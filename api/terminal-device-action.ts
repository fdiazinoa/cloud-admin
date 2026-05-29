import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";

type ApiRequest = IncomingMessage & {
    body?: unknown;
    headers: IncomingHttpHeaders;
    method?: string;
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
        const body = await readBody(request);
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
