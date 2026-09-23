import { useMemo, useState } from 'react';
import { ChevronRight, Pin, PinOff, Search, Star, X } from 'lucide-react';
import type { AdminNavigationModule } from '../../lib/adminNavigation';
import { tokenize } from '../../lib/adminNavigation';

interface OverlayItem {
    id: string;
    label: string;
    path: string;
    keywords: string[];
    sensitive: boolean;
}

function matchesQuery(item: OverlayItem, query: string): boolean {
    const terms = tokenize(query);
    if (!terms.length) return true;
    const haystack = tokenize([item.label, ...item.keywords].join(' '));
    return terms.every((term) => haystack.some((token) => token.includes(term)));
}

interface AdminModuleOverlayProps {
    module: AdminNavigationModule | null;
    activePath: string;
    isFavorite: (path: string) => boolean;
    toggleFavorite: (path: string) => void;
    pinned: boolean;
    onTogglePin: () => void;
    onClose: () => void;
    onNavigate: (path: string) => void;
}

export function AdminModuleOverlay({
    module,
    activePath,
    isFavorite,
    toggleFavorite,
    pinned,
    onTogglePin,
    onClose,
    onNavigate,
}: AdminModuleOverlayProps) {
    const [query, setQuery] = useState('');

    const items = useMemo<OverlayItem[]>(() => {
        if (!module) return [];
        return [
            {
                id: module.id,
                label: module.label,
                path: module.path,
                keywords: module.keywords ?? [],
                sensitive: Boolean(module.sensitive),
            },
            ...(module.items ?? []).map((item) => ({
                id: item.id,
                label: item.label,
                path: item.path,
                keywords: [...(module.keywords ?? []), ...(item.keywords ?? [])],
                sensitive: Boolean(item.sensitive || module.sensitive),
            })),
        ];
    }, [module]);

    const filteredItems = useMemo(() => items.filter((item) => matchesQuery(item, query)), [items, query]);

    if (!module) return null;

    return (
        <aside
            id="admin-module-overlay"
            role="dialog"
            aria-label={`Menú de ${module.label}`}
            className={`absolute bottom-0 left-[72px] top-0 z-40 hidden w-[300px] shrink-0 flex-col border-r border-slate-200 bg-[#F8FAFC] shadow-xl shadow-slate-900/5 animate-[admin-overlay-in_200ms_ease-out] motion-reduce:animate-none md:flex ${
                pinned ? 'min-[1440px]:static min-[1440px]:top-auto min-[1440px]:bottom-auto' : ''
            }`}
        >
            <header className="shrink-0 border-b border-slate-200 px-4 pb-3 pt-4">
                <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                        <module.icon size={18} aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h2 className="truncate text-sm font-black text-slate-900">{module.label}</h2>
                        <p className="mt-0.5 text-xs leading-4 text-slate-500">{module.description}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                        <button
                            type="button"
                            onClick={onTogglePin}
                            className="hidden min-[1440px]:inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200/60 hover:text-slate-700"
                            title={pinned ? 'Desfijar menú' : 'Fijar menú'}
                            aria-label={pinned ? 'Desfijar menú' : 'Fijar menú'}
                            aria-pressed={pinned}
                        >
                            {pinned ? <PinOff size={15} /> : <Pin size={15} />}
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200/60 hover:text-slate-700"
                            title="Cerrar menú"
                            aria-label="Cerrar menú"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>

                <div className="relative mt-3">
                    <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                    <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder={`Buscar en ${module.label}…`}
                        className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {filteredItems.length ? (
                    <ul className="space-y-0.5">
                        {filteredItems.map((item) => {
                            const active = activePath === item.path;
                            const favorite = isFavorite(item.path);
                            return (
                                <li key={item.id}>
                                    <div
                                        className={`group flex items-center gap-2 rounded-lg px-2 py-2 transition-colors motion-reduce:transition-none ${
                                            active ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-100'
                                        }`}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => onNavigate(item.path)}
                                            className={`flex min-w-0 flex-1 items-center gap-2 text-left ${active ? 'font-bold' : 'font-semibold'}`}
                                            aria-current={active ? 'page' : undefined}
                                        >
                                            <ChevronRight size={14} className={`shrink-0 ${active ? 'text-blue-500' : 'text-slate-400'}`} aria-hidden="true" />
                                            <span className="truncate text-[13px]">{item.label}</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                toggleFavorite(item.path);
                                            }}
                                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                                                favorite ? 'text-amber-500 hover:bg-amber-50' : 'text-slate-300 opacity-0 hover:bg-slate-200/60 hover:text-slate-500 group-hover:opacity-100'
                                            }`}
                                            title={favorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                                            aria-label={favorite ? `Quitar ${item.label} de favoritos` : `Agregar ${item.label} a favoritos`}
                                            aria-pressed={favorite}
                                        >
                                            <Star size={15} fill={favorite ? 'currentColor' : 'none'} />
                                        </button>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                ) : (
                    <p className="px-3 py-6 text-center text-sm text-slate-400">Sin resultados para «{query}».</p>
                )}
            </div>
        </aside>
    );
}
