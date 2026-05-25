CREATE TABLE IF NOT EXISTS landlord.pos_apk_releases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_name TEXT NOT NULL,
    version_code INTEGER NOT NULL CHECK (version_code > 0),
    apk_url TEXT NOT NULL,
    direct_download_url TEXT,
    checksum_sha256 TEXT,
    changelog TEXT,
    release_type TEXT,
    release_status TEXT NOT NULL DEFAULT 'available',
    summary TEXT,
    bugs_fixed TEXT[] NOT NULL DEFAULT '{}',
    new_features TEXT[] NOT NULL DEFAULT '{}',
    internal_changes TEXT[] NOT NULL DEFAULT '{}',
    validation_checklist TEXT[] NOT NULL DEFAULT '{}',
    install_notes TEXT,
    rollout_scope TEXT,
    is_latest BOOLEAN NOT NULL DEFAULT false,
    published_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE landlord.pos_apk_releases
    ADD COLUMN IF NOT EXISTS direct_download_url TEXT,
    ADD COLUMN IF NOT EXISTS release_type TEXT,
    ADD COLUMN IF NOT EXISTS release_status TEXT NOT NULL DEFAULT 'available',
    ADD COLUMN IF NOT EXISTS summary TEXT,
    ADD COLUMN IF NOT EXISTS bugs_fixed TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS new_features TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS internal_changes TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS validation_checklist TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS install_notes TEXT,
    ADD COLUMN IF NOT EXISTS rollout_scope TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'pos_apk_releases_release_type_check'
          AND conrelid = 'landlord.pos_apk_releases'::regclass
    ) THEN
        ALTER TABLE landlord.pos_apk_releases
            ADD CONSTRAINT pos_apk_releases_release_type_check
            CHECK (
                release_type IS NULL
                OR release_type IN ('bugfix', 'feature', 'improvement', 'hotfix', 'beta')
            ) NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'pos_apk_releases_release_status_check'
          AND conrelid = 'landlord.pos_apk_releases'::regclass
    ) THEN
        ALTER TABLE landlord.pos_apk_releases
            ADD CONSTRAINT pos_apk_releases_release_status_check
            CHECK (release_status IN ('draft', 'internal_testing', 'beta', 'available', 'retired')) NOT VALID;
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS pos_apk_releases_one_latest_idx
ON landlord.pos_apk_releases (is_latest)
WHERE is_latest = true;

CREATE UNIQUE INDEX IF NOT EXISTS pos_apk_releases_version_code_idx
ON landlord.pos_apk_releases (version_code);

CREATE INDEX IF NOT EXISTS pos_apk_releases_published_at_idx
ON landlord.pos_apk_releases (published_at DESC);

CREATE INDEX IF NOT EXISTS pos_apk_releases_release_status_idx
ON landlord.pos_apk_releases (release_status);

ALTER TABLE landlord.pos_apk_releases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Deny all to public on pos_apk_releases" ON landlord.pos_apk_releases;
CREATE POLICY "Deny all to public on pos_apk_releases"
ON landlord.pos_apk_releases
FOR ALL
TO PUBLIC
USING (false)
WITH CHECK (false);
