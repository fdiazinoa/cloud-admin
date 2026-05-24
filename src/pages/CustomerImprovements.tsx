import React, { useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    CheckCircle2,
    CircleDashed,
    ClipboardList,
    ExternalLink,
    Lightbulb,
    Loader2,
    Search,
    XCircle,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabaseAdmin } from '../lib/supabase';

type ImprovementStatus = 'Nueva' | 'En evaluacion' | 'Aceptada' | 'En desarrollo' | 'Implementada' | 'Rechazada';
type ImprovementPriority = 'Baja' | 'Media' | 'Alta' | 'Critica';

interface ImprovementRow {
    id: string;
    ticket_id?: string | null;
    tenant_id?: string | null;
    contact_id?: string | null;
    source: string;
    status: ImprovementStatus;
    priority: ImprovementPriority;
    title: string;
    request_text: string;
    ai_summary?: string | null;
    requested_capability?: string | null;
    affected_module?: string | null;
    customer_impact?: string | null;
    duplicate_group_key?: string | null;
    ai_confidence?: number | null;
    detected_by_ai: boolean;
    decision_notes?: string | null;
    created_at: string;
    updated_at: string;
    tenants?: { name?: string | null } | { name?: string | null }[] | null;
    support_tickets?: {
        subject?: string | null;
        status?: string | null;
        source?: string | null;
    } | {
        subject?: string | null;
        status?: string | null;
        source?: string | null;
    }[] | null;
    support_contacts?: {
        name?: string | null;
        email?: string | null;
        company_name?: string | null;
    } | {
        name?: string | null;
        email?: string | null;
        company_name?: string | null;
    }[] | null;
}

const statuses: ImprovementStatus[] = ['Nueva', 'En evaluacion', 'Aceptada', 'En desarrollo', 'Implementada', 'Rechazada'];
const priorities: ImprovementPriority[] = ['Baja', 'Media', 'Alta', 'Critica'];

const statusStyles: Record<ImprovementStatus, string> = {
    Nueva: 'border-blue-200 bg-blue-50 text-blue-700',
    'En evaluacion': 'border-amber-200 bg-amber-50 text-amber-700',
    Aceptada: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    'En desarrollo': 'border-violet-200 bg-violet-50 text-violet-700',
    Implementada: 'border-teal-200 bg-teal-50 text-teal-700',
    Rechazada: 'border-red-200 bg-red-50 text-red-700',
};

const priorityStyles: Record<ImprovementPriority, string> = {
    Baja: 'border-slate-200 bg-slate-50 text-slate-600',
    Media: 'border-orange-200 bg-orange-50 text-orange-700',
    Alta: 'border-red-200 bg-red-50 text-red-700',
    Critica: 'border-rose-200 bg-rose-50 text-rose-700',
};

function normalizeRelation<T>(value: T | T[] | null | undefined): T | null {
    if (Array.isArray(value)) return value[0] ?? null;
    return value ?? null;
}

function formatDate(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('es-DO', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}

function getCustomerLabel(item: ImprovementRow) {
    const tenant = normalizeRelation(item.tenants);
    const contact = normalizeRelation(item.support_contacts);
    return tenant?.name || contact?.company_name || contact?.name || contact?.email || 'Cliente no identificado';
}

function getTicketLabel(item: ImprovementRow) {
    if (!normalizeRelation(item.support_tickets) && !item.ticket_id) return 'Sin ticket';
    return `#${item.ticket_id?.slice(0, 8) ?? 'sin-id'}`;
}

function confidenceLabel(value?: number | null) {
    if (typeof value !== 'number') return 'Sin confianza IA';
    return `${Math.round(value * 100)}% confianza IA`;
}

export const CustomerImprovements: React.FC = () => {
    const [items, setItems] = useState<ImprovementRow[]>([]);
    const [statusFilter, setStatusFilter] = useState<ImprovementStatus | 'Todas'>('Todas');
    const [query, setQuery] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});

    const fetchItems = async () => {
        setIsLoading(true);
        const { data, error } = await supabaseAdmin
            .from('customer_improvement_requests')
            .select(`
                *,
                tenants (
                    name
                ),
                support_tickets (
                    subject,
                    status,
                    source
                ),
                support_contacts (
                    name,
                    email,
                    company_name
                )
            `)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Admin: error fetching customer improvements', error);
            setIsLoading(false);
            return;
        }

        const rows = (data ?? []) as ImprovementRow[];
        setItems(rows);
        setNotesDraft(Object.fromEntries(rows.map((item) => [item.id, item.decision_notes ?? ''])));
        setIsLoading(false);
    };

    useEffect(() => {
        void Promise.resolve().then(fetchItems);

        const channel = supabaseAdmin.channel('customer_improvement_requests')
            .on('postgres_changes', { event: '*', schema: 'landlord', table: 'customer_improvement_requests' }, () => void fetchItems())
            .subscribe();

        return () => {
            supabaseAdmin.removeChannel(channel);
        };
    }, []);

    const stats = useMemo(() => ({
        total: items.length,
        newItems: items.filter((item) => item.status === 'Nueva').length,
        accepted: items.filter((item) => item.status === 'Aceptada' || item.status === 'En desarrollo').length,
        rejected: items.filter((item) => item.status === 'Rechazada').length,
    }), [items]);

    const filteredItems = useMemo(() => {
        const cleanQuery = query.trim().toLowerCase();

        return items.filter((item) => {
            const matchesStatus = statusFilter === 'Todas' || item.status === statusFilter;
            if (!matchesStatus) return false;
            if (!cleanQuery) return true;

            const haystack = [
                item.title,
                item.request_text,
                item.ai_summary,
                item.requested_capability,
                item.affected_module,
                getCustomerLabel(item),
                getTicketLabel(item),
            ].filter(Boolean).join(' ').toLowerCase();

            return haystack.includes(cleanQuery);
        });
    }, [items, query, statusFilter]);

    const updateImprovement = async (item: ImprovementRow, patch: Partial<Pick<ImprovementRow, 'status' | 'priority' | 'decision_notes'>>) => {
        setSavingId(item.id);
        const { error } = await supabaseAdmin
            .from('customer_improvement_requests')
            .update(patch)
            .eq('id', item.id);

        if (error) {
            console.error('Admin: error updating customer improvement', error);
        } else {
            setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, ...patch } : entry));
        }
        setSavingId(null);
    };

    return (
        <div className="min-h-full bg-slate-50">
            <div className="border-b border-slate-200 bg-white px-6 py-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-amber-700">
                                <Lightbulb size={20} />
                            </div>
                            <div>
                                <h1 className="text-xl font-black text-slate-900">Mejoras solicitadas</h1>
                                <p className="text-sm text-slate-500">Oportunidades detectadas desde conversaciones de clientes.</p>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={() => void fetchItems()}
                        disabled={isLoading}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {isLoading ? <Loader2 className="animate-spin" size={16} /> : <ClipboardList size={16} />}
                        Actualizar
                    </button>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-4">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs font-bold uppercase text-slate-500">Total</p>
                        <p className="mt-1 text-2xl font-black text-slate-900">{stats.total}</p>
                    </div>
                    <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
                        <p className="text-xs font-bold uppercase text-blue-500">Nuevas</p>
                        <p className="mt-1 text-2xl font-black text-blue-700">{stats.newItems}</p>
                    </div>
                    <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3">
                        <p className="text-xs font-bold uppercase text-emerald-500">Aceptadas / dev</p>
                        <p className="mt-1 text-2xl font-black text-emerald-700">{stats.accepted}</p>
                    </div>
                    <div className="rounded-lg border border-red-100 bg-red-50 p-3">
                        <p className="text-xs font-bold uppercase text-red-500">Rechazadas</p>
                        <p className="mt-1 text-2xl font-black text-red-700">{stats.rejected}</p>
                    </div>
                </div>
            </div>

            <div className="space-y-4 p-6">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative min-w-[260px] flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Buscar por cliente, modulo, solicitud o ticket..."
                            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        />
                    </div>

                    <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1">
                        {(['Todas', ...statuses] as const).map((status) => (
                            <button
                                key={status}
                                onClick={() => setStatusFilter(status)}
                                className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${statusFilter === status ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                {status}
                            </button>
                        ))}
                    </div>
                </div>

                {isLoading ? (
                    <div className="flex items-center justify-center rounded-lg border border-slate-200 bg-white py-16 text-slate-500">
                        <Loader2 className="mr-2 animate-spin" size={18} />
                        Cargando mejoras solicitadas...
                    </div>
                ) : filteredItems.length ? (
                    <div className="grid gap-3">
                        {filteredItems.map((item) => {
                            const ticket = normalizeRelation(item.support_tickets);
                            const isSaving = savingId === item.id;

                            return (
                                <article key={item.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                            <div className="mb-2 flex flex-wrap items-center gap-2">
                                                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${statusStyles[item.status]}`}>
                                                    {item.status}
                                                </span>
                                                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${priorityStyles[item.priority]}`}>
                                                    {item.priority}
                                                </span>
                                                {item.affected_module && (
                                                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                                                        {item.affected_module}
                                                    </span>
                                                )}
                                                <span className="text-[11px] font-medium text-slate-400">{formatDate(item.created_at)}</span>
                                            </div>
                                            <h2 className="text-base font-black text-slate-900">{item.title}</h2>
                                            <p className="mt-1 text-sm font-medium text-slate-600">{getCustomerLabel(item)}</p>
                                            <p className="mt-3 text-sm leading-6 text-slate-700">{item.ai_summary || item.requested_capability || item.request_text}</p>
                                        </div>

                                        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:w-48">
                                            <select
                                                value={item.status}
                                                disabled={isSaving}
                                                onChange={(event) => void updateImprovement(item, { status: event.target.value as ImprovementStatus })}
                                                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                            >
                                                {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                                            </select>
                                            <select
                                                value={item.priority}
                                                disabled={isSaving}
                                                onChange={(event) => void updateImprovement(item, { priority: event.target.value as ImprovementPriority })}
                                                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                            >
                                                {priorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                                            </select>
                                        </div>
                                    </div>

                                    <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_260px]">
                                        <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                                            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Solicitud original</p>
                                            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{item.request_text}</p>
                                        </div>

                                        <div className="space-y-3">
                                            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600">
                                                <p className="font-bold text-slate-800">{getTicketLabel(item)}</p>
                                                <p className="mt-1 line-clamp-2">{ticket?.subject || 'Sin asunto vinculado'}</p>
                                                <p className="mt-2">{confidenceLabel(item.ai_confidence)}</p>
                                                {item.ticket_id && (
                                                    <Link
                                                        to="/support"
                                                        className="mt-3 inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 font-bold text-blue-700 hover:bg-blue-50"
                                                    >
                                                        Ver HelpDesk
                                                        <ExternalLink size={12} />
                                                    </Link>
                                                )}
                                            </div>

                                            {item.customer_impact && (
                                                <div className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 p-3 text-xs text-amber-800">
                                                    <AlertTriangle className="mt-0.5 shrink-0" size={14} />
                                                    <span>{item.customer_impact}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
                                        <textarea
                                            value={notesDraft[item.id] ?? ''}
                                            onChange={(event) => setNotesDraft((current) => ({ ...current, [item.id]: event.target.value }))}
                                            placeholder="Notas de decision, alcance o motivo de rechazo..."
                                            className="min-h-[74px] rounded-lg border border-slate-200 bg-white p-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                        />
                                        <div className="flex gap-2 sm:flex-col">
                                            <button
                                                onClick={() => void updateImprovement(item, { decision_notes: notesDraft[item.id] ?? '' })}
                                                disabled={isSaving}
                                                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                {isSaving ? <Loader2 className="animate-spin" size={14} /> : <ClipboardList size={14} />}
                                                Guardar notas
                                            </button>
                                            <button
                                                onClick={() => void updateImprovement(item, { status: 'Aceptada' })}
                                                disabled={isSaving}
                                                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                <CheckCircle2 size={14} />
                                                Aceptar
                                            </button>
                                            <button
                                                onClick={() => void updateImprovement(item, { status: 'Rechazada' })}
                                                disabled={isSaving}
                                                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                <XCircle size={14} />
                                                Rechazar
                                            </button>
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center rounded-lg border border-slate-200 bg-white py-16 text-center">
                        <CircleDashed className="mb-3 text-slate-300" size={48} />
                        <p className="text-sm font-bold text-slate-700">No hay mejoras con estos filtros</p>
                        <p className="mt-1 text-sm text-slate-500">Cuando la IA detecte solicitudes de funciones aparecerán aquí.</p>
                    </div>
                )}
            </div>
        </div>
    );
};
