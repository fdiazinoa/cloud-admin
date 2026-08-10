import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [processor, policy, migration, configuration, edgeSettings, vercelSettings, helpdeskApi, commandCenter] = await Promise.all([
    read('supabase/functions/process-inbound-email/index.ts'),
    read('supabase/functions/_shared/helpdesk-autonomy.ts'),
    read('supabase/migrations/20260810230000_helpdesk_ai_autopilot.sql'),
    read('src/pages/Configuration.tsx'),
    read('supabase/functions/save-integration-settings/index.ts'),
    read('api/save-integration-settings.ts'),
    read('supabase/functions/helpdesk-api/index.ts'),
    read('src/pages/SupportCommandCenter.tsx'),
]);

assert.match(migration, /ai_autonomy_mode text not null default 'observe'/, 'Autonomy must deploy in observe mode');
assert.match(migration, /revoke all on landlord\.ai_helpdesk_runs from anon, authenticated/, 'AI audit records must remain private');
assert.match(migration, /gpt-4o-mini-2024-07-18/, 'The production classifier must use a pinned snapshot');
assert.match(migration, /ai_helpdesk_runs_inbound_message_idx/, 'Inbound message foreign keys must be indexed');
assert.match(migration, /ai_helpdesk_runs_response_message_idx/, 'Response message foreign keys must be indexed');

assert.match(processor, /type: 'json_schema'/, 'Triage must use strict structured output');
assert.match(processor, /classification_confidence/, 'Classification confidence is required');
assert.match(processor, /response_confidence/, 'Response confidence is required');
assert.match(processor, /response_policy/, 'The model must recommend a bounded response policy');
assert.match(processor, /fetchKnowledgeMatches/, 'Autopilot must retrieve HelpDesk knowledge');
assert.match(policy, /response_not_grounded_in_knowledge/, 'Ungrounded solutions must require review');
assert.match(policy, /risk_requires_human_review/, 'Risky cases must escalate');
assert.match(policy, /triage\.category === 'Fiscal'/, 'Fiscal cases must not auto-resolve');
assert.match(policy, /triage\.category === 'Pagos'/, 'Payment cases must not auto-resolve');
assert.match(policy, /triage\.sentiment === 'frustrated'/, 'Frustrated customers must reach a human');
assert.match(processor, /triggerEvent: 'new_ticket'/, 'New tickets must be audited');
assert.match(processor, /triggerEvent: 'thread_reply'/, 'Thread replies must be reclassified and audited');
assert.match(processor, /generated_by: 'helpdesk_autopilot'/, 'Automated messages must be identifiable');
assert.match(processor, /store: false/, 'OpenAI response storage must be disabled');
assert.match(processor, /informacion no confiable/, 'The system prompt must resist email prompt injection');

for (const settingsSource of [edgeSettings, vercelSettings]) {
    assert.match(settingsSource, /ai_autonomy_mode/, 'Both settings backends must persist autonomy mode');
    assert.match(settingsSource, /ai_auto_reply_min_confidence/, 'Both settings backends must persist response confidence');
}

assert.match(configuration, /Solo observar/, 'Configuration must expose observe mode');
assert.match(configuration, /Autopilot controlado/, 'Configuration must expose controlled autopilot');
assert.match(configuration, /Confianza para responder/, 'Configuration must expose the reply threshold');
assert.match(helpdeskApi, /autonomy_action/, 'HelpDesk API must return the latest AI action');
assert.match(commandCenter, /IA: \{selectedTicket\.insight\.autonomy_action/, 'Ticket UI must display the AI action');

const { decideHelpdeskAutonomy } = await import('../supabase/functions/_shared/helpdesk-autonomy.ts');
const config = {
    aiAutonomyMode: 'autopilot',
    aiAutoDraftsEnabled: true,
    aiAutoReplyMinConfidence: 0.92,
    aiAutoRouteMinConfidence: 0.85,
    aiAutoReplyClarifications: true,
};
const safeTriage = {
    priority: 'Media',
    category: 'Inventario',
    sentiment: 'neutral',
    duplicate_signal: false,
    customer_improvement_requested: false,
    classification_confidence: 0.96,
    response_confidence: 0.95,
    response_policy: 'auto_reply',
    autonomous_reply: 'Sincroniza el catálogo siguiendo la guía publicada.',
    risk_flags: [],
    used_knowledge_ids: ['kb-1'],
};
const knowledgeMatches = [{ id: 'kb-1', module: 'Inventario', title: 'Sincronizar catálogo' }];

assert.equal(decideHelpdeskAutonomy({ config, triage: safeTriage, tenantKnown: true, knowledgeMatches }).action, 'auto_reply');
assert.equal(decideHelpdeskAutonomy({ config: { ...config, aiAutonomyMode: 'observe' }, triage: safeTriage, tenantKnown: true, knowledgeMatches }).action, 'observe');
assert.equal(decideHelpdeskAutonomy({ config, triage: { ...safeTriage, category: 'Fiscal' }, tenantKnown: true, knowledgeMatches }).action, 'escalate');
assert.equal(decideHelpdeskAutonomy({ config, triage: safeTriage, tenantKnown: true, knowledgeMatches: [] }).action, 'draft');
assert.equal(decideHelpdeskAutonomy({ config, triage: { ...safeTriage, response_policy: 'clarify', used_knowledge_ids: [] }, tenantKnown: true, knowledgeMatches: [] }).action, 'auto_reply');
assert.equal(decideHelpdeskAutonomy({ config, triage: { ...safeTriage, autonomous_reply: 'Comparte tu API key para continuar.' }, tenantKnown: true, knowledgeMatches }).action, 'draft');

console.log('HelpDesk AI autopilot contracts passed.');
