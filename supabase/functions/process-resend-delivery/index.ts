import { createHelpdeskAdminClient } from '../_shared/helpdesk-auth.ts';

declare const Deno: {
    env: { get(key: string): string | undefined };
    serve(handler: (request: Request) => Response | Promise<Response>): void;
};

interface ResendDeliveryEvent {
    type?: string;
    created_at?: string;
    data?: {
        email_id?: string;
        bounce?: { message?: string; type?: string; subType?: string };
        failed?: { reason?: string };
    };
}

const supportedEvents = new Map([
    ['email.sent', 'sent'],
    ['email.delivered', 'delivered'],
    ['email.bounced', 'bounced'],
    ['email.failed', 'failed'],
    ['email.complained', 'failed'],
]);
const deliveryRanks: Record<string, number> = { queued: 0, sent: 1, delivered: 2, failed: 3, bounced: 3 };
const encoder = new TextEncoder();

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function getEnv(name: string) {
    const value = Deno.env.get(name);
    if (!value) throw new Error(`Missing required environment variable: ${name}`);
    return value;
}

function decodeBase64(value: string) {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
    if (left.length !== right.length) return false;
    let difference = 0;
    for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
    return difference === 0;
}

async function verifyWebhookSignature(request: Request, payload: string) {
    const webhookId = request.headers.get('svix-id')?.trim() ?? '';
    const timestamp = request.headers.get('svix-timestamp')?.trim() ?? '';
    const signatureHeader = request.headers.get('svix-signature')?.trim() ?? '';
    if (!webhookId || !timestamp || !signatureHeader) return null;

    const timestampSeconds = Number(timestamp);
    if (!Number.isFinite(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > 300) return null;

    const encodedSecret = getEnv('RESEND_WEBHOOK_SECRET').replace(/^whsec_/, '');
    const key = await crypto.subtle.importKey(
        'raw',
        decodeBase64(encodedSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`${webhookId}.${timestamp}.${payload}`)));
    const valid = signatureHeader.split(/\s+/).some((entry) => {
        const [version, encodedSignature] = entry.split(',', 2);
        if (version !== 'v1' || !encodedSignature) return false;
        try {
            return constantTimeEqual(expected, decodeBase64(encodedSignature));
        } catch {
            return false;
        }
    });

    return valid ? webhookId : null;
}

function getDeliveryError(event: ResendDeliveryEvent) {
    if (event.type === 'email.bounced') {
        return event.data?.bounce?.message || [event.data?.bounce?.type, event.data?.bounce?.subType].filter(Boolean).join(': ') || 'Email bounced';
    }
    if (event.type === 'email.failed' || event.type === 'email.complained') {
        return event.data?.failed?.reason || event.type;
    }
    return null;
}

Deno.serve(async (request) => {
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    try {
        const rawPayload = await request.text();
        const webhookId = await verifyWebhookSignature(request, rawPayload);
        if (!webhookId) return json({ error: 'Invalid webhook signature' }, 401);

        const event = JSON.parse(rawPayload) as ResendDeliveryEvent;
        const deliveryStatus = event.type ? supportedEvents.get(event.type) : undefined;
        const providerMessageId = event.data?.email_id?.trim();
        if (!deliveryStatus || !providerMessageId) return json({ ok: true, ignored: true });

        const supabase = createHelpdeskAdminClient();
        const { data: existingEvent, error: existingEventError } = await supabase
            .from('support_webhook_events')
            .select('webhook_id')
            .eq('webhook_id', webhookId)
            .maybeSingle();
        if (existingEventError) throw existingEventError;
        if (existingEvent) return json({ ok: true, duplicate: true });

        const { data: message, error: messageError } = await supabase
            .from('ticket_messages')
            .select('id, ticket_id, delivery_status')
            .eq('provider_message_id', providerMessageId)
            .maybeSingle();
        if (messageError) throw messageError;

        const recordEvent = async () => {
            const { error } = await supabase.from('support_webhook_events').insert({
                webhook_id: webhookId,
                event_type: event.type,
                provider_message_id: providerMessageId,
            });
            if (error) throw error;
        };
        if (!message) {
            await recordEvent();
            return json({ ok: true, ignored: true });
        }
        const currentRank = deliveryRanks[String(message.delivery_status ?? '')] ?? -1;
        const incomingRank = deliveryRanks[deliveryStatus] ?? -1;
        if (incomingRank < currentRank) {
            await recordEvent();
            return json({ ok: true, ignored: true, stale: true });
        }

        const eventTime = event.created_at && !Number.isNaN(Date.parse(event.created_at))
            ? event.created_at
            : new Date().toISOString();
        const deliveryError = getDeliveryError(event);
        const terminalFailure = deliveryStatus === 'failed' || deliveryStatus === 'bounced';
        const { error: updateError } = await supabase.from('ticket_messages').update({
            delivery_status: deliveryStatus,
            delivered_at: deliveryStatus === 'delivered' ? eventTime : undefined,
            failed_at: terminalFailure ? eventTime : undefined,
            delivery_error: deliveryError,
        }).eq('id', message.id);
        if (updateError) throw updateError;

        const { data: latestMessage, error: latestError } = await supabase
            .from('ticket_messages')
            .select('id')
            .eq('ticket_id', message.ticket_id)
            .eq('sender_type', 'Admin')
            .eq('delivery_channel', 'email')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (latestError) throw latestError;
        if (latestMessage?.id === message.id) {
            const { error: ticketError } = await supabase.from('support_tickets').update({
                last_delivery_status: deliveryStatus,
                last_delivery_error: deliveryError,
            }).eq('id', message.ticket_id);
            if (ticketError) throw ticketError;
        }

        if (deliveryStatus !== 'sent') {
            const { error: attemptError } = await supabase.from('support_delivery_attempts').insert({
                ticket_id: message.ticket_id,
                message_id: message.id,
                status: deliveryStatus,
                provider_message_id: providerMessageId,
                error_message: deliveryError,
            });
            if (attemptError) throw attemptError;
        }

        await recordEvent();

        return json({ ok: true, status: deliveryStatus });
    } catch (error) {
        console.error('process-resend-delivery failed', error);
        return json({ error: 'Could not process delivery event' }, 500);
    }
});
