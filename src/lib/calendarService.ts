import { supabase } from './supabase';

export type MeetingType = 'implementation' | 'meeting' | 'follow_up' | 'training';
export type MeetingStatus = 'pending' | 'scheduled' | 'failed' | 'cancelled' | 'completed';

export interface CalendarMeeting {
    id: string;
    meeting_type: MeetingType;
    title: string;
    context: string;
    ai_summary: string;
    ai_summary_source: 'openai' | 'structured_fallback';
    starts_at: string;
    ends_at: string;
    timezone: string;
    customer_email?: string | null;
    attendee_emails: string[];
    support_user_ids: string[];
    status: MeetingStatus;
    google_event_url?: string | null;
    last_error?: string | null;
    created_at: string;
}

export interface CalendarSupportUser { id: string; full_name: string; email: string }

interface FunctionErrorPayload { error?: string; detail?: string }

async function invokeCalendar<T>(action: string, payload: Record<string, unknown> = {}) {
    const { data, error } = await supabase.functions.invoke('calendar-api', { body: { action, ...payload } });
    if (error) {
        let detail = error.message;
        const context = error.context as Response | undefined;
        if (context?.clone) {
            const response = await context.clone().json().catch(() => null) as FunctionErrorPayload | null;
            detail = response?.detail || response?.error || detail;
        }
        throw new Error(detail);
    }
    return data as T;
}

export function listCalendarMeetings() {
    return invokeCalendar<{ meetings: CalendarMeeting[] }>('list');
}

export function listCalendarSupportUsers() {
    return invokeCalendar<{ users: CalendarSupportUser[] }>('support_users');
}

export function createCalendarMeeting(input: {
    meetingType: MeetingType;
    title: string;
    context: string;
    startsAt: string;
    endsAt: string;
    timezone: string;
    customerEmail: string;
    supportUserIds: string[];
    attendeeEmails: string[];
}) {
    return invokeCalendar<{ meeting: CalendarMeeting }>('create', {
        meeting_type: input.meetingType,
        title: input.title,
        context: input.context,
        starts_at: input.startsAt,
        ends_at: input.endsAt,
        timezone: input.timezone,
        customer_email: input.customerEmail,
        support_user_ids: input.supportUserIds,
        attendee_emails: input.attendeeEmails,
    });
}

export function retryCalendarMeeting(meetingId: string) {
    return invokeCalendar<{ meeting: CalendarMeeting }>('retry', { meeting_id: meetingId });
}
