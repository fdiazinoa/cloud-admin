-- ==============================================================================
-- Módulo de Soporte Proactivo (Helpdesk)
-- ==============================================================================

-- 1. Enum para Categoría del Ticket
CREATE TYPE ticket_category AS ENUM (
  'Ventas',
  'Inventario',
  'Fiscal',
  'Hardware',
  'Pagos',
  'Otros'
);

-- 2. Enum para Prioridad del Ticket
CREATE TYPE ticket_priority AS ENUM (
  'Baja',
  'Media',
  'Alta',
  'Critica'
);

-- 3. Enum para Estado del Ticket
CREATE TYPE ticket_status AS ENUM (
  'Abierto',
  'En_Proceso',
  'Resuelto',
  'Cerrado'
);

-- 4. Enum para Tipo de Remitente
CREATE TYPE message_sender_type AS ENUM (
  'Admin',
  'Client',
  'System'
);

-- 5. Tabla support_tickets
CREATE TABLE IF NOT EXISTS landlord.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES landlord.tenants(id) ON DELETE CASCADE,
  category ticket_category NOT NULL DEFAULT 'Otros',
  priority ticket_priority NOT NULL DEFAULT 'Media',
  status ticket_status NOT NULL DEFAULT 'Abierto',
  subject TEXT NOT NULL,
  technical_context JSONB DEFAULT '{}'::jsonb, -- Almacena info del auto-diagnóstico (batería, red, errores, etc)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Trigger para actualizar updated_at en support_tickets
CREATE OR REPLACE FUNCTION update_support_ticket_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_support_tickets_updated_at
    BEFORE UPDATE ON landlord.support_tickets
    FOR EACH ROW
    EXECUTE FUNCTION update_support_ticket_updated_at_column();

-- 6. Tabla ticket_messages
CREATE TABLE IF NOT EXISTS landlord.ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES landlord.support_tickets(id) ON DELETE CASCADE,
  sender_type message_sender_type NOT NULL,
  sender_id UUID, -- Opcional, puede ser el ID del Admin o null si es la terminal
  message TEXT NOT NULL,
  attachments JSONB DEFAULT '[]'::jsonb, -- Array de URLs o metadata de archivos adjuntos
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==============================================================================
-- Políticas de Seguridad RLS (Row Level Security)
-- ==============================================================================

-- Habilitar RLS en las tablas
ALTER TABLE landlord.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE landlord.ticket_messages ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- Políticas para support_tickets
-- ------------------------------------------------------------------------------

-- (Cliente/POS) Puede ver solo sus propios tickets
CREATE POLICY "Tenants can view their own tickets"
ON landlord.support_tickets FOR SELECT
USING (tenant_id = auth.uid()); -- Asumiendo que el ID de sesión/tenant es auth.uid()

-- (Cliente/POS) Puede crear tickets
CREATE POLICY "Tenants can insert their own tickets"
ON landlord.support_tickets FOR INSERT
WITH CHECK (tenant_id = auth.uid());

-- (Cliente/POS) Puede actualizar sus tickets (ej. marcarlos resueltos)
CREATE POLICY "Tenants can update their own tickets"
ON landlord.support_tickets FOR UPDATE
USING (tenant_id = auth.uid());

-- (Admin) Puede ver todos los tickets. (Podemos usar un flag is_admin o verificar el rol, aquí lo hacemos abierto para el service role o si auth.role() = 'service_role')
-- En Supabase, el rol service_role bypassa RLS, pero podemos agregar una póliza para usuarios autenticados como admins si aplica.
-- CREATE POLICY "Admins can view all tickets" ON landlord.support_tickets FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

-- ------------------------------------------------------------------------------
-- Políticas para ticket_messages
-- ------------------------------------------------------------------------------

-- (Cliente/POS) Puede ver mensajes de sus propios tickets
CREATE POLICY "Tenants can view messages of their tickets"
ON landlord.ticket_messages FOR SELECT
USING (
  ticket_id IN (
    SELECT id FROM landlord.support_tickets WHERE tenant_id = auth.uid()
  )
);

-- (Cliente/POS) Puede insertar mensajes en sus propios tickets
CREATE POLICY "Tenants can insert messages to their tickets"
ON landlord.ticket_messages FOR INSERT
WITH CHECK (
  ticket_id IN (
    SELECT id FROM landlord.support_tickets WHERE tenant_id = auth.uid()
  )
  AND sender_type = 'Client'
);

-- ==============================================================================
-- Configuración de WebSockets (Realtime)
-- ==============================================================================

-- Habilitar Realtime para estas tablas
alter publication supabase_realtime add table landlord.support_tickets;
alter publication supabase_realtime add table landlord.ticket_messages;
