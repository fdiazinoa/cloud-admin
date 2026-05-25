import { supabase, supabaseAdmin, supabaseProjectUrl, supabaseServiceRoleKey } from "./supabase";
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
    totalTenants: number;
    activeTenants: number;
    trialTenants: number;
    suspendedTenants: number;
    terminals: number;
    activeSubscriptions: number;
    openTickets: number;
    criticalTickets: number;
    tenantGrowth: DashboardTrendPoint[];
    recentTickets: DashboardTicket[];
    expiringSubscriptions: DashboardExpiringSubscription[];
    supportSatisfaction: DashboardSupportSatisfaction;
    lastUpdatedAt: string;
}

export interface DashboardSupportSatisfaction {
    totalResponses: number;
    excellent: DashboardSatisfactionBucket;
    good: DashboardSatisfactionBucket;
    bad: DashboardSatisfactionBucket;
}

export interface DashboardSatisfactionBucket {
    count: number;
    percentage: number;
}

export interface DashboardTrendPoint {
    name: string;
    value: number;
}

export interface DashboardTicket {
    id: string;
    subject: string;
    priority: string;
    status: string;
    tenantName: string;
    createdAt: string;
}

export interface DashboardExpiringSubscription {
    tenantId: string;
    tenantName: string;
    planName: string;
    endDate: string;
    daysRemaining: number;
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

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asText(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function normalizeKey(value: unknown): string {
    return asText(value).toUpperCase();
}

async function loadErpTerminalBindings(tenantId: string): Promise<Map<string, string>> {
    try {
        const { data: erpTenant, error: erpTenantError } = await supabaseAdmin
            .schema("public")
            .from("erp_tenants")
            .select("id")
            .eq("config->>cloudAdminTenantId", tenantId)
            .maybeSingle();

        if (erpTenantError) {
            console.warn("ERP tenant lookup unavailable for terminal binding status:", erpTenantError);
            return new Map();
        }

        const erpTenantId = (erpTenant as { id?: string } | null)?.id;
        if (!erpTenantId) return new Map();

        const { data: stores, error: storesError } = await supabaseAdmin
            .schema("public")
            .from("erp_stores")
            .select("id")
            .eq("tenant_id", erpTenantId);

        if (storesError) {
            console.warn("ERP store lookup unavailable for terminal binding status:", storesError);
            return new Map();
        }

        const storeIds = ((stores as Array<{ id?: string }> | null) || [])
            .map((store) => store.id)
            .filter((id): id is string => Boolean(id));

        if (storeIds.length === 0) return new Map();

        const { data: terminals, error: terminalsError } = await supabaseAdmin
            .schema("public")
            .from("erp_terminals")
            .select("id,device_id,name,config,last_seen,created_at")
            .in("store_id", storeIds);

        if (terminalsError) {
            console.warn("ERP terminal lookup unavailable for terminal binding status:", terminalsError);
            return new Map();
        }

        const bindings = new Map<string, string>();
        for (const terminal of ((terminals as Array<Record<string, unknown>> | null) || [])) {
            const deviceId = asText(terminal.device_id);
            if (!deviceId) continue;

            const config = asRecord(terminal.config);
            const metadata = asRecord(config.metadata);
            [
                terminal.id,
                metadata.terminal_id,
                metadata.erp_terminal_id,
            ].forEach((candidate) => {
                const key = normalizeKey(candidate);
                if (key) bindings.set(key, deviceId);
            });
        }

        return bindings;
    } catch (error) {
        console.warn("ERP terminal binding status lookup failed:", error);
        return new Map();
    }
}

function applyRegistryBindingStatus(
    registries: TenantTerminalRegistryEntry[],
    bindings: Map<string, string>,
): TenantTerminalRegistryEntry[] {
    if (bindings.size === 0) return registries;

    return registries.map((registry) => {
        const lookupKeys = [
            registry.terminal_id,
            registry.terminal_name,
            registry.device_id,
        ].map(normalizeKey).filter(Boolean);

        const authorizedDeviceId = lookupKeys
            .map((key) => bindings.get(key))
            .find((value): value is string => Boolean(value));

        const isRevoked = Boolean(
            authorizedDeviceId
            && registry.device_id
            && normalizeKey(registry.device_id) !== normalizeKey(authorizedDeviceId)
        );

        return {
            ...registry,
            authorized_device_id: authorizedDeviceId || registry.authorized_device_id || null,
            is_revoked: isRevoked,
        };
    });
}

export interface RequestTerminalTakeoverInput {
    tenantId: string;
    terminalId: string;
    registryId?: string | null;
    newDeviceId: string;
    deviceName?: string;
    reason: string;
    confirmTakeover: boolean;
}

export interface TerminalTakeoverResult {
    status: string;
    terminal?: unknown;
    previous_device_id?: string | null;
    new_device_id?: string;
    requires_auth?: boolean;
    message?: string;
}

export interface RequestTerminalLocalRebuildInput {
    tenantId: string;
    terminalId: string;
    registryId?: string | null;
    reason: string;
    confirmRebuild: boolean;
}

export interface TerminalLocalRebuildResult {
    status: string;
    terminal?: unknown;
    device_id?: string | null;
    requires_full_bootstrap?: boolean;
    message?: string;
}

export interface RequestTerminalErpReadinessInput {
    tenantId: string;
    terminalId: string;
    registryId?: string | null;
    deviceId: string;
    terminalName?: string | null;
}

export interface TerminalErpReadinessResult {
    status: string;
    erpTenantId?: string | null;
    companyId?: string | null;
    storeId?: string | null;
    terminalId?: string | null;
    profileStatus?: string | null;
    checks?: Record<string, unknown>;
    erp_readiness?: Record<string, unknown>;
    message?: string;
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

    registryRows = applyRegistryBindingStatus(registryRows, await loadErpTerminalBindings(tenantId));

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

export async function requestTerminalTakeover(input: RequestTerminalTakeoverInput): Promise<TerminalTakeoverResult> {
    const response = await fetch("/api/terminal-takeover", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${supabaseServiceRoleKey}`,
            "Content-Type": "application/json",
            "X-Actor-Source": "cloud-admin-ui",
        },
        body: JSON.stringify({
            tenant_id: input.tenantId,
            terminal_id: input.terminalId,
            registry_id: input.registryId || null,
            device_id: input.newDeviceId,
            device_name: input.deviceName || null,
            reason: input.reason,
            confirm_takeover: input.confirmTakeover,
        }),
    });

    const payload = await response.json().catch(() => null) as { message?: string; error?: string } | null;

    if (!response.ok) {
        throw new Error(payload?.message || payload?.error || "No se pudo ejecutar la recuperacion de terminal.");
    }

    return (payload || { status: "success" }) as TerminalTakeoverResult;
}

export async function requestTerminalLocalRebuild(input: RequestTerminalLocalRebuildInput): Promise<TerminalLocalRebuildResult> {
    const endpoint = `${supabaseProjectUrl.replace(/\/$/, "")}/functions/v1/request-terminal-local-rebuild`;
    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${supabaseServiceRoleKey}`,
            "Content-Type": "application/json",
            "X-Actor-Source": "cloud-admin-ui",
        },
        body: JSON.stringify({
            tenant_id: input.tenantId,
            terminal_id: input.terminalId,
            registry_id: input.registryId || null,
            reason: input.reason,
            confirm_rebuild: input.confirmRebuild,
        }),
    });

    const payload = await response.json().catch(() => null) as { message?: string; error?: string } | null;

    if (!response.ok) {
        throw new Error(payload?.message || payload?.error || "No se pudo preparar la reconstruccion local del POS.");
    }

    return (payload || { status: "success" }) as TerminalLocalRebuildResult;
}

export async function requestTerminalErpReadiness(input: RequestTerminalErpReadinessInput): Promise<TerminalErpReadinessResult> {
    const endpoint = `${supabaseProjectUrl.replace(/\/$/, "")}/functions/v1/request-pos-erp-readiness`;
    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${supabaseServiceRoleKey}`,
            "Content-Type": "application/json",
            "X-Actor-Source": "cloud-admin-ui",
        },
        body: JSON.stringify({
            tenant_id: input.tenantId,
            terminal_id: input.terminalId,
            registry_id: input.registryId || null,
            device_id: input.deviceId,
            terminal_name: input.terminalName || null,
        }),
    });

    const payload = await response.json().catch(() => null) as { message?: string; error?: string } | null;

    if (!response.ok) {
        throw new Error(payload?.message || payload?.error || "No se pudo preparar el contexto ERP del POS.");
    }

    return (payload || { status: "pending" }) as TerminalErpReadinessResult;
}

export async function getDashboardStats(): Promise<DashboardStats> {
    const [tenantsRes, terminalsRes, subscriptionRows, ticketRows] = await Promise.all([
        supabaseAdmin.from("tenants").select("id,name,status,created_at"),
        supabaseAdmin.schema("public").from("terminals").select("id", { count: "exact", head: true }),
        getDashboardSubscriptions(),
        getDashboardTickets(),
    ]);

    if (tenantsRes.error) throw tenantsRes.error;
    if (terminalsRes.error) throw terminalsRes.error;

    const tenantRows = ((tenantsRes.data as Array<Pick<Tenant, "id" | "name" | "status" | "created_at">>) || []);
    const tenantsById = new Map(tenantRows.map((tenant) => [tenant.id, tenant]));
    const activeTenants = tenantRows.filter((tenant) => tenant.status === "ACTIVE").length;
    const trialTenants = tenantRows.filter((tenant) => tenant.status === "TRIAL").length;
    const suspendedTenants = tenantRows.filter((tenant) => tenant.status === "SUSPENDED").length;
    const today = startOfDay(new Date());
    const activeSubscriptions = subscriptionRows.filter((subscription) => subscription.is_active).length;
    const expiringSubscriptions = subscriptionRows
        .filter((subscription) => subscription.is_active && Boolean(subscription.end_date))
        .map((subscription) => {
            const endDate = startOfDay(new Date(subscription.end_date as string));
            const daysRemaining = Math.ceil((endDate.getTime() - today.getTime()) / 86400000);
            const tenant = tenantsById.get(subscription.tenant_id);

            return {
                tenantId: subscription.tenant_id,
                tenantName: tenant?.name || "Tenant no identificado",
                planName: subscription.plan_name || "Plan activo",
                endDate: subscription.end_date as string,
                daysRemaining,
            };
        })
        .filter((subscription) => subscription.daysRemaining >= 0 && subscription.daysRemaining <= 30)
        .sort((a, b) => a.daysRemaining - b.daysRemaining)
        .slice(0, 5);
    const openTickets = ticketRows.filter((ticket) => !["Cerrado", "Resuelto"].includes(ticket.status)).length;
    const criticalTickets = ticketRows.filter((ticket) => {
        const isOpen = !["Cerrado", "Resuelto"].includes(ticket.status);
        return isOpen && ticket.priority.toLowerCase().startsWith("cr");
    }).length;
    const recentTickets = ticketRows
        .slice(0, 5)
        .map((ticket) => ({
            id: ticket.id,
            subject: ticket.subject,
            priority: ticket.priority,
            status: ticket.status,
            tenantName: ticket.tenant_id ? tenantsById.get(ticket.tenant_id)?.name || "Sin tenant asignado" : "Sin tenant asignado",
            createdAt: ticket.created_at,
        }));

    return {
        totalTenants: tenantRows.length,
        activeTenants,
        trialTenants,
        suspendedTenants,
        terminals: terminalsRes.count || 0,
        activeSubscriptions,
        openTickets,
        criticalTickets,
        tenantGrowth: buildTenantGrowth(tenantRows),
        recentTickets,
        expiringSubscriptions,
        supportSatisfaction: buildSupportSatisfaction(ticketRows),
        lastUpdatedAt: new Date().toISOString(),
    };
}

function startOfDay(value: Date): Date {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

type DashboardSubscriptionRow = {
    tenant_id: string;
    is_active: boolean;
    end_date?: string | null;
    plan_name?: string | null;
};

type DashboardTicketRow = {
    id: string;
    subject: string;
    priority: string;
    status: string;
    tenant_id?: string | null;
    customer_rating?: number | null;
    created_at: string;
};

async function getDashboardSubscriptions(): Promise<DashboardSubscriptionRow[]> {
    const { data, error } = await supabaseAdmin
        .from("subscriptions")
        .select("tenant_id,is_active,end_date,plan_name");

    if (!error) return (data as DashboardSubscriptionRow[]) || [];

    const code = (error as { code?: string }).code;
    if (code !== "42703" && code !== "PGRST204") {
        console.warn("Dashboard subscriptions unavailable:", error);
        return [];
    }

    const fallback = await supabaseAdmin
        .from("subscriptions")
        .select("tenant_id,is_active,plan_name");

    if (fallback.error) {
        console.warn("Dashboard subscriptions fallback unavailable:", fallback.error);
        return [];
    }

    return ((fallback.data as DashboardSubscriptionRow[]) || []).map((subscription) => ({
        ...subscription,
        end_date: null,
    }));
}

async function getDashboardTickets(): Promise<DashboardTicketRow[]> {
    const { data, error } = await supabaseAdmin
        .from("support_tickets")
        .select("id,subject,priority,status,tenant_id,customer_rating,created_at")
        .order("created_at", { ascending: false });

    if (error) {
        console.warn("Dashboard support tickets unavailable:", error);
        return [];
    }

    return (data as DashboardTicketRow[]) || [];
}

function buildSupportSatisfaction(tickets: DashboardTicketRow[]): DashboardSupportSatisfaction {
    const ratings = tickets
        .map((ticket) => ticket.customer_rating)
        .filter((rating): rating is number => typeof rating === "number" && rating >= 1 && rating <= 5);
    const totalResponses = ratings.length;
    const excellent = ratings.filter((rating) => rating === 5).length;
    const good = ratings.filter((rating) => rating >= 3 && rating <= 4).length;
    const bad = ratings.filter((rating) => rating <= 2).length;

    const percentage = (count: number) => totalResponses ? Math.round((count / totalResponses) * 100) : 0;

    return {
        totalResponses,
        excellent: {
            count: excellent,
            percentage: percentage(excellent),
        },
        good: {
            count: good,
            percentage: percentage(good),
        },
        bad: {
            count: bad,
            percentage: percentage(bad),
        },
    };
}

function buildTenantGrowth(tenants: Array<Pick<Tenant, "created_at">>): DashboardTrendPoint[] {
    const formatter = new Intl.DateTimeFormat("es-DO", { month: "short" });
    const now = new Date();
    const buckets: DashboardTrendPoint[] = [];

    for (let index = 5; index >= 0; index -= 1) {
        const month = new Date(now.getFullYear(), now.getMonth() - index, 1);
        buckets.push({
            name: formatter.format(month).replace(".", ""),
            value: 0,
        });
    }

    tenants.forEach((tenant) => {
        const createdAt = new Date(tenant.created_at);
        const diffMonths = (now.getFullYear() - createdAt.getFullYear()) * 12 + now.getMonth() - createdAt.getMonth();

        if (diffMonths >= 0 && diffMonths < buckets.length) {
            buckets[buckets.length - 1 - diffMonths].value += 1;
        }
    });

    return buckets;
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

export async function registerTenantServerEndpoint(payload: {
    tenantId: string;
    deviceId: string;
    terminalId: string;
    terminalName?: string;
    hostname?: string;
    protocol?: string;
    port?: number;
    localIp: string;
    localIps?: string[];
    endpointUrl?: string;
    isPrimary?: boolean;
    appVersion?: string;
    appVersionCode?: number;
}): Promise<void> {
    const { error } = await supabaseAdmin.rpc("register_tenant_server_endpoint", {
        p_tenant_id: payload.tenantId,
        p_device_id: payload.deviceId,
        p_terminal_id: payload.terminalId,
        p_terminal_name: payload.terminalName || null,
        p_hostname: payload.hostname || null,
        p_protocol: payload.protocol || 'http',
        p_port: payload.port || 3001,
        p_local_ip: payload.localIp,
        p_local_ips: payload.localIps || [payload.localIp],
        p_endpoint_url: payload.endpointUrl || null,
        p_is_primary: payload.isPrimary !== false,
        p_app_version: payload.appVersion || null,
        p_app_version_code: payload.appVersionCode || null,
        p_status: 'ONLINE',
        p_last_seen_at: new Date().toISOString()
    });

    if (error) throw error;
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
    requestTerminalTakeover,
    requestTerminalLocalRebuild,
    requestTerminalErpReadiness,
    getDashboardStats,
    suspendTenant,
    reactivateTenant,
    updateTenantCredentials,
    toggleTerminalActiveStatus,
    registerTenantServerEndpoint,
};
