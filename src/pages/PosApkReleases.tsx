import React, { useEffect, useMemo, useState } from 'react';
import {
    CheckCircle2,
    Clipboard,
    Download,
    ExternalLink,
    Loader2,
    PackageCheck,
    Save,
    Smartphone,
} from 'lucide-react';
import {
    buildDirectDownloadUrl,
    getPosApkReleases,
    createPosApkRelease,
    type PosApkRelease,
} from '../lib/posApkReleases';

const defaultForm = {
    versionName: '',
    versionCode: '',
    apkUrl: '',
    checksumSha256: '',
    changelog: '',
    isLatest: true,
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

export const PosApkReleases: React.FC = () => {
    const [releases, setReleases] = useState<PosApkRelease[]>([]);
    const [form, setForm] = useState(defaultForm);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [errorMessage, setErrorMessage] = useState('');

    const latestRelease = releases.find((release) => release.is_latest) || releases[0] || null;
    const previewDownloadUrl = useMemo(() => buildDirectDownloadUrl(form.apkUrl), [form.apkUrl]);

    const loadReleases = async () => {
        setLoading(true);
        setErrorMessage('');
        try {
            setReleases(await getPosApkReleases());
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
            setErrorMessage('El version code debe ser un número entero mayor que cero.');
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
                isLatest: form.isLatest,
            });

            setForm(defaultForm);
            setMessage(`APK POS ${release.version_name} registrado.`);
            await loadReleases();
        } catch (error) {
            setErrorMessage(`No se pudo registrar el APK: ${getErrorMessage(error)}`);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6 p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h2 className="text-2xl font-black text-slate-800">APK POS</h2>
                    <p className="text-sm text-slate-500">Versiones publicadas para instalación y soporte de terminales.</p>
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

            <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
                <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
                    <div className="border-b border-slate-100 px-6 py-5">
                        <div className="flex items-start gap-4">
                            <div className="rounded-2xl bg-blue-50 p-3 text-blue-600">
                                <Smartphone size={22} />
                            </div>
                            <div>
                                <p className="text-xs font-black uppercase tracking-widest text-slate-400">Último release</p>
                                <h3 className="mt-1 text-xl font-black text-slate-900">
                                    {latestRelease ? `POS ${latestRelease.version_name}` : 'Sin APK registrado'}
                                </h3>
                                <p className="mt-1 text-sm font-medium text-slate-500">
                                    {latestRelease ? `Build ${latestRelease.version_code} · ${formatDateTime(latestRelease.published_at)}` : 'Registra el primer APK para habilitar descargas.'}
                                </p>
                            </div>
                        </div>
                    </div>

                    {latestRelease ? (
                        <div className="space-y-5 px-6 py-5">
                            <div className="flex flex-wrap gap-3">
                                <a
                                    href={latestRelease.direct_download_url || latestRelease.apk_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-sm transition-colors hover:bg-blue-700"
                                >
                                    <Download size={18} />
                                    Descargar último APK
                                </a>
                                <a
                                    href={latestRelease.apk_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition-colors hover:bg-slate-50"
                                >
                                    <ExternalLink size={18} />
                                    Abrir Drive
                                </a>
                                <CopyButton value={latestRelease.direct_download_url || latestRelease.apk_url} label="Copiar enlace" />
                            </div>

                            <div className="grid gap-3 md:grid-cols-2">
                                <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">SHA256</p>
                                    <p className="mt-1 break-all font-mono text-xs text-slate-700">{latestRelease.checksum_sha256 || 'No registrado'}</p>
                                </div>
                                <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Enlace directo</p>
                                    <p className="mt-1 break-all font-mono text-xs text-slate-700">{latestRelease.direct_download_url || latestRelease.apk_url}</p>
                                </div>
                            </div>

                            {latestRelease.changelog ? (
                                <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cambios</p>
                                    <p className="mt-2 whitespace-pre-line text-sm font-medium leading-relaxed text-slate-700">{latestRelease.changelog}</p>
                                </div>
                            ) : null}
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
                            <p className="text-xs font-medium text-slate-500">Fuente externa: Google Drive.</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <label className="block">
                            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">Versión</span>
                            <input
                                required
                                value={form.versionName}
                                onChange={(event) => updateForm('versionName', event.target.value)}
                                placeholder="1.8.4"
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
                                placeholder="184"
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            />
                        </label>

                        <label className="block">
                            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">URL de Google Drive</span>
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
                            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">Changelog</span>
                            <textarea
                                value={form.changelog}
                                onChange={(event) => updateForm('changelog', event.target.value)}
                                rows={4}
                                placeholder="Cambios importantes para soporte"
                                className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            />
                        </label>

                        <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <span className="text-sm font-bold text-slate-700">Marcar como último APK</span>
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

            <section className="rounded-2xl border border-slate-100 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-6 py-4">
                    <h3 className="font-black text-slate-900">Historial</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500">
                            <tr>
                                <th className="px-6 py-4">Versión</th>
                                <th className="px-6 py-4">Fecha</th>
                                <th className="px-6 py-4">Estado</th>
                                <th className="px-6 py-4 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {releases.map((release) => (
                                <tr key={release.id} className="hover:bg-slate-50">
                                    <td className="px-6 py-4">
                                        <p className="font-black text-slate-800">POS {release.version_name}</p>
                                        <p className="text-xs font-mono text-slate-400">Build {release.version_code}</p>
                                    </td>
                                    <td className="px-6 py-4 text-slate-600">{formatDateTime(release.published_at)}</td>
                                    <td className="px-6 py-4">
                                        <span className={`rounded-full px-3 py-1 text-xs font-black uppercase ${release.is_latest ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                            {release.is_latest ? 'Último' : 'Histórico'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-2">
                                            <a
                                                href={release.direct_download_url || release.apk_url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50"
                                            >
                                                <Download size={14} />
                                                Descargar
                                            </a>
                                            <CopyButton value={release.direct_download_url || release.apk_url} />
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {releases.length === 0 && !loading ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-10 text-center text-sm font-medium text-slate-500">
                                        No hay releases registrados.
                                    </td>
                                </tr>
                            ) : null}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
};
