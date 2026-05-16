import React, { useMemo, useState } from 'react';
import {
    Bot,
    CheckCircle2,
    Clipboard,
    Code2,
    Database,
    ExternalLink,
    KeyRound,
    Mail,
    ServerCog,
    ShieldCheck,
} from 'lucide-react';

const supportEmail = 'apoyotenico@mercasend.com';
const functionName = 'process-inbound-email';
const migrationName = '202605151900_support_email_contacts.sql';

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

interface CodeBlockProps {
    value: string;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ value }) => (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-950 p-3">
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap text-xs text-emerald-300">{value}</code>
        <CopyButton value={value} />
    </div>
);

interface RequirementProps {
    label: string;
    detail: string;
    required?: boolean;
}

const Requirement: React.FC<RequirementProps> = ({ label, detail, required = true }) => (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-3 last:border-b-0">
        <div>
            <p className="text-sm font-bold text-slate-800">{label}</p>
            <p className="mt-1 text-xs text-slate-500">{detail}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${required ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
            {required ? 'Requerido' : 'Opcional'}
        </span>
    </div>
);

export const Configuration: React.FC = () => {
    const webhookUrl = useMemo(() => getWebhookUrl(), []);
    const deployCommand = `supabase functions deploy ${functionName} --no-verify-jwt`;
    const secretsCommand = [
        'supabase secrets set RESEND_API_KEY=...',
        'supabase secrets set OPENAI_API_KEY=...',
        'supabase secrets set OPENAI_MODEL=gpt-4o-mini',
        `supabase secrets set HELPDESK_FROM_EMAIL="Cloud Admin Soporte <${supportEmail}>"`,
    ].join('\n');

    return (
        <div className="min-h-full bg-slate-50 p-6">
            <div className="mx-auto max-w-6xl space-y-6">
                <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">APIs e integraciones</p>
                        <h1 className="mt-2 text-2xl font-black text-slate-900">Configuración</h1>
                        <p className="mt-2 max-w-2xl text-sm text-slate-500">
                            Punto único para revisar endpoints, webhooks, Edge Functions y secretos operativos de Cloud Admin.
                        </p>
                    </div>
                    <a
                        href="https://resend.com"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
                    >
                        Abrir Resend
                        <ExternalLink size={15} />
                    </a>
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-violet-50 text-violet-700">
                            <Mail size={20} />
                        </div>
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Canal activo</p>
                        <h2 className="mt-1 text-lg font-black text-slate-900">Email HelpDesk</h2>
                        <p className="mt-2 text-sm text-slate-500">{supportEmail}</p>
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                            <ServerCog size={20} />
                        </div>
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Edge Function</p>
                        <h2 className="mt-1 text-lg font-black text-slate-900">{functionName}</h2>
                        <p className="mt-2 text-sm text-slate-500">Webhook inbound para Resend.</p>
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                            <ShieldCheck size={20} />
                        </div>
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Seguridad</p>
                        <h2 className="mt-1 text-lg font-black text-slate-900">Secrets en Supabase</h2>
                        <p className="mt-2 text-sm text-slate-500">Las API keys no se editan ni se exponen desde el frontend.</p>
                    </div>
                </div>

                <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
                    <div className="border-b border-slate-100 p-5">
                        <div className="flex items-center gap-2">
                            <Mail size={18} className="text-violet-700" />
                            <h2 className="text-lg font-black text-slate-900">Resend inbound webhook</h2>
                        </div>
                        <p className="mt-1 text-sm text-slate-500">Usa esta URL como destino del evento `email.received` en Resend.</p>
                    </div>
                    <div className="space-y-4 p-5">
                        <div>
                            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Webhook URL</p>
                            <CodeBlock value={webhookUrl} />
                        </div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Evento</p>
                                <p className="mt-1 text-sm font-bold text-slate-800">email.received</p>
                            </div>
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Dirección de entrada</p>
                                <p className="mt-1 text-sm font-bold text-slate-800">{supportEmail}</p>
                            </div>
                        </div>
                    </div>
                </section>

                <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
                        <div className="border-b border-slate-100 p-5">
                            <div className="flex items-center gap-2">
                                <KeyRound size={18} className="text-amber-700" />
                                <h2 className="text-lg font-black text-slate-900">Secrets requeridos</h2>
                            </div>
                            <p className="mt-1 text-sm text-slate-500">Configúralos con Supabase CLI o desde Project Settings.</p>
                        </div>
                        <div className="p-5">
                            <Requirement label="RESEND_API_KEY" detail="Permite enviar auto-respuestas y consultar contenido recibido desde Resend." />
                            <Requirement label="HELPDESK_FROM_EMAIL" detail="Remitente de las respuestas automáticas del HelpDesk." />
                            <Requirement label="OPENAI_API_KEY" detail="Activa triage automático, sentimiento y respuestas sugeridas." required={false} />
                            <Requirement label="OPENAI_MODEL" detail="Modelo usado por el triage. Recomendado: gpt-4o-mini." required={false} />
                        </div>
                    </section>

                    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
                        <div className="border-b border-slate-100 p-5">
                            <div className="flex items-center gap-2">
                                <Database size={18} className="text-blue-700" />
                                <h2 className="text-lg font-black text-slate-900">Base de datos</h2>
                            </div>
                            <p className="mt-1 text-sm text-slate-500">Migración que habilita contactos externos, tickets email e insights IA.</p>
                        </div>
                        <div className="space-y-4 p-5">
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Migración</p>
                                <p className="mt-1 break-all text-sm font-bold text-slate-800">{migrationName}</p>
                            </div>
                            <CodeBlock value="supabase db push" />
                        </div>
                    </section>
                </div>

                <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
                        <div className="border-b border-slate-100 p-5">
                            <div className="flex items-center gap-2">
                                <Code2 size={18} className="text-slate-700" />
                                <h2 className="text-lg font-black text-slate-900">Deploy de función</h2>
                            </div>
                        </div>
                        <div className="p-5">
                            <CodeBlock value={deployCommand} />
                        </div>
                    </section>

                    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
                        <div className="border-b border-slate-100 p-5">
                            <div className="flex items-center gap-2">
                                <Bot size={18} className="text-violet-700" />
                                <h2 className="text-lg font-black text-slate-900">Comandos de secrets</h2>
                            </div>
                        </div>
                        <div className="p-5">
                            <CodeBlock value={secretsCommand} />
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
};
