import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [component, kbService] = await Promise.all([
    read('src/pages/SupportCommandCenter.tsx'),
    read('src/lib/knowledgeService.ts'),
]);

assert.ok(component.includes('Base de conocimientos'), 'HelpDesk must surface KB suggestions');
assert.ok(component.includes('listKnowledgeResources'), 'HelpDesk must reuse the KB service');
assert.ok(component.includes('insertKbReference'), 'HelpDesk must insert a KB reference into the reply');
assert.ok(kbService.includes('listKnowledgeResources'), 'KB service must expose listKnowledgeResources');

console.log('HelpDesk KB suggestions contracts: OK');
