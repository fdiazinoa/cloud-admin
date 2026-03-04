# Supabase Security Rollout

This folder separates the remediation into phases so Cloud Admin can move
forward without breaking the current POS and ERP clients.

## Phase 1

Apply `20260304_phase1_cloud_admin.sql` first.

What it does:

- Enables RLS on `landlord.subscriptions`.
- Adds `public.get_tenant_status()` for single-tenant license checks.
- Adds `public.resolve_tenant_license()` so clients can resolve a tenant by
  `tenant_id`, `slug`, or `email` without direct table reads.

Why phase 1 stops here:

- `../CLIC-POS/utils/licenseGuard.ts` still calls `/rest/v1/tenants` on the
  `landlord` schema with the anon key.
- `../CLIC-ERP/src/services/logisticsService.ts` and
  `../CLIC-ERP/src/services/configService.ts` still read and write `public.*`
  tables directly with the browser client.
- Enabling RLS on those tables now would break those flows until the clients
  move to RPCs or authenticated, claim-based policies.

## Phase 2

Apply `20260304_phase2_landlord_tenants_lockdown.sql` only after POS has cut over to the new RPCs.

What it does:

- Enables RLS on `landlord.tenants`.
- Removes the public read policies.
- Replaces them with a deny-all public policy.

## Phase 3

Apply `20260304_phase3_public_tables_lockdown.sql` after ERP/POS are confirmed to
work without anonymous direct reads/writes on `public.*` tables.

What it does:

- Enables RLS on the remaining tables flagged by Security Advisor in `public`.
- Creates a deny-all policy for `PUBLIC` on each table.
- Preserves service-role access for trusted server-side/admin flows.

## Verification

Run:

```bash
npm run check:supabase-keys
npm run verify:supabase-security
```

`verify:supabase-security` now fails fast if `VITE_SUPABASE_ANON_KEY` is neither
a legacy `anon` JWT nor an `sb_publishable_*` key.

If `resolve_tenant_license()` still returns `400`, inspect the live function body in the
Supabase SQL editor:

```sql
select pg_get_functiondef('public.resolve_tenant_license(uuid,text,text)'::regprocedure);
```

If that body does not show `t.slug::TEXT`, the old RPC is still active in that project.

Expected state after phase 1:

- `landlord.subscriptions` should stop being publicly queryable.
- `landlord.tenants` will still be public until phase 2 is applied.
- The `public.*` advisor findings remain open until ERP and sync flows are
  updated with real tenant- or mall-scoped policies.

Expected state after phase 3:

- Security Advisor should stop reporting `RLS Disabled in Public` for the
  listed `public.*` tables.
- Anonymous API reads on those tables should no longer return real rows.
