create index if not exists customer_services_tenant_idx
  on landlord.customer_services(tenant_id)
  where tenant_id is not null;
