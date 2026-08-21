export interface HelpdeskThreadCandidate {
    id: string;
    subject: string;
    external_sender_email?: string | null;
    created_at: string;
}

function normalizeEmail(value: string | null | undefined) {
    return (value ?? '').trim().toLowerCase();
}

export function extractTicketNumberFromSubject(subject: string) {
    const explicitTicket = subject.match(/ticket\s*#\s*(\d+)/i);
    if (explicitTicket) return Number(explicitTicket[1]);

    const standaloneNumber = subject.match(/(?:^|[\s[(])#\s*(\d+)(?!\s*#)/i);
    return standaloneNumber ? Number(standaloneNumber[1]) : null;
}

export function extractEmailMessageIds(value: unknown): string[] {
    const values = Array.isArray(value) ? value : [value];
    const messageIds = values.flatMap((entry) => {
        if (typeof entry !== 'string') return [];
        return entry.match(/<[^<>\s]+>/g) ?? [];
    });

    return Array.from(new Set(messageIds.map((messageId) => messageId.trim()).filter(Boolean)));
}

export function extractThreadReferenceMessageIds(headers: unknown): string[] {
    if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return [];

    const references: unknown[] = [];
    for (const [name, value] of Object.entries(headers as Record<string, unknown>)) {
        const normalizedName = name.trim().toLowerCase();
        if (normalizedName === 'in-reply-to' || normalizedName === 'references') references.push(value);
    }

    return extractEmailMessageIds(references.flat());
}

export function extractExternalThreadKey(subject: string) {
    const hashHashMatch = subject.match(/\[\s*##\s*([a-z0-9-]+)\s*##\s*\]/i);
    if (hashHashMatch) return `external:${hashHashMatch[1].toLowerCase()}`;

    const externalReferenceMatch = subject.match(/\[\s*#\s*([a-z][a-z0-9-]{5,})\s*\]/i);
    return externalReferenceMatch ? `external:${externalReferenceMatch[1].toLowerCase()}` : null;
}

export function normalizeThreadSubject(subject: string) {
    return subject
        .normalize('NFKC')
        .replace(/\[\s*ticket\s*#\s*\d+\s*\]/gi, ' ')
        .replace(/^\s*(?:(?:re|fw|fwd)\s*:\s*)+/i, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

export function isReplyLikeSubject(subject: string) {
    return /^\s*(?:(?:re|fw|fwd)\s*:\s*)+/i.test(subject);
}

export function selectFallbackThreadCandidate<T extends HelpdeskThreadCandidate>(
    candidates: T[],
    subject: string,
    senderEmail: string,
): T | null {
    const externalThreadKey = extractExternalThreadKey(subject);
    const normalizedSubject = normalizeThreadSubject(subject);
    if (!externalThreadKey && (!isReplyLikeSubject(subject) || !normalizedSubject)) return null;

    const matches = candidates.filter((candidate) => {
        const candidateExternalKey = extractExternalThreadKey(candidate.subject);
        if (externalThreadKey) return candidateExternalKey === externalThreadKey;

        return normalizeEmail(candidate.external_sender_email) === normalizeEmail(senderEmail)
            && normalizeThreadSubject(candidate.subject) === normalizedSubject;
    });

    return matches.sort((left, right) => {
        const timestampDifference = Date.parse(left.created_at) - Date.parse(right.created_at);
        return timestampDifference || left.id.localeCompare(right.id);
    })[0] ?? null;
}
