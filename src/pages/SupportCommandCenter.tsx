import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertTriangle,
    BatteryLow,
    Clock3,
    ExternalLink,
    Image as ImageIcon,
    Link2,
    Mail,
    MessageSquare,
    MonitorSmartphone,
    Paperclip,
    Send,
    Sparkles,
    UserPlus,
    Wand2,
    WifiOff,
    X,
} from 'lucide-react';
import { supabaseAdmin, supabaseProjectUrl, supabaseServiceRoleKey } from '../lib/supabase';

const REPLY_TEXTAREA_MAX_HEIGHT = 240;

type Sentiment = 'frustrated' | 'neutral' | 'positive';

interface TechnicalContext {
    app_version?: string;
    battery_level?: string;
    network_type?: string;
    last_5_errors?: string[];
    [key: string]: string | string[] | undefined;
}

interface SupportContact {
    id: string;
    email: string;
    name?: string | null;
    company_name?: string | null;
    phone?: string | null;
    tenant_id?: string | null;
    metadata?: {
        sla?: string;
        [key: string]: unknown;
    } | null;
}

interface AiTicketInsight {
    sentiment?: Sentiment | null;
    sentiment_score?: number | null;
    summary?: string | null;
    suggested_replies?: string[] | null;
    confidence?: number | null;
    next_best_action?: string | null;
    urgency_reason?: string | null;
    affected_module?: string | null;
    detected_contact_name?: string | null;
    detected_company?: string | null;
    detected_phone?: string | null;
    detected_identifiers?: string[] | null;
    incident_fingerprint?: string | null;
    duplicate_signal?: boolean | null;
    ai_tags?: string[] | null;
}

interface Ticket {
    id: string;
    ticket_number?: number | null;
    tenant_id?: string | null;
    tenant_name: string;
    contact?: SupportContact | null;
    category: string;
    priority: string;
    status: string;
    resolution_status?: 'open' | 'pending_customer_confirmation' | 'closed' | 'reopened' | null;
    customer_rating?: number | null;
    subject: string;
    source: string;
    assignment_status?: string | null;
    external_sender_email?: string | null;
    technical_context: TechnicalContext;
    created_at: string;
    insight?: AiTicketInsight | null;
}

interface Message {
    id: string;
    sender_type: 'Admin' | 'Client' | 'System';
    message: string;
    attachments?: unknown;
    created_at: string;
}

interface MessageAttachment {
    id?: string;
    name?: string;
    mime_type?: string;
    size_bytes?: number;
    bucket?: string;
    path?: string;
    uploaded_at?: string;
    signed_url?: string | null;
}

interface ContactFormState {
    name: string;
    phone: string;
    email: string;
    companyName: string;
    sla: string;
}

interface DraftResponse {
    draft?: string;
    error?: string;
    detail?: string;
}

interface TicketRow extends Omit<Ticket, 'tenant_name' | 'contact' | 'insight'> {
    tenants?: { name?: string | null } | { name?: string | null }[] | null;
    support_contacts?: SupportContact | SupportContact[] | null;
    ai_ticket_insights?: AiTicketInsight | AiTicketInsight[] | null;
}

const statusFilters = ['Todos', 'Abierto', 'En_Proceso', 'Resuelto', 'Cerrado'];
const sourceFilters = ['Todos', 'POS', 'ERP', 'Email', 'Preventivo'];

const sourceStyles: Record<string, string> = {
    Email: 'bg-violet-50 text-violet-700 border-violet-200',
    POS: 'bg-blue-50 text-blue-700 border-blue-200',
    ERP: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    Preventivo: 'bg-amber-50 text-amber-700 border-amber-200',
};

const sentimentStyles: Record<Sentiment, string> = {
    frustrated: 'bg-red-50 text-red-700 border-red-200',
    neutral: 'bg-slate-50 text-slate-600 border-slate-200',
    positive: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const sentimentLabels: Record<Sentiment, string> = {
    frustrated: 'Frustrado',
    neutral: 'Neutral',
    positive: 'Positivo',
};

const emptyContactForm: ContactFormState = {
    name: '',
    phone: '',
    email: '',
    companyName: '',
    sla: 'standard',
};

const slaLabels: Record<string, string> = {
    standard: 'Estándar',
    priority: 'Prioritario',
    critical: 'Crítico',
};

const resolutionStatusLabels: Record<string, string> = {
    pending_customer_confirmation: 'Esperando confirmacion',
    closed: 'Cerrado por cliente',
    reopened: 'Reabierto por cliente',
};

const resolutionStatusStyles: Record<string, string> = {
    pending_customer_confirmation: 'border-amber-200 bg-amber-50 text-amber-700',
    closed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    reopened: 'border-red-200 bg-red-50 text-red-700',
};

function normalizeRelation<T>(value: T | T[] | null | undefined): T | null {
    if (Array.isArray(value)) return value[0] ?? null;
    return value ?? null;
}

function formatTime(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('es-DO', {
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}

function getContactLabel(ticket: Ticket) {
    if (ticket.contact?.name) return ticket.contact.name;
    if (ticket.contact?.email) return ticket.contact.email;
    if (ticket.external_sender_email) return ticket.external_sender_email;
    return ticket.tenant_name;
}

function getTicketOwner(ticket: Ticket) {
    if (ticket.tenant_name !== 'Sin tenant asignado') return ticket.tenant_name;
    return ticket.contact?.company_name || getContactLabel(ticket);
}

function getTicketNumberLabel(ticket: Ticket) {
    return `#${ticket.ticket_number ?? ticket.id.slice(0, 8)}`;
}

function getTicketRecipientEmail(ticket: Ticket) {
    return ticket.contact?.email || ticket.external_sender_email || '';
}

function normalizeMessageAttachments(value: unknown): MessageAttachment[] {
    if (!Array.isArray(value)) return [];

    return value
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
        .map((item) => ({
            id: typeof item.id === 'string' ? item.id : undefined,
            name: typeof item.name === 'string' ? item.name : undefined,
            mime_type: typeof item.mime_type === 'string' ? item.mime_type : undefined,
            size_bytes: typeof item.size_bytes === 'number' ? item.size_bytes : undefined,
            bucket: typeof item.bucket === 'string' ? item.bucket : undefined,
            path: typeof item.path === 'string' ? item.path : undefined,
            uploaded_at: typeof item.uploaded_at === 'string' ? item.uploaded_at : undefined,
            signed_url: typeof item.signed_url === 'string' ? item.signed_url : null,
        }))
        .filter((attachment) => Boolean(attachment.name || attachment.path || attachment.signed_url));
}

function formatAttachmentSize(sizeBytes?: number) {
    if (!sizeBytes || sizeBytes <= 0) return 'Tamano no disponible';
    if (sizeBytes < 1024) return `${sizeBytes} B`;
    if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getAttachmentName(attachment: MessageAttachment) {
    if (attachment.name) return attachment.name;
    if (attachment.path) return attachment.path.split('/').filter(Boolean).at(-1) ?? 'Adjunto';
    return 'Adjunto';
}

function isImageAttachment(attachment: MessageAttachment) {
    return attachment.mime_type?.startsWith('image/') ?? false;
}

function truncateDraftContext(value: string, maxLength = 180) {
    return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function buildContextualFallbackDraft(ticket: Ticket, messages: Message[]) {
    const subject = `${ticket.subject} ${ticket.category} ${ticket.insight?.affected_module ?? ''}`.toLowerCase();
    const owner = getTicketOwner(ticket);
    const lastClientMessage = [...messages].reverse().find((message) => message.sender_type === 'Client')?.message;
    const opening = `Hola ${owner},`;
    const evidence = lastClientMessage ? ` Tomamos como referencia: "${truncateDraftContext(lastClientMessage)}".` : '';
    const lastError = ticket.technical_context?.last_5_errors?.[0];
    const terminalContext = [
        ticket.technical_context?.app_version ? `version ${ticket.technical_context.app_version}` : null,
        ticket.technical_context?.network_type ? `red ${ticket.technical_context.network_type}` : null,
        ticket.technical_context?.battery_level ? `bateria ${ticket.technical_context.battery_level}` : null,
    ].filter(Boolean).join(', ');

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

const SupportCommandCenter: React.FC = () => {
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
    const [replyText, setReplyText] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [filterStatus, setFilterStatus] = useState('Todos');
    const [filterSource, setFilterSource] = useState('Todos');
    const [isCreatingContact, setIsCreatingContact] = useState(false);
    const [isSendingReply, setIsSendingReply] = useState(false);
    const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
    const [isResolvingTicket, setIsResolvingTicket] = useState(false);
    const [isContactModalOpen, setIsContactModalOpen] = useState(false);
    const [contactForm, setContactForm] = useState<ContactFormState>(emptyContactForm);
    const messagesPaneRef = useRef<HTMLDivElement>(null);
    const replyTextareaRef = useRef<HTMLTextAreaElement>(null);

    const selectedTicketId = selectedTicket?.id;

    useEffect(() => {
        const pane = messagesPaneRef.current;
        if (!pane) return;
        pane.scrollTo({ top: pane.scrollHeight, behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        const textarea = replyTextareaRef.current;
        if (!textarea) return;

        textarea.style.height = 'auto';
        const nextHeight = Math.min(textarea.scrollHeight, REPLY_TEXTAREA_MAX_HEIGHT);
        textarea.style.height = `${nextHeight}px`;
        textarea.style.overflowY = textarea.scrollHeight > REPLY_TEXTAREA_MAX_HEIGHT ? 'auto' : 'hidden';
    }, [replyText, selectedTicketId]);

    useEffect(() => {
        let mounted = true;

        const fetchTickets = async () => {
            const { data, error } = await supabaseAdmin.from('support_tickets')
                .select(`
                    *,
                    tenants (
                        name
                    ),
                    support_contacts (
                        id,
                        email,
                        name,
                        company_name,
                        phone,
                        metadata,
                        tenant_id
                    ),
                    ai_ticket_insights (
                        sentiment,
                        sentiment_score,
                        summary,
                        suggested_replies,
                        confidence,
                        next_best_action,
                        urgency_reason,
                        affected_module,
                        detected_contact_name,
                        detected_company,
                        detected_phone,
                        detected_identifiers,
                        incident_fingerprint,
                        duplicate_signal,
                        ai_tags
                    )
                `)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Admin: error fetching support tickets', error);
                return;
            }

            if (!mounted) return;

            const mappedTickets = ((data ?? []) as TicketRow[]).map((ticket) => {
                const tenant = normalizeRelation(ticket.tenants);
                const contact = normalizeRelation(ticket.support_contacts);
                const insight = normalizeRelation(ticket.ai_ticket_insights);

                return {
                    ...ticket,
                    source: ticket.source || 'POS',
                    tenant_name: tenant?.name || 'Sin tenant asignado',
                    contact,
                    insight,
                    technical_context: ticket.technical_context || {},
                };
            });

            setTickets(mappedTickets);
            setSelectedTicket((current) => {
                if (!current) return current;
                return mappedTickets.find((ticket) => ticket.id === current.id) ?? current;
            });
        };

        fetchTickets();

        const channel = supabaseAdmin.channel('support_tickets_global')
            .on('postgres_changes', { event: '*', schema: 'landlord', table: 'support_tickets' }, fetchTickets)
            .on('postgres_changes', { event: '*', schema: 'landlord', table: 'support_contacts' }, fetchTickets)
            .on('postgres_changes', { event: '*', schema: 'landlord', table: 'ai_ticket_insights' }, fetchTickets)
            .subscribe();

        return () => {
            mounted = false;
            supabaseAdmin.removeChannel(channel);
        };
    }, []);

    useEffect(() => {
        if (!selectedTicketId) {
            return;
        }

        let mounted = true;

        const fetchMessages = async () => {
            try {
                const response = await fetch(`${supabaseProjectUrl}/functions/v1/get-support-messages`, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${supabaseServiceRoleKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ ticket_id: selectedTicketId }),
                });

                if (response.ok) {
                    const payload = await response.json() as { messages?: Message[] };
                    if (mounted) setMessages(payload.messages ?? []);
                    return;
                }

                console.error('Admin: error fetching signed support messages', response.statusText);
            } catch (error) {
                console.error('Admin: unexpected error fetching signed support messages', error);
            }

            const { data, error } = await supabaseAdmin.from('ticket_messages')
                .select('*')
                .eq('ticket_id', selectedTicketId)
                .order('created_at', { ascending: true });

            if (error) {
                console.error('Admin: error fetching ticket messages', error);
                return;
            }

            if (mounted) setMessages((data ?? []) as Message[]);
        };

        fetchMessages();

        const msgChannel = supabaseAdmin.channel(`support_messages_${selectedTicketId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'landlord',
                table: 'ticket_messages',
                filter: `ticket_id=eq.${selectedTicketId}`,
            }, (payload) => {
                if (mounted) {
                    const nextMessage = payload.new as Message;
                    if (normalizeMessageAttachments(nextMessage.attachments).length) {
                        void fetchMessages();
                        return;
                    }
                    setMessages((previous) => [...previous, nextMessage]);
                }
            })
            .subscribe();

        return () => {
            mounted = false;
            supabaseAdmin.removeChannel(msgChannel);
        };
    }, [selectedTicketId]);

    const ticketStats = useMemo(() => {
        return {
            critical: tickets.filter((ticket) => ticket.priority === 'Critica').length,
            open: tickets.filter((ticket) => ticket.status === 'Abierto').length,
            email: tickets.filter((ticket) => ticket.source === 'Email').length,
            unassigned: tickets.filter((ticket) => ticket.assignment_status === 'needs_assignment').length,
        };
    }, [tickets]);

    const filteredTickets = useMemo(() => {
        return tickets.filter((ticket) => {
            const statusMatches = filterStatus === 'Todos' || ticket.status === filterStatus;
            const sourceMatches = filterSource === 'Todos' || ticket.source === filterSource;
            return statusMatches && sourceMatches;
        });
    }, [filterSource, filterStatus, tickets]);

    const handleSendReply = async () => {
        if (!replyText.trim() || !selectedTicket || isSendingReply) return;

        const text = replyText.trim();
        const recipientEmail = getTicketRecipientEmail(selectedTicket);

        setReplyText('');
        setIsSendingReply(true);

        try {
            if (recipientEmail) {
                const response = await fetch(`${supabaseProjectUrl}/functions/v1/send-support-reply`, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${supabaseServiceRoleKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        ticket_id: selectedTicket.id,
                        message: text,
                    }),
                });

                if (!response.ok) {
                    const payload = await response.json().catch(() => null) as { detail?: string; error?: string } | null;
                    console.error('Admin: error notifying support reply', payload ?? response.statusText);
                    setReplyText(text);
                }

                return;
            }

            const { error } = await supabaseAdmin.from('ticket_messages').insert({
                ticket_id: selectedTicket.id,
                message: text,
                sender_type: 'Admin',
                attachments: {
                    channel: 'realtime',
                    notify_client: true,
                    delivery_status: 'inserted',
                    notification: {
                        play_sound: true,
                        sound: 'support-reply',
                    },
                },
            });

            if (error) {
                console.error('Admin: error sending support reply', error);
                setReplyText(text);
            }
        } catch (error) {
            console.error('Admin: unexpected error sending support reply', error);
            setReplyText(text);
        } finally {
            setIsSendingReply(false);
        }
    };

    const updateStatus = async (newStatus: string) => {
        if (!selectedTicket) return;

        if (newStatus === 'Resuelto') {
            setIsResolvingTicket(true);
            try {
                const response = await fetch(`${supabaseProjectUrl}/functions/v1/resolve-support-ticket`, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${supabaseServiceRoleKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ ticket_id: selectedTicket.id }),
                });

                if (!response.ok) {
                    const payload = await response.json().catch(() => null) as { detail?: string; error?: string } | null;
                    console.error('Admin: error resolving support ticket', payload ?? response.statusText);
                    return;
                }

                setSelectedTicket({
                    ...selectedTicket,
                    status: 'Resuelto',
                    resolution_status: 'pending_customer_confirmation',
                    customer_rating: null,
                });
            } catch (error) {
                console.error('Admin: unexpected error resolving support ticket', error);
            } finally {
                setIsResolvingTicket(false);
            }
            return;
        }

        const { error } = await supabaseAdmin
            .from('support_tickets')
            .update({
                status: newStatus,
                resolution_status: newStatus === 'En_Proceso' ? 'reopened' : 'open',
                resolution_feedback_token_hash: null,
            })
            .eq('id', selectedTicket.id);

        if (error) {
            console.error('Admin: error updating ticket status', error);
            return;
        }

        setSelectedTicket({
            ...selectedTicket,
            status: newStatus,
            resolution_status: newStatus === 'En_Proceso' ? 'reopened' : 'open',
        });
    };

    const openContactModal = () => {
        if (!selectedTicket?.external_sender_email && !selectedTicket?.contact?.email) return;

        const email = selectedTicket.contact?.email || selectedTicket.external_sender_email || '';
        const fallbackName = email ? email.split('@')[0] : '';

        setContactForm({
            name: selectedTicket.contact?.name || fallbackName,
            phone: selectedTicket.contact?.phone || '',
            email,
            companyName: selectedTicket.contact?.company_name || '',
            sla: selectedTicket.contact?.metadata?.sla || 'standard',
        });
        setIsContactModalOpen(true);
    };

    const saveContactFromTicket = async () => {
        if (!selectedTicket || (!selectedTicket.external_sender_email && !selectedTicket.contact?.email)) return;

        setIsCreatingContact(true);

        const contactPayload = {
            email: contactForm.email.trim().toLowerCase(),
            name: contactForm.name.trim() || null,
            phone: contactForm.phone.trim() || null,
            company_name: contactForm.companyName.trim() || null,
            source: 'Email',
            metadata: {
                ...(selectedTicket.contact?.metadata || {}),
                sla: contactForm.sla,
                converted_from: 'command_center',
                converted_from_ticket_id: selectedTicket.id,
                converted_at: new Date().toISOString(),
            },
        };

        const contactRequest = selectedTicket.contact?.id
            ? supabaseAdmin
                .from('support_contacts')
                .update(contactPayload)
                .eq('id', selectedTicket.contact.id)
                .select('id, email, name, company_name, phone, metadata, tenant_id')
                .single()
            : supabaseAdmin
                .from('support_contacts')
                .upsert(contactPayload, { onConflict: 'email' })
                .select('id, email, name, company_name, phone, metadata, tenant_id')
                .single();

        const { data: contact, error: contactError } = await contactRequest;

        if (contactError) {
            console.error('Admin: error creating support contact', contactError);
            setIsCreatingContact(false);
            return;
        }

        const { error: ticketError } = await supabaseAdmin
            .from('support_tickets')
            .update({
                contact_id: contact.id,
                assignment_status: selectedTicket.tenant_id || contact.tenant_id ? 'assigned' : 'needs_assignment',
            })
            .eq('id', selectedTicket.id);

        if (ticketError) {
            console.error('Admin: error linking support contact', ticketError);
        } else {
            setSelectedTicket({
                ...selectedTicket,
                contact,
                assignment_status: selectedTicket.tenant_id || contact.tenant_id ? 'assigned' : 'needs_assignment',
            });
            setIsContactModalOpen(false);
        }

        setIsCreatingContact(false);
    };

    const generateDraft = async () => {
        if (!selectedTicket || isGeneratingDraft) return;

        const fallbackDraft = buildContextualFallbackDraft(selectedTicket, messages);
        setIsGeneratingDraft(true);

        try {
            const response = await fetch(`${supabaseProjectUrl}/functions/v1/generate-support-draft`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${supabaseServiceRoleKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ ticket_id: selectedTicket.id }),
            });

            const payload = await response.json().catch(() => null) as DraftResponse | null;

            if (!response.ok || !payload?.draft) {
                console.error('Admin: error generating support draft', payload ?? response.statusText);
                setReplyText(fallbackDraft);
                return;
            }

            setReplyText(payload.draft);
        } catch (error) {
            console.error('Admin: unexpected error generating support draft', error);
            setReplyText(fallbackDraft);
        } finally {
            setIsGeneratingDraft(false);
        }
    };

    return (
        <div className="flex h-full min-h-[calc(100vh-8rem)] overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            <aside className="flex w-[360px] shrink-0 flex-col border-r border-slate-200 bg-white">
                <div className="shrink-0 border-b border-slate-100 p-4">
                    <div className="mb-4 flex items-start justify-between gap-3">
                        <div>
                            <h1 className="text-xl font-bold text-slate-900">Command Center</h1>
                            <p className="text-sm text-slate-500">Soporte POS, ERP y email externo</p>
                        </div>
                        <div className="rounded-lg border border-violet-200 bg-violet-50 p-2 text-violet-700">
                            <Sparkles size={18} />
                        </div>
                    </div>

                    <div className="mb-4 grid grid-cols-4 gap-2">
                        <div className="rounded-lg border border-red-100 bg-red-50 p-2 text-center">
                            <span className="block text-lg font-bold text-red-600">{ticketStats.critical}</span>
                            <span className="text-[10px] font-bold uppercase text-red-400">Críticos</span>
                        </div>
                        <div className="rounded-lg border border-orange-100 bg-orange-50 p-2 text-center">
                            <span className="block text-lg font-bold text-orange-600">{ticketStats.open}</span>
                            <span className="text-[10px] font-bold uppercase text-orange-400">Abiertos</span>
                        </div>
                        <div className="rounded-lg border border-violet-100 bg-violet-50 p-2 text-center">
                            <span className="block text-lg font-bold text-violet-600">{ticketStats.email}</span>
                            <span className="text-[10px] font-bold uppercase text-violet-400">Email</span>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-center">
                            <span className="block text-lg font-bold text-slate-700">{ticketStats.unassigned}</span>
                            <span className="text-[10px] font-bold uppercase text-slate-400">Asignar</span>
                        </div>
                    </div>

                    <div className="mb-2 flex rounded-lg bg-slate-100 p-1">
                        {statusFilters.map((status) => (
                            <button
                                key={status}
                                onClick={() => setFilterStatus(status)}
                                className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${filterStatus === status ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                {status.replace('_', ' ')}
                            </button>
                        ))}
                    </div>

                    <div className="flex gap-1 overflow-x-auto pb-1">
                        {sourceFilters.map((source) => (
                            <button
                                key={source}
                                onClick={() => setFilterSource(source)}
                                className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors ${filterSource === source ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'}`}
                            >
                                {source}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2">
                    {filteredTickets.map((ticket) => {
                        const sentiment = ticket.insight?.sentiment ?? 'neutral';

                        return (
                            <button
                                key={ticket.id}
                                onClick={() => setSelectedTicket(ticket)}
                                className={`mb-2 w-full rounded-lg border p-3 text-left transition-colors ${selectedTicket?.id === ticket.id ? 'border-blue-300 bg-blue-50 ring-1 ring-blue-500' : 'border-slate-100 bg-white hover:border-slate-300 hover:bg-slate-50'}`}
                            >
                                <div className="mb-2 flex items-center justify-between gap-2">
                                    <div className="flex min-w-0 items-center gap-2">
                                        <span className="shrink-0 text-xs font-black text-slate-500">{getTicketNumberLabel(ticket)}</span>
                                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${sourceStyles[ticket.source] ?? sourceStyles.POS}`}>
                                            {ticket.source === 'Email' ? <Mail size={11} /> : <MonitorSmartphone size={11} />}
                                            {ticket.source}
                                        </span>
                                        {ticket.resolution_status && ticket.resolution_status !== 'open' && (
                                            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${resolutionStatusStyles[ticket.resolution_status] ?? 'border-slate-200 bg-slate-50 text-slate-500'}`}>
                                                {resolutionStatusLabels[ticket.resolution_status] ?? ticket.resolution_status}
                                            </span>
                                        )}
                                    </div>
                                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${ticket.priority === 'Critica' ? 'border-red-200 bg-red-50 text-red-700' : 'border-orange-200 bg-orange-50 text-orange-700'}`}>
                                        {ticket.priority}
                                    </span>
                                </div>

                                <h3 className="truncate text-sm font-bold text-slate-900">{getTicketOwner(ticket)}</h3>
                                <p className="mt-1 line-clamp-2 text-xs text-slate-500">{ticket.subject}</p>

                                <div className="mt-3 flex items-center justify-between gap-2 text-[11px]">
                                    <span className={`rounded-full border px-2 py-0.5 font-medium ${sentimentStyles[sentiment]}`}>
                                        {sentimentLabels[sentiment]}
                                    </span>
                                    <span className="flex items-center gap-1 text-slate-400">
                                        <Clock3 size={11} />
                                        {formatTime(ticket.created_at)}
                                    </span>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </aside>

            <main className="flex min-w-0 flex-1 flex-col bg-white">
                {selectedTicket ? (
                    <>
                        <div className="shrink-0 border-b border-slate-100 bg-slate-50 p-4">
                            <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <div className="mb-2 flex flex-wrap items-center gap-2">
                                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${sourceStyles[selectedTicket.source] ?? sourceStyles.POS}`}>
                                            {selectedTicket.source === 'Email' ? <Mail size={12} /> : <MonitorSmartphone size={12} />}
                                            {selectedTicket.source}
                                        </span>
                                        <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                            {selectedTicket.status.replace('_', ' ')}
                                        </span>
                                        <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                            {selectedTicket.category}
                                        </span>
                                        {selectedTicket.resolution_status && selectedTicket.resolution_status !== 'open' && (
                                            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${resolutionStatusStyles[selectedTicket.resolution_status] ?? 'border-slate-200 bg-white text-slate-600'}`}>
                                                {resolutionStatusLabels[selectedTicket.resolution_status] ?? selectedTicket.resolution_status}
                                            </span>
                                        )}
                                        {selectedTicket.customer_rating ? (
                                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                                                {selectedTicket.customer_rating}/5 estrellas
                                            </span>
                                        ) : null}
                                    </div>
                                    <div className="flex min-w-0 items-center gap-2">
                                        <span className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-black text-slate-500">
                                            {getTicketNumberLabel(selectedTicket)}
                                        </span>
                                        <h2 className="truncate text-lg font-bold text-slate-900">{getTicketOwner(selectedTicket)}</h2>
                                    </div>
                                    <p className="mt-1 text-sm text-slate-500">{selectedTicket.subject}</p>
                                </div>

                                <div className="flex shrink-0 gap-2">
                                    <button onClick={() => updateStatus('En_Proceso')} disabled={isResolvingTicket} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
                                        En proceso
                                    </button>
                                    <button onClick={() => updateStatus('Resuelto')} disabled={isResolvingTicket} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60">
                                        {isResolvingTicket ? 'Enviando...' : 'Resolver'}
                                    </button>
                                </div>
                            </div>

                            {selectedTicket.resolution_status === 'pending_customer_confirmation' && (
                                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                                    Se notifico al cliente para confirmar cierre y valorar la respuesta.
                                </div>
                            )}

                            {selectedTicket.insight?.summary && (
                                <div className="mt-4 rounded-lg border border-violet-100 bg-violet-50 p-3">
                                    <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-violet-700">
                                        <Sparkles size={14} />
                                        Resumen IA
                                    </div>
                                    <p className="text-sm text-violet-900">{selectedTicket.insight.summary}</p>
                                    {selectedTicket.insight.next_best_action && (
                                        <div className="mt-3 rounded-lg border border-violet-200 bg-white/70 p-2">
                                            <p className="text-[11px] font-bold uppercase tracking-wide text-violet-600">Próxima acción</p>
                                            <p className="mt-1 text-sm text-violet-950">{selectedTicket.insight.next_best_action}</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div ref={messagesPaneRef} className="flex-1 space-y-4 overflow-y-auto p-6">
                            {messages.map((message) => {
                                const attachments = normalizeMessageAttachments(message.attachments);
                                const isAdminMessage = message.sender_type === 'Admin';
                                const isSystemMessage = message.sender_type === 'System';

                                return (
                                    <div key={message.id} className={`flex ${isAdminMessage ? 'justify-end' : isSystemMessage ? 'justify-center' : 'justify-start'}`}>
                                        <div className={`max-w-[72%] rounded-2xl px-4 py-3 text-sm shadow-sm ${isAdminMessage ? 'rounded-tr-sm bg-blue-600 text-white' : isSystemMessage ? 'border border-slate-200 bg-slate-50 text-slate-500' : 'rounded-tl-sm border border-slate-200 bg-white text-slate-700'}`}>
                                            <div className="mb-1 text-[10px] font-bold uppercase opacity-70">
                                                {isAdminMessage ? 'Cloud Admin' : isSystemMessage ? 'Sistema' : getContactLabel(selectedTicket)}
                                            </div>
                                            <p className="whitespace-pre-wrap break-words">{message.message}</p>

                                            {attachments.length ? (
                                                <div className="mt-3 grid gap-2">
                                                    {attachments.map((attachment, index) => {
                                                        const fileName = getAttachmentName(attachment);
                                                        const canOpen = Boolean(attachment.signed_url);
                                                        const content = (
                                                            <>
                                                                <div className={`h-16 w-20 shrink-0 overflow-hidden rounded-lg border ${isAdminMessage ? 'border-white/20 bg-white/10' : 'border-slate-200 bg-slate-50'}`}>
                                                                    {canOpen && isImageAttachment(attachment) ? (
                                                                        <img
                                                                            src={attachment.signed_url ?? undefined}
                                                                            alt={fileName}
                                                                            className="h-full w-full object-cover"
                                                                            loading="lazy"
                                                                        />
                                                                    ) : (
                                                                        <div className={`flex h-full w-full items-center justify-center ${isAdminMessage ? 'text-white/80' : 'text-slate-400'}`}>
                                                                            {isImageAttachment(attachment) ? <ImageIcon size={22} /> : <Paperclip size={22} />}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <div className="min-w-0 flex-1">
                                                                    <div className="flex min-w-0 items-center gap-1">
                                                                        <span className="truncate text-xs font-bold">{fileName}</span>
                                                                        {canOpen && <ExternalLink className="shrink-0 opacity-70" size={12} />}
                                                                    </div>
                                                                    <p className={`mt-1 text-[11px] ${isAdminMessage ? 'text-white/75' : 'text-slate-500'}`}>
                                                                        {formatAttachmentSize(attachment.size_bytes)}
                                                                    </p>
                                                                    {!canOpen && (
                                                                        <p className={`mt-1 text-[11px] font-medium ${isAdminMessage ? 'text-white/70' : 'text-amber-700'}`}>
                                                                            Archivo no disponible
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            </>
                                                        );

                                                        const className = `flex min-w-0 items-center gap-3 rounded-xl border p-2 text-left ${isAdminMessage ? 'border-white/20 bg-white/10 text-white' : 'border-slate-200 bg-slate-50 text-slate-700'}`;
                                                        const hoverClassName = isAdminMessage ? 'hover:bg-white/15' : 'hover:bg-slate-100';

                                                        return canOpen ? (
                                                            <a
                                                                key={attachment.id ?? `${fileName}-${index}`}
                                                                href={attachment.signed_url ?? undefined}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className={`${className} ${hoverClassName}`}
                                                            >
                                                                {content}
                                                            </a>
                                                        ) : (
                                                            <div key={attachment.id ?? `${fileName}-${index}`} className={className}>
                                                                {content}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ) : null}
                                        </div>
                                    </div>
                                );
                            })}
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2 shadow-sm">
                                {selectedTicket.insight?.suggested_replies?.length ? (
                                    <div className="mb-3 flex gap-2 overflow-x-auto">
                                        {selectedTicket.insight.suggested_replies.slice(0, 3).map((reply) => (
                                            <button
                                                key={reply}
                                                onClick={() => setReplyText(reply)}
                                                className="shrink-0 rounded-full border border-violet-200 bg-white px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-50"
                                            >
                                                {reply.slice(0, 92)}
                                            </button>
                                        ))}
                                    </div>
                                ) : null}

                                <div className="overflow-hidden rounded-xl border border-slate-300 bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500">
                                    <textarea
                                        ref={replyTextareaRef}
                                        rows={1}
                                        value={replyText}
                                        onChange={(event) => setReplyText(event.target.value)}
                                        placeholder="Escribe tu respuesta..."
                                        className="max-h-[240px] min-h-[40px] w-full resize-none overflow-hidden border-0 p-2 text-sm leading-5 outline-none focus:ring-0"
                                    />
                                    <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-2 py-1.5">
                                        <button
                                            onClick={generateDraft}
                                            disabled={isGeneratingDraft}
                                            className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-xs font-bold text-violet-700 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            <Wand2 size={14} />
                                            {isGeneratingDraft ? 'Generando...' : 'Borrador IA'}
                                        </button>
                                        <button
                                            onClick={handleSendReply}
                                            disabled={isSendingReply}
                                            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {isSendingReply ? 'Enviando...' : getTicketRecipientEmail(selectedTicket) ? 'Enviar y notificar' : 'Enviar'}
                                            <Send size={14} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex flex-1 flex-col items-center justify-center bg-slate-50 text-slate-400">
                        <MessageSquare className="mb-4 text-slate-300" size={56} />
                        <p className="font-medium text-slate-600">Selecciona un ticket para comenzar</p>
                    </div>
                )}
            </main>

            {selectedTicket && (
                <aside className="flex w-[320px] shrink-0 flex-col overflow-y-auto border-l border-slate-200 bg-white">
                    <div className="border-b border-slate-100 p-4">
                        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-800">Contexto</h3>
                        <p className="mt-1 text-xs text-slate-500">Tenant, contacto y señales técnicas</p>
                    </div>

                    <div className="space-y-5 p-4">
                        {selectedTicket.insight && (
                            <section>
                                <h4 className="mb-2 text-xs font-semibold text-slate-500">IA operativa</h4>
                                <div className="space-y-3 rounded-lg border border-violet-100 bg-violet-50 p-3 text-xs">
                                    {selectedTicket.insight.duplicate_signal && (
                                        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-amber-800">
                                            <AlertTriangle className="mt-0.5 shrink-0" size={14} />
                                            Posible patrón repetido o falla masiva.
                                        </div>
                                    )}
                                    {selectedTicket.insight.urgency_reason && (
                                        <div>
                                            <p className="font-bold uppercase tracking-wide text-violet-700">Razón de prioridad</p>
                                            <p className="mt-1 text-violet-950">{selectedTicket.insight.urgency_reason}</p>
                                        </div>
                                    )}
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="rounded-lg border border-violet-100 bg-white p-2">
                                            <p className="font-bold text-violet-700">Módulo</p>
                                            <p className="mt-1 text-slate-700">{selectedTicket.insight.affected_module || 'No detectado'}</p>
                                        </div>
                                        <div className="rounded-lg border border-violet-100 bg-white p-2">
                                            <p className="font-bold text-violet-700">Empresa</p>
                                            <p className="mt-1 text-slate-700">{selectedTicket.insight.detected_company || 'No detectada'}</p>
                                        </div>
                                    </div>
                                    {selectedTicket.insight.detected_phone && (
                                        <div className="rounded-lg border border-violet-100 bg-white p-2">
                                            <p className="font-bold text-violet-700">Teléfono detectado</p>
                                            <p className="mt-1 text-slate-700">{selectedTicket.insight.detected_phone}</p>
                                        </div>
                                    )}
                                    {selectedTicket.insight.detected_identifiers?.length ? (
                                        <div className="rounded-lg border border-violet-100 bg-white p-2">
                                            <p className="font-bold text-violet-700">Datos detectados</p>
                                            <p className="mt-1 text-slate-700">{selectedTicket.insight.detected_identifiers.join(' · ')}</p>
                                        </div>
                                    ) : null}
                                    {selectedTicket.insight.ai_tags?.length ? (
                                        <div className="flex flex-wrap gap-1">
                                            {selectedTicket.insight.ai_tags.slice(0, 6).map((tag) => (
                                                <span key={tag} className="rounded-full border border-violet-200 bg-white px-2 py-0.5 font-bold text-violet-700">
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    ) : null}
                                </div>
                            </section>
                        )}

                        <section>
                            <h4 className="mb-2 text-xs font-semibold text-slate-500">Contacto</h4>
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                                <p className="font-bold text-slate-800">{getContactLabel(selectedTicket)}</p>
                                <p className="mt-1 text-xs text-slate-500">{selectedTicket.contact?.company_name || selectedTicket.tenant_name}</p>

                                {getTicketRecipientEmail(selectedTicket) && (
                                    <button
                                        onClick={openContactModal}
                                        disabled={isCreatingContact}
                                        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        <UserPlus size={14} />
                                        {selectedTicket.contact?.company_name || selectedTicket.contact?.phone ? 'Editar contacto' : 'Convertir en contacto'}
                                    </button>
                                )}

                                {selectedTicket.contact?.metadata?.sla && (
                                    <div className="mt-3 rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-600">
                                        SLA: <span className="font-bold text-slate-800">{slaLabels[selectedTicket.contact.metadata.sla] ?? selectedTicket.contact.metadata.sla}</span>
                                    </div>
                                )}

                                {selectedTicket.assignment_status === 'needs_assignment' && (
                                    <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                                        <AlertTriangle className="mt-0.5 shrink-0" size={14} />
                                        Falta vincular este contacto a un tenant.
                                    </div>
                                )}
                            </div>
                        </section>

                        <section>
                            <h4 className="mb-2 text-xs font-semibold text-slate-500">Tenant Health</h4>
                            <div className="space-y-2 rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-xs">
                                <div className="flex items-center justify-between">
                                    <span className="font-medium text-emerald-700">Estado</span>
                                    <span className="font-bold text-emerald-900">{selectedTicket.tenant_id ? 'Conectado' : 'No vinculado'}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="flex items-center gap-1 text-emerald-700"><BatteryLow size={13} /> Batería</span>
                                    <span className="font-bold text-emerald-900">{selectedTicket.technical_context?.battery_level || 'N/A'}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="flex items-center gap-1 text-emerald-700"><WifiOff size={13} /> Red</span>
                                    <span className="font-bold text-emerald-900">{selectedTicket.technical_context?.network_type || 'N/A'}</span>
                                </div>
                            </div>
                        </section>

                        <section>
                            <h4 className="mb-2 text-xs font-semibold text-slate-500">Últimos errores</h4>
                            <div className="rounded-lg bg-slate-950 p-3 font-mono text-[11px] text-emerald-300">
                                {selectedTicket.technical_context?.last_5_errors?.length
                                    ? selectedTicket.technical_context.last_5_errors.map((error) => <p key={error}>{error}</p>)
                                    : <p>No hay errores locales registrados.</p>}
                            </div>
                        </section>

                        <section>
                            <h4 className="mb-2 text-xs font-semibold text-slate-500">Acciones rápidas</h4>
                            <div className="space-y-2">
                                <button className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs font-medium text-slate-600 hover:bg-slate-50">
                                    Forzar Sync Inbox
                                    <Link2 size={13} />
                                </button>
                                <button className="flex w-full items-center justify-between rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-left text-xs font-medium text-violet-700 hover:bg-violet-100">
                                    Crear ticket preventivo
                                    <Sparkles size={13} />
                                </button>
                            </div>
                        </section>
                    </div>
                </aside>
            )}

            {isContactModalOpen && selectedTicket && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
                    <div className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl">
                        <div className="flex items-center justify-between border-b border-slate-100 p-5">
                            <div>
                                <h3 className="text-lg font-black text-slate-900">Convertir en contacto</h3>
                                <p className="mt-1 text-sm text-slate-500">Completa los datos del remitente y define su nivel de atención.</p>
                            </div>
                            <button
                                onClick={() => setIsContactModalOpen(false)}
                                className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50"
                                type="button"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
                            <label className="block sm:col-span-2">
                                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">Nombre</span>
                                <input
                                    value={contactForm.name}
                                    onChange={(event) => setContactForm((current) => ({ ...current, name: event.target.value }))}
                                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                />
                            </label>
                            <label className="block">
                                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">Teléfono</span>
                                <input
                                    value={contactForm.phone}
                                    onChange={(event) => setContactForm((current) => ({ ...current, phone: event.target.value }))}
                                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                />
                            </label>
                            <label className="block">
                                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">SLA</span>
                                <select
                                    value={contactForm.sla}
                                    onChange={(event) => setContactForm((current) => ({ ...current, sla: event.target.value }))}
                                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                >
                                    <option value="standard">Estándar</option>
                                    <option value="priority">Prioritario</option>
                                    <option value="critical">Crítico</option>
                                </select>
                            </label>
                            <label className="block sm:col-span-2">
                                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">Mail</span>
                                <input
                                    value={contactForm.email}
                                    onChange={(event) => setContactForm((current) => ({ ...current, email: event.target.value }))}
                                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                />
                            </label>
                            <label className="block sm:col-span-2">
                                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">Empresa</span>
                                <input
                                    value={contactForm.companyName}
                                    onChange={(event) => setContactForm((current) => ({ ...current, companyName: event.target.value }))}
                                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                />
                            </label>
                        </div>

                        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 p-4">
                            <button
                                onClick={() => setIsContactModalOpen(false)}
                                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
                                type="button"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={saveContactFromTicket}
                                disabled={isCreatingContact || !contactForm.email.trim()}
                                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                                type="button"
                            >
                                {isCreatingContact ? 'Guardando...' : 'Guardar contacto'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SupportCommandCenter;
