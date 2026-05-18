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
    aiProvider: 'openai' | 'anthropic' | 'disabled';
    aiModel: string;
    aiTriageEnabled: boolean;
    aiSentimentEnabled: boolean;
    aiAutoDraftsEnabled: boolean;
}

interface IntegrationSettingsRow {
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

function normalizeCategory(value?: string | null): TicketCategory {
    if (!value) return 'Otros';
    return categoryMap[value.toLowerCase()] ?? 'Otros';
}

function extractTicketNumberFromSubject(subject: string) {
    const match = subject.match(/(?:ticket\s*)?#\s*(\d+)/i);
    return match ? Number(match[1]) : null;
}

function buildThreadSubject(ticketNumber: number | string, subject: string) {
    const cleanSubject = subject.replace(/^\s*(re|fw|fwd):\s*/i, '').trim() || 'Solicitud técnica';
    const ticketToken = `[Ticket #${ticketNumber}]`;
    return cleanSubject.includes(ticketToken) ? cleanSubject : `${ticketToken} ${cleanSubject}`;
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
        suggested_replies: [
            'Hola, recibimos tu solicitud y ya estamos revisando el caso con nuestro equipo técnico.',
            'Gracias por escribirnos. Vamos a validar el origen del problema y te confirmamos los próximos pasos.',
        ],
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

    try {
        const supabase = createClient(
            getEnv('SUPABASE_URL'),
            getEnv('SUPABASE_SERVICE_ROLE_KEY'),
            {
                auth: { autoRefreshToken: false, persistSession: false },
                db: { schema: 'landlord' },
            },
        );

        const integrationConfig = await loadIntegrationConfig(supabase);
        if (!integrationConfig.resendApiKey) {
            throw new Error('Missing Resend API key. Configure it in Cloud Admin or RESEND_API_KEY.');
        }

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
            || (inbound.email_id ? await getInboundEmailBody(inbound.email_id, integrationConfig.resendApiKey) : '')
            || '(Correo recibido sin cuerpo de texto plano disponible.)';
        const subjectTicketNumber = extractTicketNumberFromSubject(subject);

        if (subjectTicketNumber) {
            const threadedTicket = await supabase
                .from('support_tickets')
                .select('id, ticket_number')
                .eq('ticket_number', subjectTicketNumber)
                .maybeSingle();

            if (threadedTicket.error) throw threadedTicket.error;

            if (threadedTicket.data?.id) {
                const threadedMessage = await supabase.from('ticket_messages').insert({
                    ticket_id: threadedTicket.data.id,
                    sender_type: 'Client',
                    message: body.trim(),
                });

                if (threadedMessage.error) throw threadedMessage.error;

                await supabase
                    .from('support_tickets')
                    .update({ status: 'En_Proceso' })
                    .eq('id', threadedTicket.data.id);

                if (rawEventId) {
                    await supabase.from('raw_support_events')
                        .update({ status: 'processed', processed_at: new Date().toISOString() })
                        .eq('id', rawEventId);
                }

                return json({
                    ok: true,
                    threaded: true,
                    ticket_id: threadedTicket.data.id,
                    ticket_number: threadedTicket.data.ticket_number,
                });
            }
        }

        const triage = integrationConfig.aiTriageEnabled && integrationConfig.aiProvider === 'openai'
            ? await runAiTriage({
                openAiApiKey: integrationConfig.openAiApiKey,
                model: integrationConfig.aiModel,
                from: senderEmail,
                subject,
                body,
            })
            : heuristicTriage(subject, body);

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
                    affected_module: triage.affected_module ?? undefined,
                    incident_fingerprint: triage.incident_fingerprint ?? undefined,
                },
            })
            .select('id, ticket_number')
            .single();

        if (ticketInsert.error) throw ticketInsert.error;

        const ticketId = ticketInsert.data.id;
        const ticketNumber = ticketInsert.data.ticket_number ?? ticketId;

        const messageInsert = await supabase.from('ticket_messages').insert({
            ticket_id: ticketId,
            sender_type: 'Client',
            message: body.trim(),
        });

        if (messageInsert.error) throw messageInsert.error;

        let duplicateSignal = triage.duplicate_signal;
        if (triage.incident_fingerprint) {
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

        await supabase.from('ai_ticket_insights').insert({
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
