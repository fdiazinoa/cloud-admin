# Aplicar autorización de terminal en Supabase (gamma / prod)

Cloud-Admin y el POS esperan columnas como `authorized_device_id` en `landlord.tenant_server_registry`. Si gamma muestra:

`column tenant_server_registry.authorized_device_id does not exist`

falta aplicar la migración **`202605271015_terminal_device_authorization.sql`**.

## Prerrequisito recomendado

Si `current_device_id` o `requires_pos_reauth` tampoco existen, aplica antes (o en el mismo mantenimiento):

- `supabase/migrations/202605241430_terminal_takeover_audit.sql`

## Opción A — Supabase CLI (recomendado)

Desde la raíz de este repo, con el proyecto gamma enlazado:

```bash
# 1) Login (si hace falta)
supabase login

# 2) Enlazar gamma (solo la primera vez; usa el project ref del dashboard)
supabase link --project-ref <TU_PROJECT_REF>

# 3) Ver migraciones pendientes
supabase migration list

# 4) Aplicar todas las pendientes al remoto
supabase db push
```

Para aplicar **solo** el archivo de autorización de dispositivos (si el resto ya está al día), puedes ejecutar su SQL en el SQL Editor (opción B) en lugar de forzar un push parcial.

**Project ref de gamma:** Dashboard → Project Settings → General → Reference ID (también suele estar en `supabase/.temp/project-ref` tras `supabase link` local).

## Opción B — SQL Editor en el Dashboard

1. Abre [Supabase Dashboard](https://supabase.com/dashboard) → tu proyecto gamma → **SQL Editor** → **New query**.
2. Pega el contenido completo de:

   `supabase/migrations/202605271015_terminal_device_authorization.sql`

3. Ejecuta (**Run**). Debe terminar sin error.

El archivo es idempotente (`IF NOT EXISTS` / `DROP CONSTRAINT IF EXISTS`).

## Verificar que quedó aplicado

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'landlord'
  AND table_name = 'tenant_server_registry'
  AND column_name IN (
    'authorized_device_id',
    'auth_status',
    'current_device_id',
    'requires_pos_reauth'
  )
ORDER BY column_name;
```

Debes ver al menos `authorized_device_id` y `auth_status`.

## Backfill para terminales ya online (opcional)

Después de la migración, alinea registros existentes con el `device_id` del heartbeat:

```sql
UPDATE landlord.tenant_server_registry
SET
  authorized_device_id = device_id,
  current_device_id = COALESCE(NULLIF(TRIM(current_device_id), ''), device_id),
  auth_status = 'AUTHORIZED',
  last_auth_error = NULL,
  requires_pos_reauth = FALSE,
  updated_at = timezone('utc', now())
WHERE authorized_device_id IS NULL
  AND device_id IS NOT NULL
  AND TRIM(device_id) <> '';
```

## Edge Functions (mismo proyecto)

Tras el schema, despliega (CLI o workflow manual):

```bash
supabase functions deploy request-terminal-device-authorization \
  --project-ref <TU_PROJECT_REF> \
  --no-verify-jwt

supabase functions deploy request-pos-erp-readiness \
  --project-ref <TU_PROJECT_REF> \
  --no-verify-jwt
```

## Cloud-Admin (Vercel gamma)

1. Merge/despliega el PR con el fix de **Persistir device autorizado** (actualización vía `supabaseAdmin` + fallback de columnas).
2. En **Tenants → terminales → Persistir device autorizado** → OK.
3. En el POS: **Reintentar conexión**.

Si el tenant quedó con `lifecycle_status = 'BLOCKED'`, en la UI usa **Quitar bloqueo POS** (POS_ONLY) o corrige manualmente:

```sql
UPDATE landlord.tenants
SET lifecycle_status = 'CLOUD_READY',
    provisioning_status = 'CLOUD_STAGING_REQUIRED'
WHERE id = '<TENANT_UUID>'
  AND contracted_product = 'POS_ONLY'
  AND lifecycle_status = 'BLOCKED';
```

## Orden sugerido de migraciones relacionadas (referencia)

Si gamma está muy atrás, revisa también en `supabase/migrations/`:

| Archivo | Qué aporta |
|---------|------------|
| `202605241430_terminal_takeover_audit.sql` | `current_device_id`, `requires_pos_reauth`, auditoría takeover |
| `20260524234158_pos_erp_readiness_audit.sql` | `erp_readiness` en registry |
| `202605271015_terminal_device_authorization.sql` | **`authorized_device_id`**, `auth_status`, `terminal_device_audit` |
| `20260525101500_tenant_pos_erp_semantics.sql` | Semántica tenant (`lifecycle_status`, `backup_enabled`, etc.) |

`supabase db push` aplica las pendientes en orden de timestamp del nombre del archivo.
