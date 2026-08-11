import { readFileSync } from 'node:fs';

const service = readFileSync('src/lib/accountService.ts', 'utf8');
const dialog = readFileSync('src/components/ChangePasswordDialog.tsx', 'utf8');
const layout = readFileSync('src/components/Layout.tsx', 'utf8');

const reauthenticateAt = service.indexOf('supabase.auth.signInWithPassword');
const updatePasswordAt = service.indexOf('supabase.auth.updateUser');

const checks = [
    ['service validates current password', service.includes("if (!input.currentPassword)")],
    ['service enforces minimum password length', service.includes('MIN_ACCOUNT_PASSWORD_LENGTH = 8')],
    ['service rejects password reuse', service.includes('input.newPassword === input.currentPassword')],
    ['service validates confirmation', service.includes('input.newPassword !== input.confirmPassword')],
    ['service resolves email from authenticated user', service.includes('supabase.auth.getUser()')],
    ['service reauthenticates before changing password', reauthenticateAt >= 0 && updatePasswordAt > reauthenticateAt],
    ['service maps invalid current password safely', service.includes('La contraseña actual no es correcta.')],
    ['passwords are not logged', !/console\.(log|info|warn|error)\s*\(/.test(service + dialog)],
    ['dialog uses password autocomplete hints', dialog.includes("autoComplete: 'current-password'") && dialog.includes("autoComplete: 'new-password'")],
    ['dialog exposes success and error feedback', dialog.includes('Contraseña actualizada') && dialog.includes('role="alert"')],
    ['desktop and mobile layout expose change password', (layout.match(/Cambiar contraseña/g) || []).length >= 2],
    ['layout mounts the change password dialog', layout.includes('<ChangePasswordDialog open={changePasswordOpen}')],
];

const failures = checks.filter(([, passed]) => !passed);
for (const [label, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${label}`);
if (failures.length) process.exitCode = 1;
else console.log('PASS authenticated users can securely change their password');

