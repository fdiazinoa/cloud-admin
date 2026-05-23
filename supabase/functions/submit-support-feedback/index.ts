import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.98.0';

declare const Deno: {
    env: {
        get(key: string): string | undefined;
    };
    serve(handler: (request: Request) => Response | Promise<Response>): void;
};

interface FeedbackPayload {
    ticket_id?: string;
    token?: string;
    action?: string;
    rating?: number | string;
    feedback?: string;
}

interface SupportTicket {
    id: string;
    ticket_number?: number | null;
    subject: string;
    resolution_feedback_token_hash?: string | null;
}

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

function html(body: string, status = 200) {
    return new Response(body, {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' },
    });
}

function getEnv(name: string) {
    const value = Deno.env.get(name);
    if (!value) throw new Error(`Missing required environment variable: ${name}`);
    return value;
}

function describeError(error: unknown) {
    if (error instanceof Error) return error.message;
    if (error && typeof error === 'object') {
        const record = error as Record<string, unknown>;
        const parts = [
            typeof record.message === 'string' ? record.message : null,
            typeof record.details === 'string' ? record.details : null,
            typeof record.hint === 'string' ? record.hint : null,
            typeof record.code === 'string' ? `code: ${record.code}` : null,
        ].filter(Boolean);

        if (parts.length) return parts.join(' | ');
    }

    return String(error);
}

async function sha256Hex(value: string) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
}

function parseRating(value: unknown) {
    const rating = Number(value);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return null;
    return rating;
}

function readPayloadFromUrl(request: Request): FeedbackPayload {
    const url = new URL(request.url);
    return {
        ticket_id: url.searchParams.get('ticket_id') ?? undefined,
        token: url.searchParams.get('token') ?? undefined,
        action: url.searchParams.get('action') ?? undefined,
        rating: url.searchParams.get('rating') ?? undefined,
        feedback: url.searchParams.get('feedback') ?? undefined,
    };
}

function escapeHtml(value: string) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function responsePage(title: string, message: string) {
    return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f8fafc; color: #0f172a; font-family: Inter, Arial, sans-serif; }
    main { width: min(92vw, 560px); border: 1px solid #e2e8f0; border-radius: 18px; background: white; padding: 32px; box-shadow: 0 20px 50px rgba(15, 23, 42, 0.08); }
    h1 { margin: 0 0 12px; font-size: 24px; }
    p { margin: 0; line-height: 1.6; color: #475569; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
  </main>
</body>
</html>`;
}

Deno.serve(async (request) => {
    if (request.method === 'OPTIONS') {
        return json({ ok: true });
    }

    if (request.method !== 'GET' && request.method !== 'POST') {
        return json({ error: 'Method not allowed' }, 405);
    }

    try {
        const payload = request.method === 'GET'
            ? readPayloadFromUrl(request)
            : await request.json() as FeedbackPayload;

        const ticketId = payload.ticket_id?.trim();
        const token = payload.token?.trim();
        const action = payload.action?.trim().toLowerCase();
        const feedback = payload.feedback?.trim() || null;
        const rating = parseRating(payload.rating);

        if (!ticketId || !token || !action) {
            return request.method === 'GET'
                ? html(responsePage('Enlace incompleto', 'No pudimos registrar la respuesta porque faltan datos del ticket.'), 400)
                : json({ error: 'ticket_id, token and action are required' }, 400);
        }

        if (action !== 'close' && action !== 'reopen') {
            return request.method === 'GET'
                ? html(responsePage('Accion no valida', 'El enlace de feedback no es valido.'), 400)
                : json({ error: 'action must be close or reopen' }, 400);
        }

        const supabase = createClient(
            getEnv('SUPABASE_URL'),
            getEnv('SUPABASE_SERVICE_ROLE_KEY'),
            {
                auth: { autoRefreshToken: false, persistSession: false },
                db: { schema: 'landlord' },
            },
        );

        const { data: ticket, error: ticketError } = await supabase
            .from('support_tickets')
            .select('id, ticket_number, subject, resolution_feedback_token_hash')
            .eq('id', ticketId)
            .single();

        if (ticketError) throw ticketError;

        const supportTicket = ticket as SupportTicket;
        const tokenHash = await sha256Hex(token);
        if (!supportTicket.resolution_feedback_token_hash || supportTicket.resolution_feedback_token_hash !== tokenHash) {
            return request.method === 'GET'
                ? html(responsePage('Enlace vencido', 'Este enlace de confirmacion ya no esta disponible.'), 401)
                : json({ error: 'invalid token' }, 401);
        }

        const now = new Date().toISOString();
        const isClosing = action === 'close';
        const updatePayload = isClosing
            ? {
                status: 'Cerrado',
                resolution_status: 'closed',
                closed_at: now,
                customer_confirmed_at: now,
                customer_rating: rating,
                customer_feedback: feedback,
                resolution_feedback_token_hash: null,
            }
            : {
                status: 'En_Proceso',
                resolution_status: 'reopened',
                reopened_at: now,
                customer_confirmed_at: now,
                customer_rating: rating,
                customer_feedback: feedback,
                resolution_feedback_token_hash: null,
            };

        const { error: updateError } = await supabase
            .from('support_tickets')
            .update(updatePayload)
            .eq('id', supportTicket.id);

        if (updateError) throw updateError;

        const ratingLabel = rating ? ` Valoracion: ${rating}/5.` : '';
        const feedbackLabel = feedback ? ` Comentario: ${feedback}` : '';
        const message = isClosing
            ? `El cliente confirmo que la solucion fue satisfactoria y cerro el ticket.${ratingLabel}${feedbackLabel}`
            : `El cliente indico que aun necesita ayuda. El ticket fue reabierto.${ratingLabel}${feedbackLabel}`;

        await supabase.from('ticket_messages').insert({
            ticket_id: supportTicket.id,
            sender_type: 'System',
            message,
            attachments: {
                channel: 'resolution',
                event: isClosing ? 'customer_closed_ticket' : 'customer_reopened_ticket',
                rating,
                feedback,
            },
        });

        if (request.method === 'GET') {
            return html(responsePage(
                isClosing ? 'Gracias por tu valoracion' : 'Ticket reabierto',
                isClosing
                    ? 'Hemos cerrado el ticket. Gracias por confirmar que la respuesta soluciono el caso.'
                    : 'Hemos reabierto el ticket para que el equipo de soporte continue ayudandote.',
            ));
        }

        return json({
            ok: true,
            status: isClosing ? 'Cerrado' : 'En_Proceso',
            resolution_status: isClosing ? 'closed' : 'reopened',
        });
    } catch (error) {
        const detail = describeError(error);
        if (request.method === 'GET') {
            return html(responsePage('No pudimos registrar la respuesta', detail), 500);
        }
        return json({ error: 'Could not submit support feedback', detail }, 500);
    }
});
