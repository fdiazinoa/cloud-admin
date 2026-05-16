import React, { useEffect, useMemo, useState } from 'react';
import {
    Bot,
    CheckCircle2,
    Clipboard,
    ExternalLink,
    Mail,
    Save,
    ShieldCheck,
    Sparkles,
} from 'lucide-react';
import { supabaseAdmin, supabaseProjectUrl } from '../lib/supabase';

const functionName = 'process-inbound-email';
const settingsFunctionName = 'save-integration-settings';

interface IntegrationSettings {
    resend_inbound_email: string;
    resend_from_name: string;
    resend_from_email: string;
    ai_provider: 'openai' | 'anthropic' | 'disabled';
    ai_model: string;
    ai_triage_enabled: boolean;
    ai_sentiment_enabled: boolean;
    ai_auto_drafts_enabled: boolean;
}

interface SecretStatus {
    provider: 'resend' | 'openai' | 'anthropic';
    secret_last4: string | null;
    updated_at: string;
}

const defaultSettings: IntegrationSettings = {
    resend_inbound_email: 'apoyotenico@mercasend.com',
    resend_from_name: 'Cloud Admin Soporte',
    resend_from_email: 'apoyotenico@mercasend.com',
    ai_provider: 'openai',
    ai_model: 'gpt-4o-mini',
    ai_triage_enabled: true,
    ai_sentiment_enabled: true,
    ai_auto_drafts_enabled: true,
};

function getWebhookUrl() {
    if (!supabaseProjectUrl) return `https://<PROJECT_REF>.supabase.co/functions/v1/${functionName}`;
    return `${supabaseProjectUrl.replace(/\/$/, '')}/functions/v1/${functionName}`;
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
            type="button"
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

interface TextInputProps {
    label: string;
    value: string;
    onChange: (value: string) => void;
    type?: string;
    placeholder?: string;
}

const TextInput: React.FC<TextInputProps> = ({ label, value, onChange, type = 'text', placeholder }) => (
    <label className="block">
        <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">{label}</span>
        <input
            type={type}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        />
    </label>
);

interface ToggleRowProps {
    label: string;
    detail: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
}

const ToggleRow: React.FC<ToggleRowProps> = ({ label, detail, checked, onChange }) => (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 py-3 last:border-b-0">
        <div>
            <p className="text-sm font-bold text-slate-800">{label}</p>
            <p className="mt-1 text-xs text-slate-500">{detail}</p>
        </div>
        <button
            onClick={() => onChange(!checked)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-indigo-600' : 'bg-slate-300'}`}
            type="button"
        >
            <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : 'translate-x-1'}`} />
        </button>
    </div>
);

function formatSecretStatus(statuses: SecretStatus[], provider: SecretStatus['provider']) {
    const status = statuses.find((item) => item.provider === provider);
    if (!status) return 'No configurado';
    return `Configurado · termina en ${status.secret_last4 || '****'}`;
}

export const Configuration: React.FC = () => {
    const webhookUrl = useMemo(() => getWebhookUrl(), []);
    const [settings, setSettings] = useState<IntegrationSettings>(defaultSettings);
    const [secretStatuses, setSecretStatuses] = useState<SecretStatus[]>([]);
    const [resendApiKey, setResendApiKey] = useState('');
    const [openAiApiKey, setOpenAiApiKey] = useState('');
    const [anthropicApiKey, setAnthropicApiKey] = useState('');
    const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [message, setMessage] = useState('');

    useEffect(() => {
        let mounted = true;

        const loadConfiguration = async () => {
            const { data: settingsData, error: settingsError } = await supabaseAdmin
                .from('support_integration_settings')
                .select('*')
                .eq('id', 'helpdesk')
                .maybeSingle();

            if (!settingsError && settingsData && mounted) {
                setSettings({ ...defaultSettings, ...settingsData });
            }

            const { data: secretData, error: secretError } = await supabaseAdmin
                .from('support_integration_secrets')
                .select('provider, secret_last4, updated_at');

            if (!secretError && secretData && mounted) {
                setSecretStatuses(secretData as SecretStatus[]);
            }

            if ((settingsError || secretError) && mounted) {
                setMessage('La configuración editable requiere aplicar la migración de integraciones.');
            }
        };

        loadConfiguration();

        return () => {
            mounted = false;
        };
    }, []);

    const updateSetting = <K extends keyof IntegrationSettings>(key: K, value: IntegrationSettings[K]) => {
        setSettings((current) => ({ ...current, [key]: value }));
        setSaveState('idle');
    };

    const handleSave = async () => {
        setSaveState('saving');
        setMessage('');

        const { data: payload, error } = await supabaseAdmin.functions.invoke(settingsFunctionName, {
            body: {
                settings,
                secrets: {
                    resend_api_key: resendApiKey || undefined,
                    openai_api_key: openAiApiKey || undefined,
                    anthropic_api_key: anthropicApiKey || undefined,
                },
            },
        });

        if (error) {
            setSaveState('error');
            setMessage(payload?.detail || payload?.error || error.message || 'No se pudo guardar la configuración.');
            return;
        }

        setSaveState('saved');
        setMessage('Configuración guardada correctamente.');
        setResendApiKey('');
        setOpenAiApiKey('');
        setAnthropicApiKey('');

        const { data } = await supabaseAdmin
            .from('support_integration_secrets')
            .select('provider, secret_last4, updated_at');
        setSecretStatuses((data ?? []) as SecretStatus[]);
    };

    return (
        <div className="min-h-full bg-slate-50 p-6">
            <div className="mx-auto max-w-6xl space-y-6">
                <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Canales e inteligencia artificial</p>
                        <h1 className="mt-2 text-2xl font-black text-slate-900">Configuración</h1>
                        <p className="mt-2 max-w-2xl text-sm text-slate-500">
                            Configura Resend, el correo del HelpDesk y el proveedor de IA usado para triage y respuestas sugeridas.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <a href="https://resend.com" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">
                            Abrir Resend
                            <ExternalLink size={15} />
                        </a>
                        <a href="https://platform.openai.com" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">
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
                        <p className="mt-2 text-sm text-slate-500">{settings.resend_inbound_email}</p>
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
                            <Bot size={20} />
                        </div>
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Proveedor IA</p>
                        <h2 className="mt-1 text-lg font-black text-slate-900">{settings.ai_provider === 'disabled' ? 'Desactivado' : settings.ai_provider}</h2>
                        <p className="mt-2 text-sm text-slate-500">{settings.ai_model}</p>
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                            <ShieldCheck size={20} />
                        </div>
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Seguridad</p>
                        <h2 className="mt-1 text-lg font-black text-slate-900">Keys cifradas</h2>
                        <p className="mt-2 text-sm text-slate-500">Las API keys se guardan cifradas y nunca se muestran de vuelta.</p>
                    </div>
                </div>

                <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
                    <div className="border-b border-slate-100 p-5">
                        <div className="flex items-center gap-2">
                            <Mail size={18} className="text-violet-700" />
                            <h2 className="text-lg font-black text-slate-900">Resend</h2>
                        </div>
                        <p className="mt-1 text-sm text-slate-500">Define el correo que recibe solicitudes y el remitente de respuestas automáticas.</p>
                    </div>
                    <div className="grid grid-cols-1 gap-5 p-5 xl:grid-cols-2">
                        <div className="space-y-4">
                            <TextInput label="Correo que recibe soporte" value={settings.resend_inbound_email} onChange={(value) => updateSetting('resend_inbound_email', value)} />
                            <TextInput label="Nombre del remitente" value={settings.resend_from_name} onChange={(value) => updateSetting('resend_from_name', value)} />
                            <TextInput label="Correo que enviará respuestas" value={settings.resend_from_email} onChange={(value) => updateSetting('resend_from_email', value)} />
                            <TextInput label="Resend API Key" value={resendApiKey} onChange={setResendApiKey} type="password" placeholder={formatSecretStatus(secretStatuses, 'resend')} />
                        </div>
                        <div className="space-y-4">
                            <div>
                                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Webhook URL para Resend</p>
                                <CodeValue value={webhookUrl} />
                            </div>
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Evento esperado</p>
                                <p className="mt-1 text-sm font-bold text-slate-800">email.received</p>
                            </div>
                            <p className="text-xs text-slate-500">
                                Si el campo API key queda vacío, se conserva la key actual. Para reemplazarla, pega una nueva y guarda.
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
                        <p className="mt-1 text-sm text-slate-500">Configura el proveedor, modelo y capacidades que usará el HelpDesk.</p>
                    </div>
                    <div className="grid grid-cols-1 gap-5 p-5 xl:grid-cols-2">
                        <div className="space-y-4">
                            <label className="block">
                                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">Proveedor IA</span>
                                <select
                                    value={settings.ai_provider}
                                    onChange={(event) => updateSetting('ai_provider', event.target.value as IntegrationSettings['ai_provider'])}
                                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                                >
                                    <option value="openai">OpenAI</option>
                                    <option value="anthropic">Anthropic</option>
                                    <option value="disabled">Desactivado</option>
                                </select>
                            </label>
                            <TextInput label="Modelo" value={settings.ai_model} onChange={(value) => updateSetting('ai_model', value)} />
                            <TextInput label="OpenAI API Key" value={openAiApiKey} onChange={setOpenAiApiKey} type="password" placeholder={formatSecretStatus(secretStatuses, 'openai')} />
                            <TextInput label="Anthropic API Key" value={anthropicApiKey} onChange={setAnthropicApiKey} type="password" placeholder={formatSecretStatus(secretStatuses, 'anthropic')} />
                        </div>
                        <div className="rounded-lg border border-slate-200 p-4">
                            <ToggleRow label="Triage automático" detail="Clasifica categoría, prioridad y resumen de tickets nuevos." checked={settings.ai_triage_enabled} onChange={(value) => updateSetting('ai_triage_enabled', value)} />
                            <ToggleRow label="Análisis de sentimiento" detail="Marca tickets como frustrado, neutral o positivo." checked={settings.ai_sentiment_enabled} onChange={(value) => updateSetting('ai_sentiment_enabled', value)} />
                            <ToggleRow label="Respuestas sugeridas" detail="Genera borradores rápidos para que el agente revise antes de enviar." checked={settings.ai_auto_drafts_enabled} onChange={(value) => updateSetting('ai_auto_drafts_enabled', value)} />
                        </div>
                    </div>
                </section>

                <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
                    <div className="border-b border-slate-100 p-5">
                        <div className="flex items-center gap-2">
                            <ShieldCheck size={18} className="text-emerald-700" />
                            <h2 className="text-lg font-black text-slate-900">Guardar configuración</h2>
                        </div>
                        <p className="mt-1 text-sm text-slate-500">
                            Los cambios se guardan desde el panel administrativo y las API keys se cifran antes de persistirse.
                        </p>
                    </div>
                    <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <p className="text-sm font-bold text-slate-800">Listo para guardar</p>
                            <p className="mt-1 text-xs text-slate-500">Si dejas un campo de API key vacío, se conserva la key configurada actualmente.</p>
                        </div>
                        <button
                            onClick={handleSave}
                            disabled={saveState === 'saving'}
                            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                            type="button"
                        >
                            <Save size={16} />
                            {saveState === 'saving' ? 'Guardando...' : 'Guardar cambios'}
                        </button>
                    </div>
                    {message && (
                        <div className={`mx-5 mb-5 rounded-lg border p-3 text-sm ${saveState === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                            {message}
                        </div>
                    )}
                    <div className="mx-5 mb-5 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                        <Sparkles size={15} className="mt-0.5 shrink-0 text-indigo-500" />
                        Para habilitar esta pantalla, despliega la función `save-integration-settings` y define `INTEGRATION_SECRET_KEY` como secret de Supabase. `CONFIG_ADMIN_TOKEN` queda opcional solo para llamadas externas.
                    </div>
                </section>
            </div>
        </div>
    );
};
