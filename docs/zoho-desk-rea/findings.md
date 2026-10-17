# Zoho Desk — Funcionamiento (REA) y mapeo al Helpdesk de Cloud-Admin

Captura realizada con REA 6.5.0 (CLI, `inspect-web-page` + `capture-browser-scenario`)
sobre una sesión viva de Zoho Desk (`desk.zoho.com`, departamento "soporte-tecnico").

## Evidencia

| Evidencia | ID |
|---|---|
| Lista "Tickets abiertos" (inspect-web-page) | `ev_035dd9f50c5ef2c6067f096438115f5ddf108cbfae22e9b865ca2116bf37ef25` |
| Detalle de ticket #29014 (inspect-web-page) | `ev_f1629e616e4c6ca0bdd43de89cdd71786e359b295ecce961bb78316be07a87e3` |
| Escenario de clic (capture-browser-scenario) | `ev_…` (ver `03-scenario-click.json`) |

Archivos crudos: `docs/zoho-desk-rea/{01,02,03}-*.json`.

## 1. Navegación (rail izquierdo)

- Iconos: **Pins, Chats (3), Canales, Threads, People**.
- Módulos: **Tickets · Base de conocimientos · Clientes · Cuartel General · Vistas · Etiquetas**.
- Selector de **departamento** ("Soporte Tecnico") + top bar (búsqueda global, notificaciones, setup, agente "En línea").

## 2. Lista de tickets ("Tickets abiertos")

- **Vistas/colas**: "Tickets abiertos", "Mis filtros guardados", estrella (favorita), "Recuento total", ordenar, "Vista clásica".
- Cada fila muestra: **icono de canal** (email), **asunto**, **ID de ticket (#…​)**, **estado** (Abierto), **nº de conversaciones**, **nº de comentarios**, **fecha** (Creado el / Recibido el / "hace un día"), **contacto**, **cuenta**, **asignado** (avatar o "No asignado"), badge **"Paid user"**.

## 3. Detalle de ticket (3 paneles)

- **Izquierda**: lista persistente.
- **Centro**: asunto; acciones **Responder A Todos**, **Acciones de respuesta**, **Comment**, **More Action**; botón **Aplicar macro**; pestañas **Conversación · Resolución · Adjunto · Aprobación · Historia**; cuerpo de la conversación.
- **Derecha ("Propiedades de Ticket")**:
  - *Información de Contacto*: Nombre de Cuenta, Correo electrónico, Phone 1, Número de teléfono, Nombre del Producto.
  - *Información clave*: **Estado**, **Propietario de Ticket** ("No asignado"), **Fecha de vencimiento** ("Sin fecha de vencimiento establecida"), **Etiquetas**.
  - *Información sobre la Ticket*: **Consultor**, **Prioridad**, **Canal**, **Idioma**, **Clasificaciones**.
  - *Información adicional*.
  - Botón **Edit Ticket** (edición inline: Guardar/Cancelar).

## 4. Mapeo → Helpdesk actual (`SupportCommandCenter.tsx`)

| Zoho Desk | Helpdesk actual | Gap |
|---|---|---|
| Vistas/colas + "Mis filtros guardados" + estrella | Solo bandeja activa/spam + filtros | ❌ Falta (Fase 1) |
| Fila con canal + asunto + ID + estado + conversaciones + comentarios + cuenta + asignado + "Paid user" | Card con asunto/preview/estado/canal/departamento/asignado | ⚠️ Parcial |
| Pestañas Conversación/Resolución/Adjunto/Aprobación/Historia | Conversación + timeline (sin pestañas Resolución/Adjunto/Aprobación/Historia) | ❌ Parcial |
| **Aplicar macro** (acciones enlatadas) | Plantillas de respuesta + acciones masivas (separadas) | ❌ Falta (Fase 2) |
| Panel "Propiedades de Ticket" (contacto + clave + ticket) | Panel "Contexto" (asignación, etiquetas, IA, contacto, tenant health) | ⚠️ Reorganizar a modelo Zoho |
| **Fecha de vencimiento** (due date) | Solo "tiempo abierto" / "atrasados" | ❌ Falta (Fase 2) |
| Campos: Consultor, Prioridad, Canal, Idioma, Clasificaciones | category, priority, source, tags | ⚠️ Parcial |
| "Agregar nuevo Ticket" + Quick Action | Solo "ticket preventivo" en contexto | ❌ Falta |
| Base de conocimientos (módulo) | KB separada, sin sugerencia inline | ❌ Falta (Fase 4) |

## 5. Plan de refactor recomendado

1. **Fase 1 — Vistas/colas + workspace del detalle**: vistas guardadas (reutilizando filtros), layout de detalle a 3 paneles alineado a Zoho (acciones, pestañas, panel de propiedades).
2. **Fase 2 — Macros + fecha de vencimiento/SLA** (backend leve).
3. **Fase 3 — Tickets padre/hijo + división** (modelo de datos).
4. **Fase 4 — Sugerencias de KB inline**.

## 6. Formulario "Agregar Ticket" (`/tickets/new`)

Secciones del formulario:
- **Información sobre la Ticket**: Nombre del Contacto, Nombre de Cuenta, Correo electrónico, Phone 1, Número de teléfono, Asunto, Descripción, Estado (default "Abierto"), Propietario de Ticket (combobox de equipo), Nombre del Producto, Consultor ("-NONE-").
- **Información adicional**: Fecha de vencimiento ("dd MMM yyyy hh:mm"), Prioridad, Canal (default varía), Idioma, Clasificaciones.
- **Agregar archivo adjunto**: arrastrar/soltar, "Buscar archivos", "Tamaño máximo 20 MB".
- **Panel lateral "Detalles relacionados"**: info del Contacto elegido + botón "Elegir Contacto".
- Acciones: **Enviar / Cancelar**.

## 7. Contactos (`/contacts/list`) y Cuentas

- Left panel: **Contacto** / **Cuenta** (dos entidades separadas: contacto y account).
- Lista "Todos los Contactos" con cards: avatar, nombre, **Account Name**, email (mailto), teléfono (tel).
- Mismos controles que tickets: "Mis filtros guardados", "Recuento total", "Vista de cuadrícula", "Sort by".

## 8. Base de conocimientos (`/knowledge-base/page`)

- "Agregar nuevo Artículo" + contenido servido en un iframe (Help Center).

## 9. Detalle: edición inline de "Propiedades de Ticket"

El panel derecho es editable inline (textboxes + "Guardar"/"Cancelar"):
- Contacto: nombre, email, phone.
- Clave: Propietario de Ticket, Estado, Fecha de vencimiento, Etiquetas.
- Ticket: Nombre de Cuenta, Correo, Phone 1, Número de teléfono, Nombre del Producto, Consultor.
- Adicional: Prioridad, Canal, Idioma, Clasificaciones.

## 10. Conceptos clave de Zoho Desk (resumen para el refactor)

1. **Vistas/colas** ("Tickets abiertos", "Mis filtros guardados", estrella, "Recuento total", ordenar, vista clásica/cuadrícula).
2. **Dos entidades de cliente**: Contacto y Cuenta (Account).
3. **Ticket** = asunto + descripción + estado + propietario + fecha de vencimiento + prioridad + canal + idioma + clasificaciones + etiquetas + adjuntos + conversaciones + comentarios.
4. **Detalle en 3 paneles**: lista | conversación (acciones + macro + pestañas) | propiedades editables.
5. **Crear ticket** con el mismo set de campos.
6. **Macros** ("Aplicar macro") como acciones enlatadas.
7. **KB** como módulo con "Agregar nuevo Artículo".
