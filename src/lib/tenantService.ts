import { supabase, supabaseAdmin } from "./supabase";
import type {
    Distributor,
    Tenant,
    TenantTerminalRegistryEntry,
    TenantTerminalSnapshot,
    TenantType,
    Terminal,
} from "../types";

export interface DashboardStats {
    activeTenants: number;
    suspendedTenants: number;
    terminals: number;
}

interface CreateTenantInput {
    name: string;
    slug: string;
    email: string;
    contactName: string;
    contactEmail: string;
    city: string;
    capturedByDistributorId?: string;
    servicedByDistributorId?: string;
    plan?: string;
    type?: TenantType;
    cloudSync?: boolean;
}

type TenantUpdatePayload = {
    name: string;
    legal_name: string | null;
    tax_id: string | null;
    phone: string | null;
    type: TenantType;
    cloud_sync: boolean;
    max_pos_terminals?: number;
    max_erp_users?: number;
};

function normalizeOptional(value?: string): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function parseMissingTenantColumn(error: unknown): keyof TenantUpdatePayload | null {
    if (!error || typeof error !== "object") return null;

    const message = "message" in error && typeof error.message === "string" ? error.message : "";
    const details = "details" in error && typeof error.details === "string" ? error.details : "";
    const haystack = `${message} ${details}`.toLowerCase();

    if (haystack.includes("legal_name")) return "legal_name";
    if (haystack.includes("phone")) return "phone";

    return null;
}

function generateTempPassword(): string {
    const length = 14;
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let pwd = "";
    for (let i = 0; i < length; i++) {
        pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pwd;
}

export async function createTenant({
    name,
    slug,
    email,
    contactName,
    contactEmail,
    city,
    capturedByDistributorId,
    servicedByDistributorId,
    plan = "TRIAL",
    type = "full",
    cloudSync = true,
}: CreateTenantInput): Promise<{ tenantId: string; tempPassword: string }> {
    const accessEmail = email.trim().toLowerCase();
    const contactMail = contactEmail.trim().toLowerCase();
    const tempPassword = generateTempPassword();

    const { error: authError, data: authUser } = await supabaseAdmin.auth.admin.createUser({
        email: accessEmail,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
            name,
            full_name: name,
            slug,
            type,
            cloudSync,
            contact_name: contactName.trim(),
            contact_email: contactMail,
            city: city.trim(),
            captured_by_distributor_id: normalizeOptional(capturedByDistributorId),
            serviced_by_distributor_id: normalizeOptional(servicedByDistributorId),
            is_new_user: true,
        },
    });

    if (authError) {
        console.error("Supabase user creation failed", authError);
        throw authError;
    }

    const authUserId = authUser?.user?.id;
    if (!authUserId) {
        throw new Error("Supabase Auth user ID missing after tenant user creation");
    }

    const { data, error: fnError } = await supabaseAdmin.rpc("create_new_tenant", {
        p_name: name,
        p_slug: slug,
        p_email: accessEmail,
        p_type: type,
        p_cloud_sync: cloudSync,
        p_contact_name: contactName.trim(),
        p_contact_email: contactMail,
        p_city: city.trim(),
        p_captured_by_distributor_id: normalizeOptional(capturedByDistributorId),
        p_serviced_by_distributor_id: normalizeOptional(servicedByDistributorId),
    });

    if (fnError) {
        console.error("Tenant provisioning failed", fnError);
        await supabaseAdmin.auth.admin.deleteUser(authUserId);
        throw fnError;
    }

    const tenantId = data as string;

    const { error: metadataError } = await supabaseAdmin.auth.admin.updateUserById(authUserId, {
        user_metadata: {
            name,
            full_name: name,
            slug,
            type,
            cloudSync,
            contact_name: contactName.trim(),
            contact_email: contactMail,
            city: city.trim(),
            captured_by_distributor_id: normalizeOptional(capturedByDistributorId),
            serviced_by_distributor_id: normalizeOptional(servicedByDistributorId),
            is_new_user: true,
            tenant_id: tenantId,
        },
    });

    if (metadataError) {
        console.error("Failed to sync tenant metadata into Supabase Auth", metadataError);
        await supabaseAdmin.from("tenants").delete().eq("id", tenantId);
        await supabaseAdmin.auth.admin.deleteUser(authUserId);
        throw metadataError;
    }

    const { error: subscriptionError } = await supabaseAdmin.from("subscriptions").insert({
        tenant_id: tenantId,
        plan_name: plan,
        is_active: true,
    });

    if (subscriptionError) {
        console.error("Failed to create tenant subscription", subscriptionError);
        await supabaseAdmin.from("tenants").delete().eq("id", tenantId);
        await supabaseAdmin.auth.admin.deleteUser(authUserId);
        throw subscriptionError;
    }

    return { tenantId, tempPassword };
}

export async function verifyTenantEmail(token: string): Promise<void> {
    const { error } = await supabaseAdmin.rpc("verify_tenant_email", { p_token: token });
    if (error) throw error;
}

export async function changeTenantPassword(newPassword: string): Promise<void> {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
}

export async function getTenants(): Promise<Tenant[]> {
    const { data, error } = await supabaseAdmin
        .from("tenants")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Error fetching tenants:", error);
        throw error;
    }

    return (data as Tenant[]) || [];
}

export async function updateTenantTaxId(id: string, taxId: string): Promise<void> {
    const { error } = await supabaseAdmin
        .from("tenants")
        .update({ tax_id: taxId.trim() })
        .eq("id", id);

    if (error) throw error;
}

export async function updateTenant(
    id: string,
    payload: TenantUpdatePayload,
): Promise<void> {
    const nextPayload: Partial<TenantUpdatePayload> = { ...payload };

    for (let attempt = 0; attempt < 3; attempt += 1) {
        const { error } = await supabaseAdmin
            .from("tenants")
            .update(nextPayload)
            .eq("id", id);

        if (!error) return;

        const missingColumn = parseMissingTenantColumn(error);
        if (missingColumn && missingColumn in nextPayload) {
            delete nextPayload[missingColumn];
            continue;
        }

        throw error;
    }

    throw new Error("Tenant update failed after retrying without optional columns.");
}

export async function getDistributors(): Promise<Distributor[]> {
    const { data, error } = await supabaseAdmin
        .from("distributors")
        .select("*")
        .eq("is_active", true)
        .order("name", { ascending: true });

    if (error) {
        const errorCode = (error as { code?: string }).code;
        if (errorCode === "42P01") {
            return [];
        }
        console.error("Error fetching distributors:", error);
        throw error;
    }

    return (data as Distributor[]) || [];
}

export async function getTenantTerminalOverview(tenantId: string): Promise<TenantTerminalSnapshot[]> {
    const [terminalsRes, registryRes] = await Promise.all([
        supabaseAdmin
            .schema("public")
            .from("terminals")
            .select("*")
            .eq("tenant_id", tenantId),
        supabaseAdmin
            .from("tenant_server_registry")
            .select("*")
            .eq("tenant_id", tenantId)
            .order("last_seen_at", { ascending: false }),
    ]);

    const terminalRows: Terminal[] = [];
    if (terminalsRes.error) {
        console.warn("Tenant terminal catalog unavailable, falling back to registry data:", terminalsRes.error);
    } else {
        terminalRows.push(...((terminalsRes.data as Terminal[]) || []));
    }

    let registryRows: TenantTerminalRegistryEntry[] = [];
    if (registryRes.error) {
        const code = (registryRes.error as { code?: string }).code;
        if (code !== "42P01") {
            console.warn("Tenant server registry unavailable, falling back to catalog data:", registryRes.error);
        }
    } else {
        registryRows = (registryRes.data as TenantTerminalRegistryEntry[]) || [];
    }

    if (terminalsRes.error && registryRes.error) {
        throw terminalsRes.error;
    }

    const registriesByTerminalId = new Map<string, TenantTerminalRegistryEntry[]>();
    const registriesByDeviceId = new Map<string, TenantTerminalRegistryEntry[]>();
    const matchedRegistryIds = new Set<string>();

    for (const row of registryRows) {
        if (row.terminal_id) {
            const arr = registriesByTerminalId.get(row.terminal_id) || [];
            arr.push(row);
            registriesByTerminalId.set(row.terminal_id, arr);
        }
        if (row.device_id) {
            const arr = registriesByDeviceId.get(row.device_id) || [];
            arr.push(row);
            registriesByDeviceId.set(row.device_id, arr);
        }
    }

    const snapshots: TenantTerminalSnapshot[] = terminalRows.map((terminal) => {
        const deviceToken =
            terminal.device_token
            || terminal.device_id
            || terminal.current_device_id
            || null;
        const terminalName =
            terminal.name
            || terminal.terminal_name
            || terminal.label
            || terminal.id;
            
        let registries: TenantTerminalRegistryEntry[] = [];
        if (registriesByTerminalId.has(terminal.id)) {
            registries = registriesByTerminalId.get(terminal.id) || [];
        } else if (deviceToken && registriesByDeviceId.has(deviceToken)) {
            registries = registriesByDeviceId.get(deviceToken) || [];
        }

        const registry = registries.length > 0 ? registries[0] : null;
        
        for (const reg of registries) {
            if (reg.id) matchedRegistryIds.add(reg.id);
        }

        return {
            id: terminal.id,
            tenant_id: terminal.tenant_id,
            terminal_id: terminal.id,
            name: terminalName,
            device_token: deviceToken,
            is_active: terminal.is_active ?? terminal.active ?? true,
            last_checkin_at: terminal.last_checkin_at || terminal.last_seen_at || terminal.updated_at || null,
            created_at: terminal.created_at || null,
            registry,
            registries,
        };
    });

    const orphanedRegistriesGrouped = new Map<string, TenantTerminalRegistryEntry[]>();

    for (const row of registryRows) {
        if (matchedRegistryIds.has(row.id)) continue;
        const key = row.terminal_id || row.device_id || row.id;
        const arr = orphanedRegistriesGrouped.get(key) || [];
        arr.push(row);
        orphanedRegistriesGrouped.set(key, arr);
    }

    for (const arr of orphanedRegistriesGrouped.values()) {
        const primary = arr[0];
        snapshots.push({
            id: primary.id,
            tenant_id: primary.tenant_id,
            terminal_id: primary.terminal_id || null,
            name: primary.terminal_name || primary.terminal_id || primary.device_id || "Terminal sin catálogo",
            device_token: primary.device_id || null,
            is_active: (primary.status || "").toUpperCase() === "ONLINE",
            last_checkin_at: primary.last_seen_at || null,
            created_at: primary.created_at || null,
            registry: primary,
            registries: arr,
        });
    }

    return snapshots.sort((a, b) => {
        const aTime = new Date(a.last_checkin_at || a.created_at || 0).getTime();
        const bTime = new Date(b.last_checkin_at || b.created_at || 0).getTime();
        return bTime - aTime;
    });
}

export async function getDashboardStats(): Promise<DashboardStats> {
    const [tenantsRes, terminalsRes] = await Promise.all([
        supabaseAdmin.from("tenants").select("status"),
        supabaseAdmin.schema("public").from("terminals").select("id", { count: "exact", head: true }),
    ]);

    if (tenantsRes.error) throw tenantsRes.error;
    if (terminalsRes.error) throw terminalsRes.error;

    const activeTenants = tenantsRes.data?.filter(
        (tenant) => tenant.status === "ACTIVE" || tenant.status === "TRIAL",
    ).length || 0;
    const suspendedTenants = tenantsRes.data?.filter(
        (tenant) => tenant.status === "SUSPENDED",
    ).length || 0;

    return {
        activeTenants,
        suspendedTenants,
        terminals: terminalsRes.count || 0,
    };
}

export async function suspendTenant(id: string): Promise<void> {
    const { error } = await supabaseAdmin
        .from("tenants")
        .update({ status: "SUSPENDED" })
        .eq("id", id);
    if (error) throw error;
}

export async function reactivateTenant(id: string): Promise<void> {
    const { error } = await supabaseAdmin
        .from("tenants")
        .update({ status: "ACTIVE" })
        .eq("id", id);
    if (error) throw error;
}

export const tenantService = {
    createTenant,
    verifyTenantEmail,
    changeTenantPassword,
    getTenants,
    updateTenantTaxId,
    updateTenant,
    getDistributors,
    getTenantTerminalOverview,
    getDashboardStats,
    suspendTenant,
    reactivateTenant,
};
