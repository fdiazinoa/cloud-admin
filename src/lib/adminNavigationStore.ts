import { createContext, useContext } from 'react';

export interface AdminNavigationContextValue {
    /** Módulo cuyo overlay está abierto (null = cerrado). Es estado visual, no ruta. */
    overlayModuleId: string | null;
    openOverlay: (moduleId: string) => void;
    closeOverlay: () => void;
    toggleOverlay: (moduleId: string) => void;
    pinned: boolean;
    togglePinned: () => void;
    favorites: string[];
    isFavorite: (path: string) => boolean;
    toggleFavorite: (path: string) => void;
    recents: string[];
    recordVisit: (path: string) => void;
}

export const AdminNavigationContext = createContext<AdminNavigationContextValue | null>(null);

export function useAdminNavigation(): AdminNavigationContextValue {
    const context = useContext(AdminNavigationContext);
    if (!context) {
        throw new Error('useAdminNavigation debe usarse dentro de <AdminNavigationProvider>.');
    }
    return context;
}
