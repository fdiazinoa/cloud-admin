import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Bot, CalendarDays, Clock3, ExternalLink, Loader2, RefreshCw, Users } from 'lucide-react';
import {
    createCalendarMeeting,
    listCalendarMeetings,
    listCalendarSupportUsers,
    retryCalendarMeeting,
    type CalendarMeeting,
    type CalendarSupportUser,
    type MeetingType,
} from '../lib/calendarService';

const typeLabels: Record<MeetingType, string> = {
    implementation: 'Implementación',
    meeting: 'Reunión',
    follow_up: 'Seguimiento',
    training: 'Capacitación',
};

function initialLocalDate(hoursAhead = 2) {
    const date = new Date(Date.now() + hoursAhead * 60 * 60 * 1000);
    date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60 * 1000).toISOString().slice(0, 16);
}

const initialForm = {
    meetingType: 'implementation' as MeetingType,
    title: '',
    context: '',
    startsAt: initialLocalDate(),
    duration: '60',
    timezone: 'America/Santo_Domingo',
    customerEmail: '',
    extraAttendees: '',
    supportUserIds: [] as string[],
};

function displayDate(value: string) {
    return new Intl.DateTimeFormat('es-DO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function ImplementationCalendar() {
    const [meetings, setMeetings] = useState<CalendarMeeting[]>([]);
    const [supportUsers, setSupportUsers] = useState<CalendarSupportUser[]>([]);
    const [form, setForm] = useState(initialForm);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [retryingId, setRetryingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const [meetingResponse, usersResponse] = await Promise.all([
                listCalendarMeetings(),
                listCalendarSupportUsers(),
            ]);
            setMeetings(meetingResponse.meetings);
            setSupportUsers(usersResponse.users);
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar el calendario.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void load(); }, []);

    const upcoming = useMemo(() => meetings.filter((meeting) => meeting.status !== 'cancelled'), [meetings]);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setError(null);
        setNotice(null);
        try {
            const startsAt = new Date(form.startsAt);
            const endsAt = new Date(startsAt.getTime() + Number(form.duration) * 60 * 1000);
            const response = await createCalendarMeeting({
                meetingType: form.meetingType,
                title: form.title,
                context: form.context,
                startsAt: startsAt.toISOString(),
                endsAt: endsAt.toISOString(),
                timezone: form.timezone,
                customerEmail: form.customerEmail,
                supportUserIds: form.supportUserIds,
                attendeeEmails: form.extraAttendees.split(/[;,\n]/).map((email) => email.trim()).filter(Boolean),
            });
            setMeetings((current) => [response.meeting, ...current]);
            setForm({ ...initialForm, startsAt: initialLocalDate() });
            setNotice('Evento creado e invitaciones enviadas desde Google Calendar.');
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : 'No se pudo crear el evento.');
            await load();
        } finally {
            setSaving(false);
        }
    };

    const retry = async (meetingId: string) => {
        setRetryingId(meetingId);
        setError(null);
        try {
            const response = await retryCalendarMeeting(meetingId);
            setMeetings((current) => current.map((meeting) => meeting.id === meetingId ? response.meeting : meeting));
            setNotice('Evento sincronizado con Google Calendar.');
        } catch (retryError) {
            setError(retryError instanceof Error ? retryError.message : 'No se pudo reintentar.');
        } finally {
            setRetryingId(null);
        }
    };

    return (
        <div className="h-full overflow-y-auto bg-slate-50 p-6 lg:p-8">
            <div className="mx-auto max-w-7xl space-y-6">
                <header>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-600">Soporte coordinado</p>
                    <h1 className="mt-1 text-2xl font-black text-slate-900">Implementaciones y reuniones</h1>
                    <p className="mt-1 text-sm text-slate-500">Invita al cliente y al equipo, agrega recordatorios y conserva el contexto resumido.</p>
                </header>

                {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}
                {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{notice}</div>}

                <div className="grid gap-6 xl:grid-cols-[420px,minmax(0,1fr)]">
                    <form onSubmit={submit} className="h-fit space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex items-center gap-2"><CalendarDays className="text-indigo-600" size={20} /><h2 className="font-black text-slate-900">Nueva actividad</h2></div>
                        <label className="block text-xs font-bold text-slate-600">Tipo
                            <select value={form.meetingType} onChange={(event) => setForm({ ...form, meetingType: event.target.value as MeetingType })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                                {Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                            </select>
                        </label>
                        <label className="block text-xs font-bold text-slate-600">Título
                            <input required maxLength={180} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Implementación de ClicPOS — Sucursal Centro" />
                        </label>
                        <div className="grid grid-cols-[1fr,110px] gap-3">
                            <label className="block text-xs font-bold text-slate-600">Fecha y hora
                                <input required type="datetime-local" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                            </label>
                            <label className="block text-xs font-bold text-slate-600">Duración
                                <select value={form.duration} onChange={(event) => setForm({ ...form, duration: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                                    <option value="30">30 min</option><option value="60">1 hora</option><option value="90">1.5 h</option><option value="120">2 h</option>
                                </select>
                            </label>
                        </div>
                        <label className="block text-xs font-bold text-slate-600">Correo del cliente
                            <input type="email" value={form.customerEmail} onChange={(event) => setForm({ ...form, customerEmail: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="cliente@empresa.com" />
                        </label>
                        <fieldset>
                            <legend className="mb-2 text-xs font-bold text-slate-600">Personal de soporte</legend>
                            <div className="max-h-36 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3">
                                {supportUsers.map((user) => (
                                    <label key={user.id} className="flex items-center gap-2 text-sm text-slate-700">
                                        <input type="checkbox" checked={form.supportUserIds.includes(user.id)} onChange={(event) => setForm({ ...form, supportUserIds: event.target.checked ? [...form.supportUserIds, user.id] : form.supportUserIds.filter((id) => id !== user.id) })} />
                                        <span className="min-w-0"><strong>{user.full_name}</strong> <span className="text-xs text-slate-400">{user.email}</span></span>
                                    </label>
                                ))}
                            </div>
                        </fieldset>
                        <label className="block text-xs font-bold text-slate-600">Otros asistentes
                            <input value={form.extraAttendees} onChange={(event) => setForm({ ...form, extraAttendees: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="correo1@..., correo2@..." />
                        </label>
                        <label className="block text-xs font-bold text-slate-600">Contexto para la reunión y la IA
                            <textarea required rows={5} maxLength={6000} value={form.context} onChange={(event) => setForm({ ...form, context: event.target.value })} className="mt-1 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Cliente, productos, objetivo, incidencias previas y resultado esperado..." />
                        </label>
                        <div className="rounded-lg bg-indigo-50 p-3 text-xs text-indigo-700"><strong>Recordatorios:</strong> correo 24 horas antes y alerta 30 minutos antes.</div>
                        <button disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-black text-white hover:bg-indigo-700 disabled:opacity-60">
                            {saving ? <Loader2 className="animate-spin" size={16} /> : <CalendarDays size={16} />} Crear e invitar
                        </button>
                    </form>

                    <section className="space-y-3">
                        <div className="flex items-center justify-between"><h2 className="font-black text-slate-900">Actividades registradas</h2><span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-bold text-slate-600">{upcoming.length}</span></div>
                        {loading ? <div className="flex justify-center py-16"><Loader2 className="animate-spin text-indigo-600" /></div> : upcoming.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center text-sm text-slate-500">Aún no hay reuniones programadas.</div>
                        ) : upcoming.map((meeting) => (
                            <article key={meeting.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div><span className="text-xs font-black uppercase tracking-wider text-indigo-600">{typeLabels[meeting.meeting_type]}</span><h3 className="mt-1 text-lg font-black text-slate-900">{meeting.title}</h3></div>
                                    <span className={`rounded-full px-3 py-1 text-xs font-black ${meeting.status === 'scheduled' ? 'bg-emerald-100 text-emerald-700' : meeting.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{meeting.status === 'scheduled' ? 'Programada' : meeting.status === 'failed' ? 'Pendiente de sincronizar' : 'Procesando'}</span>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-600"><span className="flex items-center gap-1.5"><Clock3 size={15} />{displayDate(meeting.starts_at)}</span><span className="flex items-center gap-1.5"><Users size={15} />{meeting.attendee_emails.length} asistentes</span></div>
                                <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/70 p-4"><div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-indigo-700"><Bot size={15} />Resumen {meeting.ai_summary_source === 'openai' ? 'con IA' : 'estructurado'}</div><p className="whitespace-pre-line text-sm leading-6 text-slate-700">{meeting.ai_summary}</p></div>
                                {meeting.last_error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-xs font-semibold text-red-700">{meeting.last_error}</p>}
                                <div className="mt-4 flex gap-2">
                                    {meeting.google_event_url && <a href={meeting.google_event_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"><ExternalLink size={14} />Abrir en Google Calendar</a>}
                                    {meeting.status === 'failed' && <button type="button" disabled={retryingId === meeting.id} onClick={() => void retry(meeting.id)} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"><RefreshCw className={retryingId === meeting.id ? 'animate-spin' : ''} size={14} />Reintentar</button>}
                                </div>
                            </article>
                        ))}
                    </section>
                </div>
            </div>
        </div>
    );
}
