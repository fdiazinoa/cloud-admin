import React, { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Building2, Check, Loader2, PackageSearch, X } from 'lucide-react';
import type { Distributor } from '../../types';
import { getDefaultTenantProducts, type TenantProductSelection } from '../../lib/tenantProducts';
import { buildTenantSlug } from '../../lib/tenantSlug';
import { TenantProductsEditor } from '../TenantProductsEditor';
import { TenantProductSummary } from './TenantProductSummary';
import type { TenantCreateFormData } from './types';

interface TenantCreateFlowProps {
    distributors: Distributor[];
    distributorsLoading: boolean;
    isSubmitting: boolean;
    onSubmit: (form: TenantCreateFormData) => Promise<void>;
    onCancel: () => void;
}

const STEPS = [
    { key: 1, label: 'Empresa y acceso' },
    { key: 2, label: 'Productos' },
    { key: 3, label: 'Confirmar' },
] as const;

const emptyForm = (): TenantCreateFormData => ({
    name: '',
    slug: '',
    email: '',
    taxId: '',
    contactName: '',
    contactEmail: '',
    city: '',
    capturedByDistributorId: '',
    servicedByDistributorId: '',
    products: getDefaultTenantProducts(),
});

const Label: React.FC<{ children: React.ReactNode; required?: boolean }> = ({ children, required = false }) => (
    <label className="mb-1 block text-xs font-bold text-slate-700">
        {children} {required ? <span className="text-red-500">*</span> : null}
    </label>
);

const inputClasses = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition-all focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100';

export const TenantCreateFlow: React.FC<TenantCreateFlowProps> = ({
    distributors,
    distributorsLoading,
    isSubmitting,
    onSubmit,
    onCancel,
}) => {
    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [form, setForm] = useState<TenantCreateFormData>(emptyForm);
    const [isSlugManual, setIsSlugManual] = useState(false);

    const patch = (changes: Partial<TenantCreateFormData>) => setForm((current) => ({ ...current, ...changes }));

    const canContinue = useMemo(() => Boolean(
        form.name.trim() && form.email.trim() && form.contactName.trim() && form.contactEmail.trim() && form.city.trim(),
    ), [form.city, form.contactEmail, form.contactName, form.email, form.name]);

    const applyProducts = (products: TenantProductSelection) => {
        patch({ products });
        setStep(3);
    };

    return (
        <div className="flex h-full min-h-0 flex-1 flex-col bg-slate-50">
            <header className="shrink-0 border-b border-slate-200 bg-white px-4 pt-4 sm:px-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-white"><Building2 size={18} /></span>
                            <h2 className="text-xl font-black text-slate-900">Nuevo tenant</h2>
                        </div>
                        <p className="mt-1 text-sm text-slate-500">Alta guiada sin modales: datos, productos y confirmación.</p>
                    </div>
                    <button
                        type="button"
                        onClick={onCancel}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                    >
                        <X size={14} /> Cerrar
                    </button>
                </div>

                <ol className="mt-3 flex gap-5 text-xs font-bold">
                    {STEPS.map((item) => {
                        const active = step === item.key;
                        const done = step > item.key;
                        return (
                            <li key={item.key} className={`flex items-center gap-2 border-b-2 pb-2.5 ${active ? 'border-blue-600' : 'border-transparent'}`}>
                                <span className={`grid h-5 w-5 place-items-center rounded-full text-[10px] font-black ${
                                    done ? 'bg-emerald-600 text-white' : active ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'
                                }`}>
                                    {done ? <Check size={11} /> : item.key}
                                </span>
                                <span className={active ? 'font-black text-blue-700' : done ? 'text-emerald-700' : 'text-slate-500'}>{item.label}</span>
                            </li>
                        );
                    })}
                </ol>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
                {step === 1 ? (
                    <div className="space-y-4">
                        <section className="rounded-2xl border border-slate-200 bg-white p-5">
                            <p className="text-xs font-black uppercase tracking-wider text-slate-400">Identidad</p>
                            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div>
                                    <Label required>Nombre comercial</Label>
                                    <input
                                        type="text"
                                        value={form.name}
                                        onChange={(event) => {
                                            const name = event.target.value;
                                            patch({ name, slug: isSlugManual ? form.slug : buildTenantSlug(name) });
                                        }}
                                        placeholder="Ej. Supermercado El Sol"
                                        className={inputClasses}
                                    />
                                    <p className="mt-1 text-[10px] leading-tight text-slate-500">Puede repetirse; el identificador técnico debe ser único.</p>
                                </div>
                                <div>
                                    <Label required>Identificador técnico</Label>
                                    <input
                                        type="text"
                                        value={form.slug}
                                        onChange={(event) => {
                                            setIsSlugManual(true);
                                            patch({ slug: buildTenantSlug(event.target.value) });
                                        }}
                                        placeholder="mercasend_srl_prod"
                                        className={`${inputClasses} font-mono`}
                                    />
                                    <p className="mt-1 text-[10px] leading-tight text-slate-500">Letras, números y guion bajo.</p>
                                </div>
                                <div>
                                    <Label>RNC / Cédula</Label>
                                    <input type="text" value={form.taxId} onChange={(event) => patch({ taxId: event.target.value })} placeholder="Opcional" className={inputClasses} />
                                </div>
                                <div>
                                    <Label required>Email de acceso</Label>
                                    <input type="email" value={form.email} onChange={(event) => patch({ email: event.target.value })} placeholder="admin@empresa.com" className={inputClasses} />
                                </div>
                            </div>
                        </section>

                        <section className="rounded-2xl border border-slate-200 bg-white p-5">
                            <p className="text-xs font-black uppercase tracking-wider text-slate-400">Contacto y ubicación</p>
                            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                                <div>
                                    <Label required>Persona de contacto</Label>
                                    <input type="text" value={form.contactName} onChange={(event) => patch({ contactName: event.target.value })} placeholder="Nombre y apellido" className={inputClasses} />
                                </div>
                                <div>
                                    <Label required>Mail de contacto</Label>
                                    <input type="email" value={form.contactEmail} onChange={(event) => patch({ contactEmail: event.target.value })} placeholder="contacto@empresa.com" className={inputClasses} />
                                </div>
                                <div>
                                    <Label required>Ciudad</Label>
                                    <input type="text" value={form.city} onChange={(event) => patch({ city: event.target.value })} placeholder="Santo Domingo" className={inputClasses} />
                                </div>
                            </div>
                        </section>

                        <section className="rounded-2xl border border-slate-200 bg-white p-5">
                            <p className="text-xs font-black uppercase tracking-wider text-slate-400">Distribuidores</p>
                            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div>
                                    <Label>Distribuidor que captó{distributorsLoading ? ' (cargando…)' : ''}</Label>
                                    <select
                                        value={form.capturedByDistributorId}
                                        onChange={(event) => patch({ capturedByDistributorId: event.target.value })}
                                        className={inputClasses}
                                    >
                                        <option value="">Sin asignar</option>
                                        {distributors.map((distributor) => (
                                            <option key={distributor.id} value={distributor.id}>{distributor.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <Label>Distribuidor que da servicio{distributorsLoading ? ' (cargando…)' : ''}</Label>
                                    <select
                                        value={form.servicedByDistributorId}
                                        onChange={(event) => patch({ servicedByDistributorId: event.target.value })}
                                        className={inputClasses}
                                    >
                                        <option value="">Sin asignar</option>
                                        {distributors.map((distributor) => (
                                            <option key={distributor.id} value={distributor.id}>{distributor.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            {distributors.length === 0 && !distributorsLoading ? (
                                <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-700">
                                    No hay distribuidores activos. Puedes crear el tenant sin asignación y completar este dato después.
                                </p>
                            ) : null}
                        </section>
                    </div>
                ) : null}

                {step === 2 ? (
                    <section className="rounded-2xl border border-slate-200 bg-white p-5">
                        <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-400">
                            <PackageSearch size={15} /> Productos iniciales
                        </p>
                        <div className="mt-3">
                            <TenantProductsEditor
                                initialProducts={form.products}
                                helperText="Define la combinación inicial. Podrás ajustarla después desde la ficha del tenant."
                                saveLabel="Usar estos productos"
                                cancelLabel="Volver a datos"
                                onCancel={() => setStep(1)}
                                onSave={applyProducts}
                            />
                        </div>
                    </section>
                ) : null}

                {step === 3 ? (
                    <div className="space-y-4">
                        <section className="rounded-2xl border border-slate-200 bg-white p-5">
                            <p className="text-xs font-black uppercase tracking-wider text-slate-400">Revisión</p>
                            <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-3 text-[13px] sm:grid-cols-2">
                                <div><dt className="text-[11px] font-bold text-slate-400">Nombre comercial</dt><dd className="font-bold text-slate-800">{form.name}</dd></div>
                                <div><dt className="text-[11px] font-bold text-slate-400">Identificador</dt><dd className="font-mono font-bold text-slate-800">{form.slug || buildTenantSlug(form.name)}</dd></div>
                                <div><dt className="text-[11px] font-bold text-slate-400">Email de acceso</dt><dd className="font-bold text-slate-800">{form.email}</dd></div>
                                <div><dt className="text-[11px] font-bold text-slate-400">RNC / Cédula</dt><dd className="font-bold text-slate-800">{form.taxId || 'N/D'}</dd></div>
                                <div><dt className="text-[11px] font-bold text-slate-400">Contacto</dt><dd className="font-bold text-slate-800">{form.contactName} · {form.contactEmail}</dd></div>
                                <div><dt className="text-[11px] font-bold text-slate-400">Ciudad</dt><dd className="font-bold text-slate-800">{form.city}</dd></div>
                            </dl>
                        </section>

                        <section className="rounded-2xl border border-slate-200 bg-white p-5">
                            <div className="flex items-center justify-between">
                                <p className="text-xs font-black uppercase tracking-wider text-slate-400">Productos y licencias</p>
                                <button type="button" onClick={() => setStep(2)} className="text-[11px] font-black text-blue-600">Cambiar</button>
                            </div>
                            <div className="mt-3">
                                <TenantProductSummary products={form.products} />
                            </div>
                        </section>

                        <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                            Al confirmar se aprovisionan el esquema, la suscripción y el usuario de acceso, y se muestran las credenciales temporales.
                        </div>
                    </div>
                ) : null}
            </div>

            <footer className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                        type="button"
                        onClick={() => (step === 1 ? onCancel() : setStep((current) => (current - 1) as 1 | 2 | 3))}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-200"
                    >
                        <ArrowLeft size={15} />
                        {step === 1 ? 'Cancelar' : 'Atrás'}
                    </button>

                    <div className="flex items-center gap-2">
                        {step < 3 ? (
                            <button
                                type="button"
                                disabled={step === 1 && !canContinue}
                                onClick={() => setStep((current) => (current + 1) as 1 | 2 | 3)}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Continuar <ArrowRight size={15} />
                            </button>
                        ) : (
                            <button
                                type="button"
                                disabled={isSubmitting}
                                onClick={() => void onSubmit(form)}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {isSubmitting ? <Loader2 className="animate-spin" size={15} /> : <Check size={15} />}
                                {isSubmitting ? 'Aprovisionando…' : 'Crear tenant'}
                            </button>
                        )}
                    </div>
                </div>
            </footer>
        </div>
    );
};
