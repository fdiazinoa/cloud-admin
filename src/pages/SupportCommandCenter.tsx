import React, { useState, useEffect, useRef } from 'react';
import { supabaseAdmin } from '../lib/supabase';

interface TechnicalContext {
    app_version?: string;
    battery_level?: string;
    network_type?: string;
    last_5_errors?: string[];
    [key: string]: string | string[] | undefined;
}

interface Ticket {
    id: string;
    tenant_id: string;
    tenant_name: string;
    category: string;
    priority: string;
    status: string;
    subject: string;
    technical_context: TechnicalContext;
    created_at: string;
}

interface Message {
    id: string;
    sender_type: 'Admin' | 'Client' | 'System';
    message: string;
    created_at: string;
}

const SupportCommandCenter: React.FC = () => {
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
    const [replyText, setReplyText] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Estados visuales de filtros
    const [filterStatus, setFilterStatus] = useState('Todos');

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    useEffect(() => {
        let mounted = true;

        const fetchTickets = async () => {
            console.log("🛠️ Admin: Fetching tickets via supabaseAdmin...");
            const { data, error } = await supabaseAdmin.from('support_tickets')
                .select(`
                    *,
                    tenants (
                        name
                    )
                `)
                .order('created_at', { ascending: false });

            if (!error && data && mounted) {
                console.log("✅ Admin: Fetched tickets successfully", data.length);
                const mappedTickets = data.map(t => ({
                    ...t,
                    tenant_name: t.tenants?.name || 'Unknown Tenant'
                }));
                setTickets(mappedTickets);
            } else if (error) {
                console.error("❌ Admin: Error fetching tickets", error);
            }
        };

        fetchTickets();

        const channel = supabaseAdmin.channel('tickets_global')
            .on('postgres_changes', { event: '*', schema: 'landlord', table: 'support_tickets' }, () => {
                console.log("🛠️ Admin: Realtime event on support_tickets");
                fetchTickets();
            })
            .subscribe();

        return () => {
            mounted = false;
            supabaseAdmin.removeChannel(channel);
        };
    }, []);

    useEffect(() => {
        const ticketId = selectedTicket?.id;
        if (!ticketId) return;

        let mounted = true;

        const fetchMessages = async () => {
            const { data, error } = await supabaseAdmin.from('ticket_messages')
                .select('*')
                .eq('ticket_id', ticketId)
                .order('created_at', { ascending: true });
            if (!error && data && mounted) setMessages(data as Message[]);
        };

        fetchMessages();

        const msgChannel = supabaseAdmin.channel(`messages_${ticketId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'landlord',
                table: 'ticket_messages',
                filter: `ticket_id=eq.${ticketId}`
            }, (payload) => {
                if (mounted) {
                    setMessages(prev => [...prev, payload.new as Message]);
                }
            })
            .subscribe();

        return () => {
            mounted = false;
            supabaseAdmin.removeChannel(msgChannel);
        };
    }, [selectedTicket?.id]);

    const handleSelectTicket = (ticket: Ticket) => {
        setSelectedTicket(ticket);
    };

    const handeSendReply = async () => {
        if (!replyText.trim() || !selectedTicket) return;
        const txt = replyText.trim();
        setReplyText('');

        await supabaseAdmin.from('ticket_messages').insert({
            ticket_id: selectedTicket.id,
            message: txt,
            sender_type: 'Admin'
        });
    };

    const updateStatus = async (newStatus: string) => {
        if (!selectedTicket) return;
        await supabaseAdmin.from('support_tickets').update({ status: newStatus }).eq('id', selectedTicket.id);
        setSelectedTicket({ ...selectedTicket, status: newStatus });
    };

    return (
        <div className="flex h-[calc(100vh-64px)] bg-slate-50 overflow-hidden">

            {/* Columna Izquierda: Lista Maestra de Tickets */}
            <div className="w-1/3 min-w-[350px] border-r border-slate-200 bg-white flex flex-col">
                <div className="p-4 border-b border-slate-100 shrink-0">
                    <h1 className="text-xl font-bold text-slate-800 tracking-tight">Command Center</h1>
                    <p className="text-sm text-slate-500 mb-4">Soporte Técnico Proactivo</p>

                    {/* Dashboard mini-kpis */}
                    <div className="grid grid-cols-3 gap-2 mb-4">
                        <div className="bg-red-50 p-2 rounded-lg border border-red-100 text-center">
                            <span className="block text-xl font-bold text-red-600">3</span>
                            <span className="text-[10px] uppercase font-bold text-red-400">Críticos</span>
                        </div>
                        <div className="bg-orange-50 p-2 rounded-lg border border-orange-100 text-center">
                            <span className="block text-xl font-bold text-orange-600">8</span>
                            <span className="text-[10px] uppercase font-bold text-orange-400">Abiertos</span>
                        </div>
                        <div className="bg-green-50 p-2 rounded-lg border border-green-100 text-center">
                            <span className="block text-xl font-bold text-green-600">42</span>
                            <span className="text-[10px] uppercase font-bold text-green-400">Turno SLA</span>
                        </div>
                    </div>

                    <div className="flex bg-slate-100 rounded-lg p-1">
                        {['Todos', 'Abierto', 'En_Proceso'].map(status => (
                            <button
                                key={status}
                                onClick={() => setFilterStatus(status)}
                                className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-all ${filterStatus === status ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                {status.replace('_', ' ')}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2">
                    {tickets.filter(t => filterStatus === 'Todos' || t.status === filterStatus).map(ticket => (
                        <div
                            key={ticket.id}
                            onClick={() => handleSelectTicket(ticket)}
                            className={`p-3 rounded-xl mb-2 cursor-pointer transition-all border ${selectedTicket?.id === ticket.id ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-500' : 'bg-white border-slate-100 hover:border-slate-300 hover:shadow-sm'}`}
                        >
                            <div className="flex justify-between items-start mb-1">
                                <span className="text-xs font-bold text-slate-400">{ticket.id}</span>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${ticket.priority === 'Critica' ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'}`}>
                                    {ticket.priority.toUpperCase()}
                                </span>
                            </div>
                            <h3 className="font-semibold text-sm text-slate-800 truncate mb-1">{ticket.tenant_name}</h3>
                            <p className="text-xs text-slate-500 line-clamp-2">{ticket.subject}</p>

                            <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
                                <span className="flex items-center gap-1"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg> {ticket.category}</span>
                                <span>hace 15 min</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Columna Central: Consola de Respuesta */}
            <div className="flex-1 flex flex-col bg-white">
                {selectedTicket ? (
                    <>
                        <div className="p-4 border-b border-slate-100 shrink-0 bg-slate-50 flex justify-between items-center">
                            <div>
                                <h2 className="text-lg font-bold text-slate-800">{selectedTicket.tenant_name} <span className="text-sm font-normal text-slate-500 ml-2">{selectedTicket.id}</span></h2>
                                <div className="flex items-center mt-1 gap-2 text-xs">
                                    <span className={`px-2 py-0.5 rounded-md font-medium ${selectedTicket.status === 'Abierto' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                                        Estado: {selectedTicket.status.replace('_', ' ')}
                                    </span>
                                    <span className="text-slate-400">• Categoría: {selectedTicket.category}</span>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => updateStatus('En_Proceso')} className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">Marcar En Proceso</button>
                                <button onClick={() => updateStatus('Resuelto')} className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm">Resolver Ticket</button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {/* Mensajes Chat */}
                            {messages.map(msg => (
                                msg.sender_type === 'System' ? (
                                    <div key={msg.id} className="flex justify-center">
                                        <div className="bg-slate-100 text-slate-500 text-xs px-4 py-2 rounded-full border border-slate-200 text-center max-w-lg">
                                            <span className="font-bold">🤖 Sistema:</span> {msg.message}
                                        </div>
                                    </div>
                                ) : msg.sender_type === 'Client' ? (
                                    <div key={msg.id} className="flex flex-col items-start max-w-2xl">
                                        <span className="text-[10px] font-bold text-slate-400 ml-1 mb-1">Cliente POS ({selectedTicket.tenant_name})</span>
                                        <div className="bg-slate-50 text-slate-700 border border-slate-200 p-4 rounded-2xl rounded-tl-sm shadow-sm text-sm">
                                            {msg.message}
                                        </div>
                                    </div>
                                ) : (
                                    <div key={msg.id} className="flex flex-col items-end max-w-2xl self-end ml-auto">
                                        <span className="text-[10px] font-bold text-blue-400 mr-1 mb-1">Tú (Cloud Admin)</span>
                                        <div className="bg-blue-600 text-white p-4 rounded-2xl rounded-tr-sm shadow-md text-sm">
                                            {msg.message}
                                        </div>
                                    </div>
                                )
                            ))}
                            <div ref={messagesEndRef} />
                        </div>

                        <div className="p-4 bg-slate-50 border-t border-slate-200 shrink-0">
                            <div className="bg-white border border-slate-300 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-shadow">
                                <div className="bg-slate-50 border-b border-slate-200 px-3 py-2 flex gap-2">
                                    <button className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-200"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg></button>
                                    <button className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-200 font-bold font-serif">B</button>
                                    <button className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-200 italic font-serif">I</button>
                                </div>
                                <textarea
                                    rows={4}
                                    value={replyText}
                                    onChange={e => setReplyText(e.target.value)}
                                    placeholder={`Escribe tu respuesta a ${selectedTicket.tenant_name}...`}
                                    className="w-full p-3 resize-none border-0 focus:ring-0 text-sm"
                                ></textarea>
                                <div className="px-3 py-2 bg-slate-50 border-t border-slate-100 flex justify-end">
                                    <button onClick={handeSendReply} className="px-4 py-2 bg-blue-600 text-white font-medium text-sm rounded-lg shadow-sm shadow-blue-200 hover:bg-blue-700 flex items-center gap-2">
                                        Enviar Respuesta
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50">
                        <svg className="w-16 h-16 mb-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                        <p className="font-medium text-slate-500">Selecciona un ticket para comenzar a ayudar</p>
                    </div>
                )}
            </div>

            {/* Columna Derecha: Ficha de Diagnóstico de Inquilino */}
            {selectedTicket && (
                <div className="w-[300px] border-l border-slate-200 bg-white overflow-y-auto shrink-0 flex flex-col">
                    <div className="p-4 border-b border-slate-100 shrink-0">
                        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Tenant Health</h3>
                    </div>

                    <div className="p-4 space-y-6 flex-1">
                        {/* Info de Suscripción */}
                        <div>
                            <h4 className="text-xs font-semibold text-slate-500 mb-2">Suscripción</h4>
                            <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-sm">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                    <span className="font-bold text-emerald-800">Plan Pro (Activa)</span>
                                </div>
                                <p className="text-emerald-600 text-xs">Vence en 45 días (Pago al día)</p>
                            </div>
                        </div>

                        {/* Técnico del Auto-Diagnóstico */}
                        <div>
                            <h4 className="text-xs font-semibold text-slate-500 mb-2">Metadata de la Terminal</h4>
                            <ul className="bg-slate-50 border border-slate-100 rounded-lg p-3 text-xs space-y-2 text-slate-600">
                                <li className="flex justify-between border-b border-slate-100 pb-1">
                                    <span className="font-medium">OS / App Version:</span>
                                    <span className="text-slate-800">{selectedTicket.technical_context?.app_version || 'N/A'}</span>
                                </li>
                                <li className="flex justify-between border-b border-slate-100 pb-1">
                                    <span className="font-medium">Estado Red:</span>
                                    <span className="text-slate-800">{selectedTicket.technical_context?.network_type || 'N/A'}</span>
                                </li>
                                <li className="flex justify-between border-b border-slate-100 pb-1">
                                    <span className="font-medium">Batería Dispositivo:</span>
                                    <span className="text-slate-800">{selectedTicket.technical_context?.battery_level || 'N/A'}</span>
                                </li>
                                <li className="flex flex-col pt-1">
                                    <span className="font-medium mb-1">Últimos Errores (Local Logs):</span>
                                    <div className="bg-slate-900 text-emerald-400 p-2 rounded text-[10px] font-mono whitespace-pre-wrap">
                                        {selectedTicket.technical_context?.last_5_errors
                                            ? selectedTicket.technical_context.last_5_errors.join('\n')
                                            : '> No local errors detected.'}
                                    </div>
                                </li>
                            </ul>
                        </div>

                        {/* Acciones Rápidas */}
                        <div>
                            <h4 className="text-xs font-semibold text-slate-500 mb-2">Quick Actions</h4>
                            <div className="space-y-2">
                                <button className="w-full text-left px-3 py-2 text-xs font-medium bg-white border border-slate-200 rounded text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors flex items-center justify-between">
                                    Forzar Sync Inbox <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                </button>
                                <button className="w-full text-left px-3 py-2 text-xs font-medium bg-red-50 border border-red-100 rounded text-red-600 hover:bg-red-100 transition-colors flex items-center justify-between">
                                    Liberar Terminal Vinculada <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SupportCommandCenter;
