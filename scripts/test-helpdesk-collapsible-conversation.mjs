import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/pages/SupportCommandCenter.tsx', import.meta.url), 'utf8');

assert.match(source, /const \[messageExpansion, setMessageExpansion\]/, 'Conversation expansion state is missing');
assert.match(source, /messageExpansion\[message\.id\] \?\? isLatestMessage/, 'The newest message must open by default');
assert.match(source, /aria-expanded=\{isExpanded\}/, 'Message headers must expose their accordion state');
assert.match(source, /aria-controls=\{`support-message-\$\{message\.id\}`\}/, 'Message headers must identify their content');
assert.match(source, /message\.message\.replace\(\/\\s\+\/g, ' '\)\.trim\(\)/, 'Collapsed messages must include a compact preview');
assert.match(source, /\[nextMessageId\]: true/, 'Conversation search must expand the selected result');
assert.match(source, /\[activeMatch\.id\]: true/, 'The active search result must open automatically');
assert.match(source, /setMessageExpansion\(\{\}\)/, 'Expansion state must reset when changing tickets');
assert.match(source, /aria-label="Filtros rápidos de tickets"/, 'Prominent quick filters must appear above detailed filters');
assert.match(source, />Abiertos<\/span>/, 'The open-ticket quick filter is missing');
assert.match(source, />Críticos<\/span>/, 'The critical-ticket quick filter is missing');
assert.match(source, />Email<\/span>/, 'The email quick filter is missing');
assert.match(source, />Sin asignar<\/span>/, 'The unassigned-ticket quick filter is missing');

console.log('HelpDesk collapsible conversation checks passed.');
