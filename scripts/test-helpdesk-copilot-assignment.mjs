import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [migration, api, inbound, resolve, service, component] = await Promise.all([
    read('supabase/migrations/20260821204303_helpdesk_copilot_assignment_metrics.sql'),
    read('supabase/functions/helpdesk-api/index.ts'),
    read('supabase/functions/process-inbound-email/index.ts'),
    read('supabase/functions/resolve-support-ticket/index.ts'),
    read('src/lib/helpdeskService.ts'),
    read('src/pages/SupportCommandCenter.tsx'),
]);

for (const contract of [
    'support_agent_routing_profiles',
    'support_ticket_assignment_events',
    'first_response_due_at',
    'resolution_due_at',
    'resolved_by',
    'helpdesk_copilot_route_ticket',
]) {
    assert.ok(migration.includes(contract), `Migration is missing ${contract}`);
}
assert.match(migration, /security invoker/, 'The routing RPC must not bypass database permissions');
assert.match(migration, /revoke all on function .* from public, anon, authenticated/, 'The routing RPC must remain service-only');
assert.match(migration, /where is_available and auto_assign_enabled/, 'Available routing profiles need a partial index');
assert.match(migration, /support_ticket_assignment_events_ticket_created_idx/, 'Assignment history needs a ticket/time index');

for (const action of [
    'assignment_dashboard',
    'update_assignment_settings',
    'update_agent_routing_profile',
    'copilot_assign',
    'copilot_assign_pending',
]) {
    assert.match(api, new RegExp(`action === '${action}'`), `Secure HelpDesk API is missing ${action}`);
}
assert.match(api, /can_manage_assignments: canManageHelpdesk\(actor\)/, 'The UI capability must come from server authorization');
assert.match(api, /p_actor_id: actor\.id/, 'Manual Copilot assignments must record the actor');
assert.match(inbound, /assignmentCopilotMode === 'auto'/, 'Inbound tickets must honor automatic assignment mode');
assert.match(inbound, /p_source: 'copilot_auto'/, 'Inbound routing must identify its source');
assert.match(resolve, /resolved_by: actor\.id/, 'Resolution metrics must record the resolving agent');

for (const method of [
    'fetchHelpdeskAssignmentDashboard',
    'assignPendingHelpdeskTicketsWithCopilot',
    'updateHelpdeskAssignmentSettings',
]) {
    assert.ok(service.includes(method), `HelpDesk service is missing ${method}`);
}
for (const label of ['Operación de agentes', 'Asignar pendientes', 'Rendimiento por agente', 'Fuera de SLA']) {
    assert.ok(component.includes(label), `HelpDesk operation modal is missing: ${label}`);
}

console.log('HelpDesk Copilot assignment contracts: OK');
