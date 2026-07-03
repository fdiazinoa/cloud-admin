-- Broaden HelpDesk fallback detection for explicit customer suggestions.

create or replace function landlord.detect_customer_improvement_from_message()
returns trigger as $$
declare
  ticket_record record;
  combined_text text;
  normalized_text text;
  affected_module text;
  request_title text;
  group_key text;
begin
  if new.sender_type::text <> 'Client' then
    return new;
  end if;

  combined_text := coalesce(new.message, '');
  normalized_text := lower(combined_text);

  if not (
    combined_text ~* 'ser[íi]a bueno'
    or combined_text ~* 'deber[íi]a(n)? (tener|permitir|agregar|incluir|hacer|existir)'
    or combined_text ~* 'podr[íi]a(n)? (agregar|incluir|hacer|poner|crear|permitir)'
    or combined_text ~* 'necesito que'
    or combined_text ~* 'queremos que'
    or combined_text ~* 'me gustar[íi]a que'
    or combined_text ~* 'hace falta'
    or combined_text ~* 'solicitamos (una|un|que|como mejora)'
    or combined_text ~* 'sugeri(mos|ria|r[íi]a|do|da|encia).{0,80}(mejora|cambio|funci[oó]n|m[oó]dulo|modulo|sistema)'
    or combined_text ~* '(proponemos|recomendamos).{0,80}(mejora|cambio|funci[oó]n|m[oó]dulo|modulo|sistema)'
    or combined_text ~* 'opci[oó]n para'
    or combined_text ~* 'funci[oó]n para'
    or combined_text ~* 'mejora para'
    or combined_text ~* 'no permita(n)? .{0,100}(duplic|repet|m[aá]s de una vez|mas de una vez|depreci)'
    or combined_text ~* 'evit(a|ar|e).{0,100}(duplic|repet|m[aá]s de una vez|mas de una vez)'
    or combined_text ~* 'poder (aplicar|asignar|filtrar|configurar|seleccionar|elegir|limitar|condicionar)'
    or combined_text ~* '(aplicar|asignar|filtrar|configurar|seleccionar|elegir|limitar|condicionar).{0,80}(por|seg[uú]n) (forma de pago|m[eé]todo de pago|tipo de cliente|cliente|categor[ií]a|sucursal|lista de precio)'
    or combined_text ~* 'promocion(es)?.{0,100}(forma de pago|m[eé]todo de pago|tipo de cliente|cliente|categor[ií]a|sucursal|lista de precio)'
  ) then
    return new;
  end if;

  select id, tenant_id, contact_id, subject, source, priority
    into ticket_record
  from landlord.support_tickets
  where id = new.ticket_id;

  if not found then
    return new;
  end if;

  affected_module := case
    when normalized_text like '%activo fijo%' or normalized_text like '%activos fijos%' or normalized_text like '%depreci%' then 'Activos fijos'
    when normalized_text like '%inventario%' or normalized_text like '%stock%' or normalized_text like '%producto%' then 'Inventario'
    when normalized_text like '%factura%' or normalized_text like '%fiscal%' or normalized_text like '%ncf%' or normalized_text like '%e-cf%' then 'Fiscal'
    when normalized_text like '%pago%' or normalized_text like '%cobro%' or normalized_text like '%tarjeta%' then 'Pagos'
    when normalized_text like '%promocion%' or normalized_text like '%promoción%' or normalized_text like '%venta%' then 'Ventas'
    when normalized_text like '%terminal%' or normalized_text like '%impres%' or normalized_text like '%hardware%' then 'Hardware POS'
    else null
  end;

  request_title := left(coalesce(ticket_record.subject, 'Mejora solicitada por cliente'), 90);
  group_key := left(
    regexp_replace(
      lower(coalesce(affected_module, 'general') || '-' || request_title),
      '[^a-z0-9]+',
      '-',
      'g'
    ),
    96
  );

  insert into landlord.customer_improvement_requests (
    ticket_id,
    tenant_id,
    contact_id,
    source,
    status,
    priority,
    title,
    request_text,
    ai_summary,
    requested_capability,
    affected_module,
    customer_impact,
    duplicate_group_key,
    ai_confidence,
    detected_by_ai
  )
  values (
    new.ticket_id,
    ticket_record.tenant_id,
    ticket_record.contact_id,
    coalesce(ticket_record.source::text, 'HelpDesk'),
    'Nueva',
    coalesce(ticket_record.priority::text, 'Media'),
    request_title,
    left(new.message, 2000),
    left('Solicitud de mejora detectada desde mensaje del cliente: ' || new.message, 360),
    left(new.message, 260),
    affected_module,
    case
      when normalized_text like '%duplic%' or normalized_text like '%repet%' or normalized_text like '%depreci%' then 'Puede evitar duplicidad operativa o contable.'
      else 'Solicitud funcional detectada para evaluacion de producto.'
    end,
    group_key,
    0.72,
    false
  )
  on conflict (ticket_id, duplicate_group_key) do nothing;

  return new;
end;
$$ language plpgsql;
