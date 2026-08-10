-- Manual operativo v1 de Clic-Suite para Helpdesk Copilot.
-- Cada fila es un fragmento recuperable, acotado a un sintoma/procedimiento.

insert into landlord.support_knowledge_base (
  module,
  title,
  content,
  tags,
  source,
  source_path
)
values
(
  'Clic-Suite Diagnostico',
  'Datos minimos y limites de una respuesta segura',
  'Identificar producto, tenant, sucursal, terminal, version, fecha y hora, folio, error exacto, alcance y conectividad. No pedir contrasenas, tokens, llaves privadas, datos completos de tarjeta ni credenciales fiscales. No indicar reinstalacion, borrado de almacenamiento, limpieza de SQLite, liberacion de caja o cambio de device_id mientras existan ventas, cierres o documentos pendientes. Si hay riesgo de perdida de datos, pago ambiguo o fiscalidad incierta, acusar recibo y escalar.',
  array['clic-suite', 'diagnostico', 'datos', 'seguridad', 'escalamiento', 'copilot'],
  'clic_suite_manual_v1',
  'Cloud-Admin/docs/helpdesk/clic-suite-copilot-manual.md'
),
(
  'POS Sincronizacion',
  'Proteger ventas y cola local antes de diagnosticar',
  'CLIC-POS es offline-first: Android persiste en SQLite nativo y web en IndexedDB. Confirmar si la venta termino localmente, folios, terminal, hora del ultimo Z, indicador de sync y cantidad de pendientes. Restablecer red y usar Forzar Sincronizacion Completa una sola vez. Si persiste, copiar diagnostico y escalar. Nunca desinstalar, borrar almacenamiento, reiniciar la base ni eliminar la cola para resolver pendientes.',
  array['pos', 'offline', 'sqlite', 'indexeddb', 'cola', 'sync', 'sincronizacion', 'ventas'],
  'clic_suite_manual_v1',
  'CLIC-POS/components/SyncStatusHub.tsx'
),
(
  'POS Activacion',
  'Activacion inicial con email y clave temporal',
  'En Activacion usar el email registrado y la clave temporal; el primer acceso puede exigir una nueva clave de al menos seis caracteres. Si no se resuelve la licencia, recopilar tenant y error y escalar para reprovisionar en Cloud Admin. Si el APK indica que no incluye credenciales Supabase, volver a Elegir tipo de POS. Nunca pedir al cliente que envie su contrasena por el ticket.',
  array['pos', 'activacion', 'login', 'licencia', 'tenant', 'clave temporal'],
  'clic_suite_manual_v1',
  'CLIC-POS/components/ActivationScreen.tsx'
),
(
  'POS Terminales',
  'Caja adicional no encuentra la Caja Master',
  'En Activar Terminal elegir Caja Esclava / Adicional. Confirmar que ambos equipos esten en la misma red, que la IP manual sea la de una Caja Master operativa y no la de KDS o auxiliar, y usar Conectar y Sincronizar. Si requiere autorizacion administrativa, escalar sin pedir ni compartir el PIN.',
  array['pos', 'terminal', 'caja master', 'caja esclava', 'red local', 'ip', 'pairing'],
  'clic_suite_manual_v1',
  'CLIC-POS/components/TerminalBindingScreen.tsx'
),
(
  'POS Sincronizacion',
  'Interpretar diagnosticos de sincronizacion',
  'DEVICE_NOT_AUTHORIZED requiere validar y autorizar el dispositivo correcto en Cloud Admin. FISCAL_CONFIG_MISSING requiere serie, rango y configuracion fiscal antes de emitir. ERP_MASTER_PULL_FAILED o SYNC_COLLECTION_PULL_FAILED requiere registrar coleccion, endpoint, estado HTTP, terminal y hora, y reintentar una vez. Usar Copiar diagnostico y ocultar secretos completos.',
  array['pos', 'sync', 'device_not_authorized', 'fiscal_config_missing', 'erp_master_pull_failed', 'diagnostico'],
  'clic_suite_manual_v1',
  'CLIC-POS/components/SyncErrorDiagnosticModal.tsx'
),
(
  'POS Impresion',
  'Impresora ticket etiqueta o comanda no responde',
  'Identificar tipo de documento, impresora, conexion Bluetooth USB o red y rol asignado. Verificar descubrimiento y vinculo en Ajustes > Hardware y ejecutar una prueba. Confirmar si afecta todo o solo un area/categoria. Reiniciar la impresora y reintentar; no borrar offline_print_queue, que se reprocesa FIFO al recuperar conexion o foco.',
  array['pos', 'impresora', 'ticket', 'etiqueta', 'comanda', 'bluetooth', 'usb', 'offline_print_queue'],
  'clic_suite_manual_v1',
  'CLIC-POS/docs/NATIVE_PRINT_BRIDGE_CONTRACT.md'
),
(
  'POS Cierre Z',
  'Cierre Z incompleto o sin impresion',
  'Confirmar terminal, usuario, hora y si aparecio Cierre Finalizado. Revisar el historial antes de repetir. Separar impresion de persistencia: un timeout de impresora no significa necesariamente que el Z fallo. Si el proceso sigue en segundo plano, esperar y revisar historial. Si no existe Z y la caja sigue abierta, escalar con conteo, balance teorico y error exacto.',
  array['pos', 'cierre', 'z', 'z-report', 'impresion', 'caja', 'conteo'],
  'clic_suite_manual_v1',
  'CLIC-POS/components/ZReportDashboard.tsx'
),
(
  'POS Pagos',
  'Error o demora al finalizar pago',
  'Confirmar si el procesador aprobo o rechazo antes de volver a cobrar. Registrar metodo, monto, hora, folio y codigo del procesador ocultando PAN y credenciales. Si indica secuencia fiscal o configuracion de terminal, corregir antes de reintentar. Si el cobro tarda, comprobar historial. Pago aprobado sin venta confirmada siempre se escala para evitar doble cobro.',
  array['pos', 'pago', 'venta', 'tarjeta', 'doble cobro', 'secuencia fiscal', 'procesador'],
  'clic_suite_manual_v1',
  'CLIC-POS/components/PaymentModal.tsx'
),
(
  'ERP Terminales',
  'Vincular o reemplazar dispositivo de una terminal',
  'Una terminal nueva puede tener device_id DRAFT y se reemplaza al vincular el POS real. Primera vinculacion requiere admin o manager; reemplazar un dispositivo existente requiere admin, invalida la sesion anterior y debe auditarse. Confirmar tenant, compania, sucursal, terminal y dispositivo. Copilot no debe ejecutar el reemplazo autonomamente.',
  array['erp', 'terminal', 'device_id', 'draft', 'vinculacion', 'reemplazo', 'auditoria'],
  'clic_suite_manual_v1',
  'CLIC-ERP/docs/setup-terminal-api.md'
),
(
  'ERP Terminales',
  'Configuracion inicial fiscal y operativa incompleta',
  'La configuracion inicial incluye tienda, almacen predeterminado, series NCF, rangos fiscales y tarifas. Si falta configuracion fiscal, identificar terminal exacta y revisar esos datos en ERP antes de reintentar una venta fiscal. No pedir credenciales; solicitar proveedor, ambiente, RNC oculto, serie o rango y mensaje de validacion.',
  array['erp', 'terminal', 'configuracion inicial', 'almacen', 'ncf', 'rango fiscal', 'tarifa'],
  'clic_suite_manual_v1',
  'CLIC-ERP/server/services/operationalMasters.js'
),
(
  'ERP Sincronizacion POS',
  'Configuracion del ERP no llega al POS',
  'El flujo vigente usa solo CONFIG_PUSH_V2: prepara snapshots, encola referencia idempotente, el POS descarga y responde ACK APPLIED o FAILED. Confirmar terminal, dominio y hora; revisar evento y ACK. Si fallo, registrar codigo y dominio. No crear eventos legacy CONFIG_PUSH. Sincronizar el POS una vez y verificar la version recibida.',
  array['erp', 'pos', 'config_push_v2', 'ack', 'applied', 'failed', 'snapshot'],
  'clic_suite_manual_v1',
  'CLIC-ERP/docs/config-push-v2-only.md'
),
(
  'ERP Sincronizacion POS',
  'Ventas o cierres que no sincronizan',
  'Separar maestros de documentos. El tenant debe llegar a READY_FOR_DOCUMENTS; si hay mappings pendientes o conflictos no se deben reenviar documentos a ciegas. En ERP_FIRST debe existir un perfil activo de terminal. Solicitar estado bootstrap, modo POS_FIRST o ERP_FIRST, coleccion y mappings. Preparar perfil o mapping y despues reintentar. No reinstalar ni borrar datos locales.',
  array['erp', 'pos', 'bootstrap', 'ready_for_documents', 'mapping', 'perfil terminal', 'ventas', 'cierre'],
  'clic_suite_manual_v1',
  'CLIC-ERP/docs/bootstrap-master-sync.md'
),
(
  'ERP Promociones',
  'Por que una promocion no aparece en POS',
  'Comprobar promocion Activa, fechas, dias y horario; verificar que la terminal afectada este en Terminales objetivo. terminal_ids vacio es configuracion incompleta y no se envia. Confirmar producto categoria grupo o temporada, y que el articulo no tenga Excluir de Promociones. Publicar o sincronizar configuracion y probar en esa terminal.',
  array['erp', 'promocion', 'pos', 'terminal_ids', 'terminales objetivo', 'vigencia', 'excluir promociones'],
  'clic_suite_manual_v1',
  'CLIC-ERP/server/services/posPromotionsSnapshot.js'
),
(
  'ERP Facturacion Electronica',
  'Errores e-CF o Digifact',
  'No afirmar aceptacion DGII solo porque la venta finalizo. Recopilar folio, tipo e-CF, e-NCF si existe, hora, RNC oculto, ambiente y code message infoDetails. Validar credenciales sin exponerlas, token vigente, tipo, receptor, items y totales. DigiFact genera el e-NCF; no fabricarlo ni editarlo. Pago o venta completada con fiscalidad incierta se escala.',
  array['erp', 'ecf', 'digifact', 'dgii', 'encf', 'rnc', 'token', 'infoDetails'],
  'clic_suite_manual_v1',
  'CLIC-ERP/docs/digifact-ecf.md'
),
(
  'ERP Seguridad y Accesos',
  'Usuario no puede ver o ejecutar un modulo',
  'Confirmar tenant, usuario, rol ERP, rol POS si aplica, modulo y accion requerida. Las rutas pueden exigir rol y permisos VIEW CREATE EDIT o DELETE. Comparar para diagnostico sin copiar permisos indiscriminadamente. Escalar cambios a administrador y aplicar el minimo privilegio necesario.',
  array['erp', 'usuario', 'rol', 'permiso', 'rbac', 'view', 'acceso', 'tenant'],
  'clic_suite_manual_v1',
  'CLIC-ERP/src/pages/UsersRolesConfiguration.tsx'
),
(
  'Cloud Admin Terminales',
  'Dispositivo no autorizado o cambio de equipo',
  'En Empresas > Terminales comparar dispositivo reportado y autorizado, intento rechazado y version. Confirmar fisicamente equipo, tenant y terminal canonica, y evitar usar device_id de otra caja. Autorizar o reautorizar deja al equipo anterior sin sincronizar como esa terminal. Requiere motivo y confirmacion de administrador; Copilot solo recomienda y escala.',
  array['cloud-admin', 'terminal', 'device_not_authorized', 'autorizar', 'reautorizar', 'device_id'],
  'clic_suite_manual_v1',
  'Cloud-Admin/src/pages/Tenants.tsx'
),
(
  'Cloud Admin Terminales',
  'Perfil ERP incompleto y documentos pendientes',
  'Para ERP_CONTEXT_MISSING confirmar terminal canonica y dispositivo autorizado, usar Preparar perfil ERP, corregir readiness de almacen serie rango o contexto y reintentar primero un documento reparable. El reintento masivo permanece bloqueado mientras el perfil este incompleto. Solo despues reintentar pendientes de esa terminal.',
  array['cloud-admin', 'erp_context_missing', 'perfil erp', 'readiness', 'pendientes', 'reintento'],
  'clic_suite_manual_v1',
  'Cloud-Admin/src/pages/Tenants.tsx'
),
(
  'Cloud Admin Terminales',
  'Liberar cupo reparar enlace o rotar credenciales',
  'Liberar cupo puede dejar fuera al dispositivo actual; reparar enlace requiere terminal canonica y dispositivo autorizado; rotar credenciales invalida las anteriores. Son acciones administrativas. Copilot nunca debe ejecutarlas automaticamente: explicar impacto, comprobar pendientes, pedir confirmacion de administrador y conservar motivo y auditoria.',
  array['cloud-admin', 'liberar cupo', 'reparar enlace', 'rotar credenciales', 'administrador', 'auditoria'],
  'clic_suite_manual_v1',
  'Cloud-Admin/src/pages/Tenants.tsx'
),
(
  'Cloud Admin APK',
  'Nueva version registrada no aparece como APK actual',
  'La etiqueta Actual depende de is_latest y no solo de un version_code mayor. Confirmar versionName y versionCode creciente, checksum SHA-256, estado disponible y marca APK actual. Al marcar una nueva, las anteriores deben quedar is_latest false. Verificar que /api/pos-apk/latest devuelve la version esperada.',
  array['cloud-admin', 'apk', 'is_latest', 'version_code', 'release', 'actual', 'sha256'],
  'clic_suite_manual_v1',
  'Cloud-Admin/src/lib/posApkReleases.ts'
)
on conflict (module, title) do update
set content = excluded.content,
    tags = excluded.tags,
    source = excluded.source,
    source_path = excluded.source_path,
    is_active = true,
    updated_at = timezone('utc'::text, now());

