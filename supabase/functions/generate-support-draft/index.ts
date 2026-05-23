import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.98.0';

declare const Deno: {
    env: {
        get(key: string): string | undefined;
    };
    serve(handler: (request: Request) => Response | Promise<Response>): void;
};

interface DraftPayload {
    ticket_id?: string;
}

interface SupportContact {
    email?: string | null;
    name?: string | null;
    company_name?: string | null;
    phone?: string | null;
}

interface AiTicketInsight {
    summary?: string | null;
    next_best_action?: string | null;
    urgency_reason?: string | null;
    affected_module?: string | null;
    detected_identifiers?: string[] | null;
    ai_tags?: string[] | null;
}

interface SupportTicket {
    id: string;
    ticket_number?: number | null;
    tenant_name?: string | null;
    category: string;
    priority: string;
    status: string;
    subject: string;
    source: string;
    technical_context?: Record<string, unknown> | null;
    tenants?: { name?: string | null } | { name?: string | null }[] | null;
    support_contacts?: SupportContact | SupportContact[] | null;
    ai_ticket_insights?: AiTicketInsight | AiTicketInsight[] | null;
}

interface MessageRow {
    sender_type: 'Admin' | 'Client' | 'System';
    message: string;
    created_at: string;
}

interface KnowledgeMatch {
    id: string;
    module: string;
    title: string;
    content: string;
    tags?: string[] | null;
    source?: string | null;
    source_path?: string | null;
    rank?: number | null;
}

interface IntegrationSettingsRow {
    ai_provider?: 'openai' | 'anthropic' | 'disabled' | null;
    ai_model?: string | null;
    ai_auto_drafts_enabled?: boolean | null;
}

interface SecretRow {
    secret_ciphertext: string;
    secret_iv: string;
}

const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
const MAX_TEXT_LENGTH = 1800;
const clicSupportInstructions = [
    'Eres un especialista senior de soporte de Clic-ERP y Clic-POS para comercios en Republica Dominicana.',
    'Conoces operaciones reales de caja, cierre Z, ventas POS, sincronizacion cloud, e-CF/NCF, DGII/Digifact, inventario, productos, promociones, pagos, terminales Android, impresoras, red y usuarios del ERP.',
    'Genera solamente el texto del borrador que se enviara al cliente.',
    'Responde en espanol claro, profesional y directo.',
    'Usa primero erp_knowledge_base cuando tenga resultados relacionados con el ticket.',
    'La respuesta debe estar relacionada con el problema real del ticket y proponer pasos concretos tomados de la base de conocimiento o del contexto.',
    'No des respuestas genericas como "estamos revisando" sin instrucciones operativas.',
    'No inventes rutas, botones ni resultados si la base de conocimiento no lo respalda.',
    'No conviertas rutas internas como /crm/promociones en enlaces ni URL publicas.',
    'No prometas que ya esta resuelto y no menciones informacion interna, rutas de codigo, tokens, claves o que usaste IA.',
    'Si falta informacion, pide maximo dos datos concretos al cliente.',
    'Mantente breve: 1 a 3 parrafos.',
].join(' ');

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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

function normalizeRelation<T>(value: T | T[] | null | undefined): T | null {
    if (Array.isArray(value)) return value[0] ?? null;
    return value ?? null;
}

function truncateText(value: string, maxLength = MAX_TEXT_LENGTH) {
    return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function isGenericDraft(value: string) {
    const normalized = value.toLowerCase();
    const genericSignals = [
        'recibimos tu solicitud',
        'estamos revisando',
        'vamos a validar',
        'te confirmamos los proximos pasos',
        'te confirmamos los próximos pasos',
        'a la brevedad',
        'origen del problema',
    ];

    return value.trim().length < 120 || genericSignals.some((signal) => normalized.includes(signal));
}

function isSensitiveKey(key: string) {
    return /(password|passwd|token|secret|authorization|api[_-]?key|apikey|cookie|session)/i.test(key);
}

function redactSensitive(value: unknown, parentKey = ''): unknown {
    if (isSensitiveKey(parentKey)) return '[redacted]';
    if (typeof value === 'string') return truncateText(value);
    if (Array.isArray(value)) return value.slice(0, 10).map((item) => redactSensitive(item, parentKey));
    if (value && typeof value === 'object') {
        const output: Record<string, unknown> = {};
        Object.entries(value as Record<string, unknown>).slice(0, 30).forEach(([key, item]) => {
            output[key] = redactSensitive(item, key);
        });
        return output;
    }
    return value;
}

function base64ToBytes(value: string) {
    const binary = atob(value);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function getDecryptKey() {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(getEnv('INTEGRATION_SECRET_KEY')));
    return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['decrypt']);
}

async function decryptSecret(row: SecretRow) {
    const key = await getDecryptKey();
    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: base64ToBytes(row.secret_iv) },
        key,
        base64ToBytes(row.secret_ciphertext),
    );

    return new TextDecoder().decode(decrypted);
}

async function assertAuthorized(request: Request) {
    const authorization = request.headers.get('authorization') ?? '';
    const bearerToken = authorization.replace(/^Bearer\s+/i, '').trim();
    if (!bearerToken) {
        throw new Error('Unauthorized draft request');
    }

    if (bearerToken === getEnv('SUPABASE_SERVICE_ROLE_KEY')) return;

    const authProbe = createClient(getEnv('SUPABASE_URL'), bearerToken, {
        auth: { autoRefreshToken: false, persistSession: false },
        db: { schema: 'landlord' },
    });
    const { data, error } = await authProbe
        .from('support_integration_settings')
        .select('id')
        .eq('id', 'helpdesk')
        .maybeSingle();

    if (error || !data) throw new Error('Unauthorized draft request');
}

function getTicketOwner(ticket: SupportTicket) {
    const contact = normalizeRelation(ticket.support_contacts);
    const tenant = normalizeRelation(ticket.tenants);
    return contact?.company_name || contact?.name || tenant?.name || ticket.tenant_name || 'cliente';
}

function buildFallbackDraft(ticket: SupportTicket, messages: MessageRow[]) {
    const insight = normalizeRelation(ticket.ai_ticket_insights);
    const subject = `${ticket.subject} ${ticket.category} ${insight?.affected_module ?? ''}`.toLowerCase();
    const owner = getTicketOwner(ticket);
    const lastClientMessage = [...messages].reverse().find((message) => message.sender_type === 'Client')?.message;
    const lastError = Array.isArray(ticket.technical_context?.last_5_errors)
        ? ticket.technical_context.last_5_errors[0]
        : null;
    const appVersion = typeof ticket.technical_context?.app_version === 'string'
        ? ticket.technical_context.app_version
        : null;
    const terminalContext = [
        appVersion ? `version ${appVersion}` : null,
        typeof ticket.technical_context?.network_type === 'string' ? `red ${ticket.technical_context.network_type}` : null,
        typeof ticket.technical_context?.battery_level === 'string' ? `bateria ${ticket.technical_context.battery_level}` : null,
    ].filter(Boolean).join(', ');

    const opening = `Hola ${owner},`;
    const evidence = lastClientMessage ? ` Tomamos como referencia: "${truncateText(lastClientMessage, 180)}".` : '';

    if (/(impres|printer|cocina|comanda|hardware)/i.test(subject)) {
        return `${opening} vamos a validar el hardware del POS.${evidence} Confirma si ocurre en una sola terminal o en todas, revisa conexion/emparejamiento de impresora o scanner, y prueba una reimpresion o recibo de prueba. Si falla, envianos modelo del equipo, terminal afectada, version del POS y foto/captura del error${lastError ? `; tambien vemos "${lastError}" en contexto tecnico.` : '.'}`;
    }

    if (/(factura|fiscal|ncf|e-?cf|digifact|rnc|comprobante)/i.test(subject)) {
        return `${opening} revisemos el flujo fiscal en Clic-ERP/Clic-POS.${evidence} Valida primero tipo de comprobante, RNC/consumidor final, secuencia NCF/e-CF disponible e internet estable. Luego intenta reenviar solo ese comprobante desde historial, sin recrear la venta. Si vuelve a fallar, envianos folio, NCF/e-CF, hora exacta y captura del error${lastError ? `; en los logs vemos "${lastError}".` : '.'}`;
    }

    if (/(sync|sincron|red|internet|conexion|offline|enviar|viajar|cierre|z\b)/i.test(subject)) {
        return `${opening} esto parece sincronizacion entre Clic-POS y Cloud/ERP.${evidence} Confirma que las ventas esten visibles localmente, que la terminal tenga internet estable y fecha/hora correcta, y luego fuerza la sincronizacion desde el POS. No borres datos ni reinstales antes de confirmar respaldo. Si no viaja, envianos terminal, usuario, hora del cierre/caja y cantidad de transacciones pendientes${terminalContext ? ` (${terminalContext})` : ''}${lastError ? `; ultimo error "${lastError}".` : '.'}`;
    }

    if (/(inventario|stock|producto|catalogo)/i.test(subject)) {
        return `${opening} revisemos inventario/catalogo.${evidence} Confirma que el producto exista y este activo en Clic-ERP para la sucursal, valida precio/impuesto y luego sincroniza catalogo en el POS. Si sigue sin aparecer o el stock no coincide, envianos codigo del producto, sucursal, terminal, cantidad esperada y captura de la busqueda.`;
    }

    if (/(pago|caja|cierre|z|cuadre|turno)/i.test(subject)) {
        return `${opening} validemos el pago/cierre en Clic-POS.${evidence} Revisa si la venta quedo completada, pendiente o duplicada en el historial y comparala contra el cuadre de caja. Envianos folio, monto, metodo de pago, hora, caja y terminal para identificar si es registro, sincronizacion o conciliacion.`;
    }

    if (/(necesito que|queremos que|ser[ií]a bueno|me gustar[ií]a|opci[oó]n para|funci[oó]n para|hace falta)/i.test(subject) || (lastClientMessage && /(necesito que|queremos que|ser[ií]a bueno|me gustar[ií]a|opci[oó]n para|funci[oó]n para|hace falta)/i.test(lastClientMessage))) {
        return `${opening} lo que solicitas parece una mejora funcional para Clic-ERP/Clic-POS. La registraremos para evaluacion de producto con el caso de uso e impacto operativo. Para documentarla bien, confirmanos modulo, pasos actuales, resultado esperado, frecuencia de uso y si bloquea ventas, facturacion o cierre de caja.`;
    }

    return `${opening} necesito ubicar el punto exacto del caso en Clic-ERP/Clic-POS.${evidence} Confirma modulo afectado, usuario, sucursal/caja, terminal, version, hora aproximada y captura del mensaje. Mientras tanto valida conectividad, fecha/hora del equipo y si ocurre en una sola terminal o en todas${lastError ? `; el ultimo error registrado es "${lastError}".` : '.'}`;
}

function buildKnowledgeSearchText(ticket: SupportTicket, messages: MessageRow[]) {
    const insight = normalizeRelation(ticket.ai_ticket_insights);
    const lastClientMessages = messages
        .filter((message) => message.sender_type === 'Client')
        .slice(-4)
        .map((message) => message.message);

    return [
        ticket.subject,
        ticket.category,
        ticket.source,
        insight?.summary,
        insight?.next_best_action,
        insight?.urgency_reason,
        insight?.affected_module,
        insight?.detected_identifiers?.join(' '),
        insight?.ai_tags?.join(' '),
        ...lastClientMessages,
    ]
        .filter((value): value is string => Boolean(value && value.trim()))
        .join(' ');
}

async function fetchKnowledgeMatches(
    supabase: ReturnType<typeof createClient>,
    ticket: SupportTicket,
    messages: MessageRow[],
) {
    const queryText = buildKnowledgeSearchText(ticket, messages);
    if (!queryText.trim()) return [];

    const { data, error } = await supabase.rpc('search_support_knowledge', {
        query_text: queryText,
        match_limit: 5,
    });

    if (error) {
        console.error('generate-support-draft knowledge search failed', describeError(error));
        return [];
    }

    return (data ?? []) as KnowledgeMatch[];
}

function buildKnowledgeFallbackDraft(ticket: SupportTicket, messages: MessageRow[], knowledgeMatches: KnowledgeMatch[]) {
    if (!knowledgeMatches.length) return buildFallbackDraft(ticket, messages);

    const owner = getTicketOwner(ticket);
    const primary = knowledgeMatches[0];
    const secondary = knowledgeMatches[1];
    const mainGuidance = truncateText(primary.content, 700);
    const extraGuidance = secondary ? ` Tambien validar: ${truncateText(secondary.content, 260)}` : '';

    return `Hola ${owner}, para este caso de "${ticket.subject}", puedes revisar estos pasos: ${mainGuidance}${extraGuidance}`;
}

function buildPromptContext(ticket: SupportTicket, messages: MessageRow[], knowledgeMatches: KnowledgeMatch[]) {
    const contact = normalizeRelation(ticket.support_contacts);
    const tenant = normalizeRelation(ticket.tenants);
    const insight = normalizeRelation(ticket.ai_ticket_insights);

    return {
        ticket: {
            id: ticket.id,
            number: ticket.ticket_number,
            tenant: tenant?.name || ticket.tenant_name,
            contact_name: contact?.name,
            contact_company: contact?.company_name,
            category: ticket.category,
            priority: ticket.priority,
            status: ticket.status,
            subject: ticket.subject,
            source: ticket.source,
            technical_context: redactSensitive(ticket.technical_context ?? {}),
        },
        ai_insight: insight ? redactSensitive(insight) : null,
        conversation: messages.slice(-10).map((message) => ({
            sender_type: message.sender_type,
            message: truncateText(message.message, 1000),
            created_at: message.created_at,
        })),
        erp_knowledge_base: knowledgeMatches.map((match) => ({
            module: match.module,
            title: match.title,
            content: truncateText(match.content, 950),
            tags: match.tags ?? [],
            source: match.source,
            source_path: match.source_path,
            rank: match.rank,
        })),
    };
}

function extractOpenAiText(payload: unknown) {
    const record = payload as Record<string, unknown>;
    if (typeof record.output_text === 'string' && record.output_text.trim()) {
        return record.output_text.trim();
    }

    const output = Array.isArray(record.output) ? record.output : [];
    const parts: string[] = [];

    output.forEach((item) => {
        const content = (item as Record<string, unknown>).content;
        if (!Array.isArray(content)) return;

        content.forEach((part) => {
            const text = (part as Record<string, unknown>).text;
            if (typeof text === 'string' && text.trim()) parts.push(text.trim());
        });
    });

    return parts.join('\n').trim();
}

async function generateOpenAiDraft(apiKey: string, model: string, context: unknown) {
    const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model,
            store: false,
            max_output_tokens: 450,
            instructions: clicSupportInstructions,
            input: `Contexto del ticket:\n${JSON.stringify(context, null, 2)}`,
        }),
    });

    if (!response.ok) {
        throw new Error(`OpenAI failed: ${await response.text()}`);
    }

    const payload = await response.json();
    const draft = extractOpenAiText(payload);
    if (!draft) throw new Error('OpenAI returned an empty draft');

    return draft;
}

Deno.serve(async (request) => {
    if (request.method === 'OPTIONS') {
        return json({ ok: true });
    }

    if (request.method !== 'POST') {
        return json({ error: 'Method not allowed' }, 405);
    }

    try {
        await assertAuthorized(request);

        const payload = await request.json() as DraftPayload;
        const ticketId = payload.ticket_id?.trim();
        if (!ticketId) {
            return json({ error: 'ticket_id is required' }, 400);
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
            .select(`
                id,
                ticket_number,
                category,
                priority,
                status,
                subject,
                source,
                technical_context,
                tenants (
                    name
                ),
                support_contacts (
                    name,
                    company_name,
                    email,
                    phone
                ),
                ai_ticket_insights (
                    summary,
                    next_best_action,
                    urgency_reason,
                    affected_module,
                    detected_identifiers,
                    ai_tags
                )
            `)
            .eq('id', ticketId)
            .single();

        if (ticketError) throw ticketError;

        const { data: messages, error: messagesError } = await supabase
            .from('ticket_messages')
            .select('sender_type, message, created_at')
            .eq('ticket_id', ticketId)
            .order('created_at', { ascending: false })
            .limit(10);

        if (messagesError) throw messagesError;

        const supportTicket = ticket as SupportTicket;
        const conversation = ((messages ?? []) as MessageRow[]).reverse();
        const knowledgeMatches = await fetchKnowledgeMatches(supabase, supportTicket, conversation);
        const fallbackDraft = buildKnowledgeFallbackDraft(supportTicket, conversation, knowledgeMatches);

        const { data: settings, error: settingsError } = await supabase
            .from('support_integration_settings')
            .select('ai_provider, ai_model, ai_auto_drafts_enabled')
            .eq('id', 'helpdesk')
            .maybeSingle();

        if (settingsError) throw settingsError;

        const settingsRow = settings as IntegrationSettingsRow | null;
        const provider = settingsRow?.ai_provider ?? 'openai';

        if (provider === 'disabled' || settingsRow?.ai_auto_drafts_enabled === false) {
            return json({ status: 'success', source: 'fallback', draft: fallbackDraft });
        }

        if (provider !== 'openai') {
            return json({ status: 'success', source: 'fallback', draft: fallbackDraft });
        }

        const { data: secret, error: secretError } = await supabase
            .from('support_integration_secrets')
            .select('secret_ciphertext, secret_iv')
            .eq('provider', 'openai')
            .maybeSingle();

        if (secretError) throw secretError;
        if (!secret) {
            return json({ status: 'success', source: 'fallback', draft: fallbackDraft });
        }

        const apiKey = await decryptSecret(secret as SecretRow);
        const model = settingsRow?.ai_model?.trim() || DEFAULT_OPENAI_MODEL;
        const draft = await generateOpenAiDraft(apiKey, model, buildPromptContext(supportTicket, conversation, knowledgeMatches));
        const finalDraft = isGenericDraft(draft) ? fallbackDraft : draft;

        return json({
            status: 'success',
            source: finalDraft === fallbackDraft ? 'fallback_expert' : knowledgeMatches.length ? 'openai_knowledge_base' : 'openai',
            model,
            draft: finalDraft,
            knowledge_matches: knowledgeMatches.map((match) => ({
                module: match.module,
                title: match.title,
                rank: match.rank,
            })),
        });
    } catch (error) {
        console.error('generate-support-draft failed', error);
        return json({
            error: 'Could not generate support draft',
            detail: describeError(error),
        }, 500);
    }
});
