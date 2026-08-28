import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Lightbulb, Loader2, Plus, Search, UserRound, X } from 'lucide-react';
import {
    createInternalRequest,
    listInternalRequests,
    updateInternalRequest,
    type InternalRequestPriority,
    type InternalRequestProduct,
    type InternalRequestStatus,
    type InternalRequestType,
    type InternalRequestUser,
    type InternalWorkRequest,
} from '../lib/internalRequestService';

const productLabels: Record<InternalRequestProduct, string> = {
    msmall: 'MSmall',
    clicpos: 'ClicPOS',
    erp: 'ERP',
    'cloud-admin': 'Cloud-Admin',
    general: 'General',
};
const statusLabels: Record<InternalRequestStatus, string> = {
    new: 'Nueva',
    under_review: 'Por verificar',
    in_progress: 'En progreso',
    completed: 'Completada',
    rejected: 'Descartada',
};
const statusStyles: Record<InternalRequestStatus, string> = {
    new: 'border-blue-200 bg-blue-50 text-blue-700',
    under_review: 'border-amber-200 bg-amber-50 text-amber-700',
    in_progress: 'border-indigo-200 bg-indigo-50 text-indigo-700',
    completed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    rejected: 'border-slate-200 bg-slate-100 text-slate-500',
};
const priorityStyles: Record<InternalRequestPriority, string> = {
    Baja: 'bg-slate-100 text-slate-600',
    Media: 'bg-blue-50 text-blue-700',
    Alta: 'bg-amber-50 text-amber-700',
    Critica: 'bg-rose-50 text-rose-700',
};
const emptyForm = {
    requestType: 'problem' as InternalRequestType,
    product: 'cloud-admin' as InternalRequestProduct,
    priority: 'Media' as InternalRequestPriority,
    title: '',
    description: '',
};

function normalizeRelation<T>(value: T | T[] | null | undefined) {
    return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function formatDate(value: string) {
    return new Intl.DateTimeFormat('es-DO', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}

export const InternalRequests: React.FC = () => {
    const [requests, setRequests] = useState<InternalWorkRequest[]>([]);
    const [users, setUsers] = useState<InternalRequestUser[]>([]);
    const [form, setForm] = useState(emptyForm);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | InternalRequestStatus>('all');
    const [productFilter, setProductFilter] = useState<'all' | InternalRequestProduct>('all');
    const [isCreateOpen, setIsCreateOpen] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const response = await listInternalRequests();
            setRequests(response.requests);
            setUsers(response.users);
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar las solicitudes internas.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void load(); }, []);

    const visibleRequests = useMemo(() => {
        const needle = search.trim().toLocaleLowerCase('es');
        return requests.filter((request) => {
            const statusMatches = statusFilter === 'all' || request.status === statusFilter;
            const productMatches = productFilter === 'all' || request.product === productFilter;
            const textMatches = !needle || `${request.request_number} ${request.title} ${request.description}`.toLocaleLowerCase('es').includes(needle);
            return statusMatches && productMatches && textMatches;
        });
    }, [productFilter, requests, search, statusFilter]);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setError(null);
        setNotice(null);
        try {
            await createInternalRequest({
                ...form,
                sourcePage: window.location.hash,
            });
            setForm(emptyForm);
            setNotice('Solicitud interna registrada para verificación.');
            setIsCreateOpen(false);
            await load();
        } catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : 'No se pudo registrar la solicitud.');
        } finally {
            setSaving(false);
        }
    };

    const update = async (requestId: string, fields: { status?: InternalRequestStatus; assignedTo?: string | null }) => {
        try {
            await updateInternalRequest(requestId, fields);
            await load();
        } catch (updateError) {
            setError(updateError instanceof Error ? updateError.message : 'No se pudo actualizar la solicitud.');
        }
    };

    return (
        <div className="min-h-full bg-slate-50 p-4 sm:p-6 xl:p-8">
            <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.22em] text-indigo-600">Operación interna</p>
                    <h1 className="mt-1.5 text-2xl font-black text-slate-900">Problemas y mejoras detectadas</h1>
                    <p className="mt-1 text-sm text-slate-500">Registra, asigna y da seguimiento a las solicitudes del equipo.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm">{requests.length} solicitudes</span>
                    <span className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">{requests.filter((request) => request.status !== 'completed' && request.status !== 'rejected').length} pendientes</span>
                    <button type="button" onClick={() => { setError(null); setNotice(null); setIsCreateOpen(true); }} className="btn-primary">
                        <Plus size={16} />Nueva solicitud
                    </button>
                </div>
            </div>

            {error && !isCreateOpen ? <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</p> : null}
            {notice ? <p className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">{notice}</p> : null}

            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="grid gap-2 border-b border-slate-100 p-3 md:grid-cols-[minmax(220px,1fr)_180px_180px]">
                    <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} className="input py-2 pl-9 text-xs" placeholder="Buscar por número, título o detalle" /></div>
                    <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | InternalRequestStatus)} className="input py-2 text-xs"><option value="all">Todos los estados</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                    <select value={productFilter} onChange={(event) => setProductFilter(event.target.value as 'all' | InternalRequestProduct)} className="input py-2 text-xs"><option value="all">Todos los productos</option>{Object.entries(productLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                </div>

                {loading ? <div className="flex min-h-52 items-center justify-center gap-2 text-sm font-bold text-slate-500"><Loader2 className="animate-spin" size={18} />Cargando solicitudes…</div> : null}
                {!loading && visibleRequests.length === 0 ? <div className="flex min-h-52 flex-col items-center justify-center"><CheckCircle2 size={32} className="text-slate-300" /><p className="mt-2 text-sm font-black text-slate-700">No hay solicitudes con estos filtros</p></div> : null}
                {!loading && visibleRequests.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[1080px] border-collapse text-left">
                            <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500">
                                <tr>
                                    <th className="w-[40%] px-4 py-2.5">Solicitud</th>
                                    <th className="px-3 py-2.5">Producto</th>
                                    <th className="px-3 py-2.5">Prioridad</th>
                                    <th className="w-40 px-3 py-2.5">Estado</th>
                                    <th className="w-48 px-3 py-2.5">Responsable</th>
                                    <th className="px-4 py-2.5">Reportada</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {visibleRequests.map((request) => {
                                    const reporter = normalizeRelation(request.reporter);
                                    const assignee = normalizeRelation(request.assignee);
                                    return (
                                        <tr key={request.id} className="align-middle transition-colors hover:bg-slate-50/80">
                                            <td className="px-4 py-3">
                                                <div className="flex items-start gap-2.5">
                                                    <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${request.request_type === 'problem' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}>
                                                        {request.request_type === 'problem' ? <AlertTriangle size={14} /> : <Lightbulb size={14} />}
                                                    </span>
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[10px] font-black text-slate-400">#{request.request_number}</span>
                                                            <span className="text-sm font-black text-slate-900">{request.title}</span>
                                                        </div>
                                                        <p className="mt-0.5 line-clamp-1 text-xs text-slate-500" title={request.description}>{request.description}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-3 py-3"><span className="rounded-md bg-indigo-50 px-2 py-1 text-[11px] font-bold text-indigo-700">{productLabels[request.product]}</span></td>
                                            <td className="px-3 py-3"><span className={`rounded-md px-2 py-1 text-[11px] font-black ${priorityStyles[request.priority]}`}>{request.priority}</span></td>
                                            <td className="px-3 py-3"><select aria-label={`Estado de ${request.title}`} value={request.status} onChange={(event) => void update(request.id, { status: event.target.value as InternalRequestStatus })} className={`w-full rounded-lg border px-2 py-1.5 text-[11px] font-bold ${statusStyles[request.status]}`}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
                                            <td className="px-3 py-3"><select aria-label={`Responsable de ${request.title}`} value={assignee?.id || ''} onChange={(event) => void update(request.id, { assignedTo: event.target.value || null })} className="input py-1.5 text-[11px]"><option value="">Sin asignar</option>{users.map((user) => <option key={user.id} value={user.id}>{user.full_name}</option>)}</select></td>
                                            <td className="px-4 py-3">
                                                <p className="flex items-center gap-1 text-xs font-bold text-slate-700"><UserRound size={12} />{reporter?.full_name || 'Usuario interno'}</p>
                                                <p className="mt-0.5 text-[10px] text-slate-400">{formatDate(request.created_at)}</p>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : null}
            </section>

            {isCreateOpen ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/50 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="new-internal-request-title">
                    <div className="my-4 w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl">
                        <div className="flex items-start justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
                            <div>
                                <h2 id="new-internal-request-title" className="font-black text-slate-900">Nueva solicitud interna</h2>
                                <p className="mt-0.5 text-xs text-slate-500">Documenta el hallazgo para asignarlo y darle seguimiento.</p>
                            </div>
                            <button type="button" onClick={() => setIsCreateOpen(false)} disabled={saving} className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"><X size={19} /></button>
                        </div>
                        <form onSubmit={submit} className="max-h-[80vh] space-y-3 overflow-y-auto p-4">
                            <div className="grid grid-cols-2 gap-2">
                                <button type="button" onClick={() => setForm({ ...form, requestType: 'problem' })} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-black ${form.requestType === 'problem' ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-slate-200 text-slate-600'}`}><AlertTriangle size={16} />Problema</button>
                                <button type="button" onClick={() => setForm({ ...form, requestType: 'improvement' })} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-black ${form.requestType === 'improvement' ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-600'}`}><Lightbulb size={16} />Mejora</button>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <Field label="Producto"><select value={form.product} onChange={(event) => setForm({ ...form, product: event.target.value as InternalRequestProduct })} className="input py-2 text-xs">{Object.entries(productLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
                                <Field label="Prioridad"><select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as InternalRequestPriority })} className="input py-2 text-xs">{(['Baja', 'Media', 'Alta', 'Critica'] as InternalRequestPriority[]).map((priority) => <option key={priority}>{priority}</option>)}</select></Field>
                            </div>
                            <Field label="Título"><input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="input py-2 text-xs" placeholder="Qué se detectó" /></Field>
                            <Field label="Detalle y cómo reproducirlo"><textarea required value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="input min-h-28 resize-y text-xs" placeholder="Describe el problema, impacto o mejora propuesta…" /></Field>
                            {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</p> : null}
                            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                                <button type="button" onClick={() => setIsCreateOpen(false)} disabled={saving} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600">Cancelar</button>
                                <button disabled={saving} type="submit" className="btn-primary justify-center">{saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}Registrar solicitud</button>
                            </div>
                        </form>
                    </div>
                </div>
            ) : null}
        </div>
    );
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return <label className="block"><span className="mb-1 block text-xs font-black uppercase tracking-wider text-slate-500">{label}</span>{children}</label>;
}
