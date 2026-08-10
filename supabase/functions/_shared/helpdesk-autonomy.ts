export type HelpdeskAutonomyMode = 'observe' | 'copilot' | 'autopilot';
export type HelpdeskResponsePolicy = 'auto_reply' | 'clarify' | 'escalate' | 'no_reply';

export interface HelpdeskKnowledgeMatch {
    id: string;
    module: string;
    title: string;
    source?: string | null;
    source_path?: string | null;
    rank?: number | null;
}

export interface HelpdeskAutonomyTriage {
    priority: 'Baja' | 'Media' | 'Alta' | 'Critica';
    category: 'Ventas' | 'Inventario' | 'Fiscal' | 'Hardware' | 'Pagos' | 'Red' | 'Otros';
    sentiment: 'frustrated' | 'neutral' | 'positive';
    duplicate_signal: boolean;
    customer_improvement_requested: boolean;
    classification_confidence: number;
    response_confidence: number;
    response_policy: HelpdeskResponsePolicy;
    autonomous_reply: string | null;
    risk_flags: string[];
    used_knowledge_ids: string[];
}

export interface HelpdeskAutonomyConfig {
    aiAutonomyMode: HelpdeskAutonomyMode;
    aiAutoDraftsEnabled: boolean;
    aiAutoReplyMinConfidence: number;
    aiAutoRouteMinConfidence: number;
    aiAutoReplyClarifications: boolean;
}

export interface HelpdeskAutonomyDecision {
    action: 'observe' | 'draft' | 'auto_reply' | 'acknowledge' | 'escalate';
    reasons: string[];
    response: string;
}

export function buildHelpdeskKnowledgeSources(matches: HelpdeskKnowledgeMatch[], usedIds: string[]) {
    const used = new Set(usedIds);
    return matches
        .filter((match) => used.has(match.id))
        .map((match) => ({
            id: match.id,
            module: match.module,
            title: match.title,
            source: match.source,
            source_path: match.source_path,
            rank: match.rank,
        }));
}

function hasUnsafeResponseContent(response: string) {
    return /(service[_ -]?role|api[_ -]?key|secret|token|contrase(?:n|ñ)a|authorization|cookie|session|supabase|localhost|src\/|server\/)/i.test(response);
}

export function decideHelpdeskAutonomy(params: {
    config: HelpdeskAutonomyConfig;
    triage: HelpdeskAutonomyTriage;
    tenantKnown: boolean;
    knowledgeMatches: HelpdeskKnowledgeMatch[];
}): HelpdeskAutonomyDecision {
    const { config, triage } = params;
    const reasons: string[] = [];
    const deterministicRisk = triage.priority === 'Critica'
        || triage.category === 'Fiscal'
        || triage.category === 'Pagos'
        || triage.sentiment === 'frustrated'
        || triage.duplicate_signal
        || triage.customer_improvement_requested;

    if (triage.classification_confidence < config.aiAutoRouteMinConfidence) reasons.push('classification_confidence_below_threshold');
    if (triage.risk_flags.length || deterministicRisk) reasons.push('risk_requires_human_review');
    if (!params.tenantKnown) reasons.push('tenant_not_verified');
    if (!config.aiAutoDraftsEnabled) reasons.push('automatic_drafts_disabled');

    if (config.aiAutonomyMode === 'observe') {
        return { action: 'observe', reasons: ['observe_mode', ...reasons], response: triage.autonomous_reply ?? '' };
    }

    if (config.aiAutonomyMode === 'copilot') {
        return { action: 'draft', reasons: ['copilot_requires_approval', ...reasons], response: triage.autonomous_reply ?? '' };
    }

    if (reasons.length || triage.response_policy === 'escalate') {
        return { action: 'escalate', reasons: reasons.length ? reasons : ['model_requested_escalation'], response: triage.autonomous_reply ?? '' };
    }

    if (!triage.autonomous_reply) {
        return { action: 'acknowledge', reasons: ['no_autonomous_response'], response: '' };
    }
    if (hasUnsafeResponseContent(triage.autonomous_reply)) {
        return { action: 'draft', reasons: ['unsafe_response_content'], response: triage.autonomous_reply };
    }

    if (triage.response_policy === 'clarify') {
        if (!config.aiAutoReplyClarifications) {
            return { action: 'draft', reasons: ['automatic_clarifications_disabled'], response: triage.autonomous_reply };
        }
        if (triage.response_confidence < config.aiAutoRouteMinConfidence) {
            return { action: 'draft', reasons: ['clarification_confidence_below_threshold'], response: triage.autonomous_reply };
        }
        return { action: 'auto_reply', reasons: ['safe_clarification'], response: triage.autonomous_reply };
    }

    const usedKnowledge = buildHelpdeskKnowledgeSources(params.knowledgeMatches, triage.used_knowledge_ids);
    if (triage.response_policy !== 'auto_reply') {
        return { action: 'acknowledge', reasons: ['model_did_not_authorize_reply'], response: triage.autonomous_reply };
    }
    if (!usedKnowledge.length) {
        return { action: 'draft', reasons: ['response_not_grounded_in_knowledge'], response: triage.autonomous_reply };
    }
    if (triage.response_confidence < config.aiAutoReplyMinConfidence) {
        return { action: 'draft', reasons: ['response_confidence_below_threshold'], response: triage.autonomous_reply };
    }

    return { action: 'auto_reply', reasons: ['grounded_response_above_threshold'], response: triage.autonomous_reply };
}
