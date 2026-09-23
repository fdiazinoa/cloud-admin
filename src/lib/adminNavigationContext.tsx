import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { isSensitivePath } from './adminNavigation';
import {
    loadPreferences,
    savePreferences,
    RECENTS_LIMIT,
    type AdminNavigationPreferences,
} from './adminPreferences';
import { AdminNavigationContext, type AdminNavigationContextValue } from './adminNavigationStore';

export function AdminNavigationProvider({ userKey, children }: { userKey: string; children: ReactNode }) {
    const [preferences, setPreferences] = useState<AdminNavigationPreferences>(() => loadPreferences(userKey));
    const [overlayModuleId, setOverlayModuleId] = useState<string | null>(null);

    useEffect(() => {
        savePreferences(userKey, preferences);
    }, [userKey, preferences]);

    const openOverlay = useCallback((moduleId: string) => setOverlayModuleId(moduleId), []);
    const closeOverlay = useCallback(() => setOverlayModuleId(null), []);
    const toggleOverlay = useCallback((moduleId: string) => {
        setOverlayModuleId((current) => (current === moduleId ? null : moduleId));
    }, []);

    const togglePinned = useCallback(() => {
        setPreferences((current) => ({ ...current, pinned: !current.pinned }));
    }, []);

    const isFavorite = useCallback((path: string) => preferences.favorites.includes(path), [preferences.favorites]);

    const toggleFavorite = useCallback((path: string) => {
        setPreferences((current) => {
            const favorites = current.favorites.includes(path)
                ? current.favorites.filter((item) => item !== path)
                : [path, ...current.favorites];
            return { ...current, favorites };
        });
    }, []);

    const recordVisit = useCallback((path: string) => {
        if (!path || isSensitivePath(path)) return;
        setPreferences((current) => {
            const recents = [path, ...current.recents.filter((item) => item !== path)].slice(0, RECENTS_LIMIT);
            return { ...current, recents };
        });
    }, []);

    const value = useMemo<AdminNavigationContextValue>(() => ({
        overlayModuleId,
        openOverlay,
        closeOverlay,
        toggleOverlay,
        pinned: preferences.pinned,
        togglePinned,
        favorites: preferences.favorites,
        isFavorite,
        toggleFavorite,
        recents: preferences.recents,
        recordVisit,
    }), [overlayModuleId, openOverlay, closeOverlay, toggleOverlay, preferences.pinned, preferences.favorites, preferences.recents, togglePinned, isFavorite, toggleFavorite, recordVisit]);

    return (
        <AdminNavigationContext.Provider value={value}>
            {children}
        </AdminNavigationContext.Provider>
    );
}
