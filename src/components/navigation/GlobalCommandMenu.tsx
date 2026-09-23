import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Search, Star, Clock3 } from 'lucide-react';
import {
    adminNavigationModules,
    getNavigationEntry,
    searchNavigation,
} from '../../lib/adminNavigation';
import type { CloudAdminPermissionKey } from '../../types';

interface CommandResult {
    key: string;
    label: string;
    description: string;
    path: string;
    kind: 'module' | 'favorite' | 'recent';
}

interface GlobalCommandMenuProps {
    onClose: () => void;
    onNavigate: (path: string) => void;
    allowed: (permission: CloudAdminPermissionKey) => boolean;
    favorites: string[];
    recents: string[];
}

export function GlobalCommandMenu({ onClose, onNavigate, allowed, favorites, recents }: GlobalCommandMenuProps) {
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const raf = requestAnimationFrame(() => inputRef.current?.focus());
        return () => cancelAnimationFrame(raf);
    }, []);

    const results = useMemo<CommandResult[]>(() => {
        const q = query.trim();
        if (q) {
            return searchNavigation(q, allowed)
                .filter((result) => !result.sensitive)
                .map((result) => ({
                    key: `${result.kind}:${result.path}`,
                    label: result.label,
                    description: result.description,
                    path: result.path,
                    kind: 'module' as const,
                }));
        }

        const out: CommandResult[] = [];
        for (const path of favorites) {
            const entry = getNavigationEntry(path);
            if (entry && !entry.sensitive && !out.some((item) => item.path === path)) {
                out.push({ key: `fav:${path}`, label: entry.label, description: entry.moduleLabel, path, kind: 'favorite' });
            }
        }
        for (const path of recents) {
            if (out.some((item) => item.path === path)) continue;
            const entry = getNavigationEntry(path);
            if (entry && !entry.sensitive) {
                out.push({ key: `recent:${path}`, label: entry.label, description: entry.moduleLabel, path, kind: 'recent' });
            }
        }
        for (const module of adminNavigationModules) {
            if (!allowed(module.permission) || module.sensitive) continue;
            if (out.some((item) => item.path === module.path)) continue;
            out.push({ key: `module:${module.id}`, label: module.label, description: module.description, path: module.path, kind: 'module' });
        }
        return out;
    }, [query, allowed, favorites, recents]);

    const currentIndex = results.length ? Math.min(activeIndex, results.length - 1) : 0;

    const select = (path: string) => {
        onNavigate(path);
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
        } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActiveIndex((index) => (index + 1) % Math.max(1, results.length));
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex((index) => (index - 1 + Math.max(1, results.length)) % Math.max(1, results.length));
        } else if (event.key === 'Enter' && results[currentIndex]) {
            event.preventDefault();
            select(results[currentIndex].path);
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/10 p-4 pt-[12vh]"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
            role="dialog"
            aria-modal="true"
            aria-label="Búsqueda global"
        >
            <div className="flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
                <div className="relative border-b border-slate-200">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={(event) => {
                            setQuery(event.target.value);
                            setActiveIndex(0);
                        }}
                        onKeyDown={handleKeyDown}
                        placeholder="Buscar módulos, pantallas y accesos…"
                        className="w-full border-0 bg-transparent py-3 pl-9 pr-3 text-sm text-slate-900 outline-none placeholder:text-slate-400"
                        aria-activedescendant={results[currentIndex] ? `command-result-${currentIndex}` : undefined}
                    />
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-2">
                    {results.length ? (
                        <ul className="space-y-0.5">
                            {results.map((result, index) => (
                                <li key={result.key} id={`command-result-${index}`}>
                                    <button
                                        type="button"
                                        onClick={() => select(result.path)}
                                        onMouseEnter={() => setActiveIndex(index)}
                                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${
                                            index === currentIndex ? 'bg-blue-50 text-blue-700' : 'text-slate-700'
                                        }`}
                                    >
                                        <span className="flex min-w-0 flex-1 items-center gap-2">
                                            <span className="truncate text-sm font-semibold">{result.label}</span>
                                            {result.kind === 'favorite' && <Star size={13} className="shrink-0 text-amber-500" fill="currentColor" aria-label="Favorito" />}
                                            {result.kind === 'recent' && <Clock3 size={13} className="shrink-0 text-slate-400" aria-label="Reciente" />}
                                        </span>
                                        <span className="truncate text-xs text-slate-400">{result.description}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="px-3 py-8 text-center text-sm text-slate-400">Sin resultados para «{query}».</p>
                    )}
                </div>

                <div className="flex items-center gap-4 border-t border-slate-100 px-4 py-2 text-[11px] font-medium text-slate-400">
                    <span><kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5">↑↓</kbd> navegar</span>
                    <span><kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5">Enter</kbd> abrir</span>
                    <span><kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5">Esc</kbd> cerrar</span>
                </div>
            </div>
        </div>
    );
}
