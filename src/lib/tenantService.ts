import { supabase, supabaseAdmin, supabaseProjectUrl, supabaseServiceRoleKey } from "./supabase";
import type {
    Distributor,
    Tenant,
    TenantTerminalRegistryEntry,
    TenantTerminalSnapshot,
    TenantType,
    Terminal,
} from "../types";

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

function normalizeOptional(value?: string): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
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

    const registryByTerminalId = new Map<string, TenantTerminalRegistryEntry>();
    const registryByDeviceId = new Map<string, TenantTerminalRegistryEntry>();
    const matchedRegistryIds = new Set<string>();

    for (const row of registryRows) {
        if (row.terminal_id && !registryByTerminalId.has(row.terminal_id)) {
            registryByTerminalId.set(row.terminal_id, row);
        }
        if (row.device_id && !registryByDeviceId.has(row.device_id)) {
            registryByDeviceId.set(row.device_id, row);
        }
    }

    const snapshots: TenantTerminalSnapshot[] = ((terminalsRes.data as Terminal[]) || []).map((terminal) => {
        const registry = registryByTerminalId.get(terminal.id) || registryByDeviceId.get(terminal.device_token) || null;
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
            registry,
        };
    });

    for (const row of registryRows) {
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
            registry: row,
        });
    }

    return snapshots;
}

export async function requestTerminalTakeover(input: RequestTerminalTakeoverInput): Promise<TerminalTakeoverResult> {
    const endpoint = `${supabaseProjectUrl.replace(/\/$/, "")}/functions/v1/request-terminal-takeover`;
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
    getDashboardStats,
    suspendTenant,
    reactivateTenant,
};
