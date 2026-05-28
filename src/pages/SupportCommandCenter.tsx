import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertTriangle,
    Archive,
    BatteryLow,
    Clock3,
    ExternalLink,
    Filter,
    Image as ImageIcon,
    Link2,
    Lightbulb,
    Loader2,
    Mail,
    MessageSquare,
    MonitorSmartphone,
    Paperclip,
    Send,
    Sparkles,
    UserPlus,
    Wand2,
    WifiOff,
    X,
} from 'lucide-react';
import { supabaseAdmin, supabaseProjectUrl, supabaseServiceRoleKey } from '../lib/supabase';

const REPLY_TEXTAREA_MAX_HEIGHT = 240;
const HELPDESK_ATTACHMENTS_BUCKET = 'helpdesk-attachments';
const MAX_REPLY_ATTACHMENTS = 4;
const MAX_REPLY_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const ALLOWED_REPLY_IMAGE_TYPES = new Set([
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
]);

type Sentiment = 'frustrated' | 'neutral' | 'positive';
type ImprovementPriority = 'Baja' | 'Media' | 'Alta' | 'Critica';

interface TechnicalContext {
    app_version?: string;
    battery_level?: string;
    network_type?: string;
    last_5_errors?: string[];
    [key: string]: string | string[] | undefined;
}

interface SupportContact {
    id: string;
    email: string;
    name?: string | null;
    company_name?: string | null;
    phone?: string | null;
    tenant_id?: string | null;
    metadata?: {
        sla?: string;
        [key: string]: unknown;
    } | null;
}

interface AiTicketInsight {
    sentiment?: Sentiment | null;
    sentiment_score?: number | null;
    summary?: string | null;
    suggested_replies?: string[] | null;
    confidence?: number | null;
    next_best_action?: string | null;
    urgency_reason?: string | null;
    affected_module?: string | null;
    detected_contact_name?: string | null;
    detected_company?: string | null;
    detected_phone?: string | null;
    detected_identifiers?: string[] | null;
    incident_fingerprint?: string | null;
    duplicate_signal?: boolean | null;
    ai_tags?: string[] | null;
}

interface Ticket {
    id: string;
    ticket_number?: number | null;
    tenant_id?: string | null;
    tenant_name: string;
    contact?: SupportContact | null;
    category: string;
    priority: string;
    status: string;
    resolution_status?: 'open' | 'pending_customer_confirmation' | 'closed' | 'reopened' | null;
    customer_rating?: number | null;
    subject: string;
    source: string;
    assignment_status?: string | null;
    external_sender_email?: string | null;
    technical_context: TechnicalContext;
    created_at: string;
    insight?: AiTicketInsight | null;
}

interface Message {
    id: string;
    sender_type: 'Admin' | 'Client' | 'System';
    message: string;
    attachments?: unknown;
    created_at: string;
}

interface MessageAttachment {
    id?: string;
    name?: string;
    mime_type?: string;
    size_bytes?: number;
    bucket?: string;
    path?: string;
    uploaded_at?: string;
    signed_url?: string | null;
}

interface PendingReplyAttachment {
    id: string;
    file: File;
    previewUrl: string;
}

interface ContactFormState {
    name: string;
    phone: string;
    email: string;
    companyName: string;
    sla: string;
}

interface ImprovementDraft {
    title: string;
    requestedCapability: string;
    affectedModule: string;
    customerImpact: string;
    priority: ImprovementPriority;
}

interface DraftResponse {
    draft?: string;
    error?: string;
    detail?: string;
}

interface TicketRow extends Omit<Ticket, 'tenant_name' | 'contact' | 'insight'> {
    tenants?: { name?: string | null } | { name?: string | null }[] | null;
    support_contacts?: SupportContact | SupportContact[] | null;
    ai_ticket_insights?: AiTicketInsight | AiTicketInsight[] | null;
}

interface TicketMessagePreview {
    message: string;
    sender_type: Message['sender_type'];
    created_at: string;
}

const statusFilters = ['Todos', 'Abierto', 'En_Proceso', 'Resuelto', 'Cerrado'];
const sourceFilters = ['Todos', 'POS', 'ERP', 'Email', 'Preventivo'];

const sourceStyles: Record<string, string> = {
    Email: 'bg-violet-50 text-violet-700 border-violet-200',
    POS: 'bg-blue-50 text-blue-700 border-blue-200',
    ERP: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    Preventivo: 'bg-amber-50 text-amber-700 border-amber-200',
};

const sentimentStyles: Record<Sentiment, string> = {
    frustrated: 'bg-red-50 text-red-700 border-red-200',
    neutral: 'bg-slate-50 text-slate-600 border-slate-200',
    positive: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const sentimentLabels: Record<Sentiment, string> = {
    frustrated: 'Frustrado',
    neutral: 'Neutral',
    positive: 'Positivo',
};

const emptyContactForm: ContactFormState = {
    name: '',
    phone: '',
    email: '',
    companyName: '',
    sla: 'standard',
};

const initialImprovementDraft: ImprovementDraft = {
    title: '',
    requestedCapability: '',
    affectedModule: '',
    customerImpact: '',
    priority: 'Media',
};

const slaLabels: Record<string, string> = {
    standard: 'Estándar',
    priority: 'Prioritario',
    critical: 'Crítico',
};

const resolutionStatusLabels: Record<string, string> = {
    pending_customer_confirmation: 'Esperando confirmacion',
    closed: 'Cerrado por cliente',
    reopened: 'Reabierto por cliente',
};

const resolutionStatusStyles: Record<string, string> = {
    pending_customer_confirmation: 'border-amber-200 bg-amber-50 text-amber-700',
    closed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    reopened: 'border-red-200 bg-red-50 text-red-700',
};

function normalizeRelation<T>(value: T | T[] | null | undefined): T | null {
    if (Array.isArray(value)) return value[0] ?? null;
    return value ?? null;
}

function formatTime(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('es-DO', {
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}

function formatStatusLabel(status: string) {
    return status.replace(/_/g, ' ');
}

function truncatePreview(value: string, maxLength = 110) {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (!normalized) return '';
    return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}…` : normalized;
}

function getSenderPreviewLabel(senderType: Message['sender_type']) {
    if (senderType === 'Admin') return 'Soporte';
    if (senderType === 'System') return 'Sistema';
    return 'Cliente';
}

function buildLatestMessagePreviewMap(rows: Array<{ ticket_id?: string | null; message?: string | null; sender_type?: string | null; created_at?: string | null }>) {
    const previewMap: Record<string, TicketMessagePreview> = {};

    for (const row of rows) {
        const ticketId = String(row.ticket_id || '').trim();
        if (!ticketId || previewMap[ticketId]) continue;

        previewMap[ticketId] = {
            message: String(row.message || '').trim(),
            sender_type: (row.sender_type === 'Admin' || row.sender_type === 'System' ? row.sender_type : 'Client') as Message['sender_type'],
            created_at: String(row.created_at || ''),
        };
    }

    return previewMap;
}

function isClosedTicket(ticket: Ticket) {
    return ticket.status === 'Cerrado' || ticket.resolution_status === 'closed';
}

function isUrgentTicket(ticket: Ticket) {
    return ticket.priority === 'Critica' || ticket.priority === 'Alta';
}

function getPriorityBadgeClass(priority: string) {
    if (priority === 'Critica') {
        return 'border-red-300 bg-red-100 text-red-800 ring-1 ring-red-200 shadow-sm';
    }
    if (priority === 'Alta') {
        return 'border-amber-300 bg-amber-100 text-amber-900 ring-1 ring-amber-200';
    }
    if (priority === 'Media') {
        return 'border-sky-200 bg-sky-50 text-sky-700';
    }
    return 'border-slate-200 bg-slate-50 text-slate-600';
}

function getTicketListCardClass(ticket: Ticket, isSelected: boolean, emphasizeClosed: boolean) {
    if (isSelected) {
        return 'border-blue-400 bg-blue-50 shadow-sm ring-2 ring-blue-500/30';
    }

    const closed = isClosedTicket(ticket);
    const critical = ticket.priority === 'Critica';
    const high = ticket.priority === 'Alta';

    if (critical) {
        return 'border-red-300 border-l-4 border-l-red-500 bg-gradient-to-r from-red-50 via-white to-white ring-1 ring-red-100 hover:border-red-400 hover:shadow-md';
    }
    if (high) {
        return 'border-amber-300 border-l-4 border-l-amber-500 bg-gradient-to-r from-amber-50/90 via-white to-white ring-1 ring-amber-100 hover:border-amber-400 hover:shadow-md';
    }
    if (emphasizeClosed && closed) {
        return 'border-slate-300 border-l-4 border-l-slate-400 bg-slate-100/95 text-slate-600 hover:border-slate-400 hover:bg-slate-100';
    }

    return 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm';
}

function getContactLabel(ticket: Ticket) {
    if (ticket.contact?.name) return ticket.contact.name;
    if (ticket.contact?.email) return ticket.contact.email;
    if (ticket.external_sender_email) return ticket.external_sender_email;
    return ticket.tenant_name;
}

function getTicketOwner(ticket: Ticket) {
    if (ticket.tenant_name !== 'Sin tenant asignado') return ticket.tenant_name;
    return ticket.contact?.company_name || getContactLabel(ticket);
}

function getTicketNumberLabel(ticket: Ticket) {
    return `#${ticket.ticket_number ?? ticket.id.slice(0, 8)}`;
}

function getTicketRecipientEmail(ticket: Ticket) {
    return ticket.contact?.email || ticket.external_sender_email || '';
}

function normalizeDuplicateKey(value: string) {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'mejora-manual';
}

function normalizeForAnalysis(value: string) {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function getPrimaryClientMessage(messages: Message[]) {
    return messages.find((message) => message.sender_type === 'Client')?.message.trim() ?? '';
}

function inferImprovementModule(ticket: Ticket, requestText: string) {
    const text = normalizeForAnalysis([
        ticket.subject,
        ticket.category,
        requestText,
    ].join(' '));

    if (/(api|integracion|webhook|agente|configurable|parametrizacion|configuracion|endpoint)/.test(text)) return 'Integraciones / API ERP';
    if (/(digifact|facturacion electronica|e-?cf|ecf|ncf|dgii|fiscal|comprobante)/.test(text)) return 'Facturacion electronica / Fiscal';
    if (/(promocion|descuento|oferta|forma de pago|metodo de pago|tipo de cliente|lista de precio)/.test(text)) return 'Promociones';
    if (/(activo fijo|activos fijos|depreciacion|depreciar|asiento|entrada de diario|referencia de asiento)/.test(text)) return 'Activos fijos / Contabilidad';
    if (/(inventario|stock|producto|catalogo|categoria|almacen|sucursal)/.test(text)) return 'Inventario / Catalogo';
    if (/(venta|factura|cotizacion|pedido|cliente|cobro)/.test(text)) return 'Ventas / Facturacion';
    if (/(caja|cierre|cuadre|turno|pago|z\b|pos)/.test(text)) return 'Caja / POS';
    if (/(sync|sincron|cloud|viajar|enviar|offline|internet|conexion|red)/.test(text)) return 'Sincronizacion Cloud';
    if (/(impresora|impresion|comanda|ticket|scanner|lector|hardware|terminal)/.test(text)) return 'Hardware POS';

    const insightModule = ticket.insight?.affected_module?.trim();
    if (insightModule && !/no detectado|pendiente/i.test(insightModule)) return insightModule;

    if (ticket.category && ticket.category !== 'Otros') return ticket.category;

    return 'Pendiente de clasificar';
}

function recommendImprovementImpact(ticket: Ticket, requestText: string, module: string) {
    const text = normalizeForAnalysis(`${ticket.subject} ${module} ${requestText}`);

    if (/(duplic|repet|mas de una vez|m[aá]s de una vez)/.test(text)) {
        return 'Evita registros duplicados y reduce retrabajo operativo, conciliaciones manuales y riesgo de errores contables.';
    }

    if (/(bloquea|no permite|no puedo|error|falla|cierre|caja|venta|factura|facturacion)/.test(text)) {
        return 'Reduce friccion en operaciones criticas y ayuda a evitar interrupciones en ventas, facturacion o cierre de caja.';
    }

    if (/(api|integracion|webhook|agente|configurable|endpoint)/.test(text)) {
        return 'Facilita parametrizaciones e integraciones sin intervencion tecnica recurrente, acelerando implementaciones y soporte.';
    }

    if (/(promocion|descuento|forma de pago|tipo de cliente|lista de precio)/.test(text)) {
        return 'Permite configurar reglas comerciales con mayor precision, reduciendo ajustes manuales y diferencias al facturar.';
    }

    if (/(depreci|activo fijo|asiento|contabilidad)/.test(text)) {
        return 'Mejora el control contable y reduce errores de procesamiento mensual, especialmente en cierres y auditorias.';
    }

    if (/(sync|sincron|cloud|offline|red|internet|viajar)/.test(text)) {
        return 'Aumenta la confiabilidad del flujo Cloud/POS/ERP y reduce revisiones manuales por datos pendientes de sincronizar.';
    }

    return 'Ayuda a documentar una necesidad funcional del cliente para evaluar prioridad, alcance e impacto antes de planificar desarrollo.';
}

function mapAttachmentRecord(item: Record<string, unknown>): MessageAttachment {
    return {
        id: typeof item.id === 'string' ? item.id : undefined,
        name: typeof item.name === 'string' ? item.name : undefined,
        mime_type: typeof item.mime_type === 'string' ? item.mime_type : undefined,
        size_bytes: typeof item.size_bytes === 'number' ? item.size_bytes : undefined,
        bucket: typeof item.bucket === 'string' ? item.bucket : undefined,
        path: typeof item.path === 'string' ? item.path : undefined,
        uploaded_at: typeof item.uploaded_at === 'string' ? item.uploaded_at : undefined,
        signed_url: typeof item.signed_url === 'string' ? item.signed_url : null,
    };
}

function normalizeMessageAttachments(value: unknown): MessageAttachment[] {
    if (Array.isArray(value)) {
        return value
            .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
            .map((item) => mapAttachmentRecord(item))
            .filter((attachment) => Boolean(attachment.name || attachment.path || attachment.signed_url));
    }

    if (!value || typeof value !== 'object') return [];

    const envelope = value as Record<string, unknown>;
    const embedded = Array.isArray(envelope.files)
        ? envelope.files
        : Array.isArray(envelope.attachments)
            ? envelope.attachments
            : [];

    return embedded
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
        .map((item) => mapAttachmentRecord(item))
        .filter((attachment) => Boolean(attachment.name || attachment.path || attachment.signed_url));
}

function sanitizeAttachmentFileName(fileName: string) {
    const cleaned = fileName.trim().replace(/[^\w.\-() ]+/g, '_');
    return cleaned || 'imagen.png';
}

function buildOutboundAttachmentPath(ticketId: string, fileName: string) {
    const extension = fileName.includes('.') ? fileName.split('.').pop() : 'png';
    return `tickets/${ticketId}/outbound/${crypto.randomUUID()}.${extension}`;
}

function formatAttachmentSize(sizeBytes?: number) {
    if (!sizeBytes || sizeBytes <= 0) return 'Tamano no disponible';
    if (sizeBytes < 1024) return `${sizeBytes} B`;
    if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getAttachmentName(attachment: MessageAttachment) {
    if (attachment.name) return attachment.name;
    if (attachment.path) return attachment.path.split('/').filter(Boolean).at(-1) ?? 'Adjunto';
    return 'Adjunto';
}

function isImageAttachment(attachment: MessageAttachment) {
    return attachment.mime_type?.startsWith('image/') ?? false;
}

function truncateDraftContext(value: string, maxLength = 180) {
    return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function isElectronicInvoiceConfigurationQuestion(text: string) {
    const asksConfiguration = /(configur|activar|habilitar|parametr|integrar|conectar|instalar|setup|credencial)/i.test(text);
    const isElectronicInvoice = /(digifact|facturaci[oó]n electronica|facturaci[oó]n electr[oó]nica|e-?cf|ecf|dgii)/i.test(text);

    return asksConfiguration && isElectronicInvoice;
}

function hasAlreadyAskedConfigurationPrereqs(messages: Message[]) {
    return messages.some((message) => (
        message.sender_type === 'Admin'
        && /no tengo cargada aqui una guia confirmada de configuracion inicial de digifact/i.test(message.message)
        && /credenciales\/ambiente digifact/i.test(message.message)
    ));
}

function clientConfirmedConfigurationPrereqs(messages: Message[]) {
    const text = [...messages].reverse().find((message) => message.sender_type === 'Client')?.message.toLowerCase() ?? '';
    const confirms = /(ya tenemos|tenemos todo|todo lo indicado|si tenemos|sí tenemos|confirmo|contamos con|ya esta|ya está)/i.test(text);
    const asksNextStep = /(configur|llegar|ruta|paso|pasos|que debo|qué debo|como sigo|cómo sigo|que sigue|qué sigue|tener en cuenta)/i.test(text);

    return confirms && asksNextStep;
}

function buildContextualFallbackDraft(ticket: Ticket, messages: Message[]) {
    const subject = `${ticket.subject} ${ticket.category} ${ticket.insight?.affected_module ?? ''}`.toLowerCase();
    const owner = getTicketOwner(ticket);
    const lastClientMessage = [...messages].reverse().find((message) => message.sender_type === 'Client')?.message;
    const opening = `Hola ${owner},`;
    const evidence = lastClientMessage ? ` Tomamos como referencia: "${truncateDraftContext(lastClientMessage)}".` : '';
    const lastError = ticket.technical_context?.last_5_errors?.[0];
    const terminalContext = [
        ticket.technical_context?.app_version ? `version ${ticket.technical_context.app_version}` : null,
        ticket.technical_context?.network_type ? `red ${ticket.technical_context.network_type}` : null,
        ticket.technical_context?.battery_level ? `bateria ${ticket.technical_context.battery_level}` : null,
    ].filter(Boolean).join(', ');

    if (hasAlreadyAskedConfigurationPrereqs(messages) && clientConfirmedConfigurationPrereqs(messages)) {
        return `${opening} gracias por confirmarlo. Como ya tienen credenciales/ambiente DigiFact y secuencias e-CF/NCF, el siguiente paso no es volver a pedir prerequisitos: debo validarte la ruta exacta de parametrizacion en Clic-ERP para no indicarte un menu incorrecto.\n\nVoy a confirmar internamente el flujo correcto de configuracion y dejarlo documentado en nuestra base de conocimiento. En la proxima respuesta te compartimos los pasos exactos para activarlo en facturas y que debes revisar antes de emitir.`;
    }

    if (isElectronicInvoiceConfigurationQuestion(`${subject}\n${lastClientMessage ?? ''}`)) {
        return `${opening} para no darte una ruta incorrecta de Clic-ERP, no tengo cargada aqui una guia confirmada de configuracion inicial de DigiFact/facturacion electronica. Lo correcto es validarlo como parametrizacion fiscal antes de indicar menus o pasos.\n\nPara avanzar, confirmanos dos cosas: si la empresa ya tiene credenciales/ambiente DigiFact activo (prueba o produccion) y si ya tiene asignadas sus secuencias e-CF/NCF/RNC emisor. Con eso te guiamos con el flujo exacto y dejamos documentada la configuracion correcta. Si el caso es un error al emitir, envianos folio, NCF/e-CF y captura del rechazo.`;
    }

    if (/(impres|printer|cocina|comanda|hardware)/i.test(subject)) {
        return `${opening} vamos a validar el hardware del POS.${evidence} Confirma si ocurre en una sola terminal o en todas, revisa conexion/emparejamiento de impresora o scanner, y prueba una reimpresion o recibo de prueba. Si falla, envianos modelo del equipo, terminal afectada, version del POS y foto/captura del error${lastError ? `; tambien vemos "${lastError}" en contexto tecnico.` : '.'}`;
    }

    if (/(factura|fiscal|ncf|e-?cf|digifact|rnc|comprobante)/i.test(subject)) {
        return `${opening} revisemos el flujo fiscal en Clic-ERP/Clic-POS.${evidence} Valida primero tipo de comprobante, RNC/consumidor final, secuencia NCF/e-CF disponible e internet estable. Luego intenta reenviar solo ese comprobante desde historial, sin recrear la venta. Si vuelve a fallar, envianos folio, NCF/e-CF, hora exacta y captura del error${lastError ? `; en los logs vemos "${lastError}".` : '.'}`;
    }

    if (/(sync|sincron|red|internet|conexion|offline|enviar|viajar|cierre|z\b)/i.test(subject)) {
        return `${opening} esto parece sincronizacion entre Clic-POS y Cloud/ERP.${evidence} Confirma que las ventas esten visibles localmente, que la terminal tenga internet estable y fecha/hora correcta, y luego fuerza la sincronizacion desde el POS. No borres datos ni reinstales antes de confirmar respaldo. Si no viaja, envianos terminal, usuario, hora del cierre/caja y cantidad de transacciones pendientes${terminalContext ? ` (${terminalContext})` : ''}${lastError ? `; ultimo error "${lastError}".` : '.'}`;
    }

    if (/(inventario|stock|producto|catalogo)/i.test(subject)) {
        return `${opening} revisemos inventario/catalogo.${evidence} Confirma que el producto exista y este activo en Clic-ERP para la sucursal, valida precio/impuesto y luego sincroniza catalogo en el POS. Si sigue sin aparecer o el stock no coincide, envianos codigo del producto, sucursal, terminal, cantidad esperada y captura de la busqueda.`;
    }

    if (/(pago|caja|cierre|z|cuadre|turno)/i.test(subject)) {
        return `${opening} validemos el pago/cierre en Clic-POS.${evidence} Revisa si la venta quedo completada, pendiente o duplicada en el historial y comparala contra el cuadre de caja. Envianos folio, monto, metodo de pago, hora, caja y terminal para identificar si es registro, sincronizacion o conciliacion.`;
    }

    const improvementPattern = /(necesito que|queremos que|ser[ií]a bueno|me gustar[ií]a|opci[oó]n para|funci[oó]n para|hace falta|solicitamos (una|un|que|como mejora)|sugeri(mos|ria|r[ií]a|do|da|encia).{0,80}(mejora|cambio|funci[oó]n|m[oó]dulo|modulo|sistema)|(proponemos|recomendamos).{0,80}(mejora|cambio|funci[oó]n|m[oó]dulo|modulo|sistema)|no permita(n)? .{0,100}(duplic|repet|m[aá]s de una vez|mas de una vez|depreci)|evit(a|ar|e).{0,100}(duplic|repet|m[aá]s de una vez|mas de una vez)|poder (aplicar|asignar|filtrar|configurar|seleccionar|elegir|limitar|condicionar)|promocion(es)?.{0,100}(forma de pago|m[eé]todo de pago|tipo de cliente|cliente|categor[ií]a|sucursal|lista de precio))/i;

    if (improvementPattern.test(subject) || (lastClientMessage && improvementPattern.test(lastClientMessage))) {
        return `${opening} lo que solicitas parece una mejora funcional para Clic-ERP/Clic-POS. La registraremos para evaluacion de producto con el caso de uso e impacto operativo. Para documentarla bien, confirmanos modulo, pasos actuales, resultado esperado, frecuencia de uso y si bloquea ventas, facturacion o cierre de caja.`;
    }

    return `${opening} necesito ubicar el punto exacto del caso en Clic-ERP/Clic-POS.${evidence} Confirma modulo afectado, usuario, sucursal/caja, terminal, version, hora aproximada y captura del mensaje. Mientras tanto valida conectividad, fecha/hora del equipo y si ocurre en una sola terminal o en todas${lastError ? `; el ultimo error registrado es "${lastError}".` : '.'}`;
}

const SupportCommandCenter: React.FC = () => {
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
    const [replyText, setReplyText] = useState('');
    const [pendingReplyAttachments, setPendingReplyAttachments] = useState<PendingReplyAttachment[]>([]);
    const [replyAttachmentError, setReplyAttachmentError] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [filterStatus, setFilterStatus] = useState('Todos');
    const [filterSource, setFilterSource] = useState('Todos');
    const [quickFilter, setQuickFilter] = useState<'none' | 'critical' | 'unassigned'>('none');
    const [isCreatingContact, setIsCreatingContact] = useState(false);
    const [isSendingReply, setIsSendingReply] = useState(false);
    const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
    const [isResolvingTicket, setIsResolvingTicket] = useState(false);
    const [isContactModalOpen, setIsContactModalOpen] = useState(false);
    const [contactForm, setContactForm] = useState<ContactFormState>(emptyContactForm);
    const [isImprovementModalOpen, setIsImprovementModalOpen] = useState(false);
    const [isSavingImprovement, setIsSavingImprovement] = useState(false);
    const [improvementDraft, setImprovementDraft] = useState<ImprovementDraft>(initialImprovementDraft);
    const [improvementError, setImprovementError] = useState<string | null>(null);
    const [improvementNotice, setImprovementNotice] = useState<string | null>(null);
    const [lastMessageByTicketId, setLastMessageByTicketId] = useState<Record<string, TicketMessagePreview>>({});
    const messagesPaneRef = useRef<HTMLDivElement>(null);
    const replyTextareaRef = useRef<HTMLTextAreaElement>(null);
    const replyFileInputRef = useRef<HTMLInputElement>(null);
    const pendingReplyAttachmentsRef = useRef<PendingReplyAttachment[]>([]);

    const selectedTicketId = selectedTicket?.id;

    useEffect(() => {
        const pane = messagesPaneRef.current;
        if (!pane) return;
        pane.scrollTo({ top: pane.scrollHeight, behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        const textarea = replyTextareaRef.current;
        if (!textarea) return;

        textarea.style.height = 'auto';
        const nextHeight = Math.min(textarea.scrollHeight, REPLY_TEXTAREA_MAX_HEIGHT);
        textarea.style.height = `${nextHeight}px`;
        textarea.style.overflowY = textarea.scrollHeight > REPLY_TEXTAREA_MAX_HEIGHT ? 'auto' : 'hidden';
    }, [replyText, selectedTicketId]);

    useEffect(() => {
        pendingReplyAttachmentsRef.current = pendingReplyAttachments;
    }, [pendingReplyAttachments]);

    useEffect(() => {
        return () => {
            pendingReplyAttachmentsRef.current.forEach((attachment) => {
                URL.revokeObjectURL(attachment.previewUrl);
            });
        };
    }, []);

    useEffect(() => {
        pendingReplyAttachmentsRef.current.forEach((attachment) => {
            URL.revokeObjectURL(attachment.previewUrl);
        });
        setPendingReplyAttachments([]);
        setReplyAttachmentError(null);
        if (replyFileInputRef.current) {
            replyFileInputRef.current.value = '';
        }
    }, [selectedTicketId]);

    useEffect(() => {
        let mounted = true;

        const fetchTickets = async () => {
            const { data, error } = await supabaseAdmin.from('support_tickets')
                .select(`
                    *,
                    tenants (
                        name
                    ),
                    support_contacts (
                        id,
                        email,
                        name,
                        company_name,
                        phone,
                        metadata,
                        tenant_id
                    ),
                    ai_ticket_insights (
                        sentiment,
                        sentiment_score,
                        summary,
                        suggested_replies,
                        confidence,
                        next_best_action,
                        urgency_reason,
                        affected_module,
                        detected_contact_name,
                        detected_company,
                        detected_phone,
                        detected_identifiers,
                        incident_fingerprint,
                        duplicate_signal,
                        ai_tags
                    )
                `)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Admin: error fetching support tickets', error);
                return;
            }

            if (!mounted) return;

            const mappedTickets = ((data ?? []) as TicketRow[]).map((ticket) => {
                const tenant = normalizeRelation(ticket.tenants);
                const contact = normalizeRelation(ticket.support_contacts);
                const insight = normalizeRelation(ticket.ai_ticket_insights);

                return {
                    ...ticket,
                    source: ticket.source || 'POS',
                    tenant_name: tenant?.name || 'Sin tenant asignado',
                    contact,
                    insight,
                    technical_context: ticket.technical_context || {},
                };
            });

            setTickets(mappedTickets);
            setSelectedTicket((current) => {
                if (!current) return current;
                return mappedTickets.find((ticket) => ticket.id === current.id) ?? current;
            });

            const ticketIds = mappedTickets.map((ticket) => ticket.id);
            if (ticketIds.length > 0) {
                const { data: messageRows, error: previewError } = await supabaseAdmin
                    .from('ticket_messages')
                    .select('ticket_id, message, sender_type, created_at')
                    .in('ticket_id', ticketIds)
                    .order('created_at', { ascending: false });

                if (previewError) {
                    console.error('Admin: error fetching ticket previews', previewError);
                } else if (mounted) {
                    setLastMessageByTicketId(buildLatestMessagePreviewMap(messageRows ?? []));
                }
            } else if (mounted) {
                setLastMessageByTicketId({});
            }
        };

        fetchTickets();

        const channel = supabaseAdmin.channel('support_tickets_global')
            .on('postgres_changes', { event: '*', schema: 'landlord', table: 'support_tickets' }, fetchTickets)
            .on('postgres_changes', { event: '*', schema: 'landlord', table: 'support_contacts' }, fetchTickets)
            .on('postgres_changes', { event: '*', schema: 'landlord', table: 'ai_ticket_insights' }, fetchTickets)
            .subscribe();

        return () => {
            mounted = false;
            supabaseAdmin.removeChannel(channel);
        };
    }, []);

    useEffect(() => {
        if (!selectedTicketId) {
            return;
        }

        let mounted = true;

        const fetchMessages = async () => {
            try {
                const response = await fetch(`${supabaseProjectUrl}/functions/v1/get-support-messages`, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${supabaseServiceRoleKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ ticket_id: selectedTicketId }),
                });

                if (response.ok) {
                    const payload = await response.json() as { messages?: Message[] };
                    if (mounted) setMessages(payload.messages ?? []);
                    return;
                }

                console.error('Admin: error fetching signed support messages', response.statusText);
            } catch (error) {
                console.error('Admin: unexpected error fetching signed support messages', error);
            }

            const { data, error } = await supabaseAdmin.from('ticket_messages')
                .select('*')
                .eq('ticket_id', selectedTicketId)
                .order('created_at', { ascending: true });

            if (error) {
                console.error('Admin: error fetching ticket messages', error);
                return;
            }

            if (mounted) setMessages((data ?? []) as Message[]);
        };

        fetchMessages();

        const msgChannel = supabaseAdmin.channel(`support_messages_${selectedTicketId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'landlord',
                table: 'ticket_messages',
                filter: `ticket_id=eq.${selectedTicketId}`,
            }, (payload) => {
                if (mounted) {
                    const nextMessage = payload.new as Message;
                    if (normalizeMessageAttachments(nextMessage.attachments).length) {
                        void fetchMessages();
                        return;
                    }
                    setMessages((previous) => [...previous, nextMessage]);
                    setLastMessageByTicketId((current) => ({
                        ...current,
                        [selectedTicketId]: {
                            message: nextMessage.message,
                            sender_type: nextMessage.sender_type,
                            created_at: nextMessage.created_at,
                        },
                    }));
                }
            })
            .subscribe();

        return () => {
            mounted = false;
            supabaseAdmin.removeChannel(msgChannel);
        };
    }, [selectedTicketId]);

    const ticketStats = useMemo(() => {
        return {
            critical: tickets.filter((ticket) => ticket.priority === 'Critica').length,
            open: tickets.filter((ticket) => ticket.status === 'Abierto').length,
            email: tickets.filter((ticket) => ticket.source === 'Email').length,
            unassigned: tickets.filter((ticket) => ticket.assignment_status === 'needs_assignment').length,
        };
    }, [tickets]);

    const filteredTickets = useMemo(() => {
        return tickets.filter((ticket) => {
            const statusMatches = filterStatus === 'Todos' || ticket.status === filterStatus;
            const sourceMatches = filterSource === 'Todos' || ticket.source === filterSource;
            const criticalMatches = quickFilter !== 'critical' || ticket.priority === 'Critica';
            const unassignedMatches = quickFilter !== 'unassigned' || ticket.assignment_status === 'needs_assignment';
            return statusMatches && sourceMatches && criticalMatches && unassignedMatches;
        });
    }, [filterSource, filterStatus, quickFilter, tickets]);

    const clearPendingReplyAttachments = () => {
        pendingReplyAttachments.forEach((attachment) => {
            URL.revokeObjectURL(attachment.previewUrl);
        });
        setPendingReplyAttachments([]);
        setReplyAttachmentError(null);
        if (replyFileInputRef.current) {
            replyFileInputRef.current.value = '';
        }
    };

    const handleReplyAttachmentSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = Array.from(event.target.files ?? []);
        event.target.value = '';

        if (!selectedFiles.length) return;

        setReplyAttachmentError(null);
        const availableSlots = MAX_REPLY_ATTACHMENTS - pendingReplyAttachments.length;
        if (availableSlots <= 0) {
            setReplyAttachmentError(`Solo puedes adjuntar hasta ${MAX_REPLY_ATTACHMENTS} imagenes por respuesta.`);
            return;
        }

        const accepted: PendingReplyAttachment[] = [];
        const rejected: string[] = [];

        for (const file of selectedFiles.slice(0, availableSlots)) {
            if (!ALLOWED_REPLY_IMAGE_TYPES.has(file.type)) {
                rejected.push(`${file.name}: formato no permitido`);
                continue;
            }
            if (file.size > MAX_REPLY_ATTACHMENT_BYTES) {
                rejected.push(`${file.name}: supera 5 MB`);
                continue;
            }

            accepted.push({
                id: crypto.randomUUID(),
                file,
                previewUrl: URL.createObjectURL(file),
            });
        }

        if (rejected.length) {
            setReplyAttachmentError(rejected.join(' · '));
        }

        if (accepted.length) {
            setPendingReplyAttachments((current) => [...current, ...accepted]);
        }
    };

    const removePendingReplyAttachment = (attachmentId: string) => {
        setPendingReplyAttachments((current) => {
            const target = current.find((attachment) => attachment.id === attachmentId);
            if (target) URL.revokeObjectURL(target.previewUrl);
            return current.filter((attachment) => attachment.id !== attachmentId);
        });
    };

    const uploadPendingReplyAttachments = async (ticketId: string) => {
        const uploaded: MessageAttachment[] = [];

        for (const pending of pendingReplyAttachments) {
            const safeName = sanitizeAttachmentFileName(pending.file.name);
            const path = buildOutboundAttachmentPath(ticketId, safeName);
            const { error } = await supabaseAdmin.storage
                .from(HELPDESK_ATTACHMENTS_BUCKET)
                .upload(path, pending.file, {
                    contentType: pending.file.type,
                    upsert: false,
                });

            if (error) {
                throw new Error(`No se pudo subir ${safeName}: ${error.message}`);
            }

            uploaded.push({
                id: pending.id,
                name: safeName,
                mime_type: pending.file.type,
                size_bytes: pending.file.size,
                bucket: HELPDESK_ATTACHMENTS_BUCKET,
                path,
                uploaded_at: new Date().toISOString(),
            });
        }

        return uploaded;
    };

    const handleSendReply = async () => {
        const text = replyText.trim();
        const hasAttachments = pendingReplyAttachments.length > 0;
        if ((!text && !hasAttachments) || !selectedTicket || isSendingReply) return;

        const recipientEmail = getTicketRecipientEmail(selectedTicket);
        const messageText = text || 'Imagen adjunta enviada por soporte.';
        const savedReplyText = replyText;
        const savedAttachments = pendingReplyAttachments;

        setReplyText('');
        setIsSendingReply(true);
        setReplyAttachmentError(null);

        try {
            const uploadedAttachments = hasAttachments
                ? await uploadPendingReplyAttachments(selectedTicket.id)
                : [];

            if (recipientEmail) {
                const response = await fetch(`${supabaseProjectUrl}/functions/v1/send-support-reply`, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${supabaseServiceRoleKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        ticket_id: selectedTicket.id,
                        message: messageText,
                        attachments: uploadedAttachments,
                    }),
                });

                if (!response.ok) {
                    const payload = await response.json().catch(() => null) as { detail?: string; error?: string } | null;
                    console.error('Admin: error notifying support reply', payload ?? response.statusText);
                    setReplyText(savedReplyText);
                    setPendingReplyAttachments(savedAttachments);
                    setReplyAttachmentError(payload?.detail || payload?.error || 'No se pudo enviar la respuesta con adjuntos.');
                    return;
                }

                clearPendingReplyAttachments();
                return;
            }

            const { error } = await supabaseAdmin.from('ticket_messages').insert({
                ticket_id: selectedTicket.id,
                message: messageText,
                sender_type: 'Admin',
                attachments: {
                    channel: 'realtime',
                    notify_client: true,
                    delivery_status: 'inserted',
                    files: uploadedAttachments,
                    notification: {
                        play_sound: true,
                        sound: 'support-reply',
                    },
                },
            });

            if (error) {
                console.error('Admin: error sending support reply', error);
                setReplyText(savedReplyText);
                setPendingReplyAttachments(savedAttachments);
                setReplyAttachmentError(error.message);
                return;
            }

            clearPendingReplyAttachments();
        } catch (error) {
            console.error('Admin: unexpected error sending support reply', error);
            setReplyText(savedReplyText);
            setPendingReplyAttachments(savedAttachments);
            setReplyAttachmentError(error instanceof Error ? error.message : 'Error inesperado al enviar adjuntos.');
        } finally {
            setIsSendingReply(false);
        }
    };

    const updateStatus = async (newStatus: string) => {
        if (!selectedTicket) return;

        if (newStatus === 'Resuelto') {
            setIsResolvingTicket(true);
            try {
                const response = await fetch(`${supabaseProjectUrl}/functions/v1/resolve-support-ticket`, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${supabaseServiceRoleKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ ticket_id: selectedTicket.id }),
                });

                if (!response.ok) {
                    const payload = await response.json().catch(() => null) as { detail?: string; error?: string } | null;
                    console.error('Admin: error resolving support ticket', payload ?? response.statusText);
                    return;
                }

                setSelectedTicket({
                    ...selectedTicket,
                    status: 'Resuelto',
                    resolution_status: 'pending_customer_confirmation',
                    customer_rating: null,
                });
            } catch (error) {
                console.error('Admin: unexpected error resolving support ticket', error);
            } finally {
                setIsResolvingTicket(false);
            }
            return;
        }

        const { error } = await supabaseAdmin
            .from('support_tickets')
            .update({
                status: newStatus,
                resolution_status: newStatus === 'En_Proceso' ? 'reopened' : 'open',
                resolution_feedback_token_hash: null,
            })
            .eq('id', selectedTicket.id);

        if (error) {
            console.error('Admin: error updating ticket status', error);
            return;
        }

        setSelectedTicket({
            ...selectedTicket,
            status: newStatus,
            resolution_status: newStatus === 'En_Proceso' ? 'reopened' : 'open',
        });
    };

    const openContactModal = () => {
        if (!selectedTicket?.external_sender_email && !selectedTicket?.contact?.email) return;

        const email = selectedTicket.contact?.email || selectedTicket.external_sender_email || '';
        const fallbackName = email ? email.split('@')[0] : '';

        setContactForm({
            name: selectedTicket.contact?.name || fallbackName,
            phone: selectedTicket.contact?.phone || '',
            email,
            companyName: selectedTicket.contact?.company_name || '',
            sla: selectedTicket.contact?.metadata?.sla || 'standard',
        });
        setIsContactModalOpen(true);
    };

    const saveContactFromTicket = async () => {
        if (!selectedTicket || (!selectedTicket.external_sender_email && !selectedTicket.contact?.email)) return;

        setIsCreatingContact(true);

        const contactPayload = {
            email: contactForm.email.trim().toLowerCase(),
            name: contactForm.name.trim() || null,
            phone: contactForm.phone.trim() || null,
            company_name: contactForm.companyName.trim() || null,
            source: 'Email',
            metadata: {
                ...(selectedTicket.contact?.metadata || {}),
                sla: contactForm.sla,
                converted_from: 'command_center',
                converted_from_ticket_id: selectedTicket.id,
                converted_at: new Date().toISOString(),
            },
        };

        const contactRequest = selectedTicket.contact?.id
            ? supabaseAdmin
                .from('support_contacts')
                .update(contactPayload)
                .eq('id', selectedTicket.contact.id)
                .select('id, email, name, company_name, phone, metadata, tenant_id')
                .single()
            : supabaseAdmin
                .from('support_contacts')
                .upsert(contactPayload, { onConflict: 'email' })
                .select('id, email, name, company_name, phone, metadata, tenant_id')
                .single();

        const { data: contact, error: contactError } = await contactRequest;

        if (contactError) {
            console.error('Admin: error creating support contact', contactError);
            setIsCreatingContact(false);
            return;
        }

        const { error: ticketError } = await supabaseAdmin
            .from('support_tickets')
            .update({
                contact_id: contact.id,
                assignment_status: selectedTicket.tenant_id || contact.tenant_id ? 'assigned' : 'needs_assignment',
            })
            .eq('id', selectedTicket.id);

        if (ticketError) {
            console.error('Admin: error linking support contact', ticketError);
        } else {
            setSelectedTicket({
                ...selectedTicket,
                contact,
                assignment_status: selectedTicket.tenant_id || contact.tenant_id ? 'assigned' : 'needs_assignment',
            });
            setIsContactModalOpen(false);
        }

        setIsCreatingContact(false);
    };

    const generateDraft = async () => {
        if (!selectedTicket || isGeneratingDraft) return;

        const fallbackDraft = buildContextualFallbackDraft(selectedTicket, messages);
        setIsGeneratingDraft(true);

        try {
            const response = await fetch(`${supabaseProjectUrl}/functions/v1/generate-support-draft`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${supabaseServiceRoleKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ ticket_id: selectedTicket.id }),
            });

            const payload = await response.json().catch(() => null) as DraftResponse | null;

            if (!response.ok || !payload?.draft) {
                console.error('Admin: error generating support draft', payload ?? response.statusText);
                setReplyText(fallbackDraft);
                return;
            }

            setReplyText(payload.draft);
        } catch (error) {
            console.error('Admin: unexpected error generating support draft', error);
            setReplyText(fallbackDraft);
        } finally {
            setIsGeneratingDraft(false);
        }
    };

    const openImprovementModal = () => {
        if (!selectedTicket) return;

        const primaryClientMessage = getPrimaryClientMessage(messages);
        const requestedCapability = primaryClientMessage || selectedTicket.subject;
        const affectedModule = inferImprovementModule(selectedTicket, requestedCapability);

        setImprovementDraft({
            title: selectedTicket.subject,
            requestedCapability,
            affectedModule,
            customerImpact: recommendImprovementImpact(selectedTicket, requestedCapability, affectedModule),
            priority: selectedTicket.priority === 'Critica' ? 'Alta' : 'Media',
        });
        setImprovementError(null);
        setImprovementNotice(null);
        setIsImprovementModalOpen(true);
    };

    const closeImprovementModal = () => {
        if (isSavingImprovement) return;
        setIsImprovementModalOpen(false);
        setImprovementDraft(initialImprovementDraft);
        setImprovementError(null);
    };

    const updateImprovementDraft = <K extends keyof ImprovementDraft>(field: K, value: ImprovementDraft[K]) => {
        setImprovementDraft((current) => ({ ...current, [field]: value }));
    };

    const handleCreateImprovement = async () => {
        if (!selectedTicket) return;

        const title = improvementDraft.title.trim();
        const requestedCapability = improvementDraft.requestedCapability.trim();
        const affectedModule = improvementDraft.affectedModule.trim();
        const customerImpact = improvementDraft.customerImpact.trim();

        if (!title || !requestedCapability) {
            setImprovementError('Completa el titulo y la solicitud antes de registrarla.');
            return;
        }

        setIsSavingImprovement(true);
        setImprovementError(null);

        const duplicateGroupKey = normalizeDuplicateKey(`${selectedTicket.id}-${title}`);
        const payload = {
            ticket_id: selectedTicket.id,
            tenant_id: selectedTicket.tenant_id,
            contact_id: selectedTicket.contact?.id,
            source: 'HelpDesk manual',
            status: 'Nueva',
            priority: improvementDraft.priority,
            title,
            request_text: requestedCapability,
            ai_summary: null,
            requested_capability: requestedCapability,
            affected_module: affectedModule || selectedTicket.insight?.affected_module || selectedTicket.category,
            customer_impact: customerImpact || 'Registrada manualmente desde HelpDesk para evaluacion de producto.',
            duplicate_group_key: duplicateGroupKey,
            ai_confidence: null,
            detected_by_ai: false,
        };

        let improvementId: string | null = null;
        let alreadyExisted = false;

        const { data: existing, error: existingError } = await supabaseAdmin
            .from('customer_improvement_requests')
            .select('id')
            .eq('ticket_id', selectedTicket.id)
            .eq('duplicate_group_key', duplicateGroupKey)
            .maybeSingle();

        if (existingError) {
            console.error('Admin: error checking duplicate customer improvement', existingError);
            setImprovementError('No se pudo validar si la mejora ya existia.');
            setIsSavingImprovement(false);
            return;
        }

        if (existing?.id) {
            improvementId = existing.id;
            alreadyExisted = true;
        } else {
            const { data: inserted, error: insertError } = await supabaseAdmin
                .from('customer_improvement_requests')
                .insert(payload)
                .select('id')
                .single();

            if (insertError) {
                console.error('Admin: error creating customer improvement', insertError);
                setImprovementError('No se pudo registrar la mejora solicitada.');
                setIsSavingImprovement(false);
                return;
            }

            improvementId = inserted.id;
        }

        const message = alreadyExisted
            ? `Confirmamos que tu solicitud "${title}" ya estaba registrada como mejora funcional para evaluacion del equipo de producto. Te avisaremos cuando tengamos una decision o avance.`
            : `Registramos tu solicitud "${title}" como mejora funcional para evaluacion del equipo de producto. Te avisaremos cuando tengamos una decision o avance.`;

        const { error: messageError } = await supabaseAdmin.from('ticket_messages').insert({
            ticket_id: selectedTicket.id,
            message,
            sender_type: 'Admin',
            attachments: {
                channel: 'customer_improvement',
                event: alreadyExisted ? 'customer_improvement_already_registered' : 'customer_improvement_registered',
                improvement_request_id: improvementId,
                manual: true,
                notify_client: true,
                notification: {
                    badge: true,
                    increment_unread: true,
                    play_sound: true,
                    sound: 'support-improvement-registered',
                    title: 'Solicitud registrada como mejora',
                    body: message,
                },
                client_alert: {
                    badge: true,
                    increment_unread: true,
                },
            },
        });

        if (messageError) {
            console.error('Admin: error notifying customer improvement', messageError);
            setImprovementNotice('La mejora fue registrada, pero no se pudo insertar la notificacion en el ticket.');
        } else {
            setImprovementNotice(alreadyExisted ? 'La mejora ya existia; se notifico al cliente.' : 'Mejora registrada y cliente notificado.');
            setIsImprovementModalOpen(false);
            setImprovementDraft(initialImprovementDraft);
        }

        setIsSavingImprovement(false);
    };

    return (
        <div className="flex h-[calc(100dvh-4rem)] max-h-[calc(100dvh-4rem)] overflow-hidden bg-slate-100">
            <aside className="flex min-h-0 w-[380px] shrink-0 flex-col border-r border-slate-200 bg-white shadow-sm">
                <div className="shrink-0 border-b border-slate-100 p-4">
                    <div className="mb-4 flex items-start justify-between gap-3">
                        <div>
                            <h1 className="text-xl font-bold text-slate-900">Command Center</h1>
                            <p className="text-sm text-slate-500">Soporte POS, ERP y email externo</p>
                        </div>
                        <div className="rounded-xl border border-violet-200 bg-violet-50 p-2.5 text-violet-700">
                            <Sparkles size={18} />
                        </div>
                    </div>

                    <div className="mb-4 grid grid-cols-4 gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                setQuickFilter('none');
                                setFilterStatus('Abierto');
                            }}
                            className={`rounded-lg border p-2 text-center transition-colors ${filterStatus === 'Abierto' && quickFilter === 'none' ? 'border-orange-300 bg-orange-100 ring-1 ring-orange-300' : 'border-orange-100 bg-orange-50 hover:border-orange-200'}`}
                        >
                            <span className="block text-lg font-bold text-orange-600">{ticketStats.open}</span>
                            <span className="text-[10px] font-bold uppercase text-orange-400">Abiertos</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setFilterStatus('Todos');
                                setFilterSource('Todos');
                                setQuickFilter('critical');
                            }}
                            className={`rounded-lg border p-2 text-center transition-colors ${quickFilter === 'critical' ? 'border-red-300 bg-red-100 ring-1 ring-red-300' : 'border-red-100 bg-red-50 hover:border-red-200'}`}
                        >
                            <span className="block text-lg font-bold text-red-600">{ticketStats.critical}</span>
                            <span className="text-[10px] font-bold uppercase text-red-400">Críticos</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setQuickFilter('none');
                                setFilterStatus('Todos');
                                setFilterSource('Email');
                            }}
                            className={`rounded-lg border p-2 text-center transition-colors ${filterSource === 'Email' && quickFilter === 'none' ? 'border-violet-300 bg-violet-100 ring-1 ring-violet-300' : 'border-violet-100 bg-violet-50 hover:border-violet-200'}`}
                        >
                            <span className="block text-lg font-bold text-violet-600">{ticketStats.email}</span>
                            <span className="text-[10px] font-bold uppercase text-violet-400">Email</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setFilterStatus('Todos');
                                setFilterSource('Todos');
                                setQuickFilter('unassigned');
                            }}
                            className={`rounded-lg border p-2 text-center transition-colors ${quickFilter === 'unassigned' ? 'border-slate-400 bg-slate-200 ring-1 ring-slate-400' : 'border-slate-200 bg-slate-50 hover:border-slate-300'}`}
                        >
                            <span className="block text-lg font-bold text-slate-700">{ticketStats.unassigned}</span>
                            <span className="text-[10px] font-bold uppercase text-slate-400">Asignar</span>
                        </button>
                    </div>

                    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/90 p-3">
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                            <Filter size={12} />
                            Filtros
                        </div>

                        <div>
                            <p className="mb-1.5 text-[11px] font-semibold text-slate-600">Estado del ticket</p>
                            <div className="flex flex-wrap gap-1.5">
                                {statusFilters.map((status) => (
                                    <button
                                        key={status}
                                        type="button"
                                        onClick={() => {
                                            setQuickFilter('none');
                                            setFilterStatus(status);
                                        }}
                                        className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
                                            filterStatus === status
                                                ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                                                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-100'
                                        }`}
                                    >
                                        {formatStatusLabel(status)}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="border-t border-slate-200 pt-3">
                            <p className="mb-1.5 text-[11px] font-semibold text-slate-600">Canal de origen</p>
                            <div className="flex flex-wrap gap-1.5">
                                {sourceFilters.map((source) => (
                                    <button
                                        key={source}
                                        type="button"
                                        onClick={() => {
                                            setQuickFilter('none');
                                            setFilterSource(source);
                                        }}
                                        className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
                                            filterSource === source
                                                ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                                                : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700'
                                        }`}
                                    >
                                        {source === 'Email' ? <Mail size={11} /> : source === 'Todos' ? null : <MonitorSmartphone size={11} />}
                                        {source}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <p className="border-t border-slate-200 pt-2 text-[11px] font-medium text-slate-500">
                            Mostrando <span className="font-bold text-slate-800">{filteredTickets.length}</span> de{' '}
                            <span className="font-bold text-slate-800">{tickets.length}</span> tickets
                        </p>

                        {filterStatus === 'Todos' ? (
                            <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[10px] leading-relaxed text-slate-500">
                                <p className="mb-1 font-bold uppercase tracking-wide text-slate-400">Leyenda en Todos</p>
                                <div className="flex flex-wrap gap-x-3 gap-y-1">
                                    <span className="inline-flex items-center gap-1">
                                        <span className="h-2 w-2 rounded-full bg-red-500" /> Crítico
                                    </span>
                                    <span className="inline-flex items-center gap-1">
                                        <span className="h-2 w-2 rounded-full bg-amber-500" /> Alta
                                    </span>
                                    <span className="inline-flex items-center gap-1">
                                        <span className="h-2 w-2 rounded-full bg-slate-400" /> Cerrado
                                    </span>
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                    {filteredTickets.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                            No hay tickets con los filtros seleccionados.
                        </div>
                    ) : null}
                    {filteredTickets.map((ticket) => {
                        const sentiment = ticket.insight?.sentiment ?? 'neutral';
                        const preview = lastMessageByTicketId[ticket.id];
                        const previewText = preview?.message
                            ? truncatePreview(preview.message)
                            : truncatePreview(ticket.insight?.summary || ticket.subject);
                        const emphasizeClosed = filterStatus === 'Todos';
                        const closed = isClosedTicket(ticket);
                        const urgent = isUrgentTicket(ticket);
                        const isSelected = selectedTicket?.id === ticket.id;

                        return (
                            <button
                                key={ticket.id}
                                type="button"
                                onClick={() => setSelectedTicket(ticket)}
                                className={`mb-2 w-full rounded-xl border p-3 text-left transition-all ${getTicketListCardClass(ticket, isSelected, emphasizeClosed)}`}
                            >
                                <div className="mb-2 flex items-center justify-between gap-2">
                                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                                        <span className={`shrink-0 text-xs font-black ${closed && emphasizeClosed && !urgent ? 'text-slate-500' : 'text-slate-500'}`}>
                                            {getTicketNumberLabel(ticket)}
                                        </span>
                                        {emphasizeClosed && closed ? (
                                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-300 bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                                                <Archive size={10} />
                                                Cerrado
                                            </span>
                                        ) : null}
                                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${sourceStyles[ticket.source] ?? sourceStyles.POS}`}>
                                            {ticket.source === 'Email' ? <Mail size={11} /> : <MonitorSmartphone size={11} />}
                                            {ticket.source}
                                        </span>
                                        {ticket.resolution_status && ticket.resolution_status !== 'open' && (
                                            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${resolutionStatusStyles[ticket.resolution_status] ?? 'border-slate-200 bg-slate-50 text-slate-500'}`}>
                                                {resolutionStatusLabels[ticket.resolution_status] ?? ticket.resolution_status}
                                            </span>
                                        )}
                                    </div>
                                    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${getPriorityBadgeClass(ticket.priority)}`}>
                                        {urgent ? <AlertTriangle size={10} className={ticket.priority === 'Critica' ? 'text-red-700' : 'text-amber-700'} /> : null}
                                        {ticket.priority}
                                    </span>
                                </div>

                                <h3 className={`truncate text-sm font-bold ${closed && emphasizeClosed && !urgent ? 'text-slate-700' : 'text-slate-900'}`}>
                                    {getTicketOwner(ticket)}
                                </h3>
                                <p className={`mt-1 line-clamp-1 text-xs font-medium ${closed && emphasizeClosed && !urgent ? 'text-slate-500' : 'text-slate-700'}`}>
                                    {ticket.subject}
                                </p>
                                <p className={`mt-2 line-clamp-2 text-xs leading-relaxed ${closed && emphasizeClosed && !urgent ? 'text-slate-400' : 'text-slate-500'}`}>
                                    {preview ? (
                                        <>
                                            <span className="font-semibold text-slate-600">{getSenderPreviewLabel(preview.sender_type)}:</span>{' '}
                                            {previewText}
                                        </>
                                    ) : (
                                        previewText
                                    )}
                                </p>

                                <div className="mt-3 flex items-center justify-between gap-2 text-[11px]">
                                    <span className={`rounded-full border px-2 py-0.5 font-medium ${sentimentStyles[sentiment]}`}>
                                        {sentimentLabels[sentiment]}
                                    </span>
                                    <span className="flex items-center gap-1 text-slate-400">
                                        <Clock3 size={11} />
                                        {formatTime(preview?.created_at || ticket.created_at)}
                                    </span>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </aside>

            <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white">
                {selectedTicket ? (
                    <>
                        <div className="shrink-0 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white p-4">
                            <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <div className="mb-2 flex flex-wrap items-center gap-2">
                                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${sourceStyles[selectedTicket.source] ?? sourceStyles.POS}`}>
                                            {selectedTicket.source === 'Email' ? <Mail size={12} /> : <MonitorSmartphone size={12} />}
                                            {selectedTicket.source}
                                        </span>
                                        <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                            {formatStatusLabel(selectedTicket.status)}
                                        </span>
                                        <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                            {selectedTicket.category}
                                        </span>
                                        {selectedTicket.resolution_status && selectedTicket.resolution_status !== 'open' && (
                                            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${resolutionStatusStyles[selectedTicket.resolution_status] ?? 'border-slate-200 bg-white text-slate-600'}`}>
                                                {resolutionStatusLabels[selectedTicket.resolution_status] ?? selectedTicket.resolution_status}
                                            </span>
                                        )}
                                        {selectedTicket.customer_rating ? (
                                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                                                {selectedTicket.customer_rating}/5 estrellas
                                            </span>
                                        ) : null}
                                    </div>
                                    <div className="flex min-w-0 items-center gap-2">
                                        <span className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-black text-slate-500">
                                            {getTicketNumberLabel(selectedTicket)}
                                        </span>
                                        <h2 className="truncate text-lg font-bold text-slate-900">{getTicketOwner(selectedTicket)}</h2>
                                    </div>
                                    <p className="mt-1 text-sm text-slate-500">{selectedTicket.subject}</p>
                                </div>

                                <div className="flex shrink-0 gap-2">
                                    <button onClick={() => updateStatus('En_Proceso')} disabled={isResolvingTicket} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
                                        En proceso
                                    </button>
                                    <button onClick={() => updateStatus('Resuelto')} disabled={isResolvingTicket} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60">
                                        {isResolvingTicket ? 'Enviando...' : 'Resolver'}
                                    </button>
                                </div>
                            </div>

                            {selectedTicket.resolution_status === 'pending_customer_confirmation' && (
                                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                                    Se notifico al cliente para confirmar cierre y valorar la respuesta.
                                </div>
                            )}

                            {selectedTicket.insight?.summary && (
                                <div className="mt-4 rounded-lg border border-violet-100 bg-violet-50 p-3">
                                    <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-violet-700">
                                        <Sparkles size={14} />
                                        Resumen IA
                                    </div>
                                    <p className="text-sm text-violet-900">{selectedTicket.insight.summary}</p>
                                    {selectedTicket.insight.next_best_action && (
                                        <div className="mt-3 rounded-lg border border-violet-200 bg-white/70 p-2">
                                            <p className="text-[11px] font-bold uppercase tracking-wide text-violet-600">Próxima acción</p>
                                            <p className="mt-1 text-sm text-violet-950">{selectedTicket.insight.next_best_action}</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div ref={messagesPaneRef} className="min-h-0 flex-1 overflow-y-auto bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_120px)] px-4 py-4">
                            {messages.length === 0 ? (
                                <div className="flex h-full min-h-[160px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/70 text-sm text-slate-500">
                                    Aún no hay mensajes en este ticket.
                                </div>
                            ) : null}
                            <div className="mx-auto flex max-w-3xl flex-col gap-3">
                            {messages.map((message) => {
                                const attachments = normalizeMessageAttachments(message.attachments);
                                const isAdminMessage = message.sender_type === 'Admin';
                                const isSystemMessage = message.sender_type === 'System';

                                return (
                                    <div key={message.id} className={`flex ${isAdminMessage ? 'justify-end' : isSystemMessage ? 'justify-center' : 'justify-start'}`}>
                                        <div className={`max-w-[min(72%,640px)] rounded-2xl px-4 py-3 text-sm shadow-sm ${isAdminMessage ? 'rounded-br-md bg-blue-600 text-white' : isSystemMessage ? 'max-w-xl border border-slate-200 bg-slate-50 text-slate-500' : 'rounded-bl-md border border-slate-200 bg-white text-slate-700'}`}>
                                            <div className="mb-1.5 flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-wide opacity-75">
                                                <span>{isAdminMessage ? 'Cloud Admin' : isSystemMessage ? 'Sistema' : getContactLabel(selectedTicket)}</span>
                                                <span className="font-medium normal-case tracking-normal">{formatTime(message.created_at)}</span>
                                            </div>
                                            <p className="whitespace-pre-wrap break-words leading-relaxed">{message.message}</p>

                                            {attachments.length ? (
                                                <div className="mt-3 grid gap-2">
                                                    {attachments.map((attachment, index) => {
                                                        const fileName = getAttachmentName(attachment);
                                                        const canOpen = Boolean(attachment.signed_url);
                                                        const content = (
                                                            <>
                                                                <div className={`h-16 w-20 shrink-0 overflow-hidden rounded-lg border ${isAdminMessage ? 'border-white/20 bg-white/10' : 'border-slate-200 bg-slate-50'}`}>
                                                                    {canOpen && isImageAttachment(attachment) ? (
                                                                        <img
                                                                            src={attachment.signed_url ?? undefined}
                                                                            alt={fileName}
                                                                            className="h-full w-full object-cover"
                                                                            loading="lazy"
                                                                        />
                                                                    ) : (
                                                                        <div className={`flex h-full w-full items-center justify-center ${isAdminMessage ? 'text-white/80' : 'text-slate-400'}`}>
                                                                            {isImageAttachment(attachment) ? <ImageIcon size={22} /> : <Paperclip size={22} />}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <div className="min-w-0 flex-1">
                                                                    <div className="flex min-w-0 items-center gap-1">
                                                                        <span className="truncate text-xs font-bold">{fileName}</span>
                                                                        {canOpen && <ExternalLink className="shrink-0 opacity-70" size={12} />}
                                                                    </div>
                                                                    <p className={`mt-1 text-[11px] ${isAdminMessage ? 'text-white/75' : 'text-slate-500'}`}>
                                                                        {formatAttachmentSize(attachment.size_bytes)}
                                                                    </p>
                                                                    {!canOpen && (
                                                                        <p className={`mt-1 text-[11px] font-medium ${isAdminMessage ? 'text-white/70' : 'text-amber-700'}`}>
                                                                            Archivo no disponible
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            </>
                                                        );

                                                        const className = `flex min-w-0 items-center gap-3 rounded-xl border p-2 text-left ${isAdminMessage ? 'border-white/20 bg-white/10 text-white' : 'border-slate-200 bg-slate-50 text-slate-700'}`;
                                                        const hoverClassName = isAdminMessage ? 'hover:bg-white/15' : 'hover:bg-slate-100';

                                                        return canOpen ? (
                                                            <a
                                                                key={attachment.id ?? `${fileName}-${index}`}
                                                                href={attachment.signed_url ?? undefined}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className={`${className} ${hoverClassName}`}
                                                            >
                                                                {content}
                                                            </a>
                                                        ) : (
                                                            <div key={attachment.id ?? `${fileName}-${index}`} className={className}>
                                                                {content}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ) : null}
                                        </div>
                                    </div>
                                );
                            })}
                            </div>
                        </div>

                        <div className="shrink-0 border-t border-slate-200 bg-slate-50 p-4">
                            <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                                {selectedTicket.insight?.suggested_replies?.length ? (
                                    <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                                        {selectedTicket.insight.suggested_replies.slice(0, 3).map((reply) => (
                                            <button
                                                key={reply}
                                                type="button"
                                                onClick={() => setReplyText(reply)}
                                                className="shrink-0 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-left text-xs font-medium text-violet-700 hover:bg-violet-100"
                                            >
                                                {reply.slice(0, 92)}
                                            </button>
                                        ))}
                                    </div>
                                ) : null}

                                <input
                                    ref={replyFileInputRef}
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp,image/gif"
                                    multiple
                                    className="hidden"
                                    onChange={handleReplyAttachmentSelection}
                                />

                                {pendingReplyAttachments.length ? (
                                    <div className="mb-3 flex flex-wrap gap-2">
                                        {pendingReplyAttachments.map((attachment) => (
                                            <div
                                                key={attachment.id}
                                                className="group relative h-20 w-20 overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
                                            >
                                                <img
                                                    src={attachment.previewUrl}
                                                    alt={attachment.file.name}
                                                    className="h-full w-full object-cover"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => removePendingReplyAttachment(attachment.id)}
                                                    className="absolute right-1 top-1 rounded-full bg-slate-900/75 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                                                    aria-label="Quitar adjunto"
                                                >
                                                    <X size={12} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : null}

                                {replyAttachmentError ? (
                                    <p className="mb-3 text-xs font-medium text-red-600">{replyAttachmentError}</p>
                                ) : null}

                                <div className="overflow-hidden rounded-xl border border-slate-300 bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/30">
                                    <textarea
                                        ref={replyTextareaRef}
                                        rows={1}
                                        value={replyText}
                                        onChange={(event) => setReplyText(event.target.value)}
                                        placeholder="Escribe tu respuesta…"
                                        className="max-h-[240px] min-h-[44px] w-full resize-none overflow-hidden border-0 px-3 py-2.5 text-sm leading-5 outline-none focus:ring-0"
                                    />
                                    <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-2 py-2">
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => replyFileInputRef.current?.click()}
                                                disabled={isSendingReply || pendingReplyAttachments.length >= MAX_REPLY_ATTACHMENTS}
                                                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                                                title="Adjuntar imagen"
                                            >
                                                <Paperclip size={14} />
                                                Adjuntar
                                            </button>
                                            <button
                                                type="button"
                                                onClick={generateDraft}
                                                disabled={isGeneratingDraft}
                                                className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-xs font-bold text-violet-700 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                <Wand2 size={14} />
                                                {isGeneratingDraft ? 'Generando...' : 'Borrador IA'}
                                            </button>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleSendReply}
                                            disabled={isSendingReply || (!replyText.trim() && pendingReplyAttachments.length === 0)}
                                            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {isSendingReply ? 'Enviando...' : getTicketRecipientEmail(selectedTicket) ? 'Enviar y notificar' : 'Enviar'}
                                            <Send size={14} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-slate-50 text-slate-400">
                        <MessageSquare className="mb-4 text-slate-300" size={56} />
                        <p className="font-medium text-slate-600">Selecciona un ticket para comenzar</p>
                    </div>
                )}
            </main>

            {selectedTicket && (
                <aside className="flex min-h-0 w-[320px] shrink-0 flex-col overflow-hidden border-l border-slate-200 bg-white">
                    <div className="shrink-0 border-b border-slate-100 p-4">
                        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-800">Contexto</h3>
                        <p className="mt-1 text-xs text-slate-500">Tenant, contacto y señales técnicas</p>
                    </div>

                    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
                        {selectedTicket.insight && (
                            <section>
                                <h4 className="mb-2 text-xs font-semibold text-slate-500">IA operativa</h4>
                                <div className="space-y-3 rounded-lg border border-violet-100 bg-violet-50 p-3 text-xs">
                                    {selectedTicket.insight.duplicate_signal && (
                                        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-amber-800">
                                            <AlertTriangle className="mt-0.5 shrink-0" size={14} />
                                            Posible patrón repetido o falla masiva.
                                        </div>
                                    )}
                                    {selectedTicket.insight.urgency_reason && (
                                        <div>
                                            <p className="font-bold uppercase tracking-wide text-violet-700">Razón de prioridad</p>
                                            <p className="mt-1 text-violet-950">{selectedTicket.insight.urgency_reason}</p>
                                        </div>
                                    )}
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="rounded-lg border border-violet-100 bg-white p-2">
                                            <p className="font-bold text-violet-700">Módulo</p>
                                            <p className="mt-1 text-slate-700">{selectedTicket.insight.affected_module || 'No detectado'}</p>
                                        </div>
                                        <div className="rounded-lg border border-violet-100 bg-white p-2">
                                            <p className="font-bold text-violet-700">Empresa</p>
                                            <p className="mt-1 text-slate-700">{selectedTicket.insight.detected_company || 'No detectada'}</p>
                                        </div>
                                    </div>
                                    {selectedTicket.insight.detected_phone && (
                                        <div className="rounded-lg border border-violet-100 bg-white p-2">
                                            <p className="font-bold text-violet-700">Teléfono detectado</p>
                                            <p className="mt-1 text-slate-700">{selectedTicket.insight.detected_phone}</p>
                                        </div>
                                    )}
                                    {selectedTicket.insight.detected_identifiers?.length ? (
                                        <div className="rounded-lg border border-violet-100 bg-white p-2">
                                            <p className="font-bold text-violet-700">Datos detectados</p>
                                            <p className="mt-1 text-slate-700">{selectedTicket.insight.detected_identifiers.join(' · ')}</p>
                                        </div>
                                    ) : null}
                                    {selectedTicket.insight.ai_tags?.length ? (
                                        <div className="flex flex-wrap gap-1">
                                            {selectedTicket.insight.ai_tags.slice(0, 6).map((tag) => (
                                                <span key={tag} className="rounded-full border border-violet-200 bg-white px-2 py-0.5 font-bold text-violet-700">
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    ) : null}
                                </div>
                            </section>
                        )}

                        <section>
                            <h4 className="mb-2 text-xs font-semibold text-slate-500">Contacto</h4>
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                                <p className="font-bold text-slate-800">{getContactLabel(selectedTicket)}</p>
                                <p className="mt-1 text-xs text-slate-500">{selectedTicket.contact?.company_name || selectedTicket.tenant_name}</p>

                                {getTicketRecipientEmail(selectedTicket) && (
                                    <button
                                        onClick={openContactModal}
                                        disabled={isCreatingContact}
                                        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        <UserPlus size={14} />
                                        {selectedTicket.contact?.company_name || selectedTicket.contact?.phone ? 'Editar contacto' : 'Convertir en contacto'}
                                    </button>
                                )}

                                {selectedTicket.contact?.metadata?.sla && (
                                    <div className="mt-3 rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-600">
                                        SLA: <span className="font-bold text-slate-800">{slaLabels[selectedTicket.contact.metadata.sla] ?? selectedTicket.contact.metadata.sla}</span>
                                    </div>
                                )}

                                {selectedTicket.assignment_status === 'needs_assignment' && (
                                    <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                                        <AlertTriangle className="mt-0.5 shrink-0" size={14} />
                                        Falta vincular este contacto a un tenant.
                                    </div>
                                )}
                            </div>
                        </section>

                        <section>
                            <h4 className="mb-2 text-xs font-semibold text-slate-500">Tenant Health</h4>
                            <div className="space-y-2 rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-xs">
                                <div className="flex items-center justify-between">
                                    <span className="font-medium text-emerald-700">Estado</span>
                                    <span className="font-bold text-emerald-900">{selectedTicket.tenant_id ? 'Conectado' : 'No vinculado'}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="flex items-center gap-1 text-emerald-700"><BatteryLow size={13} /> Batería</span>
                                    <span className="font-bold text-emerald-900">{selectedTicket.technical_context?.battery_level || 'N/A'}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="flex items-center gap-1 text-emerald-700"><WifiOff size={13} /> Red</span>
                                    <span className="font-bold text-emerald-900">{selectedTicket.technical_context?.network_type || 'N/A'}</span>
                                </div>
                            </div>
                        </section>

                        <section>
                            <h4 className="mb-2 text-xs font-semibold text-slate-500">Últimos errores</h4>
                            <div className="rounded-lg bg-slate-950 p-3 font-mono text-[11px] text-emerald-300">
                                {selectedTicket.technical_context?.last_5_errors?.length
                                    ? selectedTicket.technical_context.last_5_errors.map((error) => <p key={error}>{error}</p>)
                                    : <p>No hay errores locales registrados.</p>}
                            </div>
                        </section>

                        <section>
                            <h4 className="mb-2 text-xs font-semibold text-slate-500">Acciones rápidas</h4>
                            <div className="space-y-2">
                                <button
                                    onClick={openImprovementModal}
                                    className="flex w-full items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs font-medium text-amber-800 hover:bg-amber-100"
                                >
                                    Marcar como mejora
                                    <Lightbulb size={13} />
                                </button>
                                <button className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs font-medium text-slate-600 hover:bg-slate-50">
                                    Forzar Sync Inbox
                                    <Link2 size={13} />
                                </button>
                                <button className="flex w-full items-center justify-between rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-left text-xs font-medium text-violet-700 hover:bg-violet-100">
                                    Crear ticket preventivo
                                    <Sparkles size={13} />
                                </button>
                            </div>
                        </section>
                    </div>
                </aside>
            )}

            {isImprovementModalOpen && selectedTicket && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
                    <div className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl">
                        <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
                            <div>
                                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
                                    <Lightbulb size={14} />
                                    Mejora solicitada
                                </div>
                                <h2 className="text-lg font-black text-slate-900">Enviar caso a mejoras</h2>
                                <p className="mt-1 text-sm text-slate-500">Se creara una oportunidad vinculada al ticket y se notificara al cliente.</p>
                            </div>
                            <button
                                onClick={closeImprovementModal}
                                className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50"
                                aria-label="Cerrar"
                                type="button"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="space-y-4 p-5">
                            <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
                                <label className="block">
                                    <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Titulo</span>
                                    <input
                                        value={improvementDraft.title}
                                        onChange={(event) => updateImprovementDraft('title', event.target.value)}
                                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                        placeholder="Ej. Promociones por forma de pago"
                                    />
                                </label>
                                <label className="block">
                                    <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Prioridad</span>
                                    <select
                                        value={improvementDraft.priority}
                                        onChange={(event) => updateImprovementDraft('priority', event.target.value as ImprovementPriority)}
                                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                    >
                                        <option value="Baja">Baja</option>
                                        <option value="Media">Media</option>
                                        <option value="Alta">Alta</option>
                                        <option value="Critica">Critica</option>
                                    </select>
                                </label>
                            </div>

                            <label className="block">
                                <span className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                                    Modulo afectado
                                    <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] text-violet-700">Sugerido por IA</span>
                                </span>
                                <input
                                    value={improvementDraft.affectedModule}
                                    onChange={(event) => updateImprovementDraft('affectedModule', event.target.value)}
                                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                    placeholder="ERP, POS, Promociones, Activos fijos..."
                                />
                            </label>

                            <label className="block">
                                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Solicitud del cliente</span>
                                <textarea
                                    value={improvementDraft.requestedCapability}
                                    onChange={(event) => updateImprovementDraft('requestedCapability', event.target.value)}
                                    rows={4}
                                    className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                    placeholder="Describe lo que el cliente esta solicitando..."
                                />
                            </label>

                            <label className="block">
                                <span className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                                    Impacto operativo
                                    <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] text-violet-700">Sugerido por IA</span>
                                </span>
                                <textarea
                                    value={improvementDraft.customerImpact}
                                    onChange={(event) => updateImprovementDraft('customerImpact', event.target.value)}
                                    rows={3}
                                    className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                    placeholder="Ej. Evita doble digitacion, reduce errores, desbloquea cierre de caja..."
                                />
                            </label>

                            {improvementError && (
                                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                                    {improvementError}
                                </div>
                            )}
                            {improvementNotice && (
                                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                                    {improvementNotice}
                                </div>
                            )}
                        </div>

                        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4">
                            <button
                                onClick={closeImprovementModal}
                                disabled={isSavingImprovement}
                                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                                type="button"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleCreateImprovement}
                                disabled={isSavingImprovement}
                                className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
                                type="button"
                            >
                                {isSavingImprovement ? <Loader2 className="animate-spin" size={16} /> : <Lightbulb size={16} />}
                                Registrar y notificar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isContactModalOpen && selectedTicket && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
                    <div className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl">
                        <div className="flex items-center justify-between border-b border-slate-100 p-5">
                            <div>
                                <h3 className="text-lg font-black text-slate-900">Convertir en contacto</h3>
                                <p className="mt-1 text-sm text-slate-500">Completa los datos del remitente y define su nivel de atención.</p>
                            </div>
                            <button
                                onClick={() => setIsContactModalOpen(false)}
                                className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50"
                                type="button"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
                            <label className="block sm:col-span-2">
                                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">Nombre</span>
                                <input
                                    value={contactForm.name}
                                    onChange={(event) => setContactForm((current) => ({ ...current, name: event.target.value }))}
                                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                />
                            </label>
                            <label className="block">
                                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">Teléfono</span>
                                <input
                                    value={contactForm.phone}
                                    onChange={(event) => setContactForm((current) => ({ ...current, phone: event.target.value }))}
                                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                />
                            </label>
                            <label className="block">
                                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">SLA</span>
                                <select
                                    value={contactForm.sla}
                                    onChange={(event) => setContactForm((current) => ({ ...current, sla: event.target.value }))}
                                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                >
                                    <option value="standard">Estándar</option>
                                    <option value="priority">Prioritario</option>
                                    <option value="critical">Crítico</option>
                                </select>
                            </label>
                            <label className="block sm:col-span-2">
                                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">Mail</span>
                                <input
                                    value={contactForm.email}
                                    onChange={(event) => setContactForm((current) => ({ ...current, email: event.target.value }))}
                                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                />
                            </label>
                            <label className="block sm:col-span-2">
                                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">Empresa</span>
                                <input
                                    value={contactForm.companyName}
                                    onChange={(event) => setContactForm((current) => ({ ...current, companyName: event.target.value }))}
                                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                />
                            </label>
                        </div>

                        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 p-4">
                            <button
                                onClick={() => setIsContactModalOpen(false)}
                                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
                                type="button"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={saveContactFromTicket}
                                disabled={isCreatingContact || !contactForm.email.trim()}
                                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                                type="button"
                            >
                                {isCreatingContact ? 'Guardando...' : 'Guardar contacto'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SupportCommandCenter;
