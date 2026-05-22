import { supabaseAdmin } from './supabase';

export interface PosApkRelease {
    id: string;
    version_name: string;
    version_code: number;
    apk_url: string;
    direct_download_url: string | null;
    checksum_sha256: string | null;
    changelog: string | null;
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
    isLatest: boolean;
}

export function extractGoogleDriveFileId(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const filePathMatch = trimmed.match(/\/file\/d\/([^/]+)/);
    if (filePathMatch?.[1]) return filePathMatch[1];

    try {
        const parsed = new URL(trimmed);
        const idParam = parsed.searchParams.get('id');
        return idParam?.trim() || null;
    } catch {
        return null;
    }
}

export function buildDirectDownloadUrl(value: string): string {
    const fileId = extractGoogleDriveFileId(value);
    return fileId ? `https://drive.google.com/uc?export=download&id=${fileId}` : value.trim();
}

export async function getPosApkReleases(): Promise<PosApkRelease[]> {
    const { data, error } = await supabaseAdmin
        .from('pos_apk_releases')
        .select('*')
        .order('is_latest', { ascending: false })
        .order('published_at', { ascending: false });

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
            is_latest: input.isLatest,
        })
        .select('*')
        .single();

    if (error) throw error;
    return data as PosApkRelease;
}

export const posApkReleaseService = {
    buildDirectDownloadUrl,
    createPosApkRelease,
    extractGoogleDriveFileId,
    getPosApkReleases,
};
