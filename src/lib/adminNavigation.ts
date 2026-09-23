import {
    Activity,
    BadgeDollarSign,
    Building2,
    CalendarDays,
    ClipboardList,
    Headset,
    LayoutDashboard,
    Settings,
    ShieldPlus,
    Smartphone,
    UserCog,
    Users,
    type LucideIcon,
} from 'lucide-react';
import type { CloudAdminPermissionKey } from '../types';

/**
 * Fuente única de navegación de Cloud-Admin.
 *
 * Cada módulo se corresponde con una pantalla real existente en `App.tsx`.
 * No se inventan rutas ni permisos: el `path` y `permission` de cada módulo
 * coinciden con los `<Route>` y `PermissionGate` ya definidos.
 *
 * `items` permite declarar pantallas secundarias de un mismo módulo cuando
 * existan (hoy cada módulo tiene una sola pantalla, por lo que la lista queda
 * vacía y el overlay expone la pantalla principal del módulo).
 */
export interface AdminNavigationItem {
    /** Identificador estable, único dentro de todo el árbol. */
    id: string;
    label: string;
    path: string;
    /** Palabras clave adicionales para la búsqueda dentro del módulo. */
    keywords?: string[];
    /** Las rutas sensibles se excluyen de "recientes" y no se abren como acción directa. */
    sensitive?: boolean;
}

export interface AdminNavigationModule {
    id: string;
    label: string;
    description: string;
    /** Ruta principal del módulo (la que determina el módulo activo). */
    path: string;
    icon: LucideIcon;
    permission: CloudAdminPermissionKey;
    keywords?: string[];
    sensitive?: boolean;
    items?: AdminNavigationItem[];
}

export const adminNavigationModules: AdminNavigationModule[] = [
    {
        id: 'dashboard',
        label: 'Dashboard',
        description: 'Resumen operativo y métricas de Cloud-Admin.',
        path: '/',
        icon: LayoutDashboard,
        permission: 'dashboard_view',
        keywords: ['inicio', 'home', 'métricas', 'resumen', 'altas', 'operación'],
    },
    {
        id: 'tenants',
        label: 'Tenants',
        description: 'Empresas y cuentas de tenants registradas en la plataforma.',
        path: '/tenants',
        icon: Users,
        permission: 'tenants_view',
        keywords: ['empresas', 'cuentas', 'suscripciones', 'alta', 'tenant'],
    },
    {
        id: 'clientes',
        label: 'Clientes',
        description: 'Registro de clientes, contactos y servicios activos.',
        path: '/clientes',
        icon: Building2,
        permission: 'tenants_view',
        keywords: ['contactos', 'servicios', 'sucursales', 'registro', 'cliente'],
    },
    {
        id: 'plans',
        label: 'Planes SaaS',
        description: 'Planes, precios y condiciones de suscripción.',
        path: '/plans',
        icon: BadgeDollarSign,
        permission: 'plans_view',
        keywords: ['precios', 'suscripciones', 'licencias', 'plan', 'facturación'],
    },
    {
        id: 'pos-apk',
        label: 'APK POS',
        description: 'Versiones, publicación y distribución del APK POS.',
        path: '/pos-apk',
        icon: Smartphone,
        permission: 'apk_view',
        keywords: ['android', 'versión', 'publicar', 'descargas', 'terminales', 'apk'],
    },
    {
        id: 'support',
        label: 'Helpdesk & Soporte',
        description: 'Bandeja de tickets y conversaciones de soporte.',
        path: '/support',
        icon: Headset,
        permission: 'support_view',
        keywords: ['tickets', 'bandeja', 'soporte', 'correo', 'helpdesk', 'conversaciones'],
    },
    {
        id: 'calendario',
        label: 'Implementaciones',
        description: 'Calendario y agenda de implementaciones.',
        path: '/calendario',
        icon: CalendarDays,
        permission: 'calendar_view',
        keywords: ['agenda', 'calendario', 'reuniones', 'implementación', 'onboarding'],
    },
    {
        id: 'solicitudes',
        label: 'Solicitudes',
        description: 'Solicitudes internas y mejoras de producto.',
        path: '/solicitudes',
        icon: ClipboardList,
        permission: 'internal_requests_view',
        keywords: ['mejoras', 'internas', 'producto', 'solicitud', 'requerimientos'],
    },
    {
        id: 'configuracion',
        label: 'Configuración',
        description: 'Parámetros y configuración de Cloud-Admin.',
        path: '/configuracion',
        icon: Settings,
        permission: 'settings_view',
        keywords: ['parámetros', 'ajustes', 'preferencias', 'integración', 'configurar'],
    },
    {
        id: 'observabilidad',
        label: 'Observabilidad',
        description: 'Monitoreo, eventos y observabilidad de la plataforma.',
        path: '/observabilidad',
        icon: Activity,
        permission: 'observability_view',
        keywords: ['monitoreo', 'eventos', 'logs', 'salud', 'métricas', 'operación'],
    },
    {
        id: 'accesos',
        label: 'Usuarios y perfiles',
        description: 'Usuarios administradores, perfiles y permisos.',
        path: '/accesos',
        icon: UserCog,
        permission: 'users_view',
        keywords: ['usuarios', 'perfiles', 'permisos', 'accesos', 'roles'],
    },
    {
        id: 'kill-switch',
        label: 'Kill Switch',
        description: 'Controles de seguridad críticos de la plataforma.',
        path: '/kill-switch',
        icon: ShieldPlus,
        permission: 'kill_switch_execute',
        keywords: ['seguridad', 'bloqueo', 'crítico', 'emergencia'],
        sensitive: true,
    },
];

function normalizePath(path: string): string {
    if (path === '/' || path === '') return '/';
    return path.replace(/\/+$/, '');
}

/** Devuelve el módulo cuya ruta (o la de sus items) coincide con `pathname`. */
export function findActiveModule(pathname: string): AdminNavigationModule | null {
    const normalized = normalizePath(pathname);
    return adminNavigationModules.find((module) => {
        if (normalizePath(module.path) === normalized) return true;
        return module.items?.some((item) => normalizePath(item.path) === normalized) ?? false;
    }) ?? null;
}

export interface NavigationEntry {
    label: string;
    moduleLabel: string;
    description: string;
    path: string;
    sensitive: boolean;
}

/** Devuelve los datos de navegación de una ruta (para favoritos, recientes y búsqueda). */
export function getNavigationEntry(path: string): NavigationEntry | null {
    const normalized = normalizePath(path);
    for (const module of adminNavigationModules) {
        if (normalizePath(module.path) === normalized) {
            return {
                label: module.label,
                moduleLabel: module.label,
                description: module.description,
                path: module.path,
                sensitive: Boolean(module.sensitive),
            };
        }
        for (const item of module.items ?? []) {
            if (normalizePath(item.path) === normalized) {
                return {
                    label: item.label,
                    moduleLabel: module.label,
                    description: module.description,
                    path: item.path,
                    sensitive: Boolean(item.sensitive || module.sensitive),
                };
            }
        }
    }
    return null;
}

/** Indica si una ruta pertenece a un módulo o item marcado como sensible. */
export function isSensitivePath(path: string): boolean {
    const normalized = normalizePath(path);
    for (const module of adminNavigationModules) {
        if (normalizePath(module.path) === normalized) return Boolean(module.sensitive);
        for (const item of module.items ?? []) {
            if (normalizePath(item.path) === normalized) return Boolean(item.sensitive || module.sensitive);
        }
    }
    return false;
}

export interface AdminNavigationSearchResult {
    kind: 'module' | 'item';
    moduleId: string;
    label: string;
    description: string;
    path: string;
    keywords: string[];
    sensitive: boolean;
}

function tokenize(value: string): string[] {
    return value.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter(Boolean);
}

/** Busca módulos e items que coincidan con la consulta y que respeten los permisos. */
export function searchNavigation(
    query: string,
    allowed: (permission: CloudAdminPermissionKey) => boolean,
): AdminNavigationSearchResult[] {
    const terms = tokenize(query);
    if (!terms.length) return [];

    const results: AdminNavigationSearchResult[] = [];
    for (const module of adminNavigationModules) {
        if (!allowed(module.permission)) continue;

        const moduleHaystack = tokenize(
            [module.label, module.description, ...(module.keywords ?? [])].join(' '),
        );
        const moduleMatches = terms.every((term) => moduleHaystack.some((token) => token.includes(term)));

        if (moduleMatches) {
            results.push({
                kind: 'module',
                moduleId: module.id,
                label: module.label,
                description: module.description,
                path: module.path,
                keywords: module.keywords ?? [],
                sensitive: Boolean(module.sensitive),
            });
        }

        for (const item of module.items ?? []) {
            const itemHaystack = tokenize([item.label, ...(item.keywords ?? [])].join(' '));
            if (terms.every((term) => itemHaystack.some((token) => token.includes(term)))) {
                results.push({
                    kind: 'item',
                    moduleId: module.id,
                    label: item.label,
                    description: module.description,
                    path: item.path,
                    keywords: [...(module.keywords ?? []), ...(item.keywords ?? [])],
                    sensitive: Boolean(item.sensitive || module.sensitive),
                });
            }
        }
    }
    return results;
}

export { tokenize };
