BEGIN;

-- Keep the existing POS immutability rules. Only the exact tenant IDs selected
-- by landlord.delete_tenant may be removed in its transaction-local context.
CREATE OR REPLACE FUNCTION private.tenant_delete_allows(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT p_tenant_id IS NOT NULL
       AND p_tenant_id::TEXT = ANY(COALESCE(
           string_to_array(NULLIF(current_setting(
               'landlord.tenant_delete_erp_tenant_ids', TRUE
           ), ''), ','), ARRAY[]::TEXT[]
       ));
$$;

REVOKE ALL ON FUNCTION private.tenant_delete_allows(UUID) FROM PUBLIC;

-- Private POS records do not reference erp_tenants with cascading FKs.
-- Remove children first, while the validated tenant context is still active.
CREATE OR REPLACE FUNCTION private.purge_deleted_pos_tenants(p_tenant_ids UUID[])
RETURNS VOID
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF p_tenant_ids IS NULL OR array_length(p_tenant_ids, 1) IS NULL THEN
        RETURN;
    END IF;

    IF EXISTS (
        SELECT 1 FROM unnest(p_tenant_ids) AS id
        WHERE NOT private.tenant_delete_allows(id)
    ) THEN
        RAISE EXCEPTION 'POS tenant purge outside confirmed tenant deletion';
    END IF;

    DELETE FROM private.pos_received_close_pending_work w
    WHERE w.commit_id IN (
        SELECT id FROM private.pos_recovered_close_commits
        WHERE tenant_id = ANY(p_tenant_ids)
    ) OR w.receipt_id IN (
        SELECT receipt_id FROM private.pos_original_records
        WHERE tenant_id = ANY(p_tenant_ids)
    );
    DELETE FROM private.pos_original_commercial_event_owners
    WHERE tenant_id = ANY(p_tenant_ids);
    DELETE FROM private.pos_original_commercial_links l
    WHERE l.receipt_id IN (
        SELECT receipt_id FROM private.pos_original_records
        WHERE tenant_id = ANY(p_tenant_ids)
    );
    DELETE FROM private.pos_original_snapshot_items i
    WHERE i.snapshot_id IN (
        SELECT id FROM private.pos_original_snapshots
        WHERE tenant_id = ANY(p_tenant_ids)
    ) OR i.receipt_id IN (
        SELECT receipt_id FROM private.pos_original_records
        WHERE tenant_id = ANY(p_tenant_ids)
    );
    DELETE FROM private.pos_recovered_close_requests r
    WHERE r.membership_id IN (
        SELECT id FROM private.pos_recovered_close_memberships
        WHERE tenant_id = ANY(p_tenant_ids)
    ) OR r.snapshot_id IN (
        SELECT id FROM private.pos_original_snapshots
        WHERE tenant_id = ANY(p_tenant_ids)
    );
    DELETE FROM private.pos_recovered_close_evidence e
    WHERE e.membership_id IN (
        SELECT id FROM private.pos_recovered_close_memberships
        WHERE tenant_id = ANY(p_tenant_ids)
    );
    DELETE FROM private.pos_recovered_close_assignments
    WHERE tenant_id = ANY(p_tenant_ids);
    DELETE FROM private.pos_recovered_close_operation_owners
    WHERE tenant_id = ANY(p_tenant_ids);
    DELETE FROM private.pos_original_recovery_bootstrap_events
    WHERE tenant_id = ANY(p_tenant_ids);

    DELETE FROM private.pos_recovered_close_commits WHERE tenant_id = ANY(p_tenant_ids);
    DELETE FROM private.pos_recovered_close_memberships WHERE tenant_id = ANY(p_tenant_ids);
    DELETE FROM private.pos_original_snapshots WHERE tenant_id = ANY(p_tenant_ids);
    DELETE FROM private.pos_original_records WHERE tenant_id = ANY(p_tenant_ids);
    DELETE FROM private.pos_original_recovery_bootstrap_boundaries WHERE tenant_id = ANY(p_tenant_ids);
    DELETE FROM private.pos_original_scopes WHERE tenant_id = ANY(p_tenant_ids);
    DELETE FROM private.pos_close_cancellations WHERE tenant_id = ANY(p_tenant_ids);
    DELETE FROM private.pos_recovered_close_authorities WHERE tenant_id = ANY(p_tenant_ids);
    DELETE FROM private.pos_recovery_terminal_revisions WHERE tenant_id = ANY(p_tenant_ids);
    DELETE FROM private.pos_report_event_clock WHERE tenant_id = ANY(p_tenant_ids);
    DELETE FROM private.pos_retained_epoch_heads WHERE tenant_id = ANY(p_tenant_ids);
    DELETE FROM private.pos_retained_epoch_requests WHERE tenant_id = ANY(p_tenant_ids);
    DELETE FROM private.pos_z_sequence_receipts WHERE tenant_id = ANY(p_tenant_ids);
    DELETE FROM private.pos_z_sequence_authorities WHERE tenant_id = ANY(p_tenant_ids);
END;
$$;

REVOKE ALL ON FUNCTION private.purge_deleted_pos_tenants(UUID[]) FROM PUBLIC;

-- These long-lived POS guards are defined by the POS service outside this
-- repository. Patch only their DELETE branches, asserting the exact anchors
-- so schema drift fails the migration instead of weakening a different guard.
DO $$
DECLARE
    v_definition TEXT;
    v_anchor TEXT;
    v_replacement TEXT;
    v_function REGPROCEDURE;
BEGIN
    FOR v_function, v_anchor, v_replacement IN
        SELECT 'private.pos_z_inbox_guard()'::REGPROCEDURE,
               $anchor$if tg_op='DELETE' then
  if old.event_type='CASH_CLOSE_POSTED'$anchor$,
               $replacement$if tg_op='DELETE' then
  if private.tenant_delete_allows(old.tenant_id) then return old; end if;
  if old.event_type='CASH_CLOSE_POSTED'$replacement$
        UNION ALL
        SELECT 'private.pos_z_monotonic_guard()'::REGPROCEDURE,
               $anchor$if tg_op='DELETE' then raise exception 'Z_SEQUENCE_AUTHORITY_IMMUTABLE';end if;$anchor$,
               $replacement$if tg_op='DELETE' then if private.tenant_delete_allows(old.tenant_id) then return old; end if; raise exception 'Z_SEQUENCE_AUTHORITY_IMMUTABLE';end if;$replacement$
        UNION ALL
        SELECT 'private.pos_recovered_close_write_guard()'::REGPROCEDURE,
               $anchor$  tenant:=coalesce(row_json->>'tenant_id',row_json->'payload'->>'tenant_id')::uuid;$anchor$,
               $replacement$  tenant:=coalesce(row_json->>'tenant_id',row_json->'payload'->>'tenant_id')::uuid;
  if tg_op='DELETE' and private.tenant_delete_allows(tenant) then continue; end if;$replacement$
    LOOP
        v_definition := pg_get_functiondef(v_function);
        IF length(v_definition) - length(replace(v_definition, v_anchor, ''))
           <> length(v_anchor) THEN
            RAISE EXCEPTION 'Unexpected definition for %', v_function;
        END IF;
        EXECUTE replace(v_definition, v_anchor, v_replacement);
    END LOOP;

    v_definition := pg_get_functiondef('landlord.delete_tenant(uuid,text)'::REGPROCEDURE);
    v_anchor := E'        DELETE FROM public.erp_tenants\n        WHERE id = ANY(v_erp_tenant_ids);';
    IF length(v_definition) - length(replace(v_definition, v_anchor, ''))
       <> length(v_anchor) THEN
        RAISE EXCEPTION 'Unexpected landlord.delete_tenant definition';
    END IF;
    EXECUTE replace(
        v_definition, v_anchor,
        E'        PERFORM private.purge_deleted_pos_tenants(v_erp_tenant_ids);\n\n' || v_anchor
    );
END;
$$;

COMMIT;
