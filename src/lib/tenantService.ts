import { supabase, supabaseAdmin } from "./supabase";
import type {
    Distributor,
    Tenant,
    TenantRegistryCleanupResult,
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

function normalizeOptional(value?: string): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function getRegistryRowLogicalKey(row: TenantTerminalRegistryEntry): string {
    return String(row.terminal_id || row.terminal_name || row.device_id || row.id || "").trim();
}

function getRegistryRowRecency(row: TenantTerminalRegistryEntry): number {
    const candidate = row.last_seen_at || row.updated_at || row.created_at || null;
    const parsed = candidate ? new Date(candidate).getTime() : 0;
    return Number.isFinite(parsed) ? parsed : 0;
}

function collapseRegistryRows(rows: TenantTerminalRegistryEntry[]) {
    const ordered = [...rows].sort((left, right) => getRegistryRowRecency(right) - getRegistryRowRecency(left));
    const collapsed = new Map<string, {
        row: TenantTerminalRegistryEntry;
        historyCount: number;
        staleIds: string[];
    }>();

    for (const row of ordered) {
        const logicalKey = getRegistryRowLogicalKey(row);
        if (!logicalKey) continue;

        const existing = collapsed.get(logicalKey);
        if (!existing) {
            collapsed.set(logicalKey, {
                row: {
                    ...row,
                    local_ips: Array.from(new Set((row.local_ips || []).filter(Boolean))),
                },
                historyCount: 1,
                staleIds: [],
            });
            continue;
        }

        existing.historyCount += 1;
        existing.staleIds.push(row.id);
        existing.row = {
            ...existing.row,
            local_ips: Array.from(
                new Set([
                    ...(existing.row.local_ips || []),
                    ...(row.local_ips || []),
                ].filter(Boolean))
            ),
        };
    }

    return Array.from(collapsed.values());
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
    payload: {
        name: string;
        legal_name: string | null;
        tax_id: string | null;
        phone: string | null;
        type: TenantType;
        cloud_sync: boolean;
    },
): Promise<void> {
    const { error } = await supabaseAdmin
        .from("tenants")
        .update(payload)
        .eq("id", id);

    if (error) throw error;
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
            .select("id,tenant_id,device_token,name,is_active,last_checkin_at,created_at")
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: true }),
        supabaseAdmin
            .from("tenant_server_registry")
            .select("*")
            .eq("tenant_id", tenantId)
            .order("last_seen_at", { ascending: false }),
    ]);

    if (terminalsRes.error) {
        throw terminalsRes.error;
    }

    let registryRows: TenantTerminalRegistryEntry[] = [];
    if (registryRes.error) {
        const code = (registryRes.error as { code?: string }).code;
        if (code !== "42P01") {
            throw registryRes.error;
        }
    } else {
        registryRows = (registryRes.data as TenantTerminalRegistryEntry[]) || [];
    }

    const collapsedRegistryRows = collapseRegistryRows(registryRows);
    const registryByTerminalId = new Map<string, (typeof collapsedRegistryRows)[number]>();
    const registryByDeviceId = new Map<string, (typeof collapsedRegistryRows)[number]>();
    const matchedRegistryIds = new Set<string>();

    for (const entry of collapsedRegistryRows) {
        const row = entry.row;
        if (row.terminal_id && !registryByTerminalId.has(row.terminal_id)) {
            registryByTerminalId.set(row.terminal_id, entry);
        }
        if (row.device_id && !registryByDeviceId.has(row.device_id)) {
            registryByDeviceId.set(row.device_id, entry);
        }
    }

    const snapshots: TenantTerminalSnapshot[] = ((terminalsRes.data as Terminal[]) || []).map((terminal) => {
        const registryEntry = registryByTerminalId.get(terminal.id) || registryByDeviceId.get(terminal.device_token);
        const registry = registryEntry?.row || null;
        if (registry?.id) {
            matchedRegistryIds.add(registry.id);
        }

        return {
            id: terminal.id,
            tenant_id: terminal.tenant_id,
            terminal_id: terminal.id,
            name: terminal.name || terminal.id,
            device_token: terminal.device_token,
            is_active: Boolean(terminal.is_active),
            last_checkin_at: terminal.last_checkin_at || null,
            created_at: terminal.created_at || null,
            registry_history_count: registryEntry?.historyCount || (registry ? 1 : 0),
            registry_stale_count: registryEntry?.staleIds.length || 0,
            registry,
        };
    });

    for (const entry of collapsedRegistryRows) {
        const row = entry.row;
        if (matchedRegistryIds.has(row.id)) continue;

        snapshots.push({
            id: row.id,
            tenant_id: row.tenant_id,
            terminal_id: row.terminal_id || null,
            name: row.terminal_name || row.terminal_id || row.device_id || "Terminal sin catálogo",
            device_token: row.device_id || null,
            is_active: (row.status || "").toUpperCase() === "ONLINE",
            last_checkin_at: row.last_seen_at || null,
            created_at: row.created_at || null,
            registry_history_count: entry.historyCount,
            registry_stale_count: entry.staleIds.length,
            registry: row,
        });
    }

    return snapshots;
}

export async function cleanupTenantTerminalRegistry(tenantId: string): Promise<TenantRegistryCleanupResult> {
    const { data, error } = await supabaseAdmin
        .from("tenant_server_registry")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("last_seen_at", { ascending: false });

    if (error) throw error;

    const registryRows = (data as TenantTerminalRegistryEntry[]) || [];
    const collapsedRegistryRows = collapseRegistryRows(registryRows);
    const staleIds = collapsedRegistryRows.flatMap((entry) => entry.staleIds);

    if (staleIds.length > 0) {
        const { error: deleteError } = await supabaseAdmin
            .from("tenant_server_registry")
            .delete()
            .in("id", staleIds);

        if (deleteError) throw deleteError;
    }

    return {
        removed: staleIds.length,
        kept: collapsedRegistryRows.length,
        logical_terminals: collapsedRegistryRows.length,
    };
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
    cleanupTenantTerminalRegistry,
    getDashboardStats,
    suspendTenant,
    reactivateTenant,
};
