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

function isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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

    const { error: auditError } = await supabase
        .from("terminal_device_audit")
        .insert({
            tenant_id: tenantId,
            terminal_id: terminalId,
            terminal_name: terminalDisplayCode,
            old_device_id: clearedDeviceIds.join(", ") || null,
            new_device_id: null,
            action: "CLEAR_TERMINAL_DEVICES",
            performed_by: performedBy,
            reason,
            result: "SUCCESS",
            metadata: {
                fallback_source: "vercel-api",
                registry_ids: registryIds,
                cleared_registry_count: count,
                cleared_device_ids: clearedDeviceIds,
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
            cleared_device_ids: clearedDeviceIds,
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
