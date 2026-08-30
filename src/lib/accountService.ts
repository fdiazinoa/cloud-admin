import { supabase } from './supabase';

export const MIN_ACCOUNT_PASSWORD_LENGTH = 8;

export interface ChangeCurrentPasswordInput {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
}

export interface ResetPasswordInput {
    newPassword: string;
    confirmPassword: string;
}

export function buildPasswordRecoveryRedirectUrl(location: Pick<Location, 'origin' | 'pathname'> = window.location): string {
    const redirectUrl = new URL(location.pathname || '/', location.origin);
    redirectUrl.searchParams.set('passwordRecovery', '1');
    return redirectUrl.toString();
}

export async function requestPasswordReset(email: string): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) throw new Error('Ingresa tu correo electrónico.');

    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: buildPasswordRecoveryRedirectUrl(),
    });
    if (error) throw error;
}

export function validateRecoveredPassword(input: ResetPasswordInput): string | null {
    if (input.newPassword.length < MIN_ACCOUNT_PASSWORD_LENGTH) {
        return `La nueva contraseña debe tener al menos ${MIN_ACCOUNT_PASSWORD_LENGTH} caracteres.`;
    }
    if (input.newPassword !== input.confirmPassword) {
        return 'La confirmación no coincide con la nueva contraseña.';
    }
    return null;
}

export async function completePasswordRecovery(input: ResetPasswordInput): Promise<void> {
    const validationError = validateRecoveredPassword(input);
    if (validationError) throw new Error(validationError);

    const { error } = await supabase.auth.updateUser({ password: input.newPassword });
    if (error) throw error;
}

export function validatePasswordChange(input: ChangeCurrentPasswordInput): string | null {
    if (!input.currentPassword) return 'Ingresa tu contraseña actual.';
    if (input.newPassword.length < MIN_ACCOUNT_PASSWORD_LENGTH) {
        return `La nueva contraseña debe tener al menos ${MIN_ACCOUNT_PASSWORD_LENGTH} caracteres.`;
    }
    if (input.newPassword === input.currentPassword) {
        return 'La nueva contraseña debe ser diferente de la actual.';
    }
    if (input.newPassword !== input.confirmPassword) {
        return 'La confirmación no coincide con la nueva contraseña.';
    }
    return null;
}

export async function changeCurrentUserPassword(input: ChangeCurrentPasswordInput): Promise<void> {
    const validationError = validatePasswordChange(input);
    if (validationError) throw new Error(validationError);

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;

    const email = userData.user?.email?.trim().toLowerCase();
    if (!email) throw new Error('La sesión actual no tiene un email válido.');

    const { error: reauthenticationError } = await supabase.auth.signInWithPassword({
        email,
        password: input.currentPassword,
    });

    if (reauthenticationError) {
        if (/invalid login credentials/i.test(reauthenticationError.message)) {
            throw new Error('La contraseña actual no es correcta.');
        }
        throw reauthenticationError;
    }

    const { error: updateError } = await supabase.auth.updateUser({
        password: input.newPassword,
    });
    if (updateError) throw updateError;
}
