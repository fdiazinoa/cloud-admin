import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertTriangle,
    BatteryLow,
    Clock3,
    Link2,
    Lightbulb,
    Loader2,
    Mail,
    MessageSquare,
    MonitorSmartphone,
    Send,
    Sparkles,
    UserPlus,
    Wand2,
    WifiOff,
    X,
} from 'lucide-react';
import { supabaseAdmin } from '../lib/supabase';

type Sentiment = 'frustrated' | 'neutral' | 'positive';
type ImprovementPriority = 'Baja' | 'Media' | 'Alta' | 'Critica';

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
    tenant_id?: string | null;
}

interface AiTicketInsight {
    sentiment?: Sentiment | null;
    sentiment_score?: number | null;
    summary?: string | null;
    suggested_replies?: string[] | null;
    confidence?: number | null;
}

interface Ticket {
    id: string;
    tenant_id?: string | null;
    tenant_name: string;
    contact?: SupportContact | null;
    category: string;
    priority: string;
    status: string;
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
    created_at: string;
}

interface TicketRow extends Omit<Ticket, 'tenant_name' | 'contact' | 'insight'> {
    tenants?: { name?: string | null } | { name?: string | null }[] | null;
    support_contacts?: SupportContact | SupportContact[] | null;
    ai_ticket_insights?: AiTicketInsight | AiTicketInsight[] | null;
}

interface ImprovementDraft {
    title: string;
    requestedCapability: string;
    affectedModule: string;
    customerImpact: string;
    priority: ImprovementPriority;
}

const statusFilters = ['Todos', 'Abierto', 'En_Proceso', 'Resuelto'];
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

const initialImprovementDraft: ImprovementDraft = {
    title: '',
    requestedCapability: '',
    affectedModule: '',
    customerImpact: '',
    priority: 'Media',
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

function normalizeDuplicateKey(value: string) {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'mejora-manual';
}

const SupportCommandCenter: React.FC = () => {
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
    const [replyText, setReplyText] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [filterStatus, setFilterStatus] = useState('Todos');
    const [filterSource, setFilterSource] = useState('Todos');
    const [isCreatingContact, setIsCreatingContact] = useState(false);
    const [isImprovementModalOpen, setIsImprovementModalOpen] = useState(false);
    const [isSavingImprovement, setIsSavingImprovement] = useState(false);
    const [improvementDraft, setImprovementDraft] = useState<ImprovementDraft>(initialImprovementDraft);
    const [improvementError, setImprovementError] = useState<string | null>(null);
    const [improvementNotice, setImprovementNotice] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const selectedTicketId = selectedTicket?.id;

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

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
                        tenant_id
                    ),
                    ai_ticket_insights (
                        sentiment,
                        sentiment_score,
                        summary,
                        suggested_replies,
                        confidence
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
                if (mounted) setMessages((previous) => [...previous, payload.new as Message]);
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
        if (!replyText.trim() || !selectedTicket) return;

        const text = replyText.trim();
        setReplyText('');

        const { error } = await supabaseAdmin.from('ticket_messages').insert({
            ticket_id: selectedTicket.id,
            message: text,
            sender_type: 'Admin',
        });

        if (error) {
            console.error('Admin: error sending support reply', error);
            setReplyText(text);
        }
    };

    const updateStatus = async (newStatus: string) => {
        if (!selectedTicket) return;

        const { error } = await supabaseAdmin
            .from('support_tickets')
            .update({ status: newStatus })
            .eq('id', selectedTicket.id);

        if (error) {
            console.error('Admin: error updating ticket status', error);
            return;
        }

        setSelectedTicket({ ...selectedTicket, status: newStatus });
    };

    const createContactFromTicket = async () => {
        if (!selectedTicket?.external_sender_email || selectedTicket.contact) return;

        setIsCreatingContact(true);

        const { data: contact, error: contactError } = await supabaseAdmin
            .from('support_contacts')
            .insert({
                email: selectedTicket.external_sender_email.toLowerCase(),
                name: selectedTicket.external_sender_email.split('@')[0],
                source: 'Email',
                metadata: {
                    first_ticket_id: selectedTicket.id,
                    created_from: 'command_center',
                },
            })
            .select('id, email, name, company_name, tenant_id')
            .single();

        if (contactError) {
            console.error('Admin: error creating support contact', contactError);
            setIsCreatingContact(false);
            return;
        }

        const { error: ticketError } = await supabaseAdmin
            .from('support_tickets')
            .update({
                contact_id: contact.id,
                assignment_status: selectedTicket.tenant_id ? 'assigned' : 'needs_assignment',
            })
            .eq('id', selectedTicket.id);

        if (ticketError) {
            console.error('Admin: error linking support contact', ticketError);
        } else {
            setSelectedTicket({ ...selectedTicket, contact, assignment_status: selectedTicket.tenant_id ? 'assigned' : 'needs_assignment' });
        }

        setIsCreatingContact(false);
    };

    const generateDraft = () => {
        if (!selectedTicket) return;

        const suggestedReply = selectedTicket.insight?.suggested_replies?.[0];
        if (suggestedReply) {
            setReplyText(suggestedReply);
            return;
        }

        const lastError = selectedTicket.technical_context?.last_5_errors?.[0];
        const greeting = `Hola ${getTicketOwner(selectedTicket)},`;
        const diagnostic = lastError
            ? `notamos en los logs el evento "${lastError}".`
            : `estamos revisando el caso "${selectedTicket.subject}".`;

        setReplyText(`${greeting} ${diagnostic} Vamos a validar el estado del servicio y te confirmamos los próximos pasos en breve.`);
    };

    const openImprovementModal = () => {
        if (!selectedTicket) return;

        const lastClientMessage = [...messages].reverse().find((message) => message.sender_type === 'Client');
        setImprovementDraft({
            title: selectedTicket.subject,
            requestedCapability: lastClientMessage?.message || selectedTicket.subject,
            affectedModule: selectedTicket.category || '',
            customerImpact: '',
            priority: selectedTicket.priority === 'Critica' ? 'Alta' : 'Media',
        });
        setImprovementError(null);
        setImprovementNotice(null);
        setIsImprovementModalOpen(true);
    };

    const closeImprovementModal = () => {
        if (isSavingImprovement) return;
        setIsImprovementModalOpen(false);
        setImprovementDraft(initialImprovementDraft);
        setImprovementError(null);
    };

    const updateImprovementDraft = <K extends keyof ImprovementDraft>(field: K, value: ImprovementDraft[K]) => {
        setImprovementDraft((current) => ({ ...current, [field]: value }));
    };

    const handleCreateImprovement = async () => {
        if (!selectedTicket) return;

        const title = improvementDraft.title.trim();
        const requestedCapability = improvementDraft.requestedCapability.trim();
        const affectedModule = improvementDraft.affectedModule.trim();
        const customerImpact = improvementDraft.customerImpact.trim();

        if (!title || !requestedCapability) {
            setImprovementError('Completa el titulo y la solicitud antes de registrarla.');
            return;
        }

        setIsSavingImprovement(true);
        setImprovementError(null);

        const duplicateGroupKey = normalizeDuplicateKey(`${selectedTicket.id}-${title}`);
        const payload = {
            ticket_id: selectedTicket.id,
            tenant_id: selectedTicket.tenant_id,
            contact_id: selectedTicket.contact?.id,
            source: 'HelpDesk manual',
            status: 'Nueva',
            priority: improvementDraft.priority,
            title,
            request_text: requestedCapability,
            ai_summary: null,
            requested_capability: requestedCapability,
            affected_module: affectedModule || selectedTicket.category,
            customer_impact: customerImpact || 'Registrada manualmente desde HelpDesk para evaluacion de producto.',
            duplicate_group_key: duplicateGroupKey,
            ai_confidence: null,
            detected_by_ai: false,
        };

        let improvementId: string | null = null;
        let alreadyExisted = false;

        const { data: existing, error: existingError } = await supabaseAdmin
            .from('customer_improvement_requests')
            .select('id')
            .eq('ticket_id', selectedTicket.id)
            .eq('duplicate_group_key', duplicateGroupKey)
            .maybeSingle();

        if (existingError) {
            console.error('Admin: error checking duplicate customer improvement', existingError);
            setImprovementError('No se pudo validar si la mejora ya existia.');
            setIsSavingImprovement(false);
            return;
        }

        if (existing?.id) {
            improvementId = existing.id;
            alreadyExisted = true;
        } else {
            const { data: inserted, error: insertError } = await supabaseAdmin
                .from('customer_improvement_requests')
                .insert(payload)
                .select('id')
                .single();

            if (insertError) {
                console.error('Admin: error creating customer improvement', insertError);
                setImprovementError('No se pudo registrar la mejora solicitada.');
                setIsSavingImprovement(false);
                return;
            }

            improvementId = inserted.id;
        }

        const message = alreadyExisted
            ? `Confirmamos que tu solicitud "${title}" ya estaba registrada como mejora funcional para evaluacion del equipo de producto. Te avisaremos cuando tengamos una decision o avance.`
            : `Registramos tu solicitud "${title}" como mejora funcional para evaluacion del equipo de producto. Te avisaremos cuando tengamos una decision o avance.`;

        const { error: messageError } = await supabaseAdmin.from('ticket_messages').insert({
            ticket_id: selectedTicket.id,
            message,
            sender_type: 'Admin',
            attachments: {
                channel: 'customer_improvement',
                event: alreadyExisted ? 'customer_improvement_already_registered' : 'customer_improvement_registered',
                improvement_request_id: improvementId,
                manual: true,
                notify_client: true,
                notification: {
                    badge: true,
                    increment_unread: true,
                    play_sound: true,
                    sound: 'support-improvement-registered',
                    title: 'Solicitud registrada como mejora',
                    body: message,
                },
                client_alert: {
                    badge: true,
                    increment_unread: true,
                },
            },
        });

        if (messageError) {
            console.error('Admin: error notifying customer improvement', messageError);
            setImprovementNotice('La mejora fue registrada, pero no se pudo insertar la notificacion en el ticket.');
        } else {
            setImprovementNotice(alreadyExisted ? 'La mejora ya existia; se notifico al cliente.' : 'Mejora registrada y cliente notificado.');
            setIsImprovementModalOpen(false);
            setImprovementDraft(initialImprovementDraft);
        }

        setIsSavingImprovement(false);
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
                                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${sourceStyles[ticket.source] ?? sourceStyles.POS}`}>
                                        {ticket.source === 'Email' ? <Mail size={11} /> : <MonitorSmartphone size={11} />}
                                        {ticket.source}
                                    </span>
                                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${ticket.priority === 'Critica' ? 'border-red-200 bg-red-50 text-red-700' : 'border-orange-200 bg-orange-50 text-orange-700'}`}>
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
                                    </div>
                                    <h2 className="truncate text-lg font-bold text-slate-900">{getTicketOwner(selectedTicket)}</h2>
                                    <p className="mt-1 text-sm text-slate-500">{selectedTicket.subject}</p>
                                </div>

                                <div className="flex shrink-0 gap-2">
                                    <button onClick={() => updateStatus('En_Proceso')} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                                        En proceso
                                    </button>
                                    <button onClick={() => updateStatus('Resuelto')} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-emerald-700">
                                        Resolver
                                    </button>
                                </div>
                            </div>

                            {selectedTicket.insight?.summary && (
                                <div className="mt-4 rounded-lg border border-violet-100 bg-violet-50 p-3">
                                    <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-violet-700">
                                        <Sparkles size={14} />
                                        Resumen IA
                                    </div>
                                    <p className="text-sm text-violet-900">{selectedTicket.insight.summary}</p>
                                </div>
                            )}
                        </div>

                        <div className="flex-1 space-y-4 overflow-y-auto p-6">
                            {messages.map((message) => (
                                <div key={message.id} className={`flex ${message.sender_type === 'Admin' ? 'justify-end' : message.sender_type === 'System' ? 'justify-center' : 'justify-start'}`}>
                                    <div className={`max-w-[72%] rounded-2xl px-4 py-3 text-sm shadow-sm ${message.sender_type === 'Admin' ? 'rounded-tr-sm bg-blue-600 text-white' : message.sender_type === 'System' ? 'border border-slate-200 bg-slate-50 text-slate-500' : 'rounded-tl-sm border border-slate-200 bg-white text-slate-700'}`}>
                                        <div className="mb-1 text-[10px] font-bold uppercase opacity-70">
                                            {message.sender_type === 'Admin' ? 'Cloud Admin' : message.sender_type === 'System' ? 'Sistema' : getContactLabel(selectedTicket)}
                                        </div>
                                        {message.message}
                                    </div>
                                </div>
                            ))}
                            <div ref={messagesEndRef} />
                        </div>

                        <div className="shrink-0 border-t border-slate-200 bg-slate-50 p-4">
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
                                    rows={4}
                                    value={replyText}
                                    onChange={(event) => setReplyText(event.target.value)}
                                    placeholder={`Escribe tu respuesta a ${getTicketOwner(selectedTicket)}...`}
                                    className="w-full resize-none border-0 p-3 text-sm outline-none focus:ring-0"
                                />
                                <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-3 py-2">
                                    <button onClick={generateDraft} className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-bold text-violet-700 hover:bg-violet-50">
                                        <Wand2 size={14} />
                                        Borrador IA
                                    </button>
                                    <button onClick={handleSendReply} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700">
                                        Enviar
                                        <Send size={14} />
                                    </button>
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
                        <section>
                            <h4 className="mb-2 text-xs font-semibold text-slate-500">Contacto</h4>
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                                <p className="font-bold text-slate-800">{getContactLabel(selectedTicket)}</p>
                                <p className="mt-1 text-xs text-slate-500">{selectedTicket.contact?.company_name || selectedTicket.tenant_name}</p>

                                {selectedTicket.source === 'Email' && !selectedTicket.contact && selectedTicket.external_sender_email && (
                                    <button
                                        onClick={createContactFromTicket}
                                        disabled={isCreatingContact}
                                        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        <UserPlus size={14} />
                                        {isCreatingContact ? 'Creando contacto...' : 'Crear contacto'}
                                    </button>
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
                                <button
                                    onClick={openImprovementModal}
                                    className="flex w-full items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs font-medium text-amber-800 hover:bg-amber-100"
                                >
                                    Marcar como mejora
                                    <Lightbulb size={13} />
                                </button>
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

            {isImprovementModalOpen && selectedTicket && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
                    <div className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl">
                        <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
                            <div>
                                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
                                    <Lightbulb size={14} />
                                    Mejora solicitada
                                </div>
                                <h2 className="text-lg font-black text-slate-900">Enviar caso a mejoras</h2>
                                <p className="mt-1 text-sm text-slate-500">Se creara una oportunidad vinculada al ticket y se notificara al cliente.</p>
                            </div>
                            <button
                                onClick={closeImprovementModal}
                                className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50"
                                aria-label="Cerrar"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="space-y-4 p-5">
                            <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
                                <label className="block">
                                    <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Titulo</span>
                                    <input
                                        value={improvementDraft.title}
                                        onChange={(event) => updateImprovementDraft('title', event.target.value)}
                                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                        placeholder="Ej. Promociones por forma de pago"
                                    />
                                </label>
                                <label className="block">
                                    <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Prioridad</span>
                                    <select
                                        value={improvementDraft.priority}
                                        onChange={(event) => updateImprovementDraft('priority', event.target.value as ImprovementPriority)}
                                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                    >
                                        <option value="Baja">Baja</option>
                                        <option value="Media">Media</option>
                                        <option value="Alta">Alta</option>
                                        <option value="Critica">Critica</option>
                                    </select>
                                </label>
                            </div>

                            <label className="block">
                                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Modulo afectado</span>
                                <input
                                    value={improvementDraft.affectedModule}
                                    onChange={(event) => updateImprovementDraft('affectedModule', event.target.value)}
                                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                    placeholder="ERP, POS, Promociones, Activos fijos..."
                                />
                            </label>

                            <label className="block">
                                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Solicitud del cliente</span>
                                <textarea
                                    value={improvementDraft.requestedCapability}
                                    onChange={(event) => updateImprovementDraft('requestedCapability', event.target.value)}
                                    rows={4}
                                    className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                    placeholder="Describe lo que el cliente esta solicitando..."
                                />
                            </label>

                            <label className="block">
                                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Impacto operativo</span>
                                <textarea
                                    value={improvementDraft.customerImpact}
                                    onChange={(event) => updateImprovementDraft('customerImpact', event.target.value)}
                                    rows={3}
                                    className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                    placeholder="Ej. Evita doble digitacion, reduce errores, desbloquea cierre de caja..."
                                />
                            </label>

                            {improvementError && (
                                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                                    {improvementError}
                                </div>
                            )}
                            {improvementNotice && (
                                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                                    {improvementNotice}
                                </div>
                            )}
                        </div>

                        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4">
                            <button
                                onClick={closeImprovementModal}
                                disabled={isSavingImprovement}
                                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleCreateImprovement}
                                disabled={isSavingImprovement}
                                className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {isSavingImprovement ? <Loader2 className="animate-spin" size={16} /> : <Lightbulb size={16} />}
                                Registrar y notificar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SupportCommandCenter;
