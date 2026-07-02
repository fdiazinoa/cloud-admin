import React, { useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    Bug,
    CheckCircle2,
    Clipboard,
    Download,
    ExternalLink,
    FileText,
    ListChecks,
    Link,
    Loader2,
    PackageCheck,
    Save,
    Smartphone,
    Sparkles,
} from 'lucide-react';
import {
    buildDirectDownloadUrl,
    createPosApkRelease,
    getPosApkReleases,
    type PosApkRelease,
} from '../lib/posApkReleases';

const defaultForm = {
    versionName: '',
    versionCode: '',
    apkUrl: '',
    checksumSha256: '',
    changelog: '',
    releaseType: 'bugfix',
    releaseStatus: 'available',
    summary: '',
    bugsFixed: '',
    newFeatures: '',
    internalChanges: '',
    validationChecklist: '',
    installNotes: '',
    rolloutScope: 'Todos los tenants',
    isLatest: true,
};

const releaseTypeLabels: Record<string, string> = {
    bugfix: 'Corrección de bugs',
    feature: 'Nueva funcionalidad',
    improvement: 'Mejora operativa',
    hotfix: 'Hotfix urgente',
    beta: 'Versión de prueba',
};

const releaseStatusLabels: Record<string, string> = {
    draft: 'Borrador',
    internal_testing: 'Prueba interna',
    beta: 'Beta',
    available: 'Disponible',
    retired: 'Retirado',
};

function formatDateTime(value?: string | null) {
    if (!value) return 'N/D';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'N/D';
    return parsed.toLocaleString('es-DO');
}

function getErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message;
    if (error && typeof error === 'object') {
        const payload = error as Record<string, unknown>;
        const parts = [payload.message, payload.details, payload.hint, payload.code ? `code: ${payload.code}` : undefined]
            .filter((part): part is string => typeof part === 'string' && part.trim().length > 0);
        if (parts.length > 0) return parts.join(' · ');
        return JSON.stringify(payload);
    }
    return String(error);
}

function linesToList(value: string): string[] {
    return value
        .split('\n')
        .map((line) => line.replace(/^[-*]\s*/, '').trim())
        .filter(Boolean);
}

function listItems(values?: string[] | null, empty = 'No registrado') {
    const cleanValues = (values ?? []).filter(Boolean);
    return cleanValues.length > 0 ? cleanValues : [empty];
}

function buildCloudAdminApkUrl(path: string) {
    if (typeof window === 'undefined') return path;
    return `${window.location.origin}${path}`;
}

const ReleaseList: React.FC<{
    title: string;
    items?: string[] | null;
    icon: React.ElementType;
    tone: 'rose' | 'emerald' | 'blue' | 'amber';
    empty: string;
}> = ({ title, items, icon: Icon, tone, empty }) => {
    const tones = {
        rose: 'bg-rose-50 text-rose-700 border-rose-100',
        emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
        blue: 'bg-blue-50 text-blue-700 border-blue-100',
        amber: 'bg-amber-50 text-amber-700 border-amber-100',
    };

    return (
        <div className={`rounded-2xl border px-4 py-3 ${tones[tone]}`}>
            <div className="mb-2 flex items-center gap-2">
                <Icon size={15} />
                <p className="text-xs font-black uppercase tracking-widest">{title}</p>
            </div>
            <ul className="space-y-1 text-sm font-semibold leading-relaxed">
                {listItems(items, empty).map((item) => (
                    <li key={item} className="flex gap-2">
                        <span aria-hidden="true">-</span>
                        <span>{item}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
};

const CopyButton: React.FC<{ value: string; label?: string }> = ({ value, label = 'Copiar' }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1400);
    };

    return (
        <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50"
        >
            {copied ? <CheckCircle2 size={14} className="text-emerald-600" /> : <Clipboard size={14} />}
            {copied ? 'Copiado' : label}
        </button>
    );
};

const ReleaseDetails: React.FC<{ release: PosApkRelease }> = ({ release }) => (
    <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">SHA256</p>
                <p className="mt-1 break-all font-mono text-xs text-slate-700">{release.checksum_sha256 || 'No registrado'}</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Alcance recomendado</p>
                <p className="mt-1 text-sm font-semibold text-slate-700">{release.rollout_scope || 'Todos los tenants'}</p>
            </div>
        </div>

        {release.summary ? (
            <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Resumen soporte</p>
                <p className="mt-2 text-sm font-medium leading-relaxed text-slate-700">{release.summary}</p>
            </div>
        ) : null}

        {release.changelog ? (
            <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Changelog</p>
                <p className="mt-2 whitespace-pre-line text-sm font-medium leading-relaxed text-slate-700">{release.changelog}</p>
            </div>
        ) : null}

        <div className="grid gap-3 lg:grid-cols-2">
            <ReleaseList title="Soluciona" items={release.bugs_fixed} icon={Bug} tone="rose" empty="No hay bugs documentados" />
            <ReleaseList title="Agrega" items={release.new_features} icon={Sparkles} tone="emerald" empty="No hay funciones nuevas documentadas" />
            <ReleaseList title="Cambios internos" items={release.internal_changes} icon={FileText} tone="blue" empty="No hay cambios internos documentados" />
            <ReleaseList title="Validación" items={release.validation_checklist} icon={ListChecks} tone="amber" empty="No hay checklist QA documentado" />
        </div>

        {release.install_notes ? (
            <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Notas de instalación</p>
                <p className="mt-2 whitespace-pre-line text-sm font-semibold leading-relaxed text-amber-900">{release.install_notes}</p>
            </div>
        ) : null}
    </div>
);

export const PosApkReleases: React.FC = () => {
    const [releases, setReleases] = useState<PosApkRelease[]>([]);
    const [selectedReleaseId, setSelectedReleaseId] = useState<string | null>(null);
    const [form, setForm] = useState(defaultForm);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [errorMessage, setErrorMessage] = useState('');

    const latestRelease = releases.find((release) => release.is_latest) || releases[0] || null;
    const selectedRelease = releases.find((release) => release.id === selectedReleaseId) || latestRelease;
    const previewDownloadUrl = useMemo(() => buildDirectDownloadUrl(form.apkUrl), [form.apkUrl]);
    const latestApkDownloadUrl = useMemo(() => buildCloudAdminApkUrl('/api/pos-apk/latest?download=1'), []);
    const latestApkJsonUrl = useMemo(() => buildCloudAdminApkUrl('/api/pos-apk/latest'), []);
    const selectedDownloadUrl = selectedRelease?.is_latest
        ? latestApkDownloadUrl
        : selectedRelease?.direct_download_url || selectedRelease?.apk_url || '';

    const loadReleases = async () => {
        setLoading(true);
        setErrorMessage('');
        try {
            const loadedReleases = await getPosApkReleases();
            setReleases(loadedReleases);
            setSelectedReleaseId((current) => current || loadedReleases.find((release) => release.is_latest)?.id || loadedReleases[0]?.id || null);
        } catch (error) {
            setErrorMessage(`No se pudieron cargar los APK: ${getErrorMessage(error)}`);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadReleases();
    }, []);

    const updateForm = <K extends keyof typeof defaultForm>(key: K, value: (typeof defaultForm)[K]) => {
        setForm((current) => ({ ...current, [key]: value }));
        setMessage('');
        setErrorMessage('');
    };

    const handleSave = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setMessage('');
        setErrorMessage('');

        const versionCode = Number(form.versionCode);
        if (!Number.isInteger(versionCode) || versionCode <= 0) {
            setErrorMessage('El version code debe ser un numero entero mayor que cero.');
            setSaving(false);
            return;
        }

        try {
            const release = await createPosApkRelease({
                versionName: form.versionName,
                versionCode,
                apkUrl: form.apkUrl,
                checksumSha256: form.checksumSha256,
                changelog: form.changelog,
                releaseType: form.releaseType,
                releaseStatus: form.releaseStatus,
                summary: form.summary,
                bugsFixed: linesToList(form.bugsFixed),
                newFeatures: linesToList(form.newFeatures),
                internalChanges: linesToList(form.internalChanges),
                validationChecklist: linesToList(form.validationChecklist),
                installNotes: form.installNotes,
                rolloutScope: form.rolloutScope,
                isLatest: form.isLatest,
            });

            setForm(defaultForm);
            setSelectedReleaseId(release.id);
            setMessage(`APK POS ${release.version_name} registrado.`);
            await loadReleases();
        } catch (error) {
            setErrorMessage(`No se pudo registrar el APK: ${getErrorMessage(error)}`);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h2 className="text-2xl font-black text-slate-800">APK POS</h2>
                    <p className="text-sm text-slate-500">Versiones publicadas, notas de soporte e historico de APK.</p>
                </div>
                {loading ? (
                    <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-500">
                        <Loader2 className="animate-spin text-blue-500" size={16} />
                        Cargando
                    </div>
                ) : null}
            </div>

            {message ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-bold text-emerald-800">
                    {message}
                </div>
            ) : null}

            {errorMessage ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-bold text-rose-800">
                    {errorMessage}
                </div>
            ) : null}

            <section className="rounded-2xl border border-blue-100 bg-white shadow-sm">
                <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                    <div className="flex items-start gap-4">
                        <div className="rounded-xl bg-blue-50 p-2.5 text-blue-600">
                            <Download size={20} />
                        </div>
                        <div>
                            <p className="text-xs font-black uppercase tracking-widest text-blue-600">Instalacion inicial</p>
                            <h3 className="mt-1 text-lg font-black text-slate-900">
                                {latestRelease ? `APK actual POS ${latestRelease.version_name}` : 'APK actual no disponible'}
                            </h3>
                            <p className="mt-1 text-sm font-medium text-slate-500">
                                {latestRelease
                                    ? `Build ${latestRelease.version_code} · enlace estable para clientes nuevos y reinstalaciones.`
                                    : 'Registra un APK disponible y marcalo como ultimo para habilitar la descarga desde Cloud-Admin.'}
                            </p>
                            <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Link Cloud-Admin</p>
                                <p className="mt-1 break-all font-mono text-xs text-slate-600">{latestApkDownloadUrl}</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2 lg:justify-end">
                        <a
                            href={latestApkDownloadUrl}
                            target="_blank"
                            rel="noreferrer"
                            aria-disabled={!latestRelease}
                            className={`inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-black text-white shadow-sm transition-colors ${latestRelease ? 'bg-blue-600 hover:bg-blue-700' : 'pointer-events-none bg-slate-300'}`}
                        >
                            <Download size={18} />
                            Descargar ultimo APK
                        </a>
                        <CopyButton value={latestApkDownloadUrl} label="Copiar link APK" />
                        <CopyButton value={latestApkJsonUrl} label="Copiar endpoint" />
                    </div>
                </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_410px]">
                <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
                    <div className="border-b border-slate-100 px-6 py-5">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div className="flex items-start gap-4">
                                <div className="rounded-2xl bg-blue-50 p-3 text-blue-600">
                                    <Smartphone size={22} />
                                </div>
                                <div>
                                    <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                                        {selectedRelease?.is_latest ? 'Ultimo release' : 'Release historico'}
                                    </p>
                                    <h3 className="mt-1 text-xl font-black text-slate-900">
                                        {selectedRelease ? `POS ${selectedRelease.version_name}` : 'Sin APK registrado'}
                                    </h3>
                                    <p className="mt-1 text-sm font-medium text-slate-500">
                                        {selectedRelease
                                            ? `Build ${selectedRelease.version_code} · ${formatDateTime(selectedRelease.published_at)}`
                                            : 'Registra el primer APK para habilitar descargas.'}
                                    </p>
                                </div>
                            </div>

                            {selectedRelease ? (
                                <div className="flex flex-wrap gap-2">
                                    <span className={`rounded-full px-3 py-1 text-xs font-black uppercase ${selectedRelease.is_latest ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                                        {selectedRelease.is_latest ? 'Actual' : 'Historico'}
                                    </span>
                                    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black uppercase text-blue-700">
                                        {releaseStatusLabels[selectedRelease.release_status || ''] || selectedRelease.release_status || 'Sin estado'}
                                    </span>
                                </div>
                            ) : null}
                        </div>
                    </div>

                    {selectedRelease ? (
                        <div className="space-y-5 px-6 py-5">
                            <div className="flex flex-wrap gap-3">
                                <a
                                    href={selectedDownloadUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-sm transition-colors hover:bg-blue-700"
                                >
                                    <Download size={18} />
                                    Descargar APK
                                </a>
                                <a
                                    href={selectedRelease.apk_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition-colors hover:bg-slate-50"
                                >
                                    <ExternalLink size={18} />
                                    Abrir fuente
                                </a>
                                <CopyButton value={selectedDownloadUrl} label="Copiar enlace" />
                            </div>
                            <ReleaseDetails release={selectedRelease} />
                        </div>
                    ) : (
                        <div className="px-6 py-12 text-center text-sm font-medium text-slate-500">
                            No hay APK disponible.
                        </div>
                    )}
                </div>

                <form onSubmit={handleSave} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                    <div className="mb-5 flex items-center gap-3">
                        <div className="rounded-xl bg-emerald-50 p-2 text-emerald-600">
                            <PackageCheck size={18} />
                        </div>
                        <div>
                            <h3 className="font-black text-slate-900">Registrar APK</h3>
                            <p className="text-xs font-medium text-slate-500">Fuente externa: Google Drive o URL directa.</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className="block">
                                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">Version</span>
                                <input
                                    required
                                    value={form.versionName}
                                    onChange={(event) => updateForm('versionName', event.target.value)}
                                    placeholder="1.0.616"
                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                />
                            </label>

                            <label className="block">
                                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">Version code</span>
                                <input
                                    required
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={form.versionCode}
                                    onChange={(event) => updateForm('versionCode', event.target.value)}
                                    placeholder="616"
                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                />
                            </label>
                        </div>

                        <label className="block">
                            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">URL del APK</span>
                            <input
                                required
                                type="url"
                                value={form.apkUrl}
                                onChange={(event) => updateForm('apkUrl', event.target.value)}
                                placeholder="https://drive.google.com/file/d/..."
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            />
                        </label>

                        <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">URL de descarga</p>
                            <p className="mt-1 break-all font-mono text-xs text-slate-600">{previewDownloadUrl || 'Pendiente'}</p>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className="block">
                                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">Tipo</span>
                                <select
                                    value={form.releaseType}
                                    onChange={(event) => updateForm('releaseType', event.target.value)}
                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                >
                                    {Object.entries(releaseTypeLabels).map(([value, label]) => (
                                        <option key={value} value={value}>{label}</option>
                                    ))}
                                </select>
                            </label>

                            <label className="block">
                                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">Estado</span>
                                <select
                                    value={form.releaseStatus}
                                    onChange={(event) => updateForm('releaseStatus', event.target.value)}
                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                >
                                    {Object.entries(releaseStatusLabels).map(([value, label]) => (
                                        <option key={value} value={value}>{label}</option>
                                    ))}
                                </select>
                            </label>
                        </div>

                        <label className="block">
                            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">Resumen</span>
                            <textarea
                                value={form.summary}
                                onChange={(event) => updateForm('summary', event.target.value)}
                                rows={3}
                                placeholder="Que resuelve este APK y cuando debe instalarse"
                                className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            />
                        </label>

                        <label className="block">
                            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">Soluciona bugs</span>
                            <textarea
                                value={form.bugsFixed}
                                onChange={(event) => updateForm('bugsFixed', event.target.value)}
                                rows={3}
                                placeholder={'Un punto por linea\nEj: Corrige sincronizacion de ventas al cierre Z'}
                                className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            />
                        </label>

                        <label className="block">
                            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">Agrega funcionalidades</span>
                            <textarea
                                value={form.newFeatures}
                                onChange={(event) => updateForm('newFeatures', event.target.value)}
                                rows={3}
                                placeholder={'Un punto por linea\nEj: Valida version superior al iniciar POS'}
                                className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            />
                        </label>

                        <label className="block">
                            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">Cambios internos</span>
                            <textarea
                                value={form.internalChanges}
                                onChange={(event) => updateForm('internalChanges', event.target.value)}
                                rows={3}
                                placeholder={'Un punto por linea\nEj: Ajusta cola offline de sincronizacion'}
                                className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            />
                        </label>

                        <label className="block">
                            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">Checklist QA</span>
                            <textarea
                                value={form.validationChecklist}
                                onChange={(event) => updateForm('validationChecklist', event.target.value)}
                                rows={3}
                                placeholder={'Un punto por linea\nLogin\nVenta contado\nCierre Z\nSincronizacion cloud'}
                                className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            />
                        </label>

                        <label className="block">
                            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">Notas de instalacion</span>
                            <textarea
                                value={form.installNotes}
                                onChange={(event) => updateForm('installNotes', event.target.value)}
                                rows={3}
                                placeholder="Ej: Sincronizar antes de actualizar. No reinstalar si hay ventas pendientes."
                                className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            />
                        </label>

                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className="block">
                                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">SHA256</span>
                                <input
                                    value={form.checksumSha256}
                                    onChange={(event) => updateForm('checksumSha256', event.target.value)}
                                    placeholder="Opcional"
                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                />
                            </label>

                            <label className="block">
                                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">Clientes recomendados</span>
                                <input
                                    value={form.rolloutScope}
                                    onChange={(event) => updateForm('rolloutScope', event.target.value)}
                                    placeholder="Todos / Solo DigiFact / Beta"
                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                />
                            </label>
                        </div>

                        <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <span className="text-sm font-bold text-slate-700">Marcar como ultimo APK</span>
                            <input
                                type="checkbox"
                                checked={form.isLatest}
                                onChange={(event) => updateForm('isLatest', event.target.checked)}
                                className="h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                        </label>

                        <button
                            type="submit"
                            disabled={saving}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-black text-white shadow-sm transition-colors hover:bg-slate-800 disabled:opacity-60"
                        >
                            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                            {saving ? 'Guardando...' : 'Guardar APK'}
                        </button>
                    </div>
                </form>
            </section>

            <section className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
                <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
                    <div className="border-b border-slate-100 px-6 py-4">
                        <h3 className="font-black text-slate-900">Historial de APK</h3>
                        <p className="mt-1 text-xs font-medium text-slate-500">Selecciona una version para ver sus notas completas.</p>
                    </div>
                    <div className="max-h-[620px] divide-y divide-slate-100 overflow-y-auto">
                        {releases.map((release) => {
                            const isSelected = selectedRelease?.id === release.id;
                            return (
                                <button
                                    key={release.id}
                                    type="button"
                                    onClick={() => setSelectedReleaseId(release.id)}
                                    className={`w-full px-6 py-4 text-left transition-colors ${isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="font-black text-slate-800">POS {release.version_name}</p>
                                            <p className="mt-1 text-xs font-mono text-slate-400">Build {release.version_code}</p>
                                        </div>
                                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${release.is_latest ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                            {release.is_latest ? 'Actual' : 'Historico'}
                                        </span>
                                    </div>
                                    <p className="mt-2 text-xs font-black uppercase text-slate-600">
                                        {releaseTypeLabels[release.release_type || ''] || release.release_type || 'Sin clasificar'}
                                    </p>
                                    <p className="mt-1 line-clamp-2 text-xs font-medium leading-relaxed text-slate-500">
                                        {release.summary || release.changelog || 'Sin resumen documentado'}
                                    </p>
                                    <p className="mt-2 text-[11px] font-medium text-slate-400">{formatDateTime(release.published_at)}</p>
                                </button>
                            );
                        })}
                        {releases.length === 0 && !loading ? (
                            <div className="px-6 py-10 text-center text-sm font-medium text-slate-500">
                                No hay releases registrados.
                            </div>
                        ) : null}
                    </div>
                </div>

                <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                    {selectedRelease ? (
                        <>
                            <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                <div>
                                    <p className="text-xs font-black uppercase tracking-widest text-slate-400">Detalle historico</p>
                                    <h3 className="mt-1 text-xl font-black text-slate-900">POS {selectedRelease.version_name}</h3>
                                    <p className="mt-1 text-sm font-medium text-slate-500">
                                        Build {selectedRelease.version_code} · {formatDateTime(selectedRelease.published_at)}
                                    </p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <a
                                        href={selectedDownloadUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50"
                                    >
                                        <Download size={14} />
                                        Descargar
                                    </a>
                                    {selectedRelease.is_latest ? (
                                        <CopyButton value={latestApkDownloadUrl} />
                                    ) : (
                                        <CopyButton value={selectedDownloadUrl} />
                                    )}
                                    {selectedRelease.is_latest ? (
                                        <a
                                            href={latestApkJsonUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50"
                                        >
                                            <Link size={14} />
                                            API
                                        </a>
                                    ) : null}
                                </div>
                            </div>
                            <ReleaseDetails release={selectedRelease} />
                        </>
                    ) : (
                        <div className="flex min-h-80 flex-col items-center justify-center text-center text-slate-500">
                            <AlertTriangle className="mb-3 text-amber-500" size={24} />
                            <p className="text-sm font-bold">No hay un APK seleccionado.</p>
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
};
