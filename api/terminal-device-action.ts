import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";
import { createClient } from "@supabase/supabase-js";

type ApiRequest = IncomingMessage & {
    body?: unknown;
    headers: IncomingHttpHeaders;
    method?: string;
};

type DeviceActionPayload = {
    tenant_id?: unknown;
    terminal_id?: unknown;
    terminal_name?: unknown;
    device_id?: unknown;
    action?: unknown;
    reason?: unknown;
};

type RegistryRecord = {
    id: string;
    terminal_id?: string | null;
    terminal_name?: string | null;
    device_id?: string | null;
    current_device_id?: string | null;
    authorized_device_id?: string | null;
    previous_device_id?: string | null;
    last_rejected_device_id?: string | null;
};

type PublicTerminalRecord = {
    id: string;
    code?: string | null;
};

type ErpTerminalRecord = {
    id: string;
    device_id?: string | null;
    config?: Record<string, unknown> | null;
};

function setCors(response: ServerResponse) {
    response.setHeader("Access-Control-Allow-Origin", process.env.CLOUD_ADMIN_TAKEOVER_CORS_ORIGIN || "*");
    response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, X-Actor-User-Id, X-Actor-Email, X-Actor-Source",
    );
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown) {
    setCors(response);
    response.statusCode = statusCode;
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify(body));
}

function getEnv(...names: string[]) {
    for (const name of names) {
        const value = process.env[name];
        if (value) return value;
    }

    throw new Error(`Missing required environment variable: ${names.join(" or ")}`);
}

function getHeader(headers: IncomingHttpHeaders, name: string) {
    const value = headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
}

function stringValue(value: unknown) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requiresDeviceId(action: unknown) {
    return action === "TAKEOVER"
        || action === "ROTATE_TOKEN"
        || action === "SYNC_AUTHORIZED_DEVICE"
        || action === "GENERATE_PAIRING_CODE";
}

function isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function getRecordChild(record: Record<string, unknown>, key: string): Record<string, unknown> {
    return asRecord(record[key]);
}

async function readBody(request: ApiRequest) {
    if (request.body) {
        return typeof request.body === "string" ? JSON.parse(request.body) : request.body;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of request) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const rawBody = Buffer.concat(chunks).toString("utf8");
    return rawBody ? JSON.parse(rawBody) : {};
}

async function loadCanonicalErpTerminal(
    supabase: ReturnType<typeof createClient>,
    terminalId: string,
) {
    const { data, error } = await supabase
        .schema("public")
        .from("erp_terminals")
        .select("id,device_id,config")
        .eq("id", terminalId)
        .maybeSingle();
    if (error) throw error;
    if (data) return data as ErpTerminalRecord;

    const { data: metadataMatch, error: metadataError } = await supabase
        .schema("public")
        .from("erp_terminals")
        .select("id,device_id,config")
        .or(`config->metadata->>terminal_id.eq.${terminalId},config->metadata->>terminalId.eq.${terminalId}`)
        .limit(1)
        .maybeSingle();
    if (metadataError) throw metadataError;
    return metadataMatch as ErpTerminalRecord | null;
}

function buildClearedErpTerminalConfig(terminal: ErpTerminalRecord, clearedAt: string) {
    const config = asRecord(terminal.config);
    const metadata = getRecordChild(config, "metadata");

    return {
        ...config,
        runtime: {},
        security: {},
        pairing: {
            ...getRecordChild(config, "pairing"),
            status: "RETRY_READY",
        },
        metadata: {
            ...metadata,
            device_id: null,
            deviceId: null,
            currentDeviceId: null,
            current_device_id: null,
            authorizedDeviceId: null,
            authorized_device_id: null,
            canonicalDeviceId: null,
            canonical_device_id: null,
            deviceBindingToken: null,
            deviceTokenFingerprint: null,
            deviceTokenIssuedAt: null,
            syncAuthToken: null,
            tokenExpiresAt: null,
            binding_status: "UNBOUND",
            device_cleared_at: clearedAt,
            device_cleared_by: "cloud-admin",
        },
        deviceBindingToken: null,
        deviceTokenFingerprint: null,
    };
}

function isArchivedErpTerminal(terminal: ErpTerminalRecord) {
    const config = asRecord(terminal.config);
    const metadata = getRecordChild(config, "metadata");
    const name = stringValue(terminal.name)?.toUpperCase() || "";
    return name.startsWith("ARCHIVED-") || metadata.archived === true || config.active === false || config.is_active === false;
}

function erpTerminalMatchesClearTarget(
    terminal: ErpTerminalRecord,
    terminalId: string,
    terminalName?: string | null,
) {
    if (terminal.id === terminalId) return true;
    const normalizedName = stringValue(terminalName)?.toUpperCase();
    if (!normalizedName) return false;

    const config = asRecord(terminal.config);
    const metadata = getRecordChild(config, "metadata");
    return [
        terminal.name,
        metadata.terminal_name,
        metadata.terminalName,
        metadata.terminal_code,
        metadata.terminalCode,
        metadata.terminal_id,
        metadata.terminalId,
    ]
        .map((value) => stringValue(value)?.toUpperCase())
        .some((value) => value === normalizedName);
}

async function loadErpTerminalsForClear(
    supabase: ReturnType<typeof createClient>,
    terminalId: string,
    terminalName?: string | null,
) {
    const direct = await loadCanonicalErpTerminal(supabase, terminalId);
    const matches = new Map<string, ErpTerminalRecord>();
    if (direct?.id) matches.set(direct.id, direct);

    if (terminalName) {
        const { data, error } = await supabase
            .schema("public")
            .from("erp_terminals")
            .select("id,name,device_id,config")
            .eq("name", terminalName);
        if (error) throw error;
        for (const row of ((data as ErpTerminalRecord[] | null) || [])) {
            if (erpTerminalMatchesClearTarget(row, terminalId, terminalName)) {
                matches.set(row.id, row);
            }
        }
    }

    return Array.from(matches.values()).filter((terminal) => !isArchivedErpTerminal(terminal));
}

function buildArchivedDuplicateErpTerminalConfig(terminal: ErpTerminalRecord, canonicalTerminalId: string, archivedAt: string) {
    const config = asRecord(terminal.config);
    const metadata = getRecordChild(config, "metadata");
    return {
        ...buildClearedErpTerminalConfig(terminal, archivedAt),
        active: false,
        is_active: false,
        pairing: {
            ...getRecordChild(config, "pairing"),
            status: "ARCHIVED",
        },
        metadata: {
            ...metadata,
            archived: true,
            archived_at: archivedAt,
            archived_reason: "DUPLICATE_TERMINAL_CLEARED_BY_CLOUD_ADMIN",
            canonical_erp_terminal_id: canonicalTerminalId,
            terminal_id: null,
            terminalId: null,
            erp_terminal_id: null,
            erpTerminalId: null,
            binding_status: "ARCHIVED",
            device_id: null,
            deviceId: null,
            currentDeviceId: null,
            current_device_id: null,
            authorizedDeviceId: null,
            authorized_device_id: null,
            canonicalDeviceId: null,
            canonical_device_id: null,
            deviceBindingToken: null,
            deviceTokenFingerprint: null,
            deviceTokenIssuedAt: null,
            syncAuthToken: null,
            tokenExpiresAt: null,
        },
    };
}

async function clearErpTerminalDeviceBindings(
    supabase: ReturnType<typeof createClient>,
    terminalId: string,
    terminalName?: string | null,
) {
    const terminals = await loadErpTerminalsForClear(supabase, terminalId, terminalName);
    if (terminals.length === 0) return { cleared: false, erpTerminalIds: [], previousDeviceIds: [] };

    const clearedAt = new Date().toISOString();
    const erpTerminalIds: string[] = [];
    const previousDeviceIds: string[] = [];

    for (const [index, terminal] of terminals.entries()) {
        const isPrimary = index === 0 || terminal.id === terminalId;
        const { error } = await supabase
            .schema("public")
            .from("erp_terminals")
            .update(isPrimary ? {
                device_id: "",
                config: buildClearedErpTerminalConfig(terminal, clearedAt),
            } : {
                device_id: `ARCHIVED-${terminal.id.slice(0, 8)}`,
                name: `ARCHIVED-${terminal.name || terminal.id.slice(0, 8)}`,
                config: buildArchivedDuplicateErpTerminalConfig(terminal, terminals[0]?.id || terminalId, clearedAt),
            })
            .eq("id", terminal.id);
        if (error) throw error;
        erpTerminalIds.push(terminal.id);
        if (terminal.device_id) previousDeviceIds.push(terminal.device_id);
    }

    return {
        cleared: true,
        erpTerminalIds,
        previousDeviceIds,
    };
}

async function fallbackClearTerminalDevices(
    payload: DeviceActionPayload,
    headers: IncomingHttpHeaders,
    supabaseUrl: string,
    serviceRoleKey: string,
) {
    const tenantId = stringValue(payload.tenant_id);
    const requestedTerminalId = stringValue(payload.terminal_id);
    const terminalName = stringValue(payload.terminal_name);
    const reason = stringValue(payload.reason) || "LAB_DEVICE_BINDING_RESET";
    const performedBy = getHeader(headers, "x-actor-email")
        || getHeader(headers, "x-actor-user-id")
        || getHeader(headers, "x-actor-source")
        || "cloud-admin-api";

    if (!tenantId || !requestedTerminalId) {
        return {
            statusCode: 400,
            body: { error: "VALIDATION_ERROR", message: "Selecciona tenant, terminal y accion." },
        };
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
        db: { schema: "landlord" },
    });

    let terminalId = requestedTerminalId;
    let terminalQuery = supabase
        .schema("public")
        .from("terminals")
        .select("id,code")
        .eq("tenant_id", tenantId);

    terminalQuery = isUuid(requestedTerminalId)
        ? terminalQuery.eq("id", requestedTerminalId)
        : terminalQuery.eq("code", terminalName || requestedTerminalId);

    const { data: terminalData, error: terminalError } = await terminalQuery
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (terminalError) throw terminalError;

    const publicTerminal = (terminalData as PublicTerminalRecord | null) || null;
    if (publicTerminal?.id) terminalId = publicTerminal.id;
    const terminalDisplayCode = publicTerminal?.code || terminalName || requestedTerminalId;

    const { data: registryRows, error: registryRowsError } = await supabase
        .from("tenant_server_registry")
        .select("id,terminal_id,terminal_name,device_id,current_device_id,authorized_device_id,previous_device_id,last_rejected_device_id")
        .eq("tenant_id", tenantId)
        .order("last_seen_at", { ascending: false });
    if (registryRowsError) throw registryRowsError;

    const rows = ((Array.isArray(registryRows) ? registryRows : []) as RegistryRecord[]).filter((row) => {
        const rowTerminalId = row.terminal_id?.trim() || "";
        const rowTerminalName = row.terminal_name?.trim() || "";
        return rowTerminalId === terminalId
            || rowTerminalId === requestedTerminalId
            || Boolean(terminalDisplayCode && rowTerminalId.toUpperCase() === terminalDisplayCode.toUpperCase())
            || Boolean(terminalDisplayCode && rowTerminalName.toUpperCase() === terminalDisplayCode.toUpperCase());
    });

    if (!publicTerminal && rows.length === 0) {
        return {
            statusCode: 404,
            body: { error: "TERMINAL_NOT_FOUND", message: "Terminal no encontrada para este tenant." },
        };
    }

    const registryIds = rows.map((row) => row.id).filter(Boolean);
    const clearedDeviceIds = Array.from(new Set(
        rows
            .flatMap((row) => [
                row.device_id,
                row.current_device_id,
                row.authorized_device_id,
                row.previous_device_id,
                row.last_rejected_device_id,
            ])
            .filter((value): value is string => typeof value === "string" && value.trim().length > 0),
    ));

    let count = 0;
    if (registryIds.length > 0) {
        const { error: deleteError, count: deletedCount } = await supabase
            .from("tenant_server_registry")
            .delete({ count: "exact" })
            .eq("tenant_id", tenantId)
            .in("id", registryIds);
        if (deleteError) throw deleteError;
        count = deletedCount || 0;
    }

    const erpClearResult = await clearErpTerminalDeviceBindings(supabase, terminalId, terminalDisplayCode);
    const uniqueClearedDeviceIds = Array.from(new Set([
        ...clearedDeviceIds,
        ...erpClearResult.previousDeviceIds,
    ]));

    const { error: auditError } = await supabase
        .from("terminal_device_audit")
        .insert({
            tenant_id: tenantId,
            terminal_id: terminalId,
            terminal_name: terminalDisplayCode,
            old_device_id: uniqueClearedDeviceIds.join(", ") || null,
            new_device_id: null,
            action: "CLEAR_TERMINAL_DEVICES",
            performed_by: performedBy,
            reason,
            result: "SUCCESS",
            metadata: {
                fallback_source: "vercel-api",
                registry_ids: registryIds,
                cleared_registry_count: count,
                cleared_device_ids: uniqueClearedDeviceIds,
                erp_terminal_cleared: erpClearResult.cleared,
                erp_terminal_ids: erpClearResult.erpTerminalIds,
                first_activation_noop: registryIds.length === 0,
                public_terminal_preserved: Boolean(publicTerminal?.id),
            },
        });
    if (auditError) {
        console.warn("terminal-device-action fallback audit failed", auditError);
    }

    return {
        statusCode: 200,
        body: {
            status: "success",
            success: true,
            action: "terminal_devices_cleared",
            cleared_registry_count: count,
            cleared_device_ids: uniqueClearedDeviceIds,
            erp_terminal_cleared: erpClearResult.cleared,
            first_activation_noop: registryIds.length === 0,
            message: registryIds.length === 0
                ? "La terminal no tenia devices previos. Queda disponible para primera activacion."
                : "Devices de la terminal limpiados. La terminal conserva su configuracion y puede vincularse nuevamente.",
        },
    };
}

function isAuthorizedRequest(request: ApiRequest) {
    const authorization = getHeader(request.headers, "authorization") ?? "";
    const bearerToken = authorization.replace(/^Bearer\s+/i, "").trim();
    if (!bearerToken) return false;

    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY", "VITE_SUPABASE_SERVICE_ROLE_KEY");
    return bearerToken === serviceRoleKey;
}

export default async function handler(request: ApiRequest, response: ServerResponse) {
    if (request.method === "OPTIONS") {
        setCors(response);
        response.statusCode = 204;
        response.end();
        return;
    }

    if (request.method !== "POST") {
        sendJson(response, 405, { error: "METHOD_NOT_ALLOWED", message: "Metodo no permitido." });
        return;
    }

    if (!isAuthorizedRequest(request)) {
        sendJson(response, 401, { error: "UNAUTHORIZED", message: "No autorizado para ejecutar esta accion." });
        return;
    }

    try {
        const body = await readBody(request) as DeviceActionPayload;
        const supabaseUrl = getEnv("SUPABASE_URL", "VITE_SUPABASE_URL").replace(/\/$/, "");
        const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY", "VITE_SUPABASE_SERVICE_ROLE_KEY");

        if (requiresDeviceId(body.action) && !stringValue(body.device_id)) {
            console.warn("cloud_admin_device_id_missing", {
                action: body.action,
                tenant_id: stringValue(body.tenant_id),
                terminal_id: stringValue(body.terminal_id),
                terminal_name: stringValue(body.terminal_name),
                source: "terminal-device-action-proxy",
            });
            console.warn("cloud_admin_erp_repair_skipped_missing_device", {
                action: body.action,
                tenant_id: stringValue(body.tenant_id),
                terminal_id: stringValue(body.terminal_id),
                source: "terminal-device-action-proxy",
            });
            sendJson(response, 400, {
                error: "DEVICE_ID_REQUIRED",
                message: "DEVICE_ID_REQUIRED: Cloud-Admin necesita un device_id autorizado antes de llamar ERP.",
            });
            return;
        }

        const edgeResponse = await fetch(`${supabaseUrl}/functions/v1/request-terminal-device-authorization`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${serviceRoleKey}`,
                "Content-Type": "application/json",
                "X-Actor-Source": getHeader(request.headers, "x-actor-source") || "cloud-admin-api",
                "X-Actor-Email": getHeader(request.headers, "x-actor-email") || "",
                "X-Actor-User-Id": getHeader(request.headers, "x-actor-user-id") || "",
            },
            body: JSON.stringify(body),
        });

        const payloadText = await edgeResponse.text();
        let edgePayload: { error?: string } | null = null;
        try {
            edgePayload = payloadText ? JSON.parse(payloadText) as { error?: string } : null;
        } catch {
            edgePayload = null;
        }

        if (
            !edgeResponse.ok
            && body.action === "CLEAR_TERMINAL_DEVICES"
            && edgePayload?.error === "INVALID_ACTION"
        ) {
            const fallback = await fallbackClearTerminalDevices(body, request.headers, supabaseUrl, serviceRoleKey);
            sendJson(response, fallback.statusCode, fallback.body);
            return;
        }

        setCors(response);
        response.statusCode = edgeResponse.status;
        response.setHeader("Content-Type", edgeResponse.headers.get("content-type") || "application/json");
        response.end(payloadText || "{}");
    } catch (error) {
        console.error("terminal-device-action proxy failed", error);
        sendJson(response, 500, {
            error: "INTERNAL_ERROR",
            message: error instanceof Error ? error.message : "Error interno ejecutando accion de terminal.",
        });
    }
}
