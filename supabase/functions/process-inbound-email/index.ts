import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.98.0';

declare const Deno: {
    env: {
        get(key: string): string | undefined;
    };
    serve(handler: (request: Request) => Response | Promise<Response>): void;
};

type TicketCategory = 'Ventas' | 'Inventario' | 'Fiscal' | 'Hardware' | 'Pagos' | 'Red' | 'Otros';
type TicketPriority = 'Baja' | 'Media' | 'Alta' | 'Critica';
type Sentiment = 'frustrated' | 'neutral' | 'positive';

interface ResendInboundEvent {
    type?: string;
    created_at?: string;
    data?: {
        email_id?: string;
        from?: string;
        to?: string[];
        subject?: string;
        text?: string;
        textBody?: string;
        text_body?: string;
        html?: string;
        message_id?: string;
    };
}

interface TriageResult {
    category: TicketCategory;
    priority: TicketPriority;
    sentiment: Sentiment;
    sentiment_score: number;
    summary: string;
    suggested_replies: string[];
    tenant_identifier: string | null;
    tenant_match_confidence: number;
}

interface TenantMatch {
    id: string | null;
    confidence: number;
}

const categoryMap: Record<string, TicketCategory> = {
    ventas: 'Ventas',
    inventario: 'Inventario',
    fiscal: 'Fiscal',
    hardware: 'Hardware',
    pagos: 'Pagos',
    red: 'Red',
    otros: 'Otros',
};

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

function getEnv(name: string) {
    const value = Deno.env.get(name);
    if (!value) throw new Error(`Missing required environment variable: ${name}`);
    return value;
}

function extractEmailAddress(rawFrom: string) {
    const match = rawFrom.match(/<([^>]+)>/);
    return (match?.[1] ?? rawFrom).trim().toLowerCase();
}

function extractDisplayName(rawFrom: string) {
    const email = extractEmailAddress(rawFrom);
    return rawFrom.replace(`<${email}>`, '').replace(email, '').replaceAll('"', '').trim() || null;
}

function normalizeCategory(value?: string | null): TicketCategory {
    if (!value) return 'Otros';
    return categoryMap[value.toLowerCase()] ?? 'Otros';
}

function heuristicTriage(subject: string, body: string): TriageResult {
    const text = `${subject} ${body}`.toLowerCase();
    const category = text.includes('impres') || text.includes('fiscal') || text.includes('comprobante')
        ? 'Fiscal'
        : text.includes('internet') || text.includes('red') || text.includes('timeout')
            ? 'Red'
            : text.includes('pago') || text.includes('tarjeta')
                ? 'Pagos'
                : text.includes('inventario') || text.includes('producto')
                    ? 'Inventario'
                    : text.includes('scanner') || text.includes('terminal') || text.includes('bateria')
                        ? 'Hardware'
                        : 'Otros';

    const priority = text.includes('urgente') || text.includes('no podemos vender') || text.includes('caído') || text.includes('critico')
        ? 'Critica'
        : text.includes('no funciona') || text.includes('bloqueado') || text.includes('error')
            ? 'Alta'
            : 'Media';

    const sentiment = text.includes('molesto') || text.includes('cansado') || text.includes('urgente') || text.includes('otra vez')
        ? 'frustrated'
        : 'neutral';

    return {
        category,
        priority,
        sentiment,
        sentiment_score: sentiment === 'frustrated' ? -0.7 : 0,
        summary: subject || 'Solicitud recibida por email',
        suggested_replies: [
            'Hola, recibimos tu solicitud y ya estamos revisando el caso con nuestro equipo técnico.',
            'Gracias por escribirnos. Vamos a validar el origen del problema y te confirmamos los próximos pasos.',
        ],
        tenant_identifier: null,
        tenant_match_confidence: 0,
    };
}

function extractOpenAIText(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') return null;
    const record = payload as Record<string, unknown>;
    if (typeof record.output_text === 'string') return record.output_text;

    const output = record.output;
    if (!Array.isArray(output)) return null;

    for (const item of output) {
        if (!item || typeof item !== 'object') continue;
        const content = (item as Record<string, unknown>).content;
        if (!Array.isArray(content)) continue;
        for (const part of content) {
            if (!part || typeof part !== 'object') continue;
            const text = (part as Record<string, unknown>).text;
            if (typeof text === 'string') return text;
        }
    }

    return null;
}

async function runAiTriage(params: {
    openAiApiKey?: string;
    model: string;
    from: string;
    subject: string;
    body: string;
}): Promise<TriageResult> {
    if (!params.openAiApiKey) return heuristicTriage(params.subject, params.body);

    try {
        const response = await fetch('https://api.openai.com/v1/responses', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${params.openAiApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: params.model,
                input: [
                    {
                        role: 'system',
                        content: 'Eres un motor de triage para soporte B2B de puntos de venta. Devuelve solo JSON estructurado y no inventes datos.',
                    },
                    {
                        role: 'user',
                        content: JSON.stringify({
                            from: params.from,
                            subject: params.subject,
                            body: params.body,
                        }),
                    },
                ],
                text: {
                    format: {
                        type: 'json_schema',
                        name: 'helpdesk_email_triage',
                        strict: true,
                        schema: {
                            type: 'object',
                            additionalProperties: false,
                            required: [
                                'category',
                                'priority',
                                'sentiment',
                                'sentiment_score',
                                'summary',
                                'suggested_replies',
                                'tenant_identifier',
                                'tenant_match_confidence',
                            ],
                            properties: {
                                category: { type: 'string', enum: ['ventas', 'inventario', 'fiscal', 'hardware', 'pagos', 'red', 'otros'] },
                                priority: { type: 'string', enum: ['Baja', 'Media', 'Alta', 'Critica'] },
                                sentiment: { type: 'string', enum: ['frustrated', 'neutral', 'positive'] },
                                sentiment_score: { type: 'number', minimum: -1, maximum: 1 },
                                summary: { type: 'string' },
                                suggested_replies: {
                                    type: 'array',
                                    minItems: 2,
                                    maxItems: 3,
                                    items: { type: 'string' },
                                },
                                tenant_identifier: { type: ['string', 'null'] },
                                tenant_match_confidence: { type: 'number', minimum: 0, maximum: 1 },
                            },
                        },
                    },
                },
            }),
        });

        if (!response.ok) {
            console.error('OpenAI triage failed', await response.text());
            return heuristicTriage(params.subject, params.body);
        }

        const payload = await response.json();
        const text = extractOpenAIText(payload);
        if (!text) return heuristicTriage(params.subject, params.body);

        const parsed = JSON.parse(text) as Omit<TriageResult, 'category'> & { category: string };
        return {
            ...parsed,
            category: normalizeCategory(parsed.category),
        };
    } catch (error) {
        console.error('OpenAI triage fallback', error);
        return heuristicTriage(params.subject, params.body);
    }
}

async function getInboundEmailBody(emailId: string, resendApiKey: string) {
    const response = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
        },
    });

    if (!response.ok) {
        console.error('Could not retrieve inbound email content', await response.text());
        return '';
    }

    const payload = await response.json() as Record<string, unknown>;
    const data = typeof payload.data === 'object' && payload.data ? payload.data as Record<string, unknown> : payload;

    return String(data.text ?? data.text_body ?? data.textBody ?? '');
}

Deno.serve(async (request) => {
    if (request.method !== 'POST') {
        return json({ error: 'Method not allowed' }, 405);
    }

    let rawEventId: string | null = null;

    try {
        const supabase = createClient(
            getEnv('SUPABASE_URL'),
            getEnv('SUPABASE_SERVICE_ROLE_KEY'),
            {
                auth: { autoRefreshToken: false, persistSession: false },
                db: { schema: 'landlord' },
            },
        );

        const resendApiKey = getEnv('RESEND_API_KEY');
        const openAiApiKey = Deno.env.get('OPENAI_API_KEY');
        const openAiModel = Deno.env.get('OPENAI_MODEL') ?? 'gpt-4o-mini';
        const fromAddress = Deno.env.get('HELPDESK_FROM_EMAIL') ?? 'Cloud Admin Soporte <apoyotenico@mercasend.com>';

        const event = await request.json() as ResendInboundEvent;
        if (event.type && event.type !== 'email.received') {
            return json({ ok: true, ignored: true });
        }

        const inbound = event.data;
        if (!inbound?.from) return json({ error: 'Missing inbound sender' }, 400);

        const emailId = inbound.email_id ?? inbound.message_id ?? crypto.randomUUID();
        const rawInsert = await supabase.from('raw_support_events').insert({
            source: 'email_resend',
            external_id: emailId,
            payload: event,
        }).select('id').single();

        rawEventId = rawInsert.data?.id ?? null;

        const existingTicket = await supabase
            .from('support_tickets')
            .select('id')
            .eq('source', 'Email')
            .eq('external_message_id', emailId)
            .maybeSingle();

        if (existingTicket.data?.id) {
            return json({ ok: true, duplicate: true, ticket_id: existingTicket.data.id });
        }

        const senderEmail = extractEmailAddress(inbound.from);
        const subject = inbound.subject?.trim() || 'Solicitud técnica por email';
        const body = (inbound.text ?? inbound.textBody ?? inbound.text_body ?? '').trim()
            || (inbound.email_id ? await getInboundEmailBody(inbound.email_id, resendApiKey) : '')
            || '(Correo recibido sin cuerpo de texto plano disponible.)';

        const triage = await runAiTriage({
            openAiApiKey,
            model: openAiModel,
            from: senderEmail,
            subject,
            body,
        });

        const contactLookup = await supabase
            .from('support_contacts')
            .select('id, tenant_id')
            .ilike('email', senderEmail)
            .maybeSingle();

        let contactId = contactLookup.data?.id ?? null;
        let tenantMatch: TenantMatch = {
            id: contactLookup.data?.tenant_id ?? null,
            confidence: contactLookup.data?.tenant_id ? 1 : 0,
        };

        if (!tenantMatch.id) {
            const tenantLookup = await supabase
                .from('tenants')
                .select('id, contact_email')
                .ilike('contact_email', senderEmail)
                .maybeSingle();

            tenantMatch = {
                id: tenantLookup.data?.id ?? null,
                confidence: tenantLookup.data?.id ? 1 : triage.tenant_match_confidence,
            };
        }

        if (!contactId) {
            const contactInsert = await supabase
                .from('support_contacts')
                .insert({
                    email: senderEmail,
                    name: extractDisplayName(inbound.from),
                    source: 'Email',
                    tenant_id: tenantMatch.id,
                    metadata: {
                        first_email_id: emailId,
                        ai_tenant_identifier: triage.tenant_identifier,
                    },
                })
                .select('id')
                .single();

            if (contactInsert.error) throw contactInsert.error;
            contactId = contactInsert.data.id;
        }

        const ticketInsert = await supabase
            .from('support_tickets')
            .insert({
                tenant_id: tenantMatch.id,
                contact_id: contactId,
                subject,
                status: 'Abierto',
                priority: triage.priority,
                category: triage.category,
                source: 'Email',
                external_sender_email: senderEmail,
                external_message_id: emailId,
                assignment_status: tenantMatch.id ? 'assigned' : 'needs_assignment',
                tenant_match_confidence: tenantMatch.confidence,
                technical_context: {
                    channel: 'email',
                    resend_email_id: inbound.email_id,
                    resend_message_id: inbound.message_id,
                    to: inbound.to ?? [],
                },
            })
            .select('id')
            .single();

        if (ticketInsert.error) throw ticketInsert.error;

        const ticketId = ticketInsert.data.id;

        const messageInsert = await supabase.from('ticket_messages').insert({
            ticket_id: ticketId,
            sender_type: 'Client',
            message: body.trim(),
        });

        if (messageInsert.error) throw messageInsert.error;

        await supabase.from('ai_ticket_insights').insert({
            ticket_id: ticketId,
            sentiment: triage.sentiment,
            sentiment_score: triage.sentiment_score,
            ai_category: triage.category,
            ai_priority: triage.priority,
            confidence: tenantMatch.confidence,
            summary: triage.summary,
            suggested_replies: triage.suggested_replies,
        });

        const autoReply = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: fromAddress,
                to: [senderEmail],
                subject: `Ticket recibido: ${subject}`,
                text: `Hola, hemos recibido tu solicitud técnica. Se ha generado el ticket #${ticketId}. Un agente te responderá a la brevedad posible.`,
            }),
        });

        if (!autoReply.ok) {
            console.error('Resend auto-reply failed', await autoReply.text());
        }

        if (rawEventId) {
            await supabase.from('raw_support_events')
                .update({ status: 'processed', processed_at: new Date().toISOString() })
                .eq('id', rawEventId);
        }

        return json({
            ok: true,
            ticket_id: ticketId,
            contact_id: contactId,
            tenant_id: tenantMatch.id,
            assignment_status: tenantMatch.id ? 'assigned' : 'needs_assignment',
        });
    } catch (error) {
        console.error('process-inbound-email failed', error);

        try {
            if (rawEventId) {
                const supabase = createClient(
                    getEnv('SUPABASE_URL'),
                    getEnv('SUPABASE_SERVICE_ROLE_KEY'),
                    {
                        auth: { autoRefreshToken: false, persistSession: false },
                        db: { schema: 'landlord' },
                    },
                );
                await supabase.from('raw_support_events')
                    .update({
                        status: 'failed',
                        error_message: error instanceof Error ? error.message : String(error),
                        processed_at: new Date().toISOString(),
                    })
                    .eq('id', rawEventId);
            }
        } catch (trackingError) {
            console.error('Could not mark raw support event as failed', trackingError);
        }

        return json({
            error: 'Inbound email processing failed',
            detail: error instanceof Error ? error.message : String(error),
        }, 500);
    }
});
