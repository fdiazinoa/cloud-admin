/** Execute the real migration in an ephemeral local PostgreSQL cluster.
 * No Docker, remote connection, production credentials, or network listener.
 * Helpers are isolated contract stubs; this does not test their deployed SQL.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const candidates = [process.env.PG_BIN, '/opt/homebrew/opt/postgresql@17/bin', '/usr/lib/postgresql/17/bin'].filter(Boolean);
try { candidates.push(execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim()); } catch { /* explicit paths still work */ }
const bin = candidates.find(candidate => existsSync(join(candidate, 'initdb')) && existsSync(join(candidate, 'pg_ctl')) && existsSync(join(candidate, 'psql')));
assert.ok(bin, 'PostgreSQL binaries required: set PG_BIN to a local PostgreSQL bin directory');
const scratch = mkdtempSync('/tmp/clic-suspension-sql-');
const data = join(scratch, 'data');
const migration = readFileSync(resolve('supabase/migrations/20261103184229_tenant_suspension_license_state.sql'), 'utf8');
const baselineFile = readFileSync(resolve('supabase/migrations/202605301530_pos_erp_terminal_catalog_licensing.sql'), 'utf8');
const marker = 'CREATE OR REPLACE FUNCTION public.resolve_tenant_license(';
const baselineStart = baselineFile.indexOf(marker);
assert.ok(baselineStart >= 0);
const baseline = baselineFile.slice(baselineStart, baselineFile.indexOf('$$;', baselineStart) + 3);
let started = false;
const run = (command, args, options = {}) => execFileSync(join(bin, command), args, { encoding: 'utf8', ...options });
try {
    run('initdb', ['-D', data, '-A', 'trust', '-U', 'fixture_admin', '--no-locale', '--encoding=UTF8']);
    run('pg_ctl', ['-D', data, '-l', join(scratch, 'postgres.log'), '-o', `-F -k ${scratch} -h ''`, '-w', 'start']);
    started = true;
    const sql = `
CREATE SCHEMA landlord;
CREATE TYPE landlord.tenant_status AS ENUM ('ACTIVE','TRIAL','SUSPENDED');
CREATE TABLE landlord.tenants (
 id uuid PRIMARY KEY, status landlord.tenant_status NOT NULL,
 slug text UNIQUE, email text, max_pos_terminals integer, max_erp_users integer,
 contracted_product text, lifecycle_status text, provisioning_status text
);
CREATE TABLE public.terminals (id text PRIMARY KEY, tenant_id uuid, is_active boolean);
CREATE TABLE landlord.tenant_server_registry (
 tenant_id uuid, device_id text, is_revoked boolean, auth_status text,
 requires_pos_reauth boolean, metadata jsonb
);
CREATE TABLE landlord.enforcement_calls (tenant_id uuid);
CREATE FUNCTION landlord.tenant_uses_terminal_slot_licensing(uuid) RETURNS boolean LANGUAGE sql
 AS 'SELECT contracted_product = ''POS_ONLY'' FROM landlord.tenants WHERE id=$1';
CREATE FUNCTION landlord.tenant_uses_erp_terminal_catalog_licensing(uuid) RETURNS boolean LANGUAGE sql
 AS 'SELECT contracted_product = ''POS_ERP'' FROM landlord.tenants WHERE id=$1';
CREATE FUNCTION landlord.count_tenant_pos_license_seats(uuid)
 RETURNS TABLE (used_seats integer,max_seats integer,license_unit text) LANGUAGE sql AS
 'SELECT (SELECT count(*)::integer FROM public.terminals WHERE tenant_id=$1), t.max_pos_terminals, ''fixture''::text FROM landlord.tenants t WHERE t.id=$1';
-- Contract stub records invocation, deliberately does not implement production
-- license-limit enforcement. Suspension SQL itself must not mutate device state.
CREATE FUNCTION landlord.enforce_tenant_pos_license_limits(uuid) RETURNS jsonb LANGUAGE plpgsql AS
 'BEGIN INSERT INTO landlord.enforcement_calls VALUES($1); RETURN ''{}''::jsonb; END';
CREATE ROLE anon;
CREATE ROLE authenticated;
INSERT INTO landlord.tenants VALUES
 ('10000000-0000-0000-0000-000000000001','ACTIVE','alpha','alpha@example.invalid',8,12,'POS_ERP','READY','READY'),
 ('20000000-0000-0000-0000-000000000002','TRIAL','beta','beta@example.invalid',3,5,'POS_ONLY','READY','READY');
INSERT INTO public.terminals VALUES
 ('a-enabled','10000000-0000-0000-0000-000000000001',true),
 ('a-manual-block','10000000-0000-0000-0000-000000000001',false),
 ('b-enabled','20000000-0000-0000-0000-000000000002',true);
INSERT INTO landlord.tenant_server_registry VALUES
 ('10000000-0000-0000-0000-000000000001','device-a',false,'AUTHORIZED',false,'{"pairing":"keep-a"}'),
 ('10000000-0000-0000-0000-000000000001','device-a-revoked',true,'OLD_DEVICE_REVOKED',true,'{"pairing":"keep-revoked"}'),
 ('20000000-0000-0000-0000-000000000002','device-b',false,'AUTHORIZED',false,'{"pairing":"keep-b"}');
CREATE FUNCTION public.assert_fixture(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS
 'BEGIN IF ok IS DISTINCT FROM TRUE THEN RAISE EXCEPTION ''FAIL: %'',label; END IF; END';
${baseline}
REVOKE ALL ON FUNCTION public.resolve_tenant_license(uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_tenant_license(uuid,text,text,text) TO anon,authenticated;
CREATE TEMP TABLE signature_before AS SELECT oid,proowner,proacl,proargnames,proallargtypes,proargmodes,
 prorettype,pronargdefaults,prosecdef,proconfig FROM pg_proc
 WHERE oid='public.resolve_tenant_license(uuid,text,text,text)'::regprocedure;
CREATE TEMP TABLE registry_before AS SELECT * FROM landlord.tenant_server_registry;
CREATE TEMP TABLE terminals_before AS SELECT * FROM public.terminals;
CREATE TEMP TABLE tenants_before AS SELECT * FROM landlord.tenants;
-- Demonstrate baseline defect before applying the actual candidate migration.
UPDATE landlord.tenants SET status='SUSPENDED' WHERE slug='alpha';
SELECT assert_fixture((SELECT status='SUSPENDED' AND device_license_allowed=true AND license_block_reason IS NULL
 FROM public.resolve_tenant_license(p_slug=>'alpha')), 'baseline reproduces suspended license allowed');
${migration}
-- Applying CREATE OR REPLACE twice must preserve function identity and permissions.
${migration}
SELECT assert_fixture((SELECT to_jsonb(p)=to_jsonb(b) FROM
 (SELECT oid,proowner,proacl,proargnames,proallargtypes,proargmodes,prorettype,pronargdefaults,prosecdef,proconfig
 FROM pg_proc WHERE oid='public.resolve_tenant_license(uuid,text,text,text)'::regprocedure) p CROSS JOIN signature_before b),
 'signature, OID, owner, grants, defaults, search_path, security-definer preserved');
SELECT assert_fixture((SELECT status='SUSPENDED' AND NOT device_license_allowed AND license_block_reason='TENANT_SUSPENDED'
 AND max_pos_terminals=8 AND max_erp_users=12 AND active_pos_terminals=2
 FROM public.resolve_tenant_license(p_tenant_id=>'10000000-0000-0000-0000-000000000001')), 'suspended UUID with unchanged quota and seats');
SELECT assert_fixture((SELECT NOT device_license_allowed AND license_block_reason='TENANT_SUSPENDED'
 FROM public.resolve_tenant_license(p_slug=>'alpha')), 'suspended slug');
SELECT assert_fixture((SELECT NOT device_license_allowed AND license_block_reason='TENANT_SUSPENDED'
 FROM public.resolve_tenant_license(p_email=>'ALPHA@EXAMPLE.INVALID')), 'suspended case-insensitive email');
SELECT assert_fixture((SELECT NOT device_license_allowed AND license_block_reason='TENANT_SUSPENDED'
 FROM public.resolve_tenant_license(p_slug=>'alpha',p_device_id=>'device-a')), 'suspended existing device');
SELECT assert_fixture((SELECT NOT device_license_allowed AND license_block_reason='TENANT_SUSPENDED'
 FROM public.resolve_tenant_license(p_slug=>'alpha',p_device_id=>'device-a-revoked')), 'suspended revoked device');
SELECT assert_fixture((SELECT NOT device_license_allowed AND license_block_reason='TENANT_SUSPENDED'
 FROM public.resolve_tenant_license(p_slug=>'alpha',p_device_id=>'not-registered')), 'suspended unknown device');
SELECT assert_fixture((SELECT id='10000000-0000-0000-0000-000000000001'::uuid AND NOT device_license_allowed
 FROM public.resolve_tenant_license(p_tenant_id=>'10000000-0000-0000-0000-000000000001',p_slug=>'beta',p_email=>'beta@example.invalid',p_device_id=>'device-b')),
 'UUID selector precedence ignores foreign slug/email/device');
SELECT assert_fixture((SELECT id='10000000-0000-0000-0000-000000000001'::uuid AND NOT device_license_allowed
 FROM public.resolve_tenant_license(p_slug=>'alpha',p_email=>'beta@example.invalid')), 'slug precedence ignores foreign email');
SELECT assert_fixture((SELECT status='TRIAL' AND device_license_allowed AND license_block_reason IS NULL
 AND max_pos_terminals=3 AND active_pos_terminals=1 FROM public.resolve_tenant_license(p_slug=>'beta',p_device_id=>'device-b')),
 'trial second tenant remains allowed');
SELECT assert_fixture((SELECT count(*)=0 FROM landlord.enforcement_calls WHERE tenant_id='10000000-0000-0000-0000-000000000001'),
 'POS_ERP does not call registry enforcement');
SELECT assert_fixture((SELECT count(*)>0 FROM landlord.enforcement_calls WHERE tenant_id='20000000-0000-0000-0000-000000000002'),
 'POS_ONLY existing enforcement contract retained');
SELECT assert_fixture((SELECT count(*)=0 FROM public.resolve_tenant_license(p_device_id=>'device-a')), 'device alone does not select tenant (existing contract)');
SELECT assert_fixture((SELECT count(*)=0 FROM public.resolve_tenant_license(p_tenant_id=>'99999999-0000-0000-0000-000000000009',p_slug=>'alpha')), 'unknown UUID never falls back');
SELECT assert_fixture((SELECT count(*)=0 FROM public.resolve_tenant_license(p_slug=>'missing',p_email=>'alpha@example.invalid')), 'unknown slug never falls back');
SELECT assert_fixture((SELECT count(*)=0 FROM public.resolve_tenant_license()), 'empty selector returns no row');
UPDATE landlord.tenants SET status='SUSPENDED' WHERE slug='beta';
SELECT assert_fixture((SELECT NOT device_license_allowed AND license_block_reason='TENANT_SUSPENDED'
 FROM public.resolve_tenant_license(p_slug=>'beta')), 'POS_ONLY suspension denied');
UPDATE landlord.tenants SET status='ACTIVE' WHERE slug='alpha';
UPDATE landlord.tenants SET status='TRIAL' WHERE slug='beta';
SELECT assert_fixture((SELECT status='ACTIVE' AND device_license_allowed AND license_block_reason IS NULL
 FROM public.resolve_tenant_license(p_slug=>'alpha',p_device_id=>'device-a')), 'reactivation ACTIVE clears tenant overlay');
SELECT assert_fixture((SELECT status='TRIAL' AND device_license_allowed AND license_block_reason IS NULL
 FROM public.resolve_tenant_license(p_slug=>'beta',p_device_id=>'device-b')), 'reactivation TRIAL clears tenant overlay');
SELECT assert_fixture(NOT EXISTS ((SELECT * FROM landlord.tenants EXCEPT SELECT * FROM tenants_before)
 UNION ALL (SELECT * FROM tenants_before EXCEPT SELECT * FROM landlord.tenants)), 'tenant identity, quotas, lifecycle and provisioning preserved');
SELECT assert_fixture(NOT EXISTS ((SELECT * FROM landlord.tenant_server_registry EXCEPT SELECT * FROM registry_before)
 UNION ALL (SELECT * FROM registry_before EXCEPT SELECT * FROM landlord.tenant_server_registry)), 'registry associations, revoked/manual flags and metadata preserved under helper stub');
SELECT assert_fixture(NOT EXISTS ((SELECT * FROM public.terminals EXCEPT SELECT * FROM terminals_before)
 UNION ALL (SELECT * FROM terminals_before EXCEPT SELECT * FROM public.terminals)), 'terminal manual is_active flags preserved');
SELECT 'tenant suspension SQL: 23 assertions PASS (ephemeral PostgreSQL, helpers stubbed)' AS result;
`;
    const output = run('psql', ['-X', '-h', scratch, '-p', '5432', '-U', 'fixture_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-qAt'], { input: sql });
    assert.match(output, /23 assertions PASS/);
    console.log(output.trim());
} finally {
    if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    rmSync(scratch, { recursive: true, force: true });
}
