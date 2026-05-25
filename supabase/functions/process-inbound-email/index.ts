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

interface ResendAttachment {
    id: string;
    filename: string;
    size?: number;
    content_type?: string;
    content_disposition?: string;
    content_id?: string | null;
    download_url?: string;
    expires_at?: string;
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
    next_best_action: string;
    urgency_reason: string;
    affected_module: string | null;
    detected_contact_name: string | null;
    detected_company: string | null;
    detected_phone: string | null;
    detected_identifiers: string[];
    incident_fingerprint: string | null;
    duplicate_signal: boolean;
    ai_tags: string[];
}

interface TenantMatch {
    id: string | null;
    confidence: number;
}

interface IntegrationConfig {
    resendApiKey?: string;
    openAiApiKey?: string;
    anthropicApiKey?: string;
    fromAddress: string;
    replyToAddress: string;
    aiProvider: 'openai' | 'anthropic' | 'disabled';
    aiModel: string;
    aiTriageEnabled: boolean;
    aiSentimentEnabled: boolean;
    aiAutoDraftsEnabled: boolean;
}

interface IntegrationSettingsRow {
    resend_inbound_email?: string | null;
    resend_from_name?: string | null;
    resend_from_email?: string | null;
    ai_provider?: 'openai' | 'anthropic' | 'disabled' | null;
    ai_model?: string | null;
    ai_triage_enabled?: boolean | null;
    ai_sentiment_enabled?: boolean | null;
    ai_auto_drafts_enabled?: boolean | null;
}

interface IntegrationSecretRow {
    provider: 'resend' | 'openai' | 'anthropic';
    secret_ciphertext: string;
    secret_iv: string;
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

const supportAttachmentsBucket = 'support-attachments';
const clicProductExpertPrompt = [
    'Eres un especialista senior de soporte de Clic-ERP y Clic-POS para comercios en Republica Dominicana.',
    'Conoces operaciones reales de caja, cierre Z, ventas POS, sincronizacion cloud, e-CF/NCF, DGII/Digifact, inventario, productos, promociones, pagos, terminales Android, impresoras, red y usuarios del ERP.',
    'Devuelve solo JSON estructurado y no inventes datos.',
    'Las suggested_replies deben ser respuestas listas para enviar al cliente, en espanol claro y profesional.',
    'Cada suggested_reply debe: mencionar el problema concreto, dar 2 a 4 pasos accionables, indicar que datos/captura enviar si no se resuelve, y evitar frases vagas como "estamos revisando" sin instrucciones.',
    'Si no hay suficiente informacion para diagnosticar, pide datos exactos: empresa, usuario, terminal, version, folio/NCF/e-CF, cierre/caja, modulo, hora aproximada y captura del error.',
    'No prometas cambios de producto ni cierres tickets; si parece solicitud de nueva funcion, clasificala como mejora solicitada y responde que se registrara para evaluacion.',
].join(' ');

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
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

        try {
            return JSON.stringify(record);
        } catch {
            return String(error);
        }
    }

    return String(error);
}

function failWithStage(stage: string, error: unknown): never {
    throw new Error(`${stage}: ${describeError(error)}`);
}

function getEnv(name: string) {
    const value = Deno.env.get(name);
    if (!value) throw new Error(`Missing required environment variable: ${name}`);
    return value;
}

function base64ToBytes(value: string) {
    const binary = atob(value);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function getDecryptKey() {
    const secret = Deno.env.get('INTEGRATION_SECRET_KEY');
    if (!secret) return null;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
    return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['decrypt']);
}

async function decryptSecret(row: IntegrationSecretRow) {
    const key = await getDecryptKey();
    if (!key) return null;

    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: base64ToBytes(row.secret_iv) },
        key,
        base64ToBytes(row.secret_ciphertext),
    );

    return new TextDecoder().decode(decrypted);
}

function formatFromAddress(name: string, email: string) {
    const cleanName = name.trim() || 'Cloud Admin Soporte';
    return `${cleanName} <${email.trim().toLowerCase()}>`;
}

async function loadIntegrationConfig(supabase: ReturnType<typeof createClient>): Promise<IntegrationConfig> {
    const config: IntegrationConfig = {
        resendApiKey: Deno.env.get('RESEND_API_KEY'),
        openAiApiKey: Deno.env.get('OPENAI_API_KEY'),
        anthropicApiKey: Deno.env.get('ANTHROPIC_API_KEY'),
        fromAddress: Deno.env.get('HELPDESK_FROM_EMAIL') ?? 'Cloud Admin Soporte <apoyotenico@mercasend.com>',
        replyToAddress: Deno.env.get('HELPDESK_INBOUND_EMAIL') ?? 'apoyotenico@mercasend.com',
        aiProvider: 'openai',
        aiModel: Deno.env.get('OPENAI_MODEL') ?? 'gpt-4o-mini',
        aiTriageEnabled: true,
        aiSentimentEnabled: true,
        aiAutoDraftsEnabled: true,
    };

    const { data: settings, error: settingsError } = await supabase
        .from('support_integration_settings')
        .select('*')
        .eq('id', 'helpdesk')
        .maybeSingle();

    if (!settingsError && settings) {
        const row = settings as IntegrationSettingsRow;
        config.aiProvider = row.ai_provider ?? config.aiProvider;
        config.aiModel = row.ai_model ?? config.aiModel;
        config.aiTriageEnabled = row.ai_triage_enabled ?? config.aiTriageEnabled;
        config.aiSentimentEnabled = row.ai_sentiment_enabled ?? config.aiSentimentEnabled;
        config.aiAutoDraftsEnabled = row.ai_auto_drafts_enabled ?? config.aiAutoDraftsEnabled;
        config.replyToAddress = row.resend_inbound_email ?? config.replyToAddress;

        if (row.resend_from_email) {
            config.fromAddress = formatFromAddress(row.resend_from_name ?? 'Cloud Admin Soporte', row.resend_from_email);
        }
    } else if (settingsError) {
        console.error('Integration settings fallback to env', settingsError);
    }

    const { data: secrets, error: secretsError } = await supabase
        .from('support_integration_secrets')
        .select('provider, secret_ciphertext, secret_iv');

    if (!secretsError && secrets?.length) {
        for (const secretRow of secrets as IntegrationSecretRow[]) {
            try {
                const decrypted = await decryptSecret(secretRow);
                if (!decrypted) continue;

                if (secretRow.provider === 'resend') config.resendApiKey = decrypted;
                if (secretRow.provider === 'openai') config.openAiApiKey = decrypted;
                if (secretRow.provider === 'anthropic') config.anthropicApiKey = decrypted;
            } catch (error) {
                console.error(`Could not decrypt ${secretRow.provider} integration secret`, error);
            }
        }
    } else if (secretsError) {
        console.error('Integration secrets fallback to env', secretsError);
    }

    return config;
}

function extractEmailAddress(rawFrom: string) {
    const match = rawFrom.match(/<([^>]+)>/);
    return (match?.[1] ?? rawFrom).trim().toLowerCase();
}

function extractDisplayName(rawFrom: string) {
    const email = extractEmailAddress(rawFrom);
    return rawFrom.replace(`<${email}>`, '').replace(email, '').replaceAll('"', '').trim() || null;
}

function stripQuotedEmailText(value: string) {
    let text = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

    const quotePatterns = [
        /\n\s*On\s.+?wrote:\s*[\s\S]*$/i,
        /\s+On\s.+?wrote:\s*[\s\S]*$/i,
        /\n\s*El\s+(lun|mar|mi[eé]|jue|vie|s[aá]b|dom).+?escribi[oó]:\s*[\s\S]*$/i,
        /\s+El\s+(lun|mar|mi[eé]|jue|vie|s[aá]b|dom).+?escribi[oó]:\s*[\s\S]*$/i,
        /\n\s*De:\s.+\n\s*Enviado:\s.+[\s\S]*$/i,
        /\n\s*From:\s.+\n\s*Sent:\s.+[\s\S]*$/i,
        /\n_{5,}[\s\S]*$/i,
    ];

    for (const pattern of quotePatterns) {
        text = text.replace(pattern, '').trim();
    }

    text = text
        .split('\n')
        .filter((line) => !line.trim().startsWith('>'))
        .join('\n')
        .replace(/\n?\[image:[^\]]+\]\s*/gi, '\n')
        .replace(/\n--\s*\n[\s\S]*$/m, '')
        .replace(/\n--\[image:[\s\S]*$/i, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    return text || value.trim();
}

function sanitizeStorageName(value: string) {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 120) || 'attachment';
}

async function getInboundAttachments(emailId: string, resendApiKey: string) {
    const response = await fetch(`https://api.resend.com/emails/receiving/${emailId}/attachments`, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
        },
    });

    if (!response.ok) {
        console.error('Could not retrieve inbound email attachments', await response.text());
        return [];
    }

    const payload = await response.json() as { data?: ResendAttachment[] };
    return payload.data ?? [];
}

async function persistInboundAttachments(
    supabase: ReturnType<typeof createClient>,
    emailId: string,
    resendApiKey: string,
) {
    const attachments = await getInboundAttachments(emailId, resendApiKey);
    const storedAttachments = [];

    for (const attachment of attachments) {
        const fileName = sanitizeStorageName(attachment.filename || `${attachment.id}.bin`);
        const storagePath = `${emailId}/${attachment.id}-${fileName}`;
        let stored = false;

        if (attachment.download_url) {
            try {
                const download = await fetch(attachment.download_url);
                if (download.ok) {
                    const bytes = new Uint8Array(await download.arrayBuffer());
                    const upload = await supabase.storage
                        .from(supportAttachmentsBucket)
                        .upload(storagePath, bytes, {
                            contentType: attachment.content_type || 'application/octet-stream',
                            upsert: true,
                        });

                    stored = !upload.error;
                    if (upload.error) console.error('Could not store inbound attachment', upload.error);
                }
            } catch (error) {
                console.error('Attachment download/store failed', error);
            }
        }

        storedAttachments.push({
            id: attachment.id,
            filename: attachment.filename,
            size: attachment.size,
            content_type: attachment.content_type,
            content_disposition: attachment.content_disposition,
            content_id: attachment.content_id,
            resend_download_url: attachment.download_url,
            resend_expires_at: attachment.expires_at,
            storage_bucket: stored ? supportAttachmentsBucket : null,
            storage_path: stored ? storagePath : null,
        });
    }

    return storedAttachments;
}

function normalizeCategory(value?: string | null): TicketCategory {
    if (!value) return 'Otros';
    return categoryMap[value.toLowerCase()] ?? 'Otros';
}

function extractTicketNumberFromSubject(subject: string) {
    const match = subject.match(/(?:ticket\s*)?#\s*(\d+)/i);
    return match ? Number(match[1]) : null;
}

function buildThreadSubject(ticketNumber: number | string, subject: string) {
    const ticketToken = `[Ticket #${ticketNumber}]`;
    const cleanSubject = subject
        .replace(/^\s*(re|fw|fwd):\s*/i, '')
        .replace(ticketToken, '')
        .trim() || 'Solicitud técnica';

    return `${ticketToken} Re: ${cleanSubject}`;
}

function mergeEmailThreadContext(
    currentContext: Record<string, unknown> | null | undefined,
    inbound: NonNullable<ResendInboundEvent['data']>,
) {
    const messageIds = Array.isArray(currentContext?.email_thread_message_ids)
        ? currentContext.email_thread_message_ids.filter((value): value is string => typeof value === 'string')
        : [];
    const updatedMessageIds = inbound.message_id
        ? Array.from(new Set([...messageIds, inbound.message_id]))
        : messageIds;

    return {
        ...(currentContext ?? {}),
        channel: 'email',
        resend_email_id: inbound.email_id ?? currentContext?.resend_email_id,
        resend_message_id: inbound.message_id ?? currentContext?.resend_message_id,
        email_thread_message_ids: updatedMessageIds,
        last_inbound_at: new Date().toISOString(),
    };
}

function buildThreadHeaders(messageId?: string) {
    return messageId
        ? {
            'In-Reply-To': messageId,
            References: messageId,
        }
        : undefined;
}

function findPhoneCandidate(text: string) {
    const match = text.match(/(?:\+?\d[\s().-]?){7,}/);
    return match?.[0]?.trim() ?? null;
}

function detectAffectedModule(text: string, category: TicketCategory) {
    const normalized = text.toLowerCase();
    if (normalized.includes('impres') || normalized.includes('recibo') || normalized.includes('comprobante')) return 'Impresión fiscal';
    if (normalized.includes('internet') || normalized.includes('wifi') || normalized.includes('red') || normalized.includes('timeout')) return 'Conectividad';
    if (normalized.includes('inventario') || normalized.includes('producto') || normalized.includes('stock')) return 'Inventario';
    if (normalized.includes('pago') || normalized.includes('tarjeta') || normalized.includes('cobro')) return 'Pagos';
    if (normalized.includes('scanner') || normalized.includes('terminal') || normalized.includes('bateria')) return 'Hardware POS';
    return category;
}

function buildIncidentFingerprint(category: TicketCategory, affectedModule: string | null) {
    return `${category}:${affectedModule ?? 'general'}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function buildExpertSuggestedReplies(params: {
    category: TicketCategory;
    priority: TicketPriority;
    subject: string;
    body: string;
    affectedModule?: string | null;
}) {
    const text = `${params.subject} ${params.body}`.toLowerCase();
    const moduleLabel = params.affectedModule || params.category;
    const isFeatureRequest = [
        'necesito que',
        'queremos que',
        'seria bueno',
        'sería bueno',
        'me gustaria',
        'me gustaría',
        'opcion para',
        'opción para',
        'funcion para',
        'función para',
        'hace falta',
    ].some((phrase) => text.includes(phrase));

    if (isFeatureRequest) {
        return [
            `Hola, gracias por la sugerencia. Por lo que nos indicas, esto es una mejora funcional para Clic-ERP/Clic-POS en el area de ${moduleLabel}. La vamos a registrar para evaluacion de producto con el caso de uso, impacto operativo y prioridad. Para documentarla bien, envianos un ejemplo del flujo actual, que resultado esperas y si aplica a una sucursal, caja o usuario especifico.`,
            `Hola, lo que solicitas parece una nueva capacidad del sistema, no un incidente tecnico. Vamos a dejarla registrada como mejora solicitada por cliente. Para poder evaluarla correctamente, por favor confirma: modulo donde la necesitas, pasos actuales, resultado esperado, frecuencia de uso y si bloquea ventas, facturacion o cierre de caja.`,
        ];
    }

    if (params.category === 'Fiscal' || /e-cf|ecf|ncf|dgii|digifact|fiscal|comprobante|factura/.test(text)) {
        return [
            'Hola, revisemos el flujo fiscal en Clic-ERP/Clic-POS. Primero confirma que el comprobante tenga tipo NCF/e-CF correcto, RNC o consumidor final valido, secuencia disponible y que la terminal tenga internet estable. Luego intenta reenviar solo ese comprobante desde el historial de ventas/facturas. Si vuelve a fallar, envianos el folio, NCF/e-CF, hora exacta y captura del mensaje para validar respuesta de DGII/Digifact.',
            'Hola, para este error fiscal evita recrear la venta hasta confirmar el estado del comprobante. Verifica si la factura quedo completada localmente, si aparece con e-CF pendiente/error y si hay conectividad en la caja. Con el folio, NCF/e-CF y captura podemos revisar si es rechazo de datos, secuencia, token/proveedor fiscal o sincronizacion.',
        ];
    }

    if (params.category === 'Red' || /sync|sincron|internet|red|wifi|cloud|nube|enviar|subir/.test(text)) {
        return [
            'Hola, esto parece un caso de sincronizacion entre Clic-POS y Cloud/ERP. Por favor valida internet en la terminal, fecha/hora correcta del dispositivo y que no haya VPN o red bloqueando la salida. Luego fuerza sincronizacion desde el POS y confirma si las ventas quedan en cola o si alguna transaccion muestra error. Envianos hora del cierre/caja, usuario, terminal y una captura del estado de sync.',
            'Hola, para proteger las ventas, no borres datos ni reinstales el POS. Primero confirma que las ventas esten visibles en el historial local y que el cierre Z exista. Despues intenta sincronizar con una red estable. Si no viajan al ERP, necesitamos terminal, version del POS, cantidad de transacciones pendientes, hora del cierre y ultimo error mostrado.',
        ];
    }

    if (params.category === 'Hardware' || /impres|printer|terminal|tablet|scanner|bateria|batería/.test(text)) {
        return [
            'Hola, vamos a validar el hardware del POS. Confirma si el problema ocurre en una sola terminal o en todas, revisa conexion de la impresora/scanner, bateria y red, y prueba imprimir un recibo de prueba desde la configuracion del POS. Si falla, envianos modelo del equipo, terminal afectada, version del POS y foto/captura del error.',
            'Hola, si el equipo no responde correctamente, primero reinicia la terminal y verifica que la impresora o scanner este emparejado/conectado. Luego prueba una venta pequena o reimpresion. Si el error continua, indicanos si afecta ventas, cocina, factura fiscal o solo impresion de recibos, para escalarlo con el modulo correcto.',
        ];
    }

    if (params.category === 'Pagos' || /pago|tarjeta|cobro|credito|crédito|transferencia/.test(text)) {
        return [
            'Hola, validemos el pago en Clic-POS. Confirma metodo usado, monto, caja, usuario y si la venta quedo completada o pendiente. Revisa tambien si el pago aparece duplicado, rechazado o sin recibo. Si no cuadra, envianos folio de venta, hora, metodo de pago y captura para comparar POS, cierre de caja y ERP.',
            'Hola, para pagos es importante no repetir la venta hasta confirmar el estado. Verifica el historial de ventas y el cuadre de caja; si el cobro fue con tarjeta, confirma si el voucher o autorizacion existe. Con folio, monto, hora y terminal podemos identificar si es error de registro, sincronizacion o conciliacion.',
        ];
    }

    if (params.category === 'Inventario' || /inventario|producto|stock|catalogo|catálogo|precio/.test(text)) {
        return [
            'Hola, revisemos inventario/catalogo. Confirma si el producto existe en Clic-ERP, si esta activo para la sucursal y si el precio/impuesto estan configurados. Luego sincroniza catalogo en el POS y prueba buscarlo por nombre o codigo. Si sigue sin aparecer, envianos codigo del producto, sucursal, terminal y captura de la busqueda.',
            'Hola, si el stock o producto no coincide, valida primero el movimiento en ERP y despues sincroniza el POS. Indicanos producto, almacen/sucursal, cantidad esperada, cantidad mostrada y hora del ultimo ajuste o venta. Con eso podemos revisar si es configuracion, inventario pendiente o sincronizacion.',
        ];
    }

    return [
        `Hola, para ayudarte con Clic-ERP/Clic-POS necesito ubicar el punto exacto del fallo. Por favor confirma modulo afectado, usuario, sucursal/caja, terminal, version de la app, hora aproximada y captura del mensaje. Mientras tanto, valida conectividad, fecha/hora del equipo y si el caso ocurre en una sola terminal o en todas.`,
        `Hola, vamos a tratar este caso como ${params.priority === 'Critica' ? 'prioridad critica' : 'soporte operativo'} en ${moduleLabel}. Para avanzar sin suposiciones, envianos los pasos exactos que hiciste, resultado esperado, resultado obtenido, folio/NCF si aplica y captura del error. Con esos datos revisamos si corresponde a configuracion, sincronizacion o comportamiento del modulo.`,
    ];
}

function isGenericSuggestedReply(reply: string) {
    const normalized = reply.toLowerCase();
    const genericSignals = [
        'recibimos tu solicitud',
        'estamos revisando',
        'vamos a validar',
        'te confirmamos los próximos pasos',
        'te confirmamos los proximos pasos',
        'a la brevedad',
        'origen del problema',
    ];

    return reply.length < 120 || genericSignals.some((signal) => normalized.includes(signal));
}

function ensureExpertSuggestedReplies(
    replies: string[] | null | undefined,
    context: {
        category: TicketCategory;
        priority: TicketPriority;
        subject: string;
        body: string;
        affectedModule?: string | null;
    },
) {
    const expertReplies = buildExpertSuggestedReplies(context);
    const preciseReplies = (replies ?? [])
        .map((reply) => reply.trim())
        .filter((reply) => reply && !isGenericSuggestedReply(reply));

    return Array.from(new Set([...preciseReplies, ...expertReplies])).slice(0, 3);
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
    const affectedModule = detectAffectedModule(`${subject} ${body}`, category);
    const incidentFingerprint = buildIncidentFingerprint(category, affectedModule);

    return {
        category,
        priority,
        sentiment,
        sentiment_score: sentiment === 'frustrated' ? -0.7 : 0,
        summary: subject || 'Solicitud recibida por email',
        suggested_replies: buildExpertSuggestedReplies({ category, priority, subject, body, affectedModule }),
        tenant_identifier: null,
        tenant_match_confidence: 0,
        next_best_action: priority === 'Critica'
            ? 'Escalar a soporte técnico inmediatamente y confirmar impacto operativo con el cliente.'
            : 'Validar el contexto del cliente, revisar señales técnicas disponibles y responder con próximos pasos.',
        urgency_reason: priority === 'Critica'
            ? 'El texto sugiere bloqueo operativo o urgencia alta.'
            : 'No se detectó bloqueo operativo explícito.',
        affected_module: affectedModule,
        detected_contact_name: null,
        detected_company: null,
        detected_phone: findPhoneCandidate(`${subject} ${body}`),
        detected_identifiers: [],
        incident_fingerprint: incidentFingerprint,
        duplicate_signal: false,
        ai_tags: [category, affectedModule].filter((tag): tag is string => Boolean(tag)),
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
                        content: clicProductExpertPrompt,
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
                                'next_best_action',
                                'urgency_reason',
                                'affected_module',
                                'detected_contact_name',
                                'detected_company',
                                'detected_phone',
                                'detected_identifiers',
                                'incident_fingerprint',
                                'duplicate_signal',
                                'ai_tags',
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
                                next_best_action: { type: 'string' },
                                urgency_reason: { type: 'string' },
                                affected_module: { type: ['string', 'null'] },
                                detected_contact_name: { type: ['string', 'null'] },
                                detected_company: { type: ['string', 'null'] },
                                detected_phone: { type: ['string', 'null'] },
                                detected_identifiers: {
                                    type: 'array',
                                    maxItems: 8,
                                    items: { type: 'string' },
                                },
                                incident_fingerprint: { type: ['string', 'null'] },
                                duplicate_signal: { type: 'boolean' },
                                ai_tags: {
                                    type: 'array',
                                    maxItems: 8,
                                    items: { type: 'string' },
                                },
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
        const category = normalizeCategory(parsed.category);
        const affectedModule = parsed.affected_module || detectAffectedModule(`${params.subject} ${params.body}`, category);
        return {
            ...parsed,
            category,
            affected_module: affectedModule,
            suggested_replies: ensureExpertSuggestedReplies(parsed.suggested_replies, {
                category,
                priority: parsed.priority,
                subject: params.subject,
                body: params.body,
                affectedModule,
            }),
            incident_fingerprint: parsed.incident_fingerprint || buildIncidentFingerprint(category, affectedModule),
            detected_identifiers: parsed.detected_identifiers || [],
            ai_tags: parsed.ai_tags || [],
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
    let stage = 'start';

    try {
        stage = 'init_supabase';
        const supabase = createClient(
            getEnv('SUPABASE_URL'),
            getEnv('SUPABASE_SERVICE_ROLE_KEY'),
            {
                auth: { autoRefreshToken: false, persistSession: false },
                db: { schema: 'landlord' },
            },
        );

        stage = 'load_integration_config';
        const integrationConfig = await loadIntegrationConfig(supabase);
        if (!integrationConfig.resendApiKey) {
            throw new Error('Missing Resend API key. Configure it in Cloud Admin or RESEND_API_KEY.');
        }

        stage = 'parse_event';
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
        if (rawInsert.error) failWithStage('record_raw_event', rawInsert.error);

        rawEventId = rawInsert.data?.id ?? null;

        stage = 'check_duplicate_ticket';
        const existingTicket = await supabase
            .from('support_tickets')
            .select('id')
            .eq('source', 'Email')
            .eq('external_message_id', emailId)
            .maybeSingle();
        if (existingTicket.error) failWithStage(stage, existingTicket.error);

        if (existingTicket.data?.id) {
            return json({ ok: true, duplicate: true, ticket_id: existingTicket.data.id });
        }

        stage = 'extract_email_content';
        const senderEmail = extractEmailAddress(inbound.from);
        const subject = inbound.subject?.trim() || 'Solicitud técnica por email';
        const rawBody = (inbound.text ?? inbound.textBody ?? inbound.text_body ?? '').trim()
            || (inbound.email_id ? await getInboundEmailBody(inbound.email_id, integrationConfig.resendApiKey) : '')
            || '(Correo recibido sin cuerpo de texto plano disponible.)';
        const body = stripQuotedEmailText(rawBody);
        const attachments = inbound.email_id
            ? await persistInboundAttachments(supabase, inbound.email_id, integrationConfig.resendApiKey)
            : [];
        const subjectTicketNumber = extractTicketNumberFromSubject(subject);

        if (subjectTicketNumber) {
            const threadedTicket = await supabase
                .from('support_tickets')
                .select('id, ticket_number, technical_context')
                .eq('ticket_number', subjectTicketNumber)
                .maybeSingle();

            if (threadedTicket.error) failWithStage('find_threaded_ticket', threadedTicket.error);

            if (threadedTicket.data?.id) {
                const threadedMessage = await supabase.from('ticket_messages').insert({
                    ticket_id: threadedTicket.data.id,
                    sender_type: 'Client',
                    message: body.trim(),
                    attachments,
                });

                if (threadedMessage.error) failWithStage('append_threaded_message', threadedMessage.error);

                const threadedTicketUpdate = await supabase
                    .from('support_tickets')
                    .update({
                        status: 'En_Proceso',
                        technical_context: mergeEmailThreadContext(
                            threadedTicket.data.technical_context as Record<string, unknown> | null,
                            inbound,
                        ),
                    })
                    .eq('id', threadedTicket.data.id);
                if (threadedTicketUpdate.error) failWithStage('update_threaded_ticket', threadedTicketUpdate.error);

                if (rawEventId) {
                    const rawProcessed = await supabase.from('raw_support_events')
                        .update({ status: 'processed', processed_at: new Date().toISOString() })
                        .eq('id', rawEventId);
                    if (rawProcessed.error) failWithStage('mark_raw_threaded_processed', rawProcessed.error);
                }

                return json({
                    ok: true,
                    threaded: true,
                    ticket_id: threadedTicket.data.id,
                    ticket_number: threadedTicket.data.ticket_number,
                });
            }
        }

        stage = 'triage_email';
        const triage = integrationConfig.aiTriageEnabled && integrationConfig.aiProvider === 'openai'
            ? await runAiTriage({
                openAiApiKey: integrationConfig.openAiApiKey,
                model: integrationConfig.aiModel,
                from: senderEmail,
                subject,
                body,
            })
            : heuristicTriage(subject, body);

        stage = 'lookup_contact';
        const contactLookup = await supabase
            .from('support_contacts')
            .select('id, tenant_id')
            .ilike('email', senderEmail)
            .maybeSingle();
        if (contactLookup.error) failWithStage(stage, contactLookup.error);

        let contactId = contactLookup.data?.id ?? null;
        let tenantMatch: TenantMatch = {
            id: contactLookup.data?.tenant_id ?? null,
            confidence: contactLookup.data?.tenant_id ? 1 : 0,
        };

        if (!tenantMatch.id) {
            stage = 'lookup_tenant';
            const tenantLookup = await supabase
                .from('tenants')
                .select('id, contact_email')
                .ilike('contact_email', senderEmail)
                .maybeSingle();
            if (tenantLookup.error) failWithStage(stage, tenantLookup.error);

            tenantMatch = {
                id: tenantLookup.data?.id ?? null,
                confidence: tenantLookup.data?.id ? 1 : triage.tenant_match_confidence,
            };
        }

        if (!contactId) {
            stage = 'create_contact';
            const contactInsert = await supabase
                .from('support_contacts')
                .insert({
                    email: senderEmail,
                    name: triage.detected_contact_name ?? extractDisplayName(inbound.from),
                    company_name: triage.detected_company,
                    phone: triage.detected_phone,
                    source: 'Email',
                    tenant_id: tenantMatch.id,
                    metadata: {
                        first_email_id: emailId,
                        ai_tenant_identifier: triage.tenant_identifier,
                        ai_detected_identifiers: triage.detected_identifiers,
                    },
                })
                .select('id')
                .single();

            if (contactInsert.error) failWithStage(stage, contactInsert.error);
            contactId = contactInsert.data.id;
        }

        stage = 'create_ticket';
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
                    email_thread_message_ids: inbound.message_id ? [inbound.message_id] : [],
                    last_inbound_at: new Date().toISOString(),
                    to: inbound.to ?? [],
                    affected_module: triage.affected_module ?? undefined,
                    incident_fingerprint: triage.incident_fingerprint ?? undefined,
                },
            })
            .select('id, ticket_number')
            .single();

        if (ticketInsert.error) failWithStage(stage, ticketInsert.error);

        const ticketId = ticketInsert.data.id;
        const ticketNumber = ticketInsert.data.ticket_number ?? ticketId;

        stage = 'create_ticket_message';
        const messageInsert = await supabase.from('ticket_messages').insert({
            ticket_id: ticketId,
            sender_type: 'Client',
            message: body.trim(),
            attachments,
        });

        if (messageInsert.error) failWithStage(stage, messageInsert.error);

        let duplicateSignal = triage.duplicate_signal;
        if (triage.incident_fingerprint) {
            stage = 'check_similar_tickets';
            const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            const similarTickets = await supabase
                .from('ai_ticket_insights')
                .select('ticket_id', { count: 'exact', head: true })
                .eq('incident_fingerprint', triage.incident_fingerprint)
                .gte('created_at', since);

            if (!similarTickets.error && (similarTickets.count ?? 0) >= 4) {
                duplicateSignal = true;
            }
        }

        stage = 'create_ai_insights';
        const insightInsert = await supabase.from('ai_ticket_insights').insert({
            ticket_id: ticketId,
            sentiment: triage.sentiment,
            sentiment_score: triage.sentiment_score,
            ai_category: triage.category,
            ai_priority: triage.priority,
            confidence: tenantMatch.confidence,
            summary: triage.summary,
            suggested_replies: triage.suggested_replies,
            next_best_action: triage.next_best_action,
            urgency_reason: triage.urgency_reason,
            affected_module: triage.affected_module,
            detected_contact_name: triage.detected_contact_name,
            detected_company: triage.detected_company,
            detected_phone: triage.detected_phone,
            detected_identifiers: triage.detected_identifiers,
            incident_fingerprint: triage.incident_fingerprint,
            duplicate_signal: duplicateSignal,
            ai_tags: triage.ai_tags,
        });
        if (insightInsert.error) failWithStage(stage, insightInsert.error);

        stage = 'send_auto_reply';
        const autoReply = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${integrationConfig.resendApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: integrationConfig.fromAddress,
                to: [senderEmail],
                subject: buildThreadSubject(ticketNumber, subject),
                text: `Hola, hemos recibido tu solicitud técnica. Se ha generado el ticket #${ticketNumber}. Un agente te responderá a la brevedad posible.`,
                reply_to: [integrationConfig.replyToAddress],
                headers: buildThreadHeaders(inbound.message_id),
            }),
        });

        if (!autoReply.ok) {
            console.error('Resend auto-reply failed', await autoReply.text());
        }

        if (rawEventId) {
            stage = 'mark_raw_processed';
            const rawProcessed = await supabase.from('raw_support_events')
                .update({ status: 'processed', processed_at: new Date().toISOString() })
                .eq('id', rawEventId);
            if (rawProcessed.error) failWithStage(stage, rawProcessed.error);
        }

        return json({
            ok: true,
            ticket_id: ticketId,
            ticket_number: ticketNumber,
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
                        error_message: describeError(error),
                        processed_at: new Date().toISOString(),
                    })
                    .eq('id', rawEventId);
            }
        } catch (trackingError) {
            console.error('Could not mark raw support event as failed', trackingError);
        }

        return json({
            error: 'Inbound email processing failed',
            detail: describeError(error),
            stage,
        }, 500);
    }
});
