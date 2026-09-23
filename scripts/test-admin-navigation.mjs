import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [config, app, layout, rail, overlay, preferences, types] = await Promise.all([
    read('src/lib/adminNavigation.ts'),
    read('src/App.tsx'),
    read('src/components/Layout.tsx'),
    read('src/components/navigation/AdminNavigationRail.tsx'),
    read('src/components/navigation/AdminModuleOverlay.tsx'),
    read('src/lib/adminPreferences.ts'),
    read('src/types.ts'),
]);

// 1. Rail ocupa ~84px y es fijo en escritorio.
assert.ok(rail.includes('w-[84px]'), 'Rail must be 84px wide');
assert.ok(rail.includes('hidden') && rail.includes('md:flex'), 'Rail must be hidden on mobile and visible on desktop');

// 2. El overlay es flotante (absolute) y NO cambia el ancho del contenido.
assert.ok(overlay.includes('absolute'), 'Overlay must be absolutely positioned over content');
assert.ok(overlay.includes('left-[84px]'), 'Overlay must anchor to the 84px rail');
assert.ok(overlay.includes('z-40'), 'Overlay must layer above content');
assert.ok(overlay.includes('w-[300px]'), 'Overlay must use a fixed width (not stretch the content)');

// 3. Fuente única de navegación (sin duplicar el menú en Layout).
assert.ok(layout.includes('adminNavigationModules.filter((module) => allowed(module.permission))'), 'Layout must filter modules from the single config');
assert.ok(!layout.includes('navItems'), 'Layout must not keep a duplicated navItems array');

// 4. Búsqueda global ⌘K / Ctrl+K y cierre con Escape.
assert.ok(layout.includes('event.metaKey || event.ctrlKey'), 'Global search must bind ⌘K / Ctrl+K');
assert.ok(layout.includes("event.key.toLowerCase() === 'k'"), 'Global search must listen for the K key');
assert.ok(layout.includes("event.key !== 'Escape'"), 'Escape must close the overlay');

// 5. Cada ruta de la configuración existe en App.tsx y cada permiso en types.ts.
const paths = [...config.matchAll(/path: '([^']*)'/g)].map((match) => match[1]);
const permissions = [...config.matchAll(/permission: '([a-z_]+)'/g)].map((match) => match[1]);

assert.equal(paths.length, 12, 'Expected 12 navigation modules');
assert.equal(permissions.length, 12, 'Expected 12 module permissions');
assert.equal(new Set(paths).size, paths.length, 'Navigation paths must be unique');

const routeByPath = {
    '/': 'index element',
    '/tenants': 'path="tenants"',
    '/clientes': 'path="clientes"',
    '/plans': 'path="plans"',
    '/pos-apk': 'path="pos-apk"',
    '/support': 'path="support"',
    '/calendario': 'path="calendario"',
    '/solicitudes': 'path="solicitudes"',
    '/configuracion': 'path="configuracion"',
    '/observabilidad': 'path="observabilidad"',
    '/accesos': 'path="accesos"',
    '/kill-switch': 'path="kill-switch"',
};

for (const path of paths) {
    const marker = routeByPath[path];
    assert.ok(marker, `No route marker defined for ${path}`);
    assert.ok(app.includes(marker), `App.tsx is missing the route for ${path}`);
}

for (const permission of permissions) {
    assert.ok(types.includes(`'${permission}'`), `types.ts is missing permission ${permission}`);
}

// 6. Módulo sensible (Kill Switch) marcado para excluirse de recientes.
assert.ok(/id: 'kill-switch'[\s\S]*?sensitive: true/.test(config), 'Kill Switch must be marked as sensitive');

// 7. La navegación no incluye rutas eliminadas del menú (p. ej. conocimiento).
assert.ok(!config.includes("'/conocimiento'"), 'Navigation config must not include the removed Manuales module');

// 8. Persistencia de favoritos/recientes reutilizable.
assert.ok(preferences.includes('localStorage'), 'Preferences must persist to localStorage');
assert.ok(preferences.includes('RECENTS_LIMIT'), 'Preferences must cap the recents list');
assert.ok(preferences.includes('favorites'), 'Preferences must store favorites');

// 9. Accesibilidad: respeta reduced-motion y expone estados accesibles.
assert.ok((rail + overlay).includes('motion-reduce'), 'Navigation must respect prefers-reduced-motion');
assert.ok(rail.includes('aria-expanded'), 'Rail buttons must expose aria-expanded');
assert.ok(rail.includes('aria-current'), 'Rail buttons must expose aria-current');

// 10. Agrupación del Rail: secciones con leyenda y nombre bajo cada icono.
assert.ok(config.includes("group: 'inicio'"), 'Navigation config must have the inicio group');
assert.ok(config.includes("group: 'operacion'"), 'Navigation config must have the operacion group');
assert.ok(config.includes("group: 'clientes'"), 'Navigation config must have the clientes group');
assert.ok(config.includes("group: 'administracion'"), 'Navigation config must have the administracion group');
assert.ok(config.includes("group: 'seguridad'"), 'Navigation config must have the seguridad group');
assert.ok(config.includes('adminNavigationGroupLabels'), 'Navigation config must declare group labels');
assert.equal((config.match(/shortLabel: '/g) || []).length, 12, 'All 12 modules must declare a short label');
assert.ok(rail.includes('adminNavigationGroupOrder'), 'Rail must group by adminNavigationGroupOrder');
assert.ok(rail.includes('adminNavigationGroupLabels'), 'Rail must render section headers');
assert.ok(rail.includes('shortLabel'), 'Rail must render the short label under every icon');

console.log('Admin navigation contracts: OK');
