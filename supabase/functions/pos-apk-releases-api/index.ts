import {
    createCloudAdminClient,
    isCloudAdminAuthorizationError,
    requireCloudAdminActor,
} from '../_shared/cloud-admin-auth.ts';

declare const Deno: {
    serve(handler: (request: Request) => Response | Promise<Response>): void;
};

interface ApkReleasePayload {
    action?: string;
    release_id?: string;
    version_name?: string;
    version_code?: number;
    apk_url?: string;
    checksum_sha256?: string;
    changelog?: string;
    release_type?: string;
    release_status?: string;
    summary?: string;
    bugs_fixed?: string[];
    new_features?: string[];
    internal_changes?: string[];
    validation_checklist?: string[];
    install_notes?: string;
    rollout_scope?: string;
    status_notes?: string;
}

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const releaseTypes = new Set(['bugfix', 'feature', 'improvement', 'hotfix', 'beta']);
const releaseStatuses = new Set(['draft', 'internal_testing', 'beta', 'available', 'retired']);

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

function cleanString(value: unknown, maxLength = 500) {
    return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function cleanList(value: unknown, maxItems = 50, maxLength = 500) {
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => cleanString(item, maxLength))
        .filter(Boolean)
        .slice(0, maxItems);
}

function validHttpUrl(value: string) {
    try {
        return ['http:', 'https:'].includes(new URL(value).protocol);
    } catch {
        return false;
    }
}

function directDownloadUrl(value: string) {
    const match = value.match(/\/file\/d\/([^/]+)/);
    if (match?.[1]) return `https://drive.google.com/uc?export=download&id=${match[1]}`;
    try {
        const parsed = new URL(value);
        const id = parsed.hostname === 'drive.google.com' ? parsed.searchParams.get('id') : null;
        return id ? `https://drive.google.com/uc?export=download&id=${id}` : value;
    } catch {
        return value;
    }
}

function describeError(error: unknown) {
    if (error instanceof Error) return error.message;
    if (error && typeof error === 'object') {
        const record = error as Record<string, unknown>;
        return [record.message, record.details, record.hint, record.code].filter(Boolean).join(' | ') || 'Unknown error';
    }
    return String(error ?? 'Unknown error');
}

Deno.serve(async (request) => {
    if (request.method === 'OPTIONS') return json({ ok: true });
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    try {
        const payload = await request.json() as ApkReleasePayload;
        const action = cleanString(payload.action, 40);
        const requiredPermission = action === 'list'
            ? 'apk_view'
            : action === 'latest'
                ? 'tenants_view'
                : 'apk_manage';
        const actor = await requireCloudAdminActor(request, requiredPermission);
        const supabase = createCloudAdminClient();

        if (action === 'list') {
            const { data, error } = await supabase
                .from('pos_apk_releases')
                .select(`
                    *,
                    status_actor:cloud_admin_users!pos_apk_releases_status_changed_by_fkey(id, full_name, email)
                `)
                .order('is_latest', { ascending: false })
                .order('version_code', { ascending: false });
            if (error) throw error;
            return json({ releases: data ?? [] });
        }

        if (action === 'latest') {
            const { data, error } = await supabase
                .from('pos_apk_releases')
                .select('version_name, version_code')
                .eq('release_status', 'available')
                .order('version_code', { ascending: false })
                .limit(1)
                .maybeSingle();
            if (error) throw error;
            return json({ release: data ?? null });
        }

        if (action === 'create') {
            const versionName = cleanString(payload.version_name, 80);
            const versionCode = Number(payload.version_code);
            const apkUrl = cleanString(payload.apk_url, 2000);
            const releaseType = cleanString(payload.release_type, 40);
            const requestedStatus = cleanString(payload.release_status, 40) || 'internal_testing';
            const checksum = cleanString(payload.checksum_sha256, 128);
            if (!versionName || !Number.isInteger(versionCode) || versionCode <= 0 || !validHttpUrl(apkUrl)) {
                return json({ error: 'Valid version_name, version_code and apk_url are required' }, 400);
            }
            if (!releaseTypes.has(releaseType) || !releaseStatuses.has(requestedStatus)) {
                return json({ error: 'Invalid release_type or release_status' }, 400);
            }
            if (checksum && !/^[a-f0-9]{64}$/i.test(checksum)) {
                return json({ error: 'checksum_sha256 must contain 64 hexadecimal characters' }, 400);
            }

            const initialStatus = requestedStatus === 'available' ? 'internal_testing' : requestedStatus;
            const { data: inserted, error: insertError } = await supabase
                .from('pos_apk_releases')
                .insert({
                    version_name: versionName,
                    version_code: versionCode,
                    apk_url: apkUrl,
                    direct_download_url: directDownloadUrl(apkUrl),
                    checksum_sha256: checksum || null,
                    changelog: cleanString(payload.changelog, 10000) || null,
                    release_type: releaseType,
                    release_status: initialStatus,
                    summary: cleanString(payload.summary, 3000) || null,
                    bugs_fixed: cleanList(payload.bugs_fixed),
                    new_features: cleanList(payload.new_features),
                    internal_changes: cleanList(payload.internal_changes),
                    validation_checklist: cleanList(payload.validation_checklist),
                    install_notes: cleanString(payload.install_notes, 5000) || null,
                    rollout_scope: cleanString(payload.rollout_scope, 500) || null,
                    is_latest: false,
                    status_changed_at: new Date().toISOString(),
                    status_changed_by: actor.id,
                    status_change_notes: cleanString(payload.status_notes, 2000) || null,
                })
                .select('*')
                .single();
            if (insertError) throw insertError;

            if (requestedStatus === 'available') {
                const { error: statusError } = await supabase.rpc('set_pos_apk_release_status', {
                    p_release_id: inserted.id,
                    p_status: requestedStatus,
                    p_actor_id: actor.id,
                    p_notes: cleanString(payload.status_notes, 2000) || null,
                });
                if (statusError) throw statusError;
            }

            const { data, error } = await supabase
                .from('pos_apk_releases')
                .select('*')
                .eq('id', inserted.id)
                .single();
            if (error) throw error;
            return json({ release: data });
        }

        if (action === 'update_status') {
            const releaseId = cleanString(payload.release_id, 64);
            const status = cleanString(payload.release_status, 40);
            if (!/^[0-9a-f-]{36}$/i.test(releaseId) || !releaseStatuses.has(status)) {
                return json({ error: 'Valid release_id and release_status are required' }, 400);
            }
            const { error: statusError } = await supabase.rpc('set_pos_apk_release_status', {
                p_release_id: releaseId,
                p_status: status,
                p_actor_id: actor.id,
                p_notes: cleanString(payload.status_notes, 2000) || null,
            });
            if (statusError) throw statusError;

            const { data, error } = await supabase
                .from('pos_apk_releases')
                .select('*')
                .eq('id', releaseId)
                .single();
            if (error) throw error;
            return json({ release: data });
        }

        return json({ error: 'Unknown APK release action' }, 400);
    } catch (error) {
        const authorizationError = isCloudAdminAuthorizationError(error);
        console.error('pos-apk-releases-api failed', describeError(error));
        return json({
            error: authorizationError ? 'unauthorized' : 'APK release operation failed',
            detail: describeError(error),
        }, authorizationError ? 401 : 500);
    }
});
