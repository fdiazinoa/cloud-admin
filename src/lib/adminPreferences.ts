/**
 * Preferencias de navegación por usuario.
 *
 * Persistencia actual: `localStorage`, con claves por usuario para que los
 * favoritos, recientes y el estado "fijado" sean personales.
 *
 * PENDIENTE DE BACKEND: no existe un endpoint de preferencias. Cuando exista,
 * conectar aquí (p. ej. `cloud_admin_user_preferences`) y reemplazar la lectura
 * asíncrona manteniendo la misma interfaz (`loadPreferences` / `savePreferences`).
 * No inventar endpoints: esta abstracción es el único punto a modificar.
 */

const STORAGE_PREFIX = 'cloud-admin:navigation';

export interface AdminNavigationPreferences {
    /** Rutas marcadas como favoritas (ordenadas por preferencia). */
    favorites: string[];
    /** Rutas visitadas recientemente (más reciente primero, pocas entradas). */
    recents: string[];
    /** Si el panel contextual está fijado (solo aplica en pantallas >= 1440px). */
    pinned: boolean;
}

const DEFAULT_PREFERENCES: AdminNavigationPreferences = {
    favorites: [],
    recents: [],
    pinned: false,
};

export const RECENTS_LIMIT = 6;

function safeParse(value: string | null): Partial<AdminNavigationPreferences> {
    if (!value) return {};
    try {
        const parsed = JSON.parse(value) as Partial<AdminNavigationPreferences>;
        return {
            favorites: Array.isArray(parsed.favorites) ? parsed.favorites.filter((item): item is string => typeof item === 'string') : [],
            recents: Array.isArray(parsed.recents) ? parsed.recents.filter((item): item is string => typeof item === 'string') : [],
            pinned: typeof parsed.pinned === 'boolean' ? parsed.pinned : false,
        };
    } catch {
        return {};
    }
}

function storageKey(userKey: string): string {
    return `${STORAGE_PREFIX}:${userKey}`;
}

export function loadPreferences(userKey: string): AdminNavigationPreferences {
    if (typeof window === 'undefined') return { ...DEFAULT_PREFERENCES };
    try {
        const raw = window.localStorage.getItem(storageKey(userKey));
        return { ...DEFAULT_PREFERENCES, ...safeParse(raw) };
    } catch {
        return { ...DEFAULT_PREFERENCES };
    }
}

export function savePreferences(userKey: string, preferences: AdminNavigationPreferences): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(storageKey(userKey), JSON.stringify(preferences));
    } catch {
        // Almacenamiento no disponible (modo privado, cuota, etc.). No bloquear la UI.
    }
}
