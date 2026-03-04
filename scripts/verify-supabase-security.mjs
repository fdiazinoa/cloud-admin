import fs from "node:fs";
import path from "node:path";

const envPath = path.resolve(".env");
const env = Object.fromEntries(
    fs.readFileSync(envPath, "utf8")
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => {
            const separatorIndex = line.indexOf("=");
            return separatorIndex > 0
                ? [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)]
                : null;
        })
        .filter(Boolean),
);

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env");
}

const decodeJwtRole = (token) => {
    try {
        const [, payload] = token.split(".");
        if (!payload) return null;
        const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
        const json = Buffer.from(normalized, "base64").toString("utf8");
        const parsed = JSON.parse(json);
        return typeof parsed.role === "string" ? parsed.role : null;
    } catch {
        return null;
    }
};

const anonRole = decodeJwtRole(supabaseAnonKey);
const isPublicClientKey = supabaseAnonKey.startsWith("sb_publishable_") || anonRole === "anon";
if (!isPublicClientKey) {
    throw new Error(
        `VITE_SUPABASE_ANON_KEY must be anon or sb_publishable for this check (current role: ${anonRole || "unknown"})`,
    );
}

const checks = [
    ["landlord", "subscriptions"],
    ["landlord", "tenants"],
    ["public", "tenants"],
    ["public", "terminals"],
    ["public", "locales"],
    ["public", "sync_inbox"],
    ["public", "sync_outbox"],
    ["public", "sync_dead_letter"],
    ["public", "items"],
    ["public", "erp_tenants"],
    ["public", "erp_stores"],
    ["public", "erp_terminals"],
    ["public", "erp_sync_inbox"],
    ["public", "erp_sync_outbox"],
    ["public", "erp_sync_dead_letter"],
    ["public", "stores"],
];

const readTable = async (schema, table) => {
    const response = await fetch(`${supabaseUrl}/rest/v1/${table}?select=*&limit=1`, {
        headers: {
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${supabaseAnonKey}`,
            Accept: "application/json",
            "Accept-Profile": schema,
            Prefer: "count=exact",
        },
    });

    const contentRange = response.headers.get("content-range") || "";
    const total = contentRange.includes("/") ? contentRange.split("/").pop() : "?";
    let keys = [];
    let bodyPreview = "";

    try {
        const payload = await response.json();
        if (Array.isArray(payload) && payload.length > 0 && payload[0] && typeof payload[0] === "object") {
            keys = Object.keys(payload[0]);
        }
        bodyPreview = JSON.stringify(payload).slice(0, 180);
    } catch {
        bodyPreview = "<non-json-response>";
    }

    return {
        schema,
        table,
        status: response.status,
        total,
        keys,
        bodyPreview,
    };
};

const results = await Promise.all(checks.map(([schema, table]) => readTable(schema, table)));

for (const result of results) {
    console.log(JSON.stringify(result));
}
