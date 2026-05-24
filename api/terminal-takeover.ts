import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";
import { createClient } from "@supabase/supabase-js";

type ApiRequest = IncomingMessage & {
    body?: unknown;
    headers: IncomingHttpHeaders;
    method?: string;
};

type TakeoverPayload = {
    tenant_id?: unknown;
    terminal_id?: unknown;
    registry_id?: unknown;
    device_id?: unknown;
    device_name?: unknown;
    reason?: unknown;
    confirm_takeover?: unknown;
    helpdesk_ticket_id?: unknown;
};

type TenantRecord = {
    id: string;
    name: string;
    email: string;
    status: string;
    type?: string | null;
    cloud_sync?: boolean | null;
};

type RegistryRecord = {
    id: string;
    tenant_id: string;
    device_id?: string | null;
    terminal_id?: string | null;
    terminal_name?: string | null;
};

type PublicTerminalRecord = {
    id: string;
    tenant_id: string;
    device_token?: string | null;
    device_id?: string | null;
    current_device_id?: string | null;
    name?: string | null;
    terminal_name?: string | null;
    label?: string | null;
};

const tokenKeys = new Set([
    "syncAuthToken",
    "sync_auth_token",
    "token",
    "auth_token",
    "access_token",
    "refresh_token",
]);

function setCors(response: ServerResponse) {
    response.setHeader("Access-Control-Allow-Origin", process.env.CLOUD_ADMIN_TAKEOVER_CORS_ORIGIN || "*");
    response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Actor-User-Id, X-Actor-Email, X-Actor-Source");
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

function stringValue(value: unknown) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isAuthorizedTakeoverRequest(request: ApiRequest) {
    const expectedToken = process.env.CONFIG_ADMIN_TOKEN;
    const receivedToken = getHeader(request.headers, "x-config-admin-token");

    if (expectedToken && receivedToken === expectedToken) {
        return true;
    }

    const authorization = getHeader(request.headers, "authorization") ?? "";
    const bearerToken = authorization.replace(/^Bearer\s+/i, "").trim();
    if (!bearerToken) return false;

    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY", "VITE_SUPABASE_SERVICE_ROLE_KEY");
    return bearerToken === serviceRoleKey;
}

function sanitizePayload(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map((item) => sanitizePayload(item));
    }

    if (!value || typeof value !== "object") {
        return value;
    }

    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        if (tokenKeys.has(key)) continue;
        output[key] = sanitizePayload(item);
    }

    return output;
}

function getErrorCode(payload: unknown): string | null {
    if (!payload || typeof payload !== "object") return null;
    const record = payload as Record<string, unknown>;
    const candidates = [record.code, record.error, record.error_code];
    for (const candidate of candidates) {
        if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    }
    return null;
}

function getErpErrorMessage(status: number, payload: unknown) {
    const code = getErrorCode(payload);
    if (status === 403 && code === "DEVICE_SUPERSEDED") {
        return "Este dispositivo anterior ya fue reemplazado.";
    }
    if (status === 401 || status === 403) {
        return "No tienes permiso para ejecutar recuperacion de terminal.";
    }
    if (payload && typeof payload === "object") {
        const record = payload as Record<string, unknown>;
        if (typeof record.message === "string") return record.message;
        if (typeof record.error === "string") return record.error;
    }
    return "El ERP no pudo completar la recuperacion de terminal.";
}

function formatUnknownError(error: unknown) {
    if (error instanceof Error) return error.message;

    if (error && typeof error === "object") {
        const payload = error as Record<string, unknown>;
        const parts = [
            payload.message,
            payload.details,
            payload.hint,
            payload.code ? `code: ${payload.code}` : undefined,
        ]
            .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
            .map((part) => part.trim());

        if (parts.length > 0) return parts.join(" · ");
        return JSON.stringify(payload);
    }

    return String(error);
}

function isLocalPosTenant(tenant: TenantRecord) {
    return tenant.type === "pos_only" && tenant.cloud_sync === false;
}

function getPublicTerminalDeviceId(terminal: PublicTerminalRecord | null) {
    return terminal?.device_token
        || terminal?.device_id
        || terminal?.current_device_id
        || null;
}

async function insertAudit(
    supabase: ReturnType<typeof createClient>,
    payload: {
        event: "TERMINAL_TAKEOVER_REQUESTED" | "TERMINAL_TAKEOVER_COMPLETED";
        tenant_id: string;
        terminal_id: string;
        previous_device_id?: string | null;
        new_device_id?: string | null;
        actor_user_id?: string | null;
        actor_email?: string | null;
        reason?: string | null;
        erp_response_status?: number | null;
        erp_error_code?: string | null;
        metadata?: Record<string, unknown>;
    },
) {
    const { error } = await supabase.from("terminal_takeover_audit").insert({
        event: payload.event,
        tenant_id: payload.tenant_id,
        terminal_id: payload.terminal_id,
        previous_device_id: payload.previous_device_id || null,
        new_device_id: payload.new_device_id || null,
        actor_user_id: payload.actor_user_id || null,
        actor_email: payload.actor_email || null,
        reason: payload.reason || null,
        erp_response_status: payload.erp_response_status || null,
        erp_error_code: payload.erp_error_code || null,
        metadata: payload.metadata || {},
    });

    if (error) {
        console.error("Failed to write terminal takeover audit", error);
    }
}

export default async function handler(request: ApiRequest, response: ServerResponse) {
    if (request.method === "OPTIONS") {
        sendJson(response, 200, { ok: true });
        return;
    }

    if (request.method !== "POST") {
        sendJson(response, 405, { error: "METHOD_NOT_ALLOWED", message: "Metodo no permitido." });
        return;
    }

    try {
        if (!isAuthorizedTakeoverRequest(request)) {
            sendJson(response, 401, { error: "UNAUTHORIZED", message: "Solicitud de recuperacion no autorizada." });
            return;
        }

        const body = await readBody(request) as TakeoverPayload;
        const tenantId = stringValue(body.tenant_id);
        const terminalId = stringValue(body.terminal_id);
        const registryId = stringValue(body.registry_id);
        const newDeviceId = stringValue(body.device_id);
        const deviceName = stringValue(body.device_name);
        const reason = stringValue(body.reason);
        const helpdeskTicketId = stringValue(body.helpdesk_ticket_id);
        const actorUserId = getHeader(request.headers, "x-actor-user-id") || null;
        const actorEmail = getHeader(request.headers, "x-actor-email") || getHeader(request.headers, "x-actor-source") || "cloud-admin";

        if (!tenantId || !terminalId || !newDeviceId || !reason) {
            sendJson(response, 400, {
                error: "VALIDATION_ERROR",
                message: "Selecciona tenant, terminal, nuevo device_id y motivo del cambio.",
            });
            return;
        }

        if (body.confirm_takeover !== true) {
            sendJson(response, 400, {
                error: "CONFIRMATION_REQUIRED",
                message: "Confirma explicitamente que la tablet anterior quedara revocada.",
            });
            return;
        }

        const supabase = createClient(
            getEnv("SUPABASE_URL", "VITE_SUPABASE_URL"),
            getEnv("SUPABASE_SERVICE_ROLE_KEY", "VITE_SUPABASE_SERVICE_ROLE_KEY"),
            {
                auth: { autoRefreshToken: false, persistSession: false },
                db: { schema: "landlord" },
            },
        );

        const { data: tenantData, error: tenantError } = await supabase
            .from("tenants")
            .select("id,name,email,status,type,cloud_sync")
            .eq("id", tenantId)
            .maybeSingle();

        if (tenantError) throw tenantError;
        const tenant = tenantData as TenantRecord | null;
        if (!tenant) {
            sendJson(response, 404, { error: "TENANT_NOT_FOUND", message: "Tenant no encontrado." });
            return;
        }
        if (tenant.status !== "ACTIVE") {
            sendJson(response, 400, { error: "TENANT_NOT_ACTIVE", message: "No se permite recuperacion si el tenant no esta activo." });
            return;
        }
        if (!isLocalPosTenant(tenant)) {
            sendJson(response, 400, {
                error: "POS_LOCAL_ONLY",
                message: "La recuperacion de terminal solo aplica a POS configurado como local. POS + ERP mantiene el flujo actual.",
            });
            return;
        }

        let registry: RegistryRecord | null = null;
        if (registryId) {
            const { data, error } = await supabase
                .from("tenant_server_registry")
                .select("id,tenant_id,device_id,terminal_id,terminal_name")
                .eq("tenant_id", tenantId)
                .eq("id", registryId)
                .maybeSingle();
            if (error) throw error;
            registry = (data as RegistryRecord | null) || null;
        }

        if (!registry) {
            const { data, error } = await supabase
                .from("tenant_server_registry")
                .select("id,tenant_id,device_id,terminal_id,terminal_name")
                .eq("tenant_id", tenantId)
                .eq("terminal_id", terminalId)
                .maybeSingle();
            if (error) throw error;
            registry = (data as RegistryRecord | null) || null;
        }

        const { data: publicTerminalData, error: terminalError } = await supabase
            .schema("public")
            .from("terminals")
            .select("*")
            .eq("tenant_id", tenantId)
            .eq("id", terminalId)
            .maybeSingle();

        if (terminalError) throw terminalError;
        const publicTerminal = publicTerminalData as PublicTerminalRecord | null;

        if (!registry && !publicTerminal) {
            sendJson(response, 404, { error: "TERMINAL_NOT_FOUND", message: "Terminal no encontrada para este tenant." });
            return;
        }

        const previousDeviceId = registry?.device_id || getPublicTerminalDeviceId(publicTerminal);
        if (previousDeviceId && previousDeviceId === newDeviceId) {
            sendJson(response, 400, {
                error: "SAME_DEVICE_ID",
                message: "El nuevo device_id no puede ser igual al dispositivo anterior.",
            });
            return;
        }

        await insertAudit(supabase, {
            event: "TERMINAL_TAKEOVER_REQUESTED",
            tenant_id: tenantId,
            terminal_id: terminalId,
            previous_device_id: previousDeviceId,
            new_device_id: newDeviceId,
            actor_user_id: actorUserId,
            actor_email: actorEmail,
            reason,
            metadata: {
                registry_id: registry?.id || null,
                source: "cloud-admin-vercel",
                device_name: deviceName,
            },
        });

        const erpResponse = await fetch(`${getEnv("ERP_API_URL", "CLOUD_ADMIN_ERP_API_URL").replace(/\/$/, "")}/api/settings/terminals/${encodeURIComponent(terminalId)}/takeover`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${getEnv("ERP_TAKEOVER_SERVICE_TOKEN", "ERP_SERVICE_TOKEN", "CLOUD_ADMIN_ERP_SERVICE_TOKEN")}`,
                "Content-Type": "application/json",
                "X-Tenant-Id": tenantId,
            },
            body: JSON.stringify({
                device_id: newDeviceId,
                device_name: deviceName || undefined,
            }),
        });

        const erpPayload = await erpResponse.json().catch(async () => ({
            message: await erpResponse.text().catch(() => ""),
        }));
        const erpErrorCode = getErrorCode(erpPayload);

        if (!erpResponse.ok) {
            await insertAudit(supabase, {
                event: "TERMINAL_TAKEOVER_COMPLETED",
                tenant_id: tenantId,
                terminal_id: terminalId,
                previous_device_id: previousDeviceId,
                new_device_id: newDeviceId,
                actor_user_id: actorUserId,
                actor_email: actorEmail,
                reason,
                erp_response_status: erpResponse.status,
                erp_error_code: erpErrorCode,
                metadata: {
                    success: false,
                    erp_payload: sanitizePayload(erpPayload),
                },
            });

            sendJson(response, erpResponse.status, {
                error: erpErrorCode || "ERP_TAKEOVER_FAILED",
                message: getErpErrorMessage(erpResponse.status, erpPayload),
            });
            return;
        }

        let registryUpdateError: string | null = null;
        if (registry?.id) {
            const { error: updateError } = await supabase
                .from("tenant_server_registry")
                .update({
                    device_id: newDeviceId,
                    terminal_name: deviceName || registry.terminal_name,
                    last_takeover_at: new Date().toISOString(),
                    previous_device_id: previousDeviceId,
                    current_device_id: newDeviceId,
                    revocation_reason: "TERMINAL_TAKEOVER",
                    requires_pos_reauth: true,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", registry.id);

            if (updateError) {
                registryUpdateError = updateError.message;
                console.error("Failed to update tenant server registry after takeover", updateError);
            }
        }

        if (helpdeskTicketId) {
            const { error: messageError } = await supabase.from("ticket_messages").insert({
                ticket_id: helpdeskTicketId,
                sender_type: "System",
                message: `Se ejecuto recuperacion de terminal. Dispositivo anterior: ${previousDeviceId || "N/D"}. Nuevo dispositivo: ${newDeviceId}.`,
                attachments: {
                    technical_action: {
                        action: "terminal_takeover",
                        previous_device_id: previousDeviceId,
                        new_device_id: newDeviceId,
                        reason,
                    },
                    notification: {
                        badge: true,
                        increment_unread: true,
                        play_sound: false,
                    },
                },
            });
            if (messageError) console.error("Failed to append helpdesk takeover message", messageError);
        }

        await insertAudit(supabase, {
            event: "TERMINAL_TAKEOVER_COMPLETED",
            tenant_id: tenantId,
            terminal_id: terminalId,
            previous_device_id: previousDeviceId,
            new_device_id: newDeviceId,
            actor_user_id: actorUserId,
            actor_email: actorEmail,
            reason,
            erp_response_status: erpResponse.status,
            metadata: {
                success: true,
                registry_update_error: registryUpdateError,
                erp_payload: sanitizePayload(erpPayload),
            },
        });

        const sanitizedPayload = sanitizePayload(erpPayload) as Record<string, unknown>;
        sendJson(response, 200, {
            status: "success",
            terminal: sanitizedPayload.terminal || null,
            previous_device_id: (sanitizedPayload.previous_device_id as string | undefined) || previousDeviceId,
            new_device_id: (sanitizedPayload.new_device_id as string | undefined) || newDeviceId,
            requires_auth: sanitizedPayload.requires_auth ?? true,
            message: "Terminal reasignada correctamente. La tablet anterior fue revocada. Inicia sesion/autentica la nueva tablet para continuar.",
        });
    } catch (error) {
        console.error("terminal-takeover failed", error);
        sendJson(response, error instanceof SyntaxError ? 400 : 500, {
            error: error instanceof SyntaxError ? "INVALID_JSON" : "INTERNAL_ERROR",
            message: error instanceof SyntaxError ? "JSON invalido." : formatUnknownError(error),
        });
    }
}
