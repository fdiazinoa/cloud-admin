import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Lightbulb, Loader2, Plus, Search, UserRound } from 'lucide-react';
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
        <div className="min-h-full bg-slate-50">
            <header className="border-b border-slate-200 bg-white px-8 py-6">
                <p className="text-xs font-black uppercase tracking-[0.24em] text-indigo-600">Operación interna</p>
                <h1 className="mt-2 text-2xl font-black text-slate-900">Problemas y mejoras detectadas</h1>
                <p className="mt-1 text-sm text-slate-500">Registra en el momento lo que debe verificarse o mejorarse y dale seguimiento después.</p>
            </header>

            <div className="grid gap-6 p-8 xl:grid-cols-[380px_1fr]">
                <form onSubmit={submit} className="h-fit space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => setForm({ ...form, requestType: 'problem' })} className={`rounded-xl border p-3 text-left ${form.requestType === 'problem' ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-slate-200 text-slate-600'}`}>
                            <AlertTriangle size={18} /><span className="mt-2 block text-xs font-black">Problema</span>
                        </button>
                        <button type="button" onClick={() => setForm({ ...form, requestType: 'improvement' })} className={`rounded-xl border p-3 text-left ${form.requestType === 'improvement' ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-600'}`}>
                            <Lightbulb size={18} /><span className="mt-2 block text-xs font-black">Mejora</span>
                        </button>
                    </div>
                    <Field label="Producto">
                        <select value={form.product} onChange={(event) => setForm({ ...form, product: event.target.value as InternalRequestProduct })} className="input">
                            {Object.entries(productLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                    </Field>
                    <Field label="Prioridad">
                        <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as InternalRequestPriority })} className="input">
                            {(['Baja', 'Media', 'Alta', 'Critica'] as InternalRequestPriority[]).map((priority) => <option key={priority}>{priority}</option>)}
                        </select>
                    </Field>
                    <Field label="Título">
                        <input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="input" placeholder="Qué se detectó" />
                    </Field>
                    <Field label="Detalle y cómo reproducirlo">
                        <textarea required value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="input min-h-[130px] resize-y" placeholder="Describe el problema, impacto o mejora propuesta…" />
                    </Field>
                    {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</p> : null}
                    {notice ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">{notice}</p> : null}
                    <button disabled={saving} type="submit" className="btn-primary w-full justify-center">
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                        Registrar ahora
                    </button>
                </form>

                <section>
                    <div className="mb-4 grid gap-2 rounded-xl border border-slate-200 bg-white p-3 md:grid-cols-[1fr_180px_180px]">
                        <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} className="input pl-9" placeholder="Buscar solicitud" /></div>
                        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | InternalRequestStatus)} className="input"><option value="all">Todos los estados</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                        <select value={productFilter} onChange={(event) => setProductFilter(event.target.value as 'all' | InternalRequestProduct)} className="input"><option value="all">Todos los productos</option>{Object.entries(productLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                    </div>

                    {loading ? <div className="flex min-h-[250px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-500"><Loader2 className="animate-spin" size={18} />Cargando solicitudes…</div> : null}
                    {!loading && visibleRequests.length === 0 ? <div className="flex min-h-[250px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white"><CheckCircle2 size={36} className="text-slate-300" /><p className="mt-3 font-black text-slate-700">No hay solicitudes con estos filtros</p></div> : null}
                    <div className="grid gap-4 2xl:grid-cols-2">
                        {visibleRequests.map((request) => {
                            const reporter = normalizeRelation(request.reporter);
                            const assignee = normalizeRelation(request.assignee);
                            return (
                                <article key={request.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex flex-wrap gap-1.5 text-[10px] font-black uppercase">
                                            <span className="rounded-full bg-slate-900 px-2 py-1 text-white">#{request.request_number}</span>
                                            <span className={`rounded-full border px-2 py-1 ${request.request_type === 'problem' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>{request.request_type === 'problem' ? 'Problema' : 'Mejora'}</span>
                                            <span className="rounded-full bg-indigo-50 px-2 py-1 text-indigo-700">{productLabels[request.product]}</span>
                                        </div>
                                        <span className="text-xs font-black text-slate-500">{request.priority}</span>
                                    </div>
                                    <h3 className="mt-3 font-black text-slate-900">{request.title}</h3>
                                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{request.description}</p>
                                    <div className="mt-4 grid gap-2 border-t border-slate-100 pt-4 sm:grid-cols-2">
                                        <label><span className="mb-1 block text-[10px] font-black uppercase text-slate-400">Estado</span><select value={request.status} onChange={(event) => void update(request.id, { status: event.target.value as InternalRequestStatus })} className={`w-full rounded-lg border px-2 py-2 text-xs font-bold ${statusStyles[request.status]}`}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                                        <label><span className="mb-1 block text-[10px] font-black uppercase text-slate-400">Responsable</span><select value={assignee?.id || ''} onChange={(event) => void update(request.id, { assignedTo: event.target.value || null })} className="input py-2 text-xs"><option value="">Sin asignar</option>{users.map((user) => <option key={user.id} value={user.id}>{user.full_name}</option>)}</select></label>
                                    </div>
                                    <p className="mt-3 flex items-center gap-1 text-[11px] text-slate-400"><UserRound size={12} />Reportado por {reporter?.full_name || 'Usuario interno'}</p>
                                </article>
                            );
                        })}
                    </div>
                </section>
            </div>
        </div>
    );
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return <label className="block"><span className="mb-1 block text-xs font-black uppercase tracking-wider text-slate-500">{label}</span>{children}</label>;
}
