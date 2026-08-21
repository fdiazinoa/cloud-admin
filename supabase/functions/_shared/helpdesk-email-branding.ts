export const HELPDESK_EMAIL_SIGNATURE_IMAGE_URL =
    'https://cdfdgxejnbznjxuokrrx.supabase.co/storage/v1/object/public/erp-media/cloud-admin/helpdesk/msmall-email-signature-v1.gif';

export const HELPDESK_EMAIL_SIGNATURE_ALT = 'MsMall — Inteligencia que transforma centros comerciales';

function escapeHtml(value: string) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function buildHelpdeskEmailSignatureHtml() {
    return `
        <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0">
            <img
                src="${HELPDESK_EMAIL_SIGNATURE_IMAGE_URL}"
                alt="${HELPDESK_EMAIL_SIGNATURE_ALT}"
                width="460"
                height="90"
                style="display:block;width:100%;max-width:460px;height:auto;border:0"
            />
        </div>
    `;
}

export function appendHelpdeskEmailSignatureHtml(html: string) {
    return `
        <div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#0f172a">
            ${html.trim()}
            ${buildHelpdeskEmailSignatureHtml()}
        </div>
    `;
}

export function buildHelpdeskEmailHtmlFromText(text: string) {
    const messageHtml = escapeHtml(text).replace(/\r?\n/g, '<br />');
    return appendHelpdeskEmailSignatureHtml(`<div>${messageHtml}</div>`);
}

export function appendHelpdeskEmailSignatureText(text: string) {
    return `${text.trimEnd()}\n\n${HELPDESK_EMAIL_SIGNATURE_ALT}`;
}
