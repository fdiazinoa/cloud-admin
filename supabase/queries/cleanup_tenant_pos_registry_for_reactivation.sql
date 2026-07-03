-- Limpieza POS registry para reactivar cajas 1 a 1 (Supabase SQL Editor)
-- Tenant: Supermercado la esperanza

-- 1) Estado actual
SELECT * FROM landlord.count_tenant_pos_license_seats('b239bf16-6b79-4fd4-8a78-da1881b09261'::uuid);

SELECT
    terminal_id,
    MAX(terminal_name) AS caja,
    COUNT(*) AS filas_registry,
    COUNT(DISTINCT device_id) AS equipos,
    COUNT(*) FILTER (WHERE status = 'ONLINE') AS online
FROM landlord.tenant_server_registry
WHERE tenant_id = 'b239bf16-6b79-4fd4-8a78-da1881b09261'::uuid
GROUP BY terminal_id
ORDER BY MIN(created_at);

-- 2) Apagar todo el registry historico del tenant (conserva filas OFFLINE)
-- Para borrar todo y empezar de cero, usa supabase/queries/purge_tenant_pos_registry.sql
-- o: npm run cleanup:tenant-pos-registry -- --purge --include-audit
UPDATE landlord.tenant_server_registry AS registry
SET
    status = 'OFFLINE',
    is_revoked = TRUE,
    auth_status = 'OLD_DEVICE_REVOKED',
    authorized_device_id = NULL,
    current_device_id = NULL,
    requires_pos_reauth = FALSE,
    last_auth_error = NULL,
    is_primary = FALSE,
    updated_at = timezone('utc', now())
WHERE registry.tenant_id = 'b239bf16-6b79-4fd4-8a78-da1881b09261'::uuid;

-- 3) Quitar bloqueo POS si quedo aplicado
UPDATE landlord.tenants AS t
SET
    lifecycle_status = CASE
        WHEN t.lifecycle_status = 'BLOCKED' THEN 'CLOUD_STAGING'
        ELSE t.lifecycle_status
    END,
    provisioning_status = CASE
        WHEN t.provisioning_status = 'BLOCKED' THEN 'CLOUD_STAGING_REQUIRED'
        ELSE t.provisioning_status
    END
WHERE t.id = 'b239bf16-6b79-4fd4-8a78-da1881b09261'::uuid;

-- 4) Recalcular licencias
SELECT landlord.enforce_tenant_pos_license_limits('b239bf16-6b79-4fd4-8a78-da1881b09261'::uuid);

-- 5) Verificar cupo libre (esperado used_seats = 0, max_seats = 3)
SELECT * FROM landlord.count_tenant_pos_license_seats('b239bf16-6b79-4fd4-8a78-da1881b09261'::uuid);

SELECT
    terminal_id,
    terminal_name,
    device_id,
    status,
    auth_status,
    is_revoked
FROM landlord.tenant_server_registry
WHERE tenant_id = 'b239bf16-6b79-4fd4-8a78-da1881b09261'::uuid
ORDER BY terminal_id, created_at;
