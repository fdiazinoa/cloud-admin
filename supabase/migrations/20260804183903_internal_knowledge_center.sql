begin;

create table if not exists landlord.knowledge_resources (
  id uuid primary key default gen_random_uuid(),
  product text not null check (product in ('msmall', 'clicpos', 'erp', 'cloud-admin')),
  resource_type text not null check (resource_type in ('manual', 'video', 'link')),
  title text not null,
  summary text,
  external_url text,
  storage_bucket text,
  storage_path text,
  file_name text,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  is_active boolean not null default true,
  created_by uuid references landlord.cloud_admin_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint knowledge_resources_source_check check (
    external_url is not null or (storage_bucket is not null and storage_path is not null)
  )
);

create index if not exists knowledge_resources_product_type_active_idx
  on landlord.knowledge_resources (product, resource_type, updated_at desc)
  where is_active;
create index if not exists knowledge_resources_created_by_idx
  on landlord.knowledge_resources (created_by);

drop trigger if exists update_knowledge_resources_updated_at on landlord.knowledge_resources;
create trigger update_knowledge_resources_updated_at
before update on landlord.knowledge_resources
for each row execute function landlord.update_support_updated_at_column();

alter table landlord.knowledge_resources enable row level security;
revoke all on landlord.knowledge_resources from anon, authenticated;
grant select, insert, update, delete on landlord.knowledge_resources to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'knowledge-center',
  'knowledge-center',
  false,
  262144000,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

commit;
