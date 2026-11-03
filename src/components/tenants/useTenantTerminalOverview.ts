import { useCallback, useEffect, useState } from 'react';
import type { TenantTerminalSnapshot } from '../../types';
import { tenantService, type TenantPosLicenseSeats } from '../../lib/tenantService';
import { getErrorMessage } from '../../lib/errorMessage';

interface TenantTerminalOverviewState {
    terminals: TenantTerminalSnapshot[] | null;
    seats: TenantPosLicenseSeats | null;
    loading: boolean;
    error: string | null;
    reload: () => Promise<void>;
}

/** Carga terminales y cupo POS del tenant (una vez por tenant). */
export const useTenantTerminalOverview = (tenantId: string): TenantTerminalOverviewState => {
    const [terminals, setTerminals] = useState<TenantTerminalSnapshot[] | null>(null);
    const [seats, setSeats] = useState<TenantPosLicenseSeats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const reload = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [overview, licenseSeats] = await Promise.all([
                tenantService.getTenantTerminalOverview(tenantId),
                tenantService.getTenantPosLicenseSeats(tenantId).catch(() => null),
            ]);
            setTerminals(overview);
            setSeats(licenseSeats);
        } catch (loadError: unknown) {
            console.error('Error loading tenant terminals:', loadError);
            setError(getErrorMessage(loadError));
        } finally {
            setLoading(false);
        }
    }, [tenantId]);

    useEffect(() => {
        setTerminals(null);
        setSeats(null);
        void reload();
    }, [reload]);

    return { terminals, seats, loading, error, reload };
};
