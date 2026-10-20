-- Documentos do cliente (PDF/imagens: RG, CPF, comprovante…) no Supabase Storage.
-- Bucket PRIVADO: nada tem link público; o painel gera URLs temporárias assinadas.
-- Nada é apagado fisicamente: "remover" marca removido_em e mantém o arquivo.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documentos-clientes', 'documentos-clientes', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.cliente_documentos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id),
  -- Caminho no bucket: <cliente_id>/<uuid>-<nome>
  caminho text not null unique,
  nome_arquivo text not null,
  tipo_mime text not null,
  tamanho_bytes bigint not null check (tamanho_bytes > 0),
  origem public.origem_lancamento not null default 'web',
  removido_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index cliente_documentos_cliente on public.cliente_documentos (cliente_id) where removido_em is null;

create trigger set_updated_at before update on public.cliente_documentos
  for each row execute function public.tg_set_updated_at();
create trigger auditar after insert or update on public.cliente_documentos
  for each row execute function public.tg_auditar();

alter table public.cliente_documentos enable row level security;
create policy painel_leitura on public.cliente_documentos for select to authenticated using (true);
create policy painel_insert on public.cliente_documentos for insert to authenticated with check (true);
create policy painel_update on public.cliente_documentos for update to authenticated using (true) with check (true);

-- Storage: só usuário autenticado lê/envia neste bucket (o bot e o painel sem login usam service role).
create policy documentos_clientes_leitura on storage.objects for select to authenticated
  using (bucket_id = 'documentos-clientes');
create policy documentos_clientes_envio on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos-clientes');
