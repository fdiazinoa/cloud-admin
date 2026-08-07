import { supabase } from './supabase';
import type { CustomerRegistryEntry, CustomerScheduledAction, CustomerService, CustomerServiceStatus, Tenant } from '../types';

export interface CustomerInput {
    email: string;
    name: string;
    companyName: string;
    phone: string;
    tenantId: string;
    hasRetainership: boolean;
    administrativeNotes: string;
    storeCreatedAt: string;
    serviceStartedAt: string;
    renewalAt: string;
    lastSuspendedAt: string;
}

export interface CustomerServiceInput {
    contactId: string;
    tenantId: string;
    serviceCode: string;
    serviceName: string;
    quantity: number;
    status: CustomerServiceStatus;
    startedAt: string;
    renewalAt: string;
    nextChargeAt: string;
    additionalCharge: number;
    scheduledAction: CustomerScheduledAction | '';
    scheduledActionAt: string;
    administrativeNotes: string;
}

async function invoke<T>(action: string, payload: Record<string, unknown> = {}) {
    const { data, error } = await supabase.functions.invoke('customer-registry-api', { body: { action, ...payload } });
    if (error) {
        let message = error.message;
        const context = error.context as Response | undefined;
        if (context?.clone) {
            const detail = await context.clone().json().catch(() => null) as { error?: string } | null;
            message = detail?.error || message;
        }
        throw new Error(message);
    }
    return data as T;
}

export function getCustomerRegistry() {
    return invoke<{ customers: CustomerRegistryEntry[]; tenants: Array<Pick<Tenant, 'id' | 'name' | 'status' | 'contracted_product' | 'max_pos_terminals' | 'max_erp_users'>> }>('overview');
}

export function saveCustomer(customerId: string | null, input: CustomerInput) {
    return invoke<{ customer: CustomerRegistryEntry }>('save_customer', {
        customer_id: customerId,
        fields: {
            email: input.email,
            name: input.name,
            company_name: input.companyName,
            phone: input.phone,
            tenant_id: input.tenantId,
            has_retainership: input.hasRetainership,
            administrative_notes: input.administrativeNotes,
            store_created_at: input.storeCreatedAt,
            service_started_at: input.serviceStartedAt,
            renewal_at: input.renewalAt,
            last_suspended_at: input.lastSuspendedAt,
        },
    });
}

export function saveCustomerService(serviceId: string | null, input: CustomerServiceInput) {
    return invoke<{ service: CustomerService }>('save_service', {
        service_id: serviceId,
        fields: {
            contact_id: input.contactId,
            tenant_id: input.tenantId,
            service_code: input.serviceCode,
            service_name: input.serviceName,
            quantity: input.quantity,
            status: input.status,
            started_at: input.startedAt,
            renewal_at: input.renewalAt,
            next_charge_at: input.nextChargeAt,
            additional_charge: input.additionalCharge,
            scheduled_action: input.scheduledAction,
            scheduled_action_at: input.scheduledActionAt,
            administrative_notes: input.administrativeNotes,
        },
    });
}

export function cancelCustomerService(serviceId: string) {
    return invoke<{ service: CustomerService }>('cancel_service', { service_id: serviceId });
}

export const customerRegistryService = { getCustomerRegistry, saveCustomer, saveCustomerService, cancelCustomerService };
