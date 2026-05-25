import { supabaseAdmin } from './supabase';

export interface PosApkRelease {
    id: string;
    version_name: string;
    version_code: number;
    apk_url: string;
    direct_download_url: string | null;
    checksum_sha256: string | null;
    changelog: string | null;
    release_type: string | null;
    release_status: string | null;
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
}

export interface CreatePosApkReleaseInput {
    versionName: string;
    versionCode: number;
    apkUrl: string;
    checksumSha256?: string;
    changelog?: string;
    releaseType?: string;
    releaseStatus?: string;
    summary?: string;
    bugsFixed?: string[];
    newFeatures?: string[];
    internalChanges?: string[];
    validationChecklist?: string[];
    installNotes?: string;
    rolloutScope?: string;
    isLatest: boolean;
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

export async function getPosApkReleases(): Promise<PosApkRelease[]> {
    const { data, error } = await supabaseAdmin
        .from('pos_apk_releases')
        .select('*')
        .order('is_latest', { ascending: false })
        .order('published_at', { ascending: false })
        .order('version_code', { ascending: false });

    if (error) throw error;
    return (data as PosApkRelease[]) || [];
}

export async function createPosApkRelease(input: CreatePosApkReleaseInput): Promise<PosApkRelease> {
    const apkUrl = input.apkUrl.trim();
    const directDownloadUrl = buildDirectDownloadUrl(apkUrl);

    if (input.isLatest) {
        const { error: unsetError } = await supabaseAdmin
            .from('pos_apk_releases')
            .update({ is_latest: false })
            .eq('is_latest', true);

        if (unsetError) throw unsetError;
    }

    const { data, error } = await supabaseAdmin
        .from('pos_apk_releases')
        .insert({
            version_name: input.versionName.trim(),
            version_code: input.versionCode,
            apk_url: apkUrl,
            direct_download_url: directDownloadUrl,
            checksum_sha256: input.checksumSha256?.trim() || null,
            changelog: input.changelog?.trim() || null,
            release_type: input.releaseType?.trim() || null,
            release_status: input.releaseStatus?.trim() || 'available',
            summary: input.summary?.trim() || null,
            bugs_fixed: normalizeList(input.bugsFixed),
            new_features: normalizeList(input.newFeatures),
            internal_changes: normalizeList(input.internalChanges),
            validation_checklist: normalizeList(input.validationChecklist),
            install_notes: input.installNotes?.trim() || null,
            rollout_scope: input.rolloutScope?.trim() || null,
            is_latest: input.isLatest,
        })
        .select('*')
        .single();

    if (error) throw error;
    return data as PosApkRelease;
}
