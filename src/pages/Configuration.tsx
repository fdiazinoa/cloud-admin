import React, { useMemo, useState } from 'react';
import {
    Bot,
    CheckCircle2,
    Clipboard,
    ExternalLink,
    Mail,
    MessageSquareText,
    ShieldCheck,
    Sparkles,
    Tags,
} from 'lucide-react';

const supportEmail = 'apoyotenico@mercasend.com';
const functionName = 'process-inbound-email';

function getWebhookUrl() {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    if (!supabaseUrl) return `https://<PROJECT_REF>.supabase.co/functions/v1/${functionName}`;
    return `${supabaseUrl.replace(/\/$/, '')}/functions/v1/${functionName}`;
}

interface CopyButtonProps {
    value: string;
}

const CopyButton: React.FC<CopyButtonProps> = ({ value }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
    };

    return (
        <button
            onClick={handleCopy}
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50"
        >
            {copied ? <CheckCircle2 size={14} className="text-emerald-600" /> : <Clipboard size={14} />}
            {copied ? 'Copiado' : 'Copiar'}
        </button>
    );
};

interface CodeValueProps {
    value: string;
}

const CodeValue: React.FC<CodeValueProps> = ({ value }) => (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-950 p-3">
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap text-xs text-emerald-300">{value}</code>
        <CopyButton value={value} />
    </div>
);

interface StatusRowProps {
    label: string;
    detail: string;
    enabled?: boolean;
}

const StatusRow: React.FC<StatusRowProps> = ({ label, detail, enabled = true }) => (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-3 last:border-b-0">
        <div>
            <p className="text-sm font-bold text-slate-800">{label}</p>
            <p className="mt-1 text-xs text-slate-500">{detail}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
            {enabled ? 'Activo' : 'Opcional'}
        </span>
    </div>
);

export const Configuration: React.FC = () => {
    const webhookUrl = useMemo(() => getWebhookUrl(), []);

    return (
        <div className="min-h-full bg-slate-50 p-6">
            <div className="mx-auto max-w-6xl space-y-6">
                <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Canales e inteligencia artificial</p>
                        <h1 className="mt-2 text-2xl font-black text-slate-900">Configuración</h1>
                        <p className="mt-2 max-w-2xl text-sm text-slate-500">
                            Ajustes funcionales para proveedores externos del HelpDesk: correo de soporte, Resend e IA.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <a
                            href="https://resend.com"
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
                        >
                            Abrir Resend
                            <ExternalLink size={15} />
                        </a>
                        <a
                            href="https://platform.openai.com"
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
                        >
                            Abrir OpenAI
                            <ExternalLink size={15} />
                        </a>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-violet-50 text-violet-700">
                            <Mail size={20} />
                        </div>
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Canal email</p>
                        <h2 className="mt-1 text-lg font-black text-slate-900">Resend inbound</h2>
                        <p className="mt-2 text-sm text-slate-500">{supportEmail}</p>
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
                            <Bot size={20} />
                        </div>
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Proveedor IA</p>
                        <h2 className="mt-1 text-lg font-black text-slate-900">OpenAI</h2>
                        <p className="mt-2 text-sm text-slate-500">Triage, sentimiento y respuestas sugeridas.</p>
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                            <ShieldCheck size={20} />
                        </div>
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Seguridad</p>
                        <h2 className="mt-1 text-lg font-black text-slate-900">Credenciales protegidas</h2>
                        <p className="mt-2 text-sm text-slate-500">Las API keys se gestionan como secretos, no desde el frontend.</p>
                    </div>
                </div>

                <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
                    <div className="border-b border-slate-100 p-5">
                        <div className="flex items-center gap-2">
                            <Mail size={18} className="text-violet-700" />
                            <h2 className="text-lg font-black text-slate-900">Resend</h2>
                        </div>
                        <p className="mt-1 text-sm text-slate-500">Configuración del canal de correo externo del HelpDesk.</p>
                    </div>
                    <div className="grid grid-cols-1 gap-5 p-5 xl:grid-cols-[1fr_1.4fr]">
                        <div className="space-y-3">
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Dirección de soporte</p>
                                <p className="mt-1 text-sm font-bold text-slate-800">{supportEmail}</p>
                            </div>
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Evento esperado</p>
                                <p className="mt-1 text-sm font-bold text-slate-800">email.received</p>
                            </div>
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Estado</p>
                                <p className="mt-1 text-sm font-bold text-emerald-700">Listo para webhook inbound</p>
                            </div>
                        </div>

                        <div>
                            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Webhook URL para Resend</p>
                            <CodeValue value={webhookUrl} />
                            <p className="mt-2 text-xs text-slate-500">
                                Este endpoint técnico es el destino que Resend debe llamar cuando llegue un email nuevo.
                            </p>
                        </div>
                    </div>
                </section>

                <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
                    <div className="border-b border-slate-100 p-5">
                        <div className="flex items-center gap-2">
                            <Bot size={18} className="text-indigo-700" />
                            <h2 className="text-lg font-black text-slate-900">Inteligencia Artificial</h2>
                        </div>
                        <p className="mt-1 text-sm text-slate-500">Capacidades que puede usar el HelpDesk cuando exista un proveedor IA configurado.</p>
                    </div>
                    <div className="grid grid-cols-1 gap-5 p-5 xl:grid-cols-[1fr_1fr]">
                        <div className="rounded-lg border border-slate-200 p-4">
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Proveedor activo</p>
                            <div className="mt-3 flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-lg font-black text-slate-900">OpenAI</p>
                                    <p className="mt-1 text-sm text-slate-500">Modelo sugerido: gpt-4o-mini</p>
                                </div>
                                <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">Principal</span>
                            </div>
                            <p className="mt-4 text-xs text-slate-500">
                                Anthropic u otro proveedor puede agregarse luego como alternativa de clasificación y redacción.
                            </p>
                        </div>

                        <div className="rounded-lg border border-slate-200 p-4">
                            <StatusRow
                                label="Triage automático"
                                detail="Clasifica categoría, prioridad y resumen de tickets nuevos."
                            />
                            <StatusRow
                                label="Análisis de sentimiento"
                                detail="Marca tickets como frustrado, neutral o positivo."
                            />
                            <StatusRow
                                label="Respuestas sugeridas"
                                detail="Genera borradores rápidos para que el agente revise antes de enviar."
                            />
                        </div>
                    </div>
                </section>

                <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                            <Tags size={18} />
                        </div>
                        <h3 className="text-sm font-black text-slate-900">Categorías IA</h3>
                        <p className="mt-2 text-sm text-slate-500">Hardware, Fiscal, Inventario, Red, Pagos, Ventas y Otros.</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-violet-50 text-violet-700">
                            <Sparkles size={18} />
                        </div>
                        <h3 className="text-sm font-black text-slate-900">Auto-drafts</h3>
                        <p className="mt-2 text-sm text-slate-500">El agente mantiene control editorial; la IA solo prepara el borrador.</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                            <MessageSquareText size={18} />
                        </div>
                        <h3 className="text-sm font-black text-slate-900">Omnicanal</h3>
                        <p className="mt-2 text-sm text-slate-500">El email externo entra al mismo Command Center sin mezclarse con el chat POS.</p>
                    </div>
                </section>
            </div>
        </div>
    );
};
