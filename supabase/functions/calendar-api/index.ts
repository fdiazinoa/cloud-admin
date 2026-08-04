import { createHelpdeskAdminClient, isAuthorizationError, requireHelpdeskActor } from '../_shared/helpdesk-auth.ts';

declare const Deno: {
    env: { get(key: string): string | undefined };
    serve(handler: (request: Request) => Response | Promise<Response>): void;
};

interface CalendarPayload {
    action?: string;
    meeting_id?: string;
    meeting_type?: string;
    title?: string;
    context?: string;
    starts_at?: string;
    ends_at?: string;
    timezone?: string;
    customer_email?: string;
    support_user_ids?: string[];
    attendee_emails?: string[];
}

interface SecretRow { secret_ciphertext: string; secret_iv: string }

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const meetingTypes = new Set(['implementation', 'meeting', 'follow_up', 'training']);
const googleScope = 'https://www.googleapis.com/auth/calendar.events';

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

function cleanString(value: unknown, maxLength = 1000) {
    return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function describeError(error: unknown) {
    if (error instanceof Error) return error.message;
    if (error && typeof error === 'object') {
        const record = error as Record<string, unknown>;
        return [record.message, record.details, record.hint, record.code].filter(Boolean).join(' | ') || 'Unknown error';
    }
    return String(error ?? 'Unknown error');
}

function isEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function uniqueEmails(values: unknown[]) {
    return Array.from(new Set(values
        .map((value) => cleanString(value, 320).toLowerCase())
        .filter((value) => value && isEmail(value))));
}

function structuredSummary(title: string, type: string, context: string) {
    const typeLabel: Record<string, string> = {
        implementation: 'Implementación',
        meeting: 'Reunión',
        follow_up: 'Seguimiento',
        training: 'Capacitación',
    };
    return [
        `${typeLabel[type] ?? 'Reunión'}: ${title}`,
        `Objetivo y contexto: ${context}`,
        'Resultado esperado: revisar el contexto, acordar responsables y dejar próximos pasos con fecha.',
    ].join('\n');
}

function base64Url(value: Uint8Array | string) {
    const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
    let binary = '';
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function pemToBytes(value: string) {
    const normalized = value.replace(/\\n/g, '\n')
        .replace(/-----BEGIN PRIVATE KEY-----/g, '')
        .replace(/-----END PRIVATE KEY-----/g, '')
        .replace(/\s/g, '');
    const binary = atob(normalized);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function getGoogleAccessToken() {
    const clientEmail = cleanString(Deno.env.get('GOOGLE_CALENDAR_CLIENT_EMAIL'), 320);
    const privateKey = Deno.env.get('GOOGLE_CALENDAR_PRIVATE_KEY') ?? '';
    const delegatedUser = cleanString(Deno.env.get('GOOGLE_CALENDAR_IMPERSONATED_USER'), 320);
    if (!clientEmail || !privateKey) {
        throw new Error('Google Calendar no está configurado: faltan GOOGLE_CALENDAR_CLIENT_EMAIL o GOOGLE_CALENDAR_PRIVATE_KEY.');
    }

    const now = Math.floor(Date.now() / 1000);
    const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims: Record<string, unknown> = {
        iss: clientEmail,
        scope: googleScope,
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
    };
    if (delegatedUser) claims.sub = delegatedUser;
    const payload = base64Url(JSON.stringify(claims));
    const unsignedToken = `${header}.${payload}`;
    const key = await crypto.subtle.importKey(
        'pkcs8',
        pemToBytes(privateKey),
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    const signature = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        key,
        new TextEncoder().encode(unsignedToken),
    );
    const assertion = `${unsignedToken}.${base64Url(new Uint8Array(signature))}`;
    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion,
        }),
    });
    const result = await response.json() as { access_token?: string; error_description?: string };
    if (!response.ok || !result.access_token) {
        throw new Error(`Google OAuth rechazó la autorización: ${result.error_description ?? response.statusText}`);
    }
    return result.access_token;
}

function base64ToBytes(value: string) {
    const binary = atob(value);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function decryptSecret(row: SecretRow) {
    const secretKey = Deno.env.get('INTEGRATION_SECRET_KEY');
    if (!secretKey) return '';
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secretKey));
    const key = await crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['decrypt']);
    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: base64ToBytes(row.secret_iv) },
        key,
        base64ToBytes(row.secret_ciphertext),
    );
    return new TextDecoder().decode(decrypted);
}

function extractOpenAiText(payload: unknown) {
    const record = payload as Record<string, unknown>;
    if (typeof record.output_text === 'string') return record.output_text.trim();
    const output = Array.isArray(record.output) ? record.output : [];
    return output.flatMap((item) => {
        const content = (item as Record<string, unknown>).content;
        if (!Array.isArray(content)) return [];
        return content.map((part) => (part as Record<string, unknown>).text).filter((text): text is string => typeof text === 'string');
    }).join('\n').trim();
}

async function generateAiSummary(supabase: ReturnType<typeof createHelpdeskAdminClient>, title: string, type: string, context: string) {
    const fallback = structuredSummary(title, type, context);
    try {
        let apiKey = Deno.env.get('OPENAI_API_KEY') ?? '';
        let model = Deno.env.get('OPENAI_MODEL') ?? 'gpt-4o-mini';
        const { data: settings } = await supabase.from('support_integration_settings')
            .select('ai_provider, ai_model').eq('id', 'helpdesk').maybeSingle();
        if (settings?.ai_provider === 'disabled') return { summary: fallback, source: 'structured_fallback' };
        if (settings?.ai_model) model = settings.ai_model;
        if (!apiKey) {
            const { data: secret } = await supabase.from('support_integration_secrets')
                .select('secret_ciphertext, secret_iv').eq('provider', 'openai').maybeSingle();
            if (secret) apiKey = await decryptSecret(secret as SecretRow);
        }
        if (!apiKey) return { summary: fallback, source: 'structured_fallback' };
        const response = await fetch('https://api.openai.com/v1/responses', {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                store: false,
                max_output_tokens: 260,
                instructions: 'Resume en español una implementación o reunión de soporte. Incluye objetivo, contexto, temas a revisar y resultado esperado. No inventes datos. Usa texto breve y accionable.',
                input: JSON.stringify({ title, meeting_type: type, context }),
            }),
        });
        if (!response.ok) throw new Error(`OpenAI ${response.status}`);
        const summary = extractOpenAiText(await response.json());
        return summary ? { summary, source: 'openai' } : { summary: fallback, source: 'structured_fallback' };
    } catch (error) {
        console.warn('Meeting AI summary fallback', describeError(error));
        return { summary: fallback, source: 'structured_fallback' };
    }
}

async function createGoogleEvent(input: {
    title: string; context: string; summary: string; startsAt: string; endsAt: string;
    timezone: string; attendees: string[];
}) {
    const calendarId = cleanString(Deno.env.get('GOOGLE_CALENDAR_ID'), 500) || 'primary';
    const accessToken = await getGoogleAccessToken();
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=all`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            summary: input.title,
            description: `${input.summary}\n\nContexto original:\n${input.context}`,
            start: { dateTime: input.startsAt, timeZone: input.timezone },
            end: { dateTime: input.endsAt, timeZone: input.timezone },
            attendees: input.attendees.map((email) => ({ email })),
            reminders: {
                useDefault: false,
                overrides: [{ method: 'email', minutes: 1440 }, { method: 'popup', minutes: 30 }],
            },
        }),
    });
    const result = await response.json() as { id?: string; htmlLink?: string; error?: { message?: string } };
    if (!response.ok || !result.id) {
        throw new Error(`Google Calendar rechazó el evento: ${result.error?.message ?? response.statusText}`);
    }
    return { id: result.id, url: result.htmlLink ?? null, calendarId };
}

Deno.serve(async (request) => {
    if (request.method === 'OPTIONS') return json({ ok: true });
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    try {
        const actor = await requireHelpdeskActor(request, 'support');
        const payload = await request.json() as CalendarPayload;
        const action = cleanString(payload.action, 40);
        const supabase = createHelpdeskAdminClient();

        if (action === 'list') {
            const { data, error } = await supabase.from('implementation_meetings')
                .select('*').order('starts_at', { ascending: false }).limit(200);
            if (error) throw error;
            return json({ meetings: data ?? [] });
        }

        if (action === 'support_users') {
            const { data, error } = await supabase.from('cloud_admin_users')
                .select('id, full_name, email, cloud_admin_profiles!inner(permissions, is_active)')
                .eq('status', 'active').eq('cloud_admin_profiles.is_active', true).order('full_name');
            if (error) throw error;
            return json({
                users: (data ?? []).filter((user) => {
                    const profile = Array.isArray(user.cloud_admin_profiles) ? user.cloud_admin_profiles[0] : user.cloud_admin_profiles;
                    return isEmail(user.email) && profile?.permissions?.support === true;
                }).map(({ id, full_name, email }) => ({ id, full_name, email })),
            });
        }

        if (action === 'create') {
            const meetingType = cleanString(payload.meeting_type, 40);
            const title = cleanString(payload.title, 180);
            const context = cleanString(payload.context, 6000);
            const startsAt = cleanString(payload.starts_at, 80);
            const endsAt = cleanString(payload.ends_at, 80);
            const timezone = cleanString(payload.timezone, 100) || 'America/Santo_Domingo';
            const customerEmail = cleanString(payload.customer_email, 320).toLowerCase();
            const supportUserIds = Array.from(new Set((payload.support_user_ids ?? []).map((id) => cleanString(id, 64)).filter(Boolean)));
            const startDate = new Date(startsAt);
            const endDate = new Date(endsAt);
            if (!meetingTypes.has(meetingType) || !title || !context || !startsAt || !endsAt || Number.isNaN(startDate.valueOf()) || Number.isNaN(endDate.valueOf()) || endDate <= startDate) {
                return json({ error: 'Tipo, título, contexto y un rango de fecha válido son obligatorios.' }, 400);
            }
            if (customerEmail && !isEmail(customerEmail)) return json({ error: 'El correo del cliente no es válido.' }, 400);

            let supportEmails: string[] = [];
            if (supportUserIds.length) {
                const { data, error } = await supabase.from('cloud_admin_users')
                    .select('id, email').in('id', supportUserIds).eq('status', 'active');
                if (error) throw error;
                if ((data ?? []).length !== supportUserIds.length) return json({ error: 'Uno de los usuarios de soporte no está activo.' }, 400);
                supportEmails = uniqueEmails((data ?? []).map((user) => user.email));
            }
            const attendees = uniqueEmails([customerEmail, ...supportEmails, ...(payload.attendee_emails ?? [])]);
            if (!attendees.length) return json({ error: 'Agrega al menos un asistente.' }, 400);
            const generated = await generateAiSummary(supabase, title, meetingType, context);

            const { data: meeting, error: insertError } = await supabase.from('implementation_meetings').insert({
                meeting_type: meetingType,
                title,
                context,
                ai_summary: generated.summary,
                ai_summary_source: generated.source,
                starts_at: startDate.toISOString(),
                ends_at: endDate.toISOString(),
                timezone,
                customer_email: customerEmail || null,
                attendee_emails: attendees,
                support_user_ids: supportUserIds,
                status: 'pending',
                created_by: actor.id,
            }).select('*').single();
            if (insertError) throw insertError;

            try {
                const googleEvent = await createGoogleEvent({ title, context, summary: generated.summary, startsAt, endsAt, timezone, attendees });
                const { data: scheduled, error: updateError } = await supabase.from('implementation_meetings').update({
                    status: 'scheduled',
                    google_calendar_id: googleEvent.calendarId,
                    google_event_id: googleEvent.id,
                    google_event_url: googleEvent.url,
                    last_error: null,
                }).eq('id', meeting.id).select('*').single();
                if (updateError) throw updateError;
                return json({ meeting: scheduled });
            } catch (calendarError) {
                const detail = describeError(calendarError).slice(0, 1200);
                await supabase.from('implementation_meetings').update({ status: 'failed', last_error: detail }).eq('id', meeting.id);
                return json({ error: 'No se pudo crear el evento en Google Calendar.', detail, meeting: { ...meeting, status: 'failed', last_error: detail } }, 502);
            }
        }

        if (action === 'retry') {
            const meetingId = cleanString(payload.meeting_id, 64);
            const { data: meeting, error } = await supabase.from('implementation_meetings').select('*').eq('id', meetingId).single();
            if (error) throw error;
            if (meeting.status === 'scheduled') return json({ meeting });
            try {
                const googleEvent = await createGoogleEvent({
                    title: meeting.title,
                    context: meeting.context,
                    summary: meeting.ai_summary,
                    startsAt: meeting.starts_at,
                    endsAt: meeting.ends_at,
                    timezone: meeting.timezone,
                    attendees: meeting.attendee_emails,
                });
                const { data: scheduled, error: updateError } = await supabase.from('implementation_meetings').update({
                    status: 'scheduled', google_calendar_id: googleEvent.calendarId, google_event_id: googleEvent.id,
                    google_event_url: googleEvent.url, last_error: null,
                }).eq('id', meetingId).select('*').single();
                if (updateError) throw updateError;
                return json({ meeting: scheduled });
            } catch (calendarError) {
                const detail = describeError(calendarError).slice(0, 1200);
                await supabase.from('implementation_meetings').update({ status: 'failed', last_error: detail }).eq('id', meetingId);
                return json({ error: 'No se pudo sincronizar con Google Calendar.', detail }, 502);
            }
        }

        return json({ error: 'Unknown calendar action' }, 400);
    } catch (error) {
        const authorizationError = isAuthorizationError(error);
        console.error('calendar-api failed', describeError(error));
        return json({
            error: authorizationError ? 'unauthorized' : 'Calendar request failed',
            detail: describeError(error),
        }, authorizationError ? 401 : 500);
    }
});
