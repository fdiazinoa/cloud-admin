import { supabase } from './supabase';

export type PosApkReleaseStatus = 'draft' | 'internal_testing' | 'beta' | 'available' | 'retired';

export interface PosApkReleaseActor {
    id: string;
    full_name: string;
    email: string;
}

export interface PosApkReleaseReference {
    version_name: string;
    version_code: number;
}

export interface PosApkRelease {
    id: string;
    version_name: string;
    version_code: number;
    apk_url: string;
    direct_download_url: string | null;
    checksum_sha256: string | null;
    changelog: string | null;
    release_type: string | null;
    release_status: PosApkReleaseStatus;
    summary: string | null;
    bugs_fixed: string[] | null;
    new_features: string[] | null;
    internal_changes: string[] | null;
    validation_checklist: string[] | null;
    install_notes: string | null;
    rollout_scope: string | null;
    is_latest: boolean;
    published_at: string;
    created_at: string;
    updated_at: string;
    status_changed_at: string | null;
    status_changed_by: string | null;
    status_change_notes: string | null;
    status_actor?: PosApkReleaseActor | PosApkReleaseActor[] | null;
}

export interface CreatePosApkReleaseInput {
    versionName: string;
    versionCode: number;
    apkUrl: string;
    checksumSha256?: string;
    changelog?: string;
    releaseType?: string;
    releaseStatus?: PosApkReleaseStatus;
    summary?: string;
    bugsFixed?: string[];
    newFeatures?: string[];
    internalChanges?: string[];
    validationChecklist?: string[];
    installNotes?: string;
    rolloutScope?: string;
}

export function extractGoogleDriveFileId(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const filePathMatch = trimmed.match(/\/file\/d\/([^/]+)/);
    if (filePathMatch?.[1]) return filePathMatch[1];

    try {
        const parsed = new URL(trimmed);
        return parsed.searchParams.get('id')?.trim() || null;
    } catch {
        return null;
    }
}

export function buildDirectDownloadUrl(value: string): string {
    const fileId = extractGoogleDriveFileId(value);
    return fileId ? `https://drive.google.com/uc?export=download&id=${fileId}` : value.trim();
}

function normalizeList(values?: string[]): string[] {
    return (values ?? []).map((value) => value.trim()).filter(Boolean);
}

async function invokePosApkReleases<T>(action: string, payload: Record<string, unknown> = {}) {
    const { data, error } = await supabase.functions.invoke('pos-apk-releases-api', {
        body: { action, ...payload },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.detail || data.error);
    return data as T;
}

export async function getPosApkReleases(): Promise<PosApkRelease[]> {
    const response = await invokePosApkReleases<{ releases: PosApkRelease[] }>('list');
    return response.releases;
}

export async function getLatestAvailablePosApkRelease(): Promise<PosApkReleaseReference | null> {
    const response = await invokePosApkReleases<{ release: PosApkReleaseReference | null }>('latest');
    return response.release;
}

export async function createPosApkRelease(input: CreatePosApkReleaseInput): Promise<PosApkRelease> {
    const apkUrl = input.apkUrl.trim();

    const response = await invokePosApkReleases<{ release: PosApkRelease }>('create', {
        version_name: input.versionName.trim(),
        version_code: input.versionCode,
        apk_url: apkUrl,
        checksum_sha256: input.checksumSha256?.trim() || null,
        changelog: input.changelog?.trim() || null,
        release_type: input.releaseType?.trim() || null,
        release_status: input.releaseStatus || 'internal_testing',
        summary: input.summary?.trim() || null,
        bugs_fixed: normalizeList(input.bugsFixed),
        new_features: normalizeList(input.newFeatures),
        internal_changes: normalizeList(input.internalChanges),
        validation_checklist: normalizeList(input.validationChecklist),
        install_notes: input.installNotes?.trim() || null,
        rollout_scope: input.rolloutScope?.trim() || null,
    });
    return response.release;
}

export async function updatePosApkReleaseStatus(
    releaseId: string,
    releaseStatus: PosApkReleaseStatus,
    statusNotes?: string,
): Promise<PosApkRelease> {
    const response = await invokePosApkReleases<{ release: PosApkRelease }>('update_status', {
        release_id: releaseId,
        release_status: releaseStatus,
        status_notes: statusNotes?.trim() || null,
    });
    return response.release;
}
