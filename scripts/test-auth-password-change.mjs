import { readFileSync } from 'node:fs';

const service = readFileSync('src/lib/accountService.ts', 'utf8');
const dialog = readFileSync('src/components/ChangePasswordDialog.tsx', 'utf8');
const forgotDialog = readFileSync('src/components/ForgotPasswordDialog.tsx', 'utf8');
const resetScreen = readFileSync('src/components/ResetPasswordScreen.tsx', 'utf8');
const layout = readFileSync('src/components/Layout.tsx', 'utf8');
const app = readFileSync('src/App.tsx', 'utf8');

const reauthenticateAt = service.indexOf('supabase.auth.signInWithPassword');
const updatePasswordAt = service.indexOf('supabase.auth.updateUser', reauthenticateAt);

const checks = [
    ['service validates current password', service.includes("if (!input.currentPassword)")],
    ['service enforces minimum password length', service.includes('MIN_ACCOUNT_PASSWORD_LENGTH = 8')],
    ['service rejects password reuse', service.includes('input.newPassword === input.currentPassword')],
    ['service validates confirmation', service.includes('input.newPassword !== input.confirmPassword')],
    ['service resolves email from authenticated user', service.includes('supabase.auth.getUser()')],
    ['service reauthenticates before changing password', reauthenticateAt >= 0 && updatePasswordAt > reauthenticateAt],
    ['service maps invalid current password safely', service.includes('La contraseña actual no es correcta.')],
    ['passwords are not logged', !/console\.(log|info|warn|error)\s*\(/.test(service + dialog + forgotDialog + resetScreen)],
    ['dialog uses password autocomplete hints', dialog.includes("autoComplete: 'current-password'") && dialog.includes("autoComplete: 'new-password'")],
    ['dialog exposes success and error feedback', dialog.includes('Contraseña actualizada') && dialog.includes('role="alert"')],
    ['desktop and mobile layout expose change password', (layout.match(/Cambiar contraseña/g) || []).length >= 2],
    ['layout mounts the change password dialog', layout.includes('<ChangePasswordDialog open={changePasswordOpen}')],
    ['forgot password sends a recovery email', service.includes('supabase.auth.resetPasswordForEmail')],
    ['recovery uses an explicit redirect marker', service.includes("searchParams.set('passwordRecovery', '1')")],
    ['forgot password response prevents user enumeration', forgotDialog.includes('Si el correo pertenece a un usuario registrado')],
    ['login exposes forgot password', app.includes('¿Olvidaste tu contraseña?') && app.includes('<ForgotPasswordDialog')],
    ['app handles Supabase password recovery event', app.includes("event === 'PASSWORD_RECOVERY'")],
    ['recovery screen validates and updates the password', resetScreen.includes('validateRecoveredPassword') && resetScreen.includes('completePasswordRecovery')],
    ['recovery screen uses new-password autocomplete', (resetScreen.match(/autoComplete="new-password"/g) || []).length >= 1],
];

const failures = checks.filter(([, passed]) => !passed);
for (const [label, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${label}`);
if (failures.length) process.exitCode = 1;
else console.log('PASS authenticated users can securely change their password');
