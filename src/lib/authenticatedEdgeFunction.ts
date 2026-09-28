import type { SupabaseClient } from '@supabase/supabase-js';
import type { FunctionInvokeOptions } from '@supabase/functions-js';

function responseStatus(error: unknown): number | null {
    if (!error || typeof error !== 'object') return null;
    const context = (error as { context?: unknown }).context;
    return context instanceof Response ? context.status : null;
}

async function requireAccessToken(client: Pick<SupabaseClient, 'auth'>): Promise<string> {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (!data.session?.access_token) {
        throw new Error('La sesión administrativa expiró. Inicia sesión nuevamente.');
    }
    return data.session.access_token;
}

export async function invokeAuthenticatedEdgeFunction(
    client: Pick<SupabaseClient, 'auth' | 'functions'>,
    functionName: string,
    options: FunctionInvokeOptions = {},
) {
    const invoke = (accessToken: string) => client.functions.invoke(functionName, {
        ...options,
        headers: {
            ...options.headers,
            Authorization: `Bearer ${accessToken}`,
        },
    });

    const firstResult = await invoke(await requireAccessToken(client));
    if (!firstResult.error || responseStatus(firstResult.error) !== 401) return firstResult;

    const { data, error } = await client.auth.refreshSession();
    if (error) throw error;
    if (!data.session?.access_token) {
        throw new Error('La sesión administrativa expiró. Inicia sesión nuevamente.');
    }
    return invoke(data.session.access_token);
}
