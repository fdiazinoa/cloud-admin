CREATE TABLE IF NOT EXISTS landlord.pos_apk_releases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_name TEXT NOT NULL,
    version_code INTEGER NOT NULL CHECK (version_code > 0),
    apk_url TEXT NOT NULL,
    direct_download_url TEXT,
    checksum_sha256 TEXT,
    changelog TEXT,
    is_latest BOOLEAN NOT NULL DEFAULT false,
    published_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE UNIQUE INDEX IF NOT EXISTS pos_apk_releases_one_latest_idx
ON landlord.pos_apk_releases (is_latest)
WHERE is_latest = true;

CREATE INDEX IF NOT EXISTS pos_apk_releases_published_at_idx
ON landlord.pos_apk_releases (published_at DESC);

ALTER TABLE landlord.pos_apk_releases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Deny all to public on pos_apk_releases" ON landlord.pos_apk_releases;
CREATE POLICY "Deny all to public on pos_apk_releases"
ON landlord.pos_apk_releases
FOR ALL
TO PUBLIC
USING (false)
WITH CHECK (false);
