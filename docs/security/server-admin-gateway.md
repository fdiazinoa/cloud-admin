# Cloud-Admin: server-only administrative credentials

Browser builds require only VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (publishable key).
SUPABASE_SERVICE_ROLE_KEY belongs only to the Vercel server environment. Do not put a new
secret in VITE_SUPABASE_SERVICE_ROLE_KEY. The old frontend variable can be removed when
this release is deployed; no client source imports it.

The login uses Supabase Auth with the public key and asks GET /api/admin-session for the
current administrative account and profile. The server validates the access token and
checks that both the administrative account and profile are active.

Administrative SDK requests go through POST /api/admin-gateway. The server checks the
profile permissions against an explicit table/RPC/function allowlist. Unknown resources,
embedded REST relations, schema mismatches and external URLs are rejected. The gateway
forwards only selected HTTP headers and never returns its service key. Integration secret
reads are limited to provider, secret_last4 and updated_at. Access/profile mutations remain
in the existing access-management Edge API; raw Auth administration is owner-only and also
requires the user/profile management capabilities. Non-owner tenant provisioning that needs
raw Auth operations fails closed until it is migrated to a dedicated server transaction.
Realtime uses the signed-in user's JWT and existing database authorization, never a service
key; subscriptions require compatible Realtime/RLS policies and must be checked before rollout.

Validation:
- npm run test:admin-gateway (session, active profile, permission boundary, SSRF and secret isolation)
- npm run test:authenticated-edge-functions
- npm run test:terminal-device-auth
- npm run test:terminal-device-requests
- npm run test:terminal-reconciliation
- npm run test:terminal-reauthorization
- npm run test:tenant-semantics
- npm run build and lint of changed modules
- Build with a fictitious VITE_SUPABASE_SERVICE_ROLE_KEY and verify that its value is absent
  from every dist file. Never use a real secret for this canary test.

Existing limitation: test:auth-password-change reports a desktop/mobile layout assertion in
unchanged Layout.tsx. No installed APK, local database, pairing, tenant suspension, or fiscal
configuration is changed by this release. Browser login, low-privilege roles, support Realtime,
Edge integrations and owner tenant provisioning still require live validation after review.
