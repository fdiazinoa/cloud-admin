import fs from "node:fs";
import path from "node:path";

const defaultEnvPaths = [
    path.resolve(".env"),
    path.resolve("../CLIC-POS/.env"),
];

const decodeJwtRole = (token) => {
    try {
        const [, payload] = token.split(".");
        if (!payload) return null;
        const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
        const parsed = JSON.parse(Buffer.from(normalized, "base64").toString("utf8"));
        return typeof parsed.role === "string" ? parsed.role : null;
    } catch {
        return null;
    }
};

const isPublicClientKey = (token) => token?.startsWith("sb_publishable_") || decodeJwtRole(token) === "anon";
const isElevatedServerKey = (token) => token?.startsWith("sb_secret_") || decodeJwtRole(token) === "service_role";

const loadEnv = (filePath) => Object.fromEntries(
    fs.readFileSync(filePath, "utf8")
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => {
            const separator = line.indexOf("=");
            return separator > 0 ? [line.slice(0, separator), line.slice(separator + 1)] : null;
        })
        .filter(Boolean),
);

let hasError = false;

for (const envPath of defaultEnvPaths) {
    if (!fs.existsSync(envPath)) {
        continue;
    }

    const env = loadEnv(envPath);
    const anonKey = env.VITE_SUPABASE_ANON_KEY;
    const serviceKey = env.VITE_SUPABASE_SERVICE_ROLE_KEY;
    const anonRole = anonKey ? decodeJwtRole(anonKey) : null;
    const serviceRole = serviceKey ? decodeJwtRole(serviceKey) : null;

    console.log(`\n[${envPath}]`);
    console.log(`- VITE_SUPABASE_ANON_KEY role: ${anonRole || "missing/invalid"}`);
    if (serviceKey) {
        console.log(`- VITE_SUPABASE_SERVICE_ROLE_KEY role: ${serviceRole || "missing/invalid"}`);
    } else {
        console.log("- VITE_SUPABASE_SERVICE_ROLE_KEY role: not set");
    }

    if (!isPublicClientKey(anonKey)) {
        hasError = true;
        console.error("  ERROR: VITE_SUPABASE_ANON_KEY is not anon/sb_publishable.");
    }
    if (serviceKey && !isElevatedServerKey(serviceKey)) {
        hasError = true;
        console.error("  ERROR: VITE_SUPABASE_SERVICE_ROLE_KEY is not service_role/sb_secret.");
    }
    if (anonKey && serviceKey && anonKey === serviceKey) {
        hasError = true;
        console.error("  ERROR: anon key and service_role key are identical.");
    }
}

if (hasError) {
    process.exitCode = 1;
}
