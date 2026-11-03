export const buildTenantSlug = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
