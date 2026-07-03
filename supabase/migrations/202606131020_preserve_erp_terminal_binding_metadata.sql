BEGIN;

CREATE OR REPLACE FUNCTION public.preserve_erp_terminal_binding_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_device_id TEXT := NULLIF(BTRIM(NEW.device_id), '');
    v_config JSONB := COALESCE(NEW.config, '{}'::jsonb);
    v_metadata JSONB := COALESCE(v_config->'metadata', '{}'::jsonb);
    v_pairing JSONB := COALESCE(v_config->'pairing', '{}'::jsonb);
BEGIN
    IF v_device_id IS NULL
       OR UPPER(v_device_id) LIKE 'DRAFT-%'
       OR UPPER(v_device_id) LIKE 'ARCHIVED-%' THEN
        RETURN NEW;
    END IF;

    v_metadata := v_metadata || jsonb_build_object(
        'authorizedDeviceId', v_device_id,
        'authorized_device_id', v_device_id,
        'currentDeviceId', v_device_id,
        'current_device_id', v_device_id,
        'canonicalDeviceId', v_device_id,
        'canonical_device_id', v_device_id,
        'binding_status', 'BOUND',
        'canonical_erp_terminal_id', NEW.id::text
    );

    v_pairing := v_pairing || jsonb_build_object('status', 'NOT_REQUIRED');

    NEW.config := jsonb_set(
        jsonb_set(v_config, '{metadata}', v_metadata, true),
        '{pairing}',
        v_pairing,
        true
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS preserve_erp_terminal_binding_metadata_trg ON public.erp_terminals;

CREATE TRIGGER preserve_erp_terminal_binding_metadata_trg
BEFORE INSERT OR UPDATE OF device_id, config
ON public.erp_terminals
FOR EACH ROW
EXECUTE FUNCTION public.preserve_erp_terminal_binding_metadata();

UPDATE public.erp_terminals
SET config = config
WHERE NULLIF(BTRIM(device_id), '') IS NOT NULL
  AND UPPER(BTRIM(device_id)) NOT LIKE 'DRAFT-%'
  AND UPPER(BTRIM(device_id)) NOT LIKE 'ARCHIVED-%';

COMMIT;
