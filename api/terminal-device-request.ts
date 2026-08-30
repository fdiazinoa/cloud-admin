import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";
import { CloudAdminAuthError, requireCloudAdminPermission } from "./lib/cloud-admin-session.js";

type ApiRequest = IncomingMessage & { body?: unknown; headers: IncomingHttpHeaders; method?: string };
type RejectPayload = {
    tenant_id?: unknown;
    terminal_id?: unknown;
    request_id?: unknown;
    requested_device_id?: unknown;
    reason?: unknown;
    idempotency_key?: unknown;
};

function setCors(response: ServerResponse) {
    const allowedOrigin = process.env.CLOUD_ADMIN_CORS_ORIGIN;
    if (allowedOrigin) response.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Idempotency-Key");
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
    setCors(response);
    response.statusCode = status;
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify(body));
}

function requiredEnv(...names: string[]) {
    for (const name of names) {
        const value = process.env[name];
        if (value) return value;
    }
    throw new Error(`Missing required environment variable: ${names.join(" or ")}`);
}

function stringValue(value: unknown) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function headerValue(headers: IncomingHttpHeaders, name: string) {
    const value = headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
}

async function readBody(request: ApiRequest) {
    if (request.body) return typeof request.body === "string" ? JSON.parse(request.body) : request.body;
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString("utf8");
    return raw ? JSON.parse(raw) : {};
}

function getAttempts(payload: unknown) {
    const record = asRecord(payload);
    if (Array.isArray(record.attempts)) return record.attempts.map(asRecord);
    if (Array.isArray(record.data)) return record.data.map(asRecord);
    return [];
}

function requestStatus(request: Record<string, unknown>) {
    return (stringValue(request.resolution_status) || stringValue(request.status) || "").toUpperCase();
}

function isPendingRequest(request: Record<string, unknown>) {
    const status = requestStatus(request);
    const metadata = asRecord(request.metadata);
    return status === "PENDING" || (
        status === "REJECTED"
        && stringValue(request.reason)?.toUpperCase() === "DEVICE_SUPERSEDED"
        && stringValue(metadata.runtime)?.toLowerCase() === "serverless"
        && !stringValue(request.resolved_at)
        && !stringValue(request.resolved_by)
    );
}

async function auditRejection(
    admin: Awaited<ReturnType<typeof requireCloudAdminPermission>>["admin"],
    input: {
        tenantId: string;
        terminalId: string;
        terminalName: string | null;
        authorizedDeviceId: string | null;
        requestedDeviceId: string;
        actor: string;
        reason: string;
        requestId: string;
        operationId: string;
        reconciled: boolean;
    },
) {
    const { error } = await admin.from("terminal_device_audit").insert({
        tenant_id: input.tenantId,
        terminal_id: input.terminalId,
        terminal_name: input.terminalName,
        old_device_id: input.authorizedDeviceId,
        new_device_id: input.requestedDeviceId,
        action: "DEVICE_REQUEST_REJECTED",
        performed_by: input.actor,
        reason: input.reason,
        result: "REJECTED",
        metadata: {
            request_id: input.requestId,
            operation_id: input.operationId,
            reconciled_after_ambiguous_response: input.reconciled,
        },
    });
    if (error) console.warn("terminal-device-request rejection audit failed", error);
}

async function fetchRequests(
    erpApiUrl: string,
    erpServiceToken: string,
    tenantId: string,
    terminalId: string,
) {
    const response = await fetch(`${erpApiUrl}/api/sync/terminals/${encodeURIComponent(terminalId)}/auth-attempts`, {
        headers: {
            Authorization: `Bearer ${erpServiceToken}`,
            "X-Cloud-Admin-Tenant-Id": tenantId,
            "X-Tenant-Id": tenantId,
        },
        signal: AbortSignal.timeout(10_000),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`ERP_AUTH_ATTEMPTS_FAILED:${response.status}`);
    return getAttempts(payload);
}

export default async function handler(request: ApiRequest, response: ServerResponse) {
    if (request.method === "OPTIONS") {
        setCors(response);
        response.statusCode = 204;
        response.end();
        return;
    }
    if (request.method !== "POST") {
        sendJson(response, 405, { error: "METHOD_NOT_ALLOWED", message: "Método no permitido." });
        return;
    }

    try {
        const { admin, actor } = await requireCloudAdminPermission(request.headers, "terminal_reauthorization");
        const body = await readBody(request) as RejectPayload;
        const tenantId = stringValue(body.tenant_id);
        const terminalId = stringValue(body.terminal_id);
        const requestId = stringValue(body.request_id);
        const requestedDeviceId = stringValue(body.requested_device_id);
        const reason = stringValue(body.reason) || "CLOUD_ADMIN_TERMINAL_DEVICE_REQUEST_REJECTED";
        const idempotencyKey = headerValue(request.headers, "idempotency-key")
            || stringValue(body.idempotency_key)
            || crypto.randomUUID();
        if (!tenantId || !terminalId || !requestId || !requestedDeviceId) {
            sendJson(response, 400, { error: "VALIDATION_ERROR", message: "Tenant, terminal, solicitud y dispositivo son requeridos." });
            return;
        }

        const { data: terminal, error: terminalError } = await admin
            .schema("public")
            .from("erp_terminals")
            .select("id,name,store_id")
            .eq("id", terminalId)
            .maybeSingle();
        if (terminalError) throw terminalError;
        const storeId = stringValue((terminal as Record<string, unknown> | null)?.store_id);
        const terminalName = stringValue((terminal as Record<string, unknown> | null)?.name);
        const { data: store, error: storeError } = storeId
            ? await admin.schema("public").from("erp_stores").select("tenant_id").eq("id", storeId).maybeSingle()
            : { data: null, error: null };
        if (storeError) throw storeError;
        const { data: erpTenant, error: tenantError } = await admin
            .schema("public")
            .from("erp_tenants")
            .select("id")
            .eq("config->>cloudAdminTenantId", tenantId)
            .maybeSingle();
        if (tenantError) throw tenantError;
        const erpTenantId = stringValue((erpTenant as Record<string, unknown> | null)?.id);
        if (!terminal || !erpTenantId || stringValue((store as Record<string, unknown> | null)?.tenant_id) !== erpTenantId) {
            sendJson(response, 403, { error: "TERMINAL_TENANT_MISMATCH", message: "La terminal y la solicitud no pertenecen al tenant indicado." });
            return;
        }

        const erpApiUrl = requiredEnv("ERP_API_URL", "CLOUD_ADMIN_ERP_API_URL").replace(/\/$/, "");
        const erpServiceToken = requiredEnv("ERP_TAKEOVER_SERVICE_TOKEN", "ERP_SERVICE_TOKEN", "CLOUD_ADMIN_ERP_SERVICE_TOKEN");
        const requests = await fetchRequests(erpApiUrl, erpServiceToken, tenantId, terminalId);
        const pending = requests.find((item) => stringValue(item.id) === requestId);
        if (!pending || stringValue(pending.requested_device_id) !== requestedDeviceId) {
            sendJson(response, 409, { error: "DEVICE_REQUEST_MISMATCH", message: "La solicitud cambió o no pertenece al dispositivo seleccionado." });
            return;
        }
        if (!isPendingRequest(pending)) {
            sendJson(response, 409, { error: "DEVICE_REQUEST_NOT_PENDING", message: "La solicitud ya no está pendiente." });
            return;
        }

        let erpResponse: Response;
        try {
            erpResponse = await fetch(
                `${erpApiUrl}/api/sync/terminals/${encodeURIComponent(terminalId)}/auth-attempts/${encodeURIComponent(requestId)}/reject`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${erpServiceToken}`,
                        "Content-Type": "application/json",
                        "X-Tenant-Id": erpTenantId,
                        "X-Cloud-Admin-Tenant-Id": tenantId,
                        "Idempotency-Key": idempotencyKey,
                    },
                    body: JSON.stringify({
                        tenant_id: erpTenantId,
                        cloud_admin_tenant_id: tenantId,
                        terminal_id: terminalId,
                        request_id: requestId,
                        requested_device_id: requestedDeviceId,
                        reason,
                        requested_by: actor.email,
                    }),
                    signal: AbortSignal.timeout(15_000),
                },
            );
        } catch {
            const canonical = await fetchRequests(erpApiUrl, erpServiceToken, tenantId, terminalId).catch(() => []);
            const reconciled = canonical.find((item) => stringValue(item.id) === requestId);
            if (reconciled && requestStatus(reconciled) === "REJECTED") {
                await auditRejection(admin, {
                    tenantId,
                    terminalId,
                    terminalName,
                    authorizedDeviceId: stringValue(reconciled.authorized_device_id),
                    requestedDeviceId,
                    actor: actor.email,
                    reason,
                    requestId,
                    operationId: idempotencyKey,
                    reconciled: true,
                });
                sendJson(response, 200, { status: "success", request_id: requestId, request_status: "REJECTED", operation_id: idempotencyKey, reconciled: true });
                return;
            }
            sendJson(response, 504, { error: "REJECTION_RESPONSE_AMBIGUOUS", message: "El ERP no confirmó el rechazo y el estado canónico sigue sin confirmarlo." });
            return;
        }

        const payload = asRecord(await erpResponse.json().catch(() => null));
        if (!erpResponse.ok) {
            sendJson(response, erpResponse.status, {
                error: stringValue(payload.code) || stringValue(payload.error) || "ERP_DEVICE_REQUEST_REJECTION_FAILED",
                message: stringValue(payload.message) || "El ERP no pudo rechazar la solicitud.",
            });
            return;
        }
        const responseRequestId = stringValue(payload.request_id) || stringValue(payload.id);
        const responseStatus = (stringValue(payload.request_status) || stringValue(payload.resolution_status) || stringValue(payload.status) || "").toUpperCase();
        if (responseRequestId !== requestId || responseStatus !== "REJECTED") {
            sendJson(response, 409, { error: "ERP_REJECTION_CONFIRMATION_INVALID", message: "El ERP no confirmó la solicitud rechazada." });
            return;
        }

        await auditRejection(admin, {
            tenantId,
            terminalId,
            terminalName,
            authorizedDeviceId: stringValue(pending.authorized_device_id),
            requestedDeviceId,
            actor: actor.email,
            reason,
            requestId,
            operationId: stringValue(payload.operation_id) || idempotencyKey,
            reconciled: false,
        });

        sendJson(response, 200, {
            status: "success",
            request_id: requestId,
            request_status: "REJECTED",
            operation_id: stringValue(payload.operation_id) || idempotencyKey,
        });
    } catch (error) {
        if (error instanceof CloudAdminAuthError) {
            sendJson(response, error.status, { error: error.code, message: error.message });
            return;
        }
        console.error("terminal-device-request failed", error);
        sendJson(response, 500, { error: "INTERNAL_ERROR", message: error instanceof Error ? error.message : "Error interno gestionando la solicitud." });
    }
}
