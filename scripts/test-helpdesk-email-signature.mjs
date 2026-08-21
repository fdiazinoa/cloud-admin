import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    appendHelpdeskEmailSignatureHtml,
    appendHelpdeskEmailSignatureText,
    buildHelpdeskEmailHtmlFromText,
    HELPDESK_EMAIL_SIGNATURE_ALT,
    HELPDESK_EMAIL_SIGNATURE_IMAGE_URL,
} from '../supabase/functions/_shared/helpdesk-email-branding.ts';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [manualReply, automatedReply, resolution, feedback] = await Promise.all([
    read('supabase/functions/send-support-reply/index.ts'),
    read('supabase/functions/process-inbound-email/index.ts'),
    read('supabase/functions/resolve-support-ticket/index.ts'),
    read('supabase/functions/submit-support-feedback/index.ts'),
]);

assert.match(HELPDESK_EMAIL_SIGNATURE_IMAGE_URL, /^https:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\//);
assert.equal(HELPDESK_EMAIL_SIGNATURE_ALT, 'MsMall — Inteligencia que transforma centros comerciales');

const renderedText = appendHelpdeskEmailSignatureText('Respuesta al cliente');
assert.match(renderedText, /Respuesta al cliente\n\nMsMall/);

const renderedHtml = buildHelpdeskEmailHtmlFromText('Primera línea\n<script>alert("x")</script>');
assert.match(renderedHtml, /Primera línea<br \/>/);
assert.equal(renderedHtml.includes('<script>'), false, 'manual replies must be HTML escaped');
assert.match(renderedHtml, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
assert.match(renderedHtml, /<img/);
assert.match(renderedHtml, /width="460"/);
assert.match(renderedHtml, /height="90"/);
assert.match(renderedHtml, new RegExp(HELPDESK_EMAIL_SIGNATURE_IMAGE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

const existingHtml = appendHelpdeskEmailSignatureHtml('<p>Ticket resuelto</p>');
assert.match(existingHtml, /<p>Ticket resuelto<\/p>/);
assert.match(existingHtml, /MsMall/);

for (const [name, source] of [
    ['manual reply', manualReply],
    ['automated reply', automatedReply],
]) {
    assert.match(source, /text: appendHelpdeskEmailSignatureText\(/, `${name} must include the plain-text signature`);
    assert.match(source, /html: buildHelpdeskEmailHtmlFromText\(/, `${name} must render the GIF signature in HTML`);
}

for (const [name, source] of [
    ['resolution request', resolution],
    ['closed ticket summary', feedback],
]) {
    assert.match(source, /text: appendHelpdeskEmailSignatureText\(/, `${name} must include the plain-text signature`);
    assert.match(source, /html: appendHelpdeskEmailSignatureHtml\(/, `${name} must render the GIF signature in HTML`);
}

console.log('HelpDesk email signature contracts: OK');
