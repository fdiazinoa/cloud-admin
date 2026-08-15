export interface ErpModuleDraftValue {
    enabled: boolean;
    licensedQuantity: number;
}

export interface ErpModuleDependencyRule {
    module_code: string;
    required_module_code: string;
}

export function cascadeErpModuleSelection(
    current: Record<string, ErpModuleDraftValue>,
    dependencies: ErpModuleDependencyRule[],
    moduleCode: string,
    enabled: boolean,
) {
    const next = Object.fromEntries(
        Object.entries(current).map(([code, value]) => [code, { ...value }]),
    ) as Record<string, ErpModuleDraftValue>;
    const changedCodes = new Set<string>();

    const visit = (code: string, visited = new Set<string>()) => {
        if (visited.has(code) || !next[code]) return;
        visited.add(code);
        next[code].enabled = enabled;
        changedCodes.add(code);
        const related = enabled
            ? dependencies.filter((dependency) => dependency.module_code === code).map((dependency) => dependency.required_module_code)
            : dependencies.filter((dependency) => dependency.required_module_code === code).map((dependency) => dependency.module_code);
        related.forEach((relatedCode) => visit(relatedCode, visited));
    };

    visit(moduleCode);
    return { draft: next, changedCodes: Array.from(changedCodes) };
}
