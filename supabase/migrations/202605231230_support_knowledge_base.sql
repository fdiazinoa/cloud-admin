create table if not exists landlord.support_knowledge_base (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'manual',
  module text not null,
  title text not null,
  content text not null,
  tags text[] not null default '{}'::text[],
  source_path text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  search_vector tsvector not null default ''::tsvector,
  constraint support_knowledge_base_module_title_key unique (module, title)
);

create or replace function landlord.refresh_support_knowledge_search_vector()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  new.search_vector = to_tsvector(
    'simple',
    coalesce(new.module, '') || ' ' ||
    coalesce(new.title, '') || ' ' ||
    coalesce(array_to_string(new.tags, ' '), '') || ' ' ||
    coalesce(new.content, '')
  );
  return new;
end;
$$;

drop trigger if exists refresh_support_knowledge_search_vector_trigger
  on landlord.support_knowledge_base;

create trigger refresh_support_knowledge_search_vector_trigger
before insert or update of module, title, content, tags
on landlord.support_knowledge_base
for each row
execute function landlord.refresh_support_knowledge_search_vector();

create index if not exists support_knowledge_base_search_idx
  on landlord.support_knowledge_base using gin (search_vector);

create index if not exists support_knowledge_base_module_idx
  on landlord.support_knowledge_base (module)
  where is_active;

create or replace function landlord.search_support_knowledge(
  query_text text,
  match_limit integer default 5
)
returns table (
  id uuid,
  module text,
  title text,
  content text,
  tags text[],
  source text,
  source_path text,
  rank real
)
language sql
stable
as $$
  with query_terms as (
    select regexp_replace(term, '[^a-z0-9_]+', '', 'g') as term
    from regexp_split_to_table(
      translate(lower(coalesce(query_text, '')), 'áéíóúüñ', 'aeiouun'),
      '\s+'
    ) as term
  ),
  filtered_terms as (
    select distinct term
    from query_terms
    where length(term) > 2
      and term not in ('como', 'para', 'pero', 'que', 'con', 'del', 'las', 'los', 'una', 'uno', 'por', 'desde', 'este', 'esta', 'ese', 'esa')
  ),
  parsed_query as (
    select to_tsquery('simple', string_agg(term || ':*', ' | ')) as ts_query
    from filtered_terms
  )
  select
    kb.id,
    kb.module,
    kb.title,
    kb.content,
    kb.tags,
    kb.source,
    kb.source_path,
    ts_rank_cd(kb.search_vector, parsed_query.ts_query) as rank
  from landlord.support_knowledge_base kb
  cross join parsed_query
  where kb.is_active
    and parsed_query.ts_query is not null
    and kb.search_vector @@ parsed_query.ts_query
  order by rank desc, kb.updated_at desc
  limit greatest(1, least(coalesce(match_limit, 5), 8));
$$;

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
  'ERP Promociones',
  'Crear y activar una promocion',
  'Ruta de menu: Marketing ERP > Promociones. Para crear una promocion, abrir Promociones y presionar el boton + Nueva promocion. Elegir el tipo de promocion: Descuento %, 2x1 BOGO, Hora Feliz o Gasta y Gana. Definir el gatillo de aplicacion: Producto especifico, Categoria completa, Temporada/campana, Grupo/coleccion o Todo el inventario. Si el gatillo no es Todo el inventario, seleccionar la referencia objetivo. Indicar el beneficio o porcentaje, dias activos, horario, vigencia desde/hasta, nombre descriptivo, prioridad, estado activo y al menos una terminal. Luego presionar Guardar promocion. Si no selecciona terminales, el ERP no permite guardar y la promocion no viaja al POS.',
  array['promociones', 'marketing', 'crm', 'pos', 'terminales', 'descuento'],
  'erp_code',
  'src/pages/Promotions.tsx'
),
(
  'ERP Promociones',
  'Por que una promocion no aparece en POS',
  'Para que una promocion aparezca en el POS debe estar activa, dentro de la fecha de vigencia, dentro del horario y dias configurados, tener terminal_ids no vacio e incluir la terminal del POS. En el backend, las promociones activas se filtran por terminal; terminal_ids vacio se trata como promocion incompleta y no se envia al POS. Si el usuario acaba de guardar cambios, pedirle sincronizar o reiniciar la carga de configuracion del POS si todavia no aparece.',
  array['promociones', 'pos', 'sincronizacion', 'terminal_ids', 'terminales'],
  'erp_code',
  'server/services/posPromotionsSnapshot.js'
),
(
  'ERP Facturacion Electronica',
  'Errores e-CF o Digifact',
  'Ante un error e-CF o Digifact, revisar secuencia fiscal, RNC del cliente, tipo de comprobante, credenciales fiscales y conectividad con el proveedor. Si las ventas quedan completadas pero con error e-CF, no prometer que ya fueron aceptadas por DGII; indicar que se validara el rechazo del proveedor y el ultimo payload fiscal. Pedir folio, NCF/e-CF y hora aproximada si el ticket no los incluye.',
  array['ecf', 'digifact', 'dgii', 'factura', 'ncf', 'rnc', 'comprobante'],
  'manual',
  'docs/digifact-ecf.md'
),
(
  'ERP Sincronizacion POS',
  'Ventas o cierres que no sincronizan',
  'Si ventas o cierres no viajan desde POS al ERP, revisar conectividad, cola local de sincronizacion, eventos pendientes y cierre Z. Recomendar no reinstalar la app ni borrar datos locales hasta confirmar que la cola fue enviada. Pedir terminal, hora del cierre, folios afectados y si al ejecutar cierre Z las transacciones viajaron, porque eso indica acumulacion o disparo tardio de sync.',
  array['sync', 'sincronizacion', 'pos', 'ventas', 'cierre', 'z', 'offline'],
  'manual',
  'server/services/terminalConfigSnapshot.js'
),
(
  'ERP Impresoras',
  'Configurar impresora de cocina o comandas',
  'Para problemas de impresora o comandas, validar que la terminal tenga asignada la impresora correcta, que la ruta o perfil de impresion corresponda al area de cocina, y realizar una prueba de comanda. Pedir nombre de la terminal afectada, si otras impresoras funcionan y si el problema ocurre con todos los productos o solo con una categoria.',
  array['impresora', 'printer', 'cocina', 'comanda', 'hardware', 'terminal'],
  'manual',
  null
),
(
  'ERP Catalogo',
  'Producto excluido de promociones',
  'En el editor de productos existe el control Excluir de Promociones. Si un producto no recibe descuentos esperados, validar que no tenga ese flag activo, que pertenezca a la categoria/grupo/temporada objetivo y que la promocion este activa para la terminal donde se intenta vender.',
  array['producto', 'catalogo', 'inventario', 'promociones', 'excluir'],
  'erp_code',
  'src/components/inventory/ProductEditor.tsx'
)
on conflict (module, title) do update
set content = excluded.content,
    tags = excluded.tags,
    source = excluded.source,
    source_path = excluded.source_path,
    is_active = true,
    updated_at = timezone('utc'::text, now());
