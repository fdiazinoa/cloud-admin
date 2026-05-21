import { supabase, supabaseAdmin } from "./supabase";
import type {
    Distributor,
    Tenant,
    TenantTerminalRegistryEntry,
    TenantTerminalSnapshot,
    TenantType,
    Terminal,
} from "../types";
import { provisionTenant, type ProvisionTenantInput, type SupabaseAdminClient } from "./tenantProvisioning";

export interface DashboardStats {
    activeTenants: number;
    suspendedTenants: number;
    terminals: number;
}

type CreateTenantInput = ProvisionTenantInput;

type TenantUpdatePayload = {
    name: string;
    legal_name: string | null;
    tax_id: string | null;
    phone: string | null;
    type: TenantType;
    cloud_sync: boolean;
    max_pos_terminals?: number;
    max_erp_users?: number;
    email?: string;
    password?: string;
};

function parseMissingTenantColumn(error: unknown): keyof TenantUpdatePayload | null {
    if (!error || typeof error !== "object") return null;

    const message = "message" in error && typeof error.message === "string" ? error.message : "";
    const details = "details" in error && typeof error.details === "string" ? error.details : "";
    const haystack = `${message} ${details}`.toLowerCase();

    if (haystack.includes("legal_name")) return "legal_name";
    if (haystack.includes("phone")) return "phone";

    return null;
}

export async function createTenant(input: CreateTenantInput): Promise<{ tenantId: string; tempPassword: string }> {
    return provisionTenant(supabaseAdmin as unknown as SupabaseAdminClient, input);
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

async function findTenantAuthUserId(tenant: Tenant): Promise<string | null> {
    const tenantEmail = tenant.email.trim().toLowerCase();
    let page = 1;
    const perPage = 1000;

    while (true) {
        const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
        if (error) throw error;

        const users = data.users || [];
        const match = users.find((user) => {
            const userEmail = user.email?.trim().toLowerCase();
            const metadataTenantId = typeof user.user_metadata?.tenant_id === "string"
                ? user.user_metadata.tenant_id
                : null;
            return userEmail === tenantEmail || metadataTenantId === tenant.id;
        });

        if (match) return match.id;
        if (users.length < perPage) return null;
        page += 1;
    }
}

export async function deleteTenant(tenant: Tenant): Promise<void> {
    const authUserId = await findTenantAuthUserId(tenant);

    const { error } = await supabaseAdmin.rpc("delete_tenant", {
        p_tenant_id: tenant.id,
        p_confirm_name: tenant.name,
    });

    if (error) throw error;

    if (authUserId) {
        const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(authUserId);
        if (authDeleteError) {
            throw new Error(
                `Tenant eliminado, pero no se pudo eliminar el usuario de acceso (${tenant.email}): ${authDeleteError.message}`,
            );
        }
    }
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

    const groupedTerminalRows = new Map<string, Terminal[]>();
    for (const terminal of terminalRows) {
        const terminalName = (terminal.name || terminal.terminal_name || terminal.label || terminal.id || "Terminal Sin Nombre").trim();
        const groupKey = terminalName.toUpperCase();
        const arr = groupedTerminalRows.get(groupKey) || [];
        arr.push(terminal);
        groupedTerminalRows.set(groupKey, arr);
    }

    const snapshots: TenantTerminalSnapshot[] = [];

    for (const terminalsGroup of groupedTerminalRows.values()) {
        // We pick the most recently created terminal row as the "primary" one for metadata
        const primaryTerminal = terminalsGroup.reduce((newest, current) => {
            const newestTime = new Date(newest.created_at || 0).getTime();
            const currentTime = new Date(current.created_at || 0).getTime();
            return currentTime > newestTime ? current : newest;
        });

        const deviceToken = primaryTerminal.device_token || primaryTerminal.device_id || primaryTerminal.current_device_id || null;
        const terminalName = primaryTerminal.name || primaryTerminal.terminal_name || primaryTerminal.label || primaryTerminal.id;

        const registriesMap = new Map<string, TenantTerminalRegistryEntry>();

        for (const terminal of terminalsGroup) {
            if (registriesByTerminalId.has(terminal.id)) {
                for (const reg of registriesByTerminalId.get(terminal.id)!) {
                     if (reg.id) {
                         registriesMap.set(reg.id, reg);
                         matchedRegistryIds.add(reg.id);
                     }
                }
            }
            const dt = terminal.device_token || terminal.device_id || terminal.current_device_id;
            if (dt && registriesByDeviceId.has(dt)) {
                for (const reg of registriesByDeviceId.get(dt)!) {
                     if (reg.id) {
                         registriesMap.set(reg.id, reg);
                         matchedRegistryIds.add(reg.id);
                     }
                }
            }
        }

        const consolidatedRegistries = Array.from(registriesMap.values());
        // Sort registries by last_seen_at DESC so the most recent heartbeat is first
        consolidatedRegistries.sort((a, b) => new Date(b.last_seen_at || 0).getTime() - new Date(a.last_seen_at || 0).getTime());

        const registry = consolidatedRegistries.length > 0 ? consolidatedRegistries[0] : null;

        snapshots.push({
            id: primaryTerminal.id,
            tenant_id: primaryTerminal.tenant_id,
            terminal_id: primaryTerminal.id,
            name: terminalName,
            device_token: deviceToken,
            is_active: primaryTerminal.config?.is_active ?? primaryTerminal.is_active ?? primaryTerminal.active ?? true,
            last_checkin_at: primaryTerminal.last_checkin_at || primaryTerminal.last_seen_at || primaryTerminal.updated_at || null,
            created_at: primaryTerminal.created_at || null,
            registry,
            registries: consolidatedRegistries,
        });
    }

    const orphanedRegistriesGrouped = new Map<string, TenantTerminalRegistryEntry[]>();

    for (const row of registryRows) {
        if (row.id && matchedRegistryIds.has(row.id)) continue;
        
        const terminalName = (row.terminal_name || row.terminal_id || row.device_id || "Terminal sin catálogo").trim();
        const groupKey = terminalName.toUpperCase();

        const existingSnapshot = snapshots.find(s => (s.name || '').trim().toUpperCase() === groupKey);

        if (existingSnapshot) {
            existingSnapshot.registries = existingSnapshot.registries || [];
            existingSnapshot.registries.push(row);
            existingSnapshot.registries.sort((a, b) => new Date(b.last_seen_at || 0).getTime() - new Date(a.last_seen_at || 0).getTime());
            existingSnapshot.registry = existingSnapshot.registries[0];
            if (row.id) matchedRegistryIds.add(row.id);
        } else {
            const arr = orphanedRegistriesGrouped.get(groupKey) || [];
            arr.push(row);
            orphanedRegistriesGrouped.set(groupKey, arr);
        }
    }

    for (const arr of orphanedRegistriesGrouped.values()) {
        arr.sort((a, b) => new Date(b.last_seen_at || 0).getTime() - new Date(a.last_seen_at || 0).getTime());
        const primary = arr[0];
        snapshots.push({
            id: primary.id || primary.device_id || `orphan-${Date.now()}`,
            tenant_id: primary.tenant_id,
            terminal_id: primary.terminal_id || null,
            name: (primary.terminal_name || primary.terminal_id || primary.device_id || "Terminal sin catálogo").trim(),
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

export async function updateTenantCredentials(
    tenantId: string,
    payload: { email?: string; password?: string }
): Promise<void> {
    const { email, password } = payload;
    if (!email && !password) return;

    // 1. Get the current tenant to get the current email
    const { data: tenant, error: fetchErr } = await supabaseAdmin
        .from("tenants")
        .select("email")
        .eq("id", tenantId)
        .single();

    if (fetchErr) throw fetchErr;

    // 2. Find the user in Auth by current email or tenant_id
    const { data: { users }, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
    if (listErr) throw listErr;

    const authUser = users.find((u) => u.email === (tenant as { email: string }).email || u.user_metadata?.tenant_id === tenantId);
    if (!authUser) throw new Error("Usuario de autenticación no encontrado para este tenant");

    // 3. Update Auth
    const updateData: { email?: string; password?: string; email_confirm?: boolean } = {};
    if (email && email.trim().toLowerCase() !== (tenant as { email: string }).email) {
        updateData.email = email.trim().toLowerCase();
        updateData.email_confirm = true;
    }
    if (password && password.trim()) {
        updateData.password = password.trim();
    }

    if (Object.keys(updateData).length > 0) {
        const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(authUser.id, updateData);
        if (authErr) throw authErr;
    }

    // 4. Update DB if email changed
    if (email && email.trim().toLowerCase() !== (tenant as { email: string }).email) {
        const { error: dbErr } = await supabaseAdmin
            .from("tenants")
            .update({ email: email.trim().toLowerCase() })
            .eq("id", tenantId);
        if (dbErr) throw dbErr;
    }
}

export async function toggleTerminalActiveStatus(terminalId: string, isActive: boolean): Promise<void> {
    const { data: terminal, error: getErr } = await supabaseAdmin
        .schema("public")
        .from("erp_terminals")
        .select("config")
        .eq("id", terminalId)
        .single();
    
    if (getErr) throw getErr;

    const config = terminal.config || {};
    config.is_active = isActive;

    const { error: setErr } = await supabaseAdmin
        .schema("public")
        .from("erp_terminals")
        .update({ config })
        .eq("id", terminalId);
    
    if (setErr) throw setErr;
}

export const tenantService = {
    createTenant,
    verifyTenantEmail,
    changeTenantPassword,
    getTenants,
    updateTenantTaxId,
    updateTenant,
    deleteTenant,
    getDistributors,
    getTenantTerminalOverview,
    getDashboardStats,
    suspendTenant,
    reactivateTenant,
    updateTenantCredentials,
    toggleTerminalActiveStatus,
};
