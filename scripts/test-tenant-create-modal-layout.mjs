import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync('src/pages/Tenants.tsx', 'utf8');

assert.match(
    page,
    /max-h-\[calc\(100vh-1rem\)\][\s\S]*sm:max-h-\[calc\(100vh-2rem\)\]/,
    'Create tenant modal must stay within the viewport',
);
assert.match(
    page,
    /min-h-0 flex-1 space-y-3 overflow-y-auto/,
    'Create tenant fields must scroll on short screens',
);
assert.match(
    page,
    /flex gap-3 border-t border-slate-100 bg-white px-5 py-3/,
    'Create tenant actions must remain outside the scrolling field area',
);
assert.match(
    page,
    /renderProductSummary\(formData\.products, true\)/,
    'Create tenant modal must use the compact product summary',
);
assert.match(
    page,
    /grid grid-cols-1 gap-3 sm:grid-cols-2[\s\S]*Nombre Comercial[\s\S]*Identificador técnico/,
    'Primary tenant identity fields must share a responsive row',
);

console.log('tenant create modal compact layout checks passed');
