import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";
import { createClient } from "@supabase/supabase-js";

type ApiRequest = IncomingMessage & {
    body?: unknown;
    headers: IncomingHttpHeaders;
    method?: string;
};

type AuthAttemptsPayload = {
    tenant_id?: unknown;
    terminal_id?: unknown;
};

type TenantRecord = {
    id: string;
    contracted_product?: string | null;
    cloud_channel?: string | null;
};

type AuthAttempt = {
    requested_device_id?: string | null;
    authorized_device_id?: string | null;
    device_id?: string | null;
    deviceId?: string | null;
    reason?: string | null;
    message?: string | null;
    status?: string | null;
    resolution_status?: string | null;
    attempted_at?: string | null;
    created_at?: string | null;
    metadata?: Record<string, unknown> | null;
    [key: string]: unknown;
};

const tokenKeys = new Set([
    "syncAuthToken",
    "sync_auth_token",
    "deviceToken",
    "device_token",
    "token",
    "auth_token",
    "access_token",
    "refresh_token",
]);

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

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
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

function sanitizePayload(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => sanitizePayload(item));
    if (!value || typeof value !== "object") return value;

    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        if (tokenKeys.has(key)) continue;
        output[key] = sanitizePayload(item);
    }
    return output;
}

function getAttemptsFromPayload(payload: unknown): unknown[] {
    if (Array.isArray(payload)) return payload;
    const record = asRecord(payload);
    if (Array.isArray(record.attempts)) return record.attempts;
    if (Array.isArray(record.data)) return record.data;
    if (Array.isArray(record.items)) return record.items;
    return [];
}

function normalizeAttempt(value: unknown, tenantId: string, terminalId: string): AuthAttempt {
    const sanitized = sanitizePayload(asRecord(value)) as Record<string, unknown>;
    const requestedDeviceId = stringValue(sanitized.requested_device_id)
        || stringValue(sanitized.device_id)
        || stringValue(sanitized.deviceId);
    const resolutionStatus = stringValue(sanitized.resolution_status) || stringValue(sanitized.status);
    const attemptedAt = stringValue(sanitized.attempted_at) || stringValue(sanitized.created_at);

    return {
        ...sanitized,
        tenant_id: tenantId,
        terminal_id: terminalId,
        requested_device_id: requestedDeviceId,
        authorized_device_id: stringValue(sanitized.authorized_device_id),
        reason: stringValue(sanitized.reason),
        resolution_status: resolutionStatus,
        attempted_at: attemptedAt,
    };
}

function getAttemptAppVersion(attempt: AuthAttempt | null) {
    if (!attempt) return null;
    const direct = stringValue(attempt.app_version) || stringValue(attempt.apk_version);
    if (direct) return direct;

    const metadata = asRecord(attempt.metadata);
    return stringValue(metadata.app_version)
        || stringValue(metadata.appVersion)
        || stringValue(metadata.apk_version)
        || stringValue(metadata.apkVersion)
        || stringValue(metadata.version);
}

function getAttemptAppVersionCode(attempt: AuthAttempt | null) {
    if (!attempt) return null;
    const metadata = asRecord(attempt.metadata);
    const candidates = [
        metadata.app_version_code,
        metadata.appVersionCode,
        metadata.apk_version_code,
        metadata.apkVersionCode,
        metadata.version_code,
        metadata.versionCode,
    ];

    for (const candidate of candidates) {
        if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
        if (typeof candidate === "string" && candidate.trim()) {
            const parsed = Number(candidate.trim());
            if (Number.isFinite(parsed)) return parsed;
        }
    }

    return null;
}

function getErpAuthAttemptsErrorMessage(status: number, payload: unknown) {
    const record = asRecord(payload);
    const detail = stringValue(record.message) || stringValue(record.error);

    if (status === 404) return "El ERP no encontro intentos para esta terminal.";
    if (status === 401 || status === 403) {
        return detail && !detail.toLowerCase().includes("no tienes permiso")
            ? `ERP rechazo la consulta de intentos (HTTP ${status}): ${detail}`
            : `ERP rechazo la consulta de intentos (HTTP ${status}). Verifica el token de servicio ERP y la configuracion del tenant antes de reautorizar.`;
    }

    return detail || "No se pudieron cargar los intentos rechazados desde el ERP.";
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
        sendJson(response, 401, { error: "UNAUTHORIZED", message: "No autorizado para consultar intentos de autorizacion." });
        return;
    }

    try {
        const body = await readBody(request) as AuthAttemptsPayload;
        const tenantId = stringValue(body.tenant_id);
        const terminalId = stringValue(body.terminal_id);

        if (!tenantId || !terminalId) {
            sendJson(response, 400, {
                error: "VALIDATION_ERROR",
                message: "Selecciona tenant y terminal para consultar intentos rechazados.",
            });
            return;
        }

        const supabaseUrl = getEnv("SUPABASE_URL", "VITE_SUPABASE_URL").replace(/\/$/, "");
        const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY", "VITE_SUPABASE_SERVICE_ROLE_KEY");
        const erpApiUrl = getEnv("ERP_API_URL", "CLOUD_ADMIN_ERP_API_URL").replace(/\/$/, "");
        const erpServiceToken = getEnv("ERP_TAKEOVER_SERVICE_TOKEN", "ERP_SERVICE_TOKEN", "CLOUD_ADMIN_ERP_SERVICE_TOKEN");
        const supabase = createClient(supabaseUrl, serviceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false },
            db: { schema: "landlord" },
        });

        const { data: tenantData, error: tenantError } = await supabase
            .from("tenants")
            .select("id,contracted_product,cloud_channel")
            .eq("id", tenantId)
            .maybeSingle();
        if (tenantError) throw tenantError;
        const tenant = tenantData as TenantRecord | null;
        if (!tenant) {
            sendJson(response, 404, { error: "TENANT_NOT_FOUND", message: "Tenant no encontrado." });
            return;
        }

        const erpResponse = await fetch(`${erpApiUrl}/api/sync/terminals/${encodeURIComponent(terminalId)}/auth-attempts`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${erpServiceToken}`,
                "Content-Type": "application/json",
                "X-Tenant-Id": tenantId,
                "X-Cloud-Admin-Tenant-Id": tenantId,
            },
        });

        const payloadText = await erpResponse.text();
        let erpPayload: unknown = null;
        try {
            erpPayload = payloadText ? JSON.parse(payloadText) : null;
        } catch {
            erpPayload = payloadText ? { message: payloadText } : null;
        }

        if (!erpResponse.ok) {
            sendJson(response, erpResponse.status, {
                error: "ERP_AUTH_ATTEMPTS_FAILED",
                message: getErpAuthAttemptsErrorMessage(erpResponse.status, erpPayload),
                erp_status: erpResponse.status,
            });
            return;
        }

        const attempts = getAttemptsFromPayload(erpPayload)
            .map((attempt) => normalizeAttempt(attempt, tenantId, terminalId))
            .filter((attempt) => attempt.requested_device_id || attempt.reason || attempt.message);

        const latestRejected = attempts.find((attempt) => {
            const reason = (attempt.reason || "").toUpperCase();
            const status = (attempt.resolution_status || attempt.status || "").toUpperCase();
            return reason === "DEVICE_NOT_AUTHORIZED" && status !== "RESOLVED";
        }) || attempts[0] || null;
        const latestWithVersion = attempts.find((attempt) => getAttemptAppVersion(attempt) || getAttemptAppVersionCode(attempt)) || null;

        if (latestRejected?.requested_device_id) {
            const permissivePosErpAuth = tenant.contracted_product === "POS_ERP" || tenant.cloud_channel === "ERP_ACTIVE";
            const appVersion = getAttemptAppVersion(latestRejected) || getAttemptAppVersion(latestWithVersion);
            const appVersionCode = getAttemptAppVersionCode(latestRejected) || getAttemptAppVersionCode(latestWithVersion);
            const registryUpdate: Record<string, unknown> = {
                last_rejected_device_id: latestRejected.requested_device_id,
                authorized_device_id: permissivePosErpAuth
                    ? latestRejected.requested_device_id
                    : latestRejected.authorized_device_id || null,
                auth_status: permissivePosErpAuth ? "AUTHORIZED" : "DEVICE_MISMATCH",
                last_auth_error: permissivePosErpAuth ? null : latestRejected.reason || latestRejected.message || "DEVICE_NOT_AUTHORIZED",
                last_auth_attempt_at: latestRejected.attempted_at || latestRejected.created_at || new Date().toISOString(),
                requires_pos_reauth: false,
                updated_at: new Date().toISOString(),
            };
            if (permissivePosErpAuth) {
                registryUpdate.device_id = latestRejected.requested_device_id;
                registryUpdate.current_device_id = latestRejected.requested_device_id;
            }
            if (appVersion) registryUpdate.app_version = appVersion;
            if (appVersionCode) registryUpdate.app_version_code = appVersionCode;

            const { error: updateError } = await supabase
                .from("tenant_server_registry")
                .update(registryUpdate)
                .eq("tenant_id", tenantId)
                .eq("terminal_id", terminalId);

            if (updateError) {
                console.warn("terminal-auth-attempts registry update failed", updateError);
            }
        }

        sendJson(response, 200, {
            status: "success",
            attempts,
        });
    } catch (error) {
        console.error("terminal-auth-attempts proxy failed", error);
        sendJson(response, 500, {
            error: "INTERNAL_ERROR",
            message: error instanceof Error ? error.message : "Error interno consultando intentos rechazados.",
        });
    }
}
