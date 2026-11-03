import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The terminal console used to live inline in `src/pages/Tenants.tsx`.
 * It now spans the modules below, so regressions that assert on its markup or
 * logic read the concatenated source of the split files.
 */
const TENANT_TERMINAL_FILES = [
    'src/components/tenants/TenantTerminalConsole.tsx',
    'src/components/tenants/TerminalTakeoverModal.tsx',
    'src/components/tenants/TerminalRebuildModal.tsx',
    'src/hooks/useTenantTerminalConsole.ts',
    'src/lib/tenantTerminalFormatting.ts',
];

export const readTenantTerminalSource = () => TENANT_TERMINAL_FILES
    .map((path) => readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf8'))
    .join('\n');
