import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, CalendarClock, CircleDollarSign, Loader2, Pencil, Plus, Save, Search, UserRoundCheck } from 'lucide-react';
import type { CustomerRegistryEntry, CustomerService, CustomerServiceStatus, Tenant } from '../types';
import { customerRegistryService, type CustomerInput, type CustomerServiceInput } from '../lib/customerRegistryService';

const emptyCustomer: CustomerInput = {
    email: '', name: '', companyName: '', phone: '', tenantId: '', hasRetainership: false,
    administrativeNotes: '', storeCreatedAt: '', serviceStartedAt: '', renewalAt: '', lastSuspendedAt: '',
};

const emptyService: CustomerServiceInput = {
    contactId: '', tenantId: '', serviceCode: '', serviceName: '', quantity: 1, status: 'active',
    startedAt: '', renewalAt: '', nextChargeAt: '', additionalCharge: 0,
    scheduledAction: '', scheduledActionAt: '', administrativeNotes: '',
};

const statusLabel: Record<CustomerServiceStatus, string> = {
    planned: 'Planificado', active: 'Activo', suspended: 'Suspendido', cancelled: 'Cancelado',
};

export const Customers = () => {
    const [customers, setCustomers] = useState<CustomerRegistryEntry[]>([]);
    const [tenants, setTenants] = useState<Array<Pick<Tenant, 'id' | 'name' | 'status' | 'contracted_product' | 'max_pos_terminals' | 'max_erp_users'>>>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
    const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
    const [customerForm, setCustomerForm] = useState<CustomerInput>(emptyCustomer);
    const [serviceForm, setServiceForm] = useState<CustomerServiceInput>(emptyService);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const selected = customers.find((customer) => customer.id === selectedId) ?? null;
    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return customers;
        return customers.filter((customer) => [customer.company_name, customer.name, customer.email, customer.phone]
            .some((value) => value?.toLowerCase().includes(query)));
    }, [customers, search]);
    const activeServices = customers.flatMap((customer) => customer.services).filter((service) => service.status === 'active').length;
    const scheduledActions = customers.flatMap((customer) => customer.services).filter((service) => service.scheduled_action_at && service.status !== 'cancelled').length;

    const load = useCallback(async (preferredId?: string | null) => {
        setLoading(true);
        try {
            const data = await customerRegistryService.getCustomerRegistry();
            setCustomers(data.customers);
            setTenants(data.tenants);
            setSelectedId((currentId) => {
                const nextId = preferredId || currentId || data.customers[0]?.id || null;
                return data.customers.some((customer) => customer.id === nextId) ? nextId : data.customers[0]?.id || null;
            });
        } catch (error) {
            alert(message(error));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const editCustomer = (customer: CustomerRegistryEntry) => {
        setSelectedId(customer.id);
        setEditingCustomerId(customer.id);
        setCustomerForm({
            email: customer.email, name: customer.name || '', companyName: customer.company_name || '', phone: customer.phone || '',
            tenantId: customer.tenant_id || '', hasRetainership: customer.has_retainership,
            administrativeNotes: customer.administrative_notes || '', storeCreatedAt: customer.store_created_at || '',
            serviceStartedAt: customer.service_started_at || '', renewalAt: customer.renewal_at || '',
            lastSuspendedAt: customer.last_suspended_at?.slice(0, 16) || '',
        });
    };

    const editService = (service: CustomerService) => {
        setEditingServiceId(service.id);
        setServiceForm({
            contactId: service.contact_id, tenantId: service.tenant_id || '', serviceCode: service.service_code,
            serviceName: service.service_name, quantity: service.quantity, status: service.status,
            startedAt: service.started_at || '', renewalAt: service.renewal_at || '', nextChargeAt: service.next_charge_at || '',
            additionalCharge: service.additional_charge, scheduledAction: service.scheduled_action || '',
            scheduledActionAt: service.scheduled_action_at?.slice(0, 16) || '', administrativeNotes: service.administrative_notes || '',
        });
    };

    const saveCustomer = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        try {
            const result = await customerRegistryService.saveCustomer(editingCustomerId, customerForm);
            setEditingCustomerId(null);
            setCustomerForm(emptyCustomer);
            await load(result.customer.id);
        } catch (error) { alert(message(error)); } finally { setSaving(false); }
    };

    const saveService = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!selected) return;
        setSaving(true);
        try {
            await customerRegistryService.saveCustomerService(editingServiceId, { ...serviceForm, contactId: selected.id, tenantId: serviceForm.tenantId || selected.tenant_id || '' });
            setEditingServiceId(null);
            setServiceForm({ ...emptyService, contactId: selected.id, tenantId: selected.tenant_id || '' });
            await load(selected.id);
        } catch (error) { alert(message(error)); } finally { setSaving(false); }
    };

    return (
        <div className="min-h-full bg-slate-50 p-4 sm:p-6 xl:p-8">
            <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <p className="text-xs font-black uppercase tracking-[0.22em] text-indigo-600">Recepción y gerencia</p>
                    <h2 className="mt-2 text-2xl font-black text-slate-950">Clientes y servicios contratados</h2>
                    <p className="mt-1 text-sm text-slate-500">Registra al cliente antes del primer ticket y centraliza su información comercial.</p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                    <Metric label="Clientes" value={customers.length} />
                    <Metric label="Servicios" value={activeServices} />
                    <Metric label="Programados" value={scheduledActions} />
                </div>
            </div>

            <div className="grid gap-6 2xl:grid-cols-[380px_minmax(0,1fr)]">
                <form onSubmit={saveCustomer} className="h-max space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div><h3 className="font-black text-slate-900">{editingCustomerId ? 'Editar cliente' : 'Registrar cliente'}</h3><p className="text-xs text-slate-500">El email permitirá identificar sus tickets.</p></div>
                        {editingCustomerId ? <button type="button" className="text-xs font-bold text-slate-500" onClick={() => { setEditingCustomerId(null); setCustomerForm(emptyCustomer); }}>Cancelar</button> : null}
                    </div>
                    <Input label="Empresa" required value={customerForm.companyName} onChange={(value) => setCustomerForm({ ...customerForm, companyName: value })} />
                    <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-1">
                        <Input label="Contacto" value={customerForm.name} onChange={(value) => setCustomerForm({ ...customerForm, name: value })} />
                        <Input label="Teléfono" value={customerForm.phone} onChange={(value) => setCustomerForm({ ...customerForm, phone: value })} />
                    </div>
                    <Input label="Correo" type="email" required value={customerForm.email} onChange={(value) => setCustomerForm({ ...customerForm, email: value })} />
                    <label className="block"><span className="label">Tenant asociado</span><select className="input" value={customerForm.tenantId} onChange={(event) => setCustomerForm({ ...customerForm, tenantId: event.target.value })}><option value="">Sin tenant todavía</option>{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}</select></label>
                    <label className="flex items-center gap-3 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-sm font-bold text-indigo-800"><input type="checkbox" checked={customerForm.hasRetainership} onChange={(event) => setCustomerForm({ ...customerForm, hasRetainership: event.target.checked })} />Posee contrato de iguala</label>
                    <div className="grid grid-cols-2 gap-3">
                        <Input label="Inicio servicio" type="date" value={customerForm.serviceStartedAt} onChange={(value) => setCustomerForm({ ...customerForm, serviceStartedAt: value })} />
                        <Input label="Próxima renovación" type="date" value={customerForm.renewalAt} onChange={(value) => setCustomerForm({ ...customerForm, renewalAt: value })} />
                        <Input label="Creación tienda" type="date" value={customerForm.storeCreatedAt} onChange={(value) => setCustomerForm({ ...customerForm, storeCreatedAt: value })} />
                        <Input label="Última suspensión" type="datetime-local" value={customerForm.lastSuspendedAt} onChange={(value) => setCustomerForm({ ...customerForm, lastSuspendedAt: value })} />
                    </div>
                    <label className="block"><span className="label">Observaciones</span><textarea className="input min-h-20 resize-y" value={customerForm.administrativeNotes} onChange={(event) => setCustomerForm({ ...customerForm, administrativeNotes: event.target.value })} /></label>
                    <button disabled={saving} className="btn-primary w-full" type="submit">{saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}{editingCustomerId ? 'Guardar cliente' : 'Registrar cliente'}</button>
                </form>

                <div className="min-w-0 space-y-6">
                    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
                            <h3 className="font-black text-slate-900">Directorio</h3>
                            <div className="relative"><Search size={15} className="absolute left-3 top-2.5 text-slate-400" /><input className="input pl-9 sm:w-72" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Empresa, contacto o correo" /></div>
                        </div>
                        {loading ? <div className="p-10 text-center text-sm font-bold text-slate-500">Cargando clientes...</div> : (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[860px] border-collapse text-left">
                                    <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500">
                                        <tr>
                                            <th className="px-4 py-3">Cliente</th>
                                            <th className="px-4 py-3">Contacto</th>
                                            <th className="px-4 py-3">Tenant</th>
                                            <th className="px-4 py-3">Contrato</th>
                                            <th className="px-4 py-3 text-center">Servicios</th>
                                            <th className="px-4 py-3">Renovación</th>
                                            <th className="px-4 py-3 text-right">Acción</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filtered.map((customer) => {
                                            const activeCustomerServices = customer.services.filter((service) => service.status === 'active').length;
                                            const isSelected = selectedId === customer.id;
                                            return (
                                                <tr key={customer.id} className={`transition-colors ${isSelected ? 'bg-indigo-50/80' : 'hover:bg-slate-50'}`}>
                                                    <td className={`border-l-2 px-4 py-3 ${isSelected ? 'border-indigo-500' : 'border-transparent'}`}>
                                                        <button type="button" onClick={() => setSelectedId(customer.id)} className="text-left">
                                                            <span className="block font-black text-slate-900">{customer.company_name || customer.name || customer.email}</span>
                                                            <span className="mt-0.5 block text-xs text-slate-500">{customer.email}</span>
                                                        </button>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className="block text-sm font-bold text-slate-700">{customer.name || 'Sin contacto'}</span>
                                                        <span className="mt-0.5 block text-xs text-slate-500">{customer.phone || 'Sin teléfono'}</span>
                                                    </td>
                                                    <td className="px-4 py-3 text-sm text-slate-600">{customer.tenant?.name || 'No vinculado'}</td>
                                                    <td className="px-4 py-3">
                                                        <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-black ${customer.has_retainership ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{customer.has_retainership ? 'Iguala' : 'Sin iguala'}</span>
                                                    </td>
                                                    <td className="px-4 py-3 text-center"><span className="inline-flex min-w-8 justify-center rounded-full bg-indigo-50 px-2 py-1 text-xs font-black text-indigo-700">{activeCustomerServices}</span></td>
                                                    <td className="px-4 py-3 text-sm text-slate-600">{formatDate(customer.renewal_at)}</td>
                                                    <td className="px-4 py-3 text-right"><button type="button" onClick={() => setSelectedId(customer.id)} className="text-xs font-black text-indigo-600 hover:text-indigo-800">Ver detalle</button></td>
                                                </tr>
                                            );
                                        })}
                                        {filtered.length === 0 ? <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">No hay clientes con ese filtro.</td></tr> : null}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>

                    {selected ? <CustomerDetail customer={selected} tenants={tenants} serviceForm={serviceForm} setServiceForm={setServiceForm} editingServiceId={editingServiceId} saving={saving} onEditCustomer={() => editCustomer(selected)} onEditService={editService} onSaveService={saveService} onCancelEdit={() => { setEditingServiceId(null); setServiceForm({ ...emptyService, contactId: selected.id, tenantId: selected.tenant_id || '' }); }} /> : null}
                </div>
            </div>
        </div>
    );
};

function CustomerDetail({ customer, tenants, serviceForm, setServiceForm, editingServiceId, saving, onEditCustomer, onEditService, onSaveService, onCancelEdit }: {
    customer: CustomerRegistryEntry; tenants: Array<Pick<Tenant, 'id' | 'name'>>; serviceForm: CustomerServiceInput;
    setServiceForm: (value: CustomerServiceInput) => void; editingServiceId: string | null; saving: boolean;
    onEditCustomer: () => void; onEditService: (service: CustomerService) => void; onSaveService: (event: React.FormEvent) => void; onCancelEdit: () => void;
}) {
    return <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-black uppercase tracking-wider text-indigo-600">Ficha del cliente</p><h3 className="mt-1 text-xl font-black text-slate-950">{customer.company_name}</h3><p className="text-sm text-slate-500">{customer.name || 'Sin contacto'} · {customer.phone || 'Sin teléfono'}</p></div><button type="button" onClick={onEditCustomer} className="btn-secondary"><Pencil size={15} />Editar ficha</button></div>
        <div className="my-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Info icon={<UserRoundCheck size={17} />} label="Contrato" value={customer.has_retainership ? 'Iguala activa' : 'Sin iguala'} /><Info icon={<Building2 size={17} />} label="Tenant" value={customer.tenant?.name || 'No vinculado'} /><Info icon={<CalendarClock size={17} />} label="Renovación" value={formatDate(customer.renewal_at)} /><Info icon={<CircleDollarSign size={17} />} label="POS / accesos" value={`${customer.tenant?.max_pos_terminals ?? 0} / ${customer.tenant?.max_erp_users ?? 0}`} /></div>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-3"><h4 className="text-sm font-black text-slate-900">Servicios contratados</h4>{customer.services.map((service) => <article key={service.id} className="rounded-lg border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-black text-slate-800">{service.service_name} <span className="text-slate-400">× {service.quantity}</span></p><p className="mt-1 text-xs text-slate-500">Renueva: {formatDate(service.renewal_at)} · Próximo cobro: {formatDate(service.next_charge_at)}</p></div><button className="icon-btn" onClick={() => onEditService(service)} type="button"><Pencil size={15} /></button></div><div className="mt-3 flex flex-wrap gap-2"><span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700">{statusLabel[service.status]}</span>{service.additional_charge > 0 ? <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-700">Cargo: {service.additional_charge.toLocaleString('es-DO', { style: 'currency', currency: 'DOP' })}</span> : null}{service.scheduled_action ? <span className="rounded-full bg-indigo-50 px-2 py-1 text-[10px] font-black text-indigo-700">Programado: {service.scheduled_action}</span> : null}</div></article>)}{customer.services.length === 0 ? <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">Aún no hay servicios registrados.</p> : null}</div>
            <form onSubmit={onSaveService} className="space-y-3 rounded-xl bg-slate-50 p-4"><div className="flex justify-between"><h4 className="text-sm font-black text-slate-900">{editingServiceId ? 'Editar servicio' : 'Agregar servicio'}</h4>{editingServiceId ? <button type="button" onClick={onCancelEdit} className="text-xs font-bold text-slate-500">Cancelar</button> : null}</div><Input label="Código" required value={serviceForm.serviceCode} onChange={(value) => setServiceForm({ ...serviceForm, serviceCode: value })} /><Input label="Servicio" required value={serviceForm.serviceName} onChange={(value) => setServiceForm({ ...serviceForm, serviceName: value })} /><div className="grid grid-cols-2 gap-3"><Input label="Cantidad" type="number" required value={String(serviceForm.quantity)} onChange={(value) => setServiceForm({ ...serviceForm, quantity: Number(value) })} /><label><span className="label">Estado</span><select className="input" value={serviceForm.status} onChange={(event) => setServiceForm({ ...serviceForm, status: event.target.value as CustomerServiceStatus })}>{Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div><label><span className="label">Tenant</span><select className="input" value={serviceForm.tenantId || customer.tenant_id || ''} onChange={(event) => setServiceForm({ ...serviceForm, tenantId: event.target.value })}><option value="">Sin tenant</option>{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}</select></label><div className="grid grid-cols-2 gap-3"><Input label="Inicio" type="date" value={serviceForm.startedAt} onChange={(value) => setServiceForm({ ...serviceForm, startedAt: value })} /><Input label="Renovación" type="date" value={serviceForm.renewalAt} onChange={(value) => setServiceForm({ ...serviceForm, renewalAt: value })} /><Input label="Próximo cobro" type="date" value={serviceForm.nextChargeAt} onChange={(value) => setServiceForm({ ...serviceForm, nextChargeAt: value })} /><Input label="Cargo adicional" type="number" value={String(serviceForm.additionalCharge)} onChange={(value) => setServiceForm({ ...serviceForm, additionalCharge: Number(value) })} /></div><label><span className="label">Acción programada</span><select className="input" value={serviceForm.scheduledAction} onChange={(event) => setServiceForm({ ...serviceForm, scheduledAction: event.target.value as CustomerServiceInput['scheduledAction'] })}><option value="">Ninguna</option><option value="charge">Cargo</option><option value="suspend">Suspensión</option><option value="reactivate">Reactivación</option></select></label>{serviceForm.scheduledAction ? <Input label="Fecha de acción" type="datetime-local" value={serviceForm.scheduledActionAt} onChange={(value) => setServiceForm({ ...serviceForm, scheduledActionAt: value })} /> : null}<label><span className="label">Observaciones</span><textarea className="input min-h-16" value={serviceForm.administrativeNotes} onChange={(event) => setServiceForm({ ...serviceForm, administrativeNotes: event.target.value })} /></label><button disabled={saving} className="btn-primary w-full" type="submit"><Plus size={16} />{editingServiceId ? 'Guardar servicio' : 'Agregar servicio'}</button></form>
        </div>
    </section>;
}

function Input({ label, value, onChange, type = 'text', required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) { return <label className="block"><span className="label">{label}</span><input className="input" type={type} required={required} value={value} onChange={(event) => onChange(event.target.value)} /></label>; }
function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-center shadow-sm"><p className="text-lg font-black text-slate-900">{value}</p><p className="text-[10px] font-bold uppercase text-slate-500">{label}</p></div>; }
function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="flex items-center gap-2 text-indigo-600">{icon}<span className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</span></div><p className="mt-2 text-sm font-black text-slate-800">{value}</p></div>; }
function formatDate(value?: string | null) { return value ? new Intl.DateTimeFormat('es-DO', { dateStyle: 'medium' }).format(new Date(`${value.slice(0, 10)}T12:00:00`)) : 'No definida'; }
function message(error: unknown) { return error instanceof Error ? error.message : 'No se pudo completar la operación.'; }
