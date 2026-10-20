-- Multiusuário com carteiras separadas: cada carteira tem seus clientes, empréstimos, regras,
-- configurações e canal. Usuários (auth.users) pertencem a uma carteira (todos com as mesmas
-- permissões). O Telegram de cada usuário é vinculado à carteira pelo painel.
--
-- Isolamento:
--   • toda tabela de dados ganha carteira_id; o RLS só mostra a carteira do usuário logado;
--   • tabelas filhas herdam a carteira do registro pai por trigger (não dá para "apontar" para fora);
--   • as RPCs (security definer) resolvem a carteira: usuário logado → a dele; service_role (bot) →
--     a informada em p.carteira_id, e só alteram registros dessa carteira.
--
-- Os dados existentes vão para a carteira "Principal", já vinculada ao Telegram do dono.

-- ───────────────────────── carteiras, membros, vínculos ─────────────────────────
create table public.carteiras (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Um usuário pertence a uma carteira.
create table public.membros (
  user_id uuid primary key references auth.users (id) on delete cascade,
  carteira_id uuid not null references public.carteiras (id),
  email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index membros_carteira on public.membros (carteira_id);

-- Quem pode falar com o bot (substitui TELEGRAM_ALLOWED_USER_IDS).
create table public.vinculos_telegram (
  telegram_user_id bigint primary key,
  carteira_id uuid not null references public.carteiras (id),
  user_id uuid references auth.users (id) on delete set null,
  nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index vinculos_telegram_carteira on public.vinculos_telegram (carteira_id);

-- Código de uso único gerado no painel e enviado ao bot (t.me/<bot>?start=v_<codigo>).
create table public.codigos_vinculo (
  codigo text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  carteira_id uuid not null references public.carteiras (id),
  expira_em timestamptz not null,
  usado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['carteiras', 'membros', 'vinculos_telegram', 'codigos_vinculo'] loop
    execute format('create trigger set_updated_at before update on public.%I
                    for each row execute function public.tg_set_updated_at()', t);
  end loop;
end $$;

-- Carteira do usuário logado (null para service_role/anon).
create or replace function public.minha_carteira()
returns uuid language sql stable security definer set search_path = public as $$
  select carteira_id from membros where user_id = auth.uid();
$$;
revoke execute on function public.minha_carteira() from public, anon;
grant execute on function public.minha_carteira() to authenticated, service_role;

-- ───────────────────────── carteira_id nas tabelas de dados ─────────────────────────
do $$
declare
  v_principal uuid;
  t text;
begin
  insert into carteiras (nome) values ('Principal') returning id into v_principal;

  foreach t in array array['clientes', 'operacoes', 'parcelas', 'pagamentos', 'eventos',
                           'regras_notificacao', 'notificacoes_enviadas', 'configuracoes', 'cliente_documentos'] loop
    execute format('alter table public.%I add column carteira_id uuid references public.carteiras (id)', t);
    -- Sem triggers no preenchimento (auditoria/updated_at não devem registrar esta migração).
    execute format('alter table public.%I disable trigger user', t);
    execute format('update public.%I set carteira_id = $1', t) using v_principal;
    execute format('alter table public.%I enable trigger user', t);
    execute format('alter table public.%I alter column carteira_id set not null', t);
    execute format('create index %I on public.%I (carteira_id)', t || '_carteira', t);
  end loop;

  -- Telegram do dono (antes em TELEGRAM_ALLOWED_USER_IDS) já vinculado à carteira Principal.
  insert into vinculos_telegram (telegram_user_id, carteira_id, nome) values (771585420, v_principal, 'dono');
end $$;

-- Cadastros feitos pelo painel (usuário logado) caem na carteira dele sem precisar informar.
-- Para o service_role (bot), minha_carteira() é null: o insert precisa trazer carteira_id.
alter table public.clientes alter column carteira_id set default public.minha_carteira();
alter table public.regras_notificacao alter column carteira_id set default public.minha_carteira();
alter table public.configuracoes alter column carteira_id set default public.minha_carteira();
alter table public.eventos alter column carteira_id set default public.minha_carteira();

-- Configuração passa a ser por carteira.
alter table public.configuracoes drop constraint configuracoes_pkey;
alter table public.configuracoes add primary key (carteira_id, chave);

-- Documento único dentro da carteira (o mesmo CPF pode existir em carteiras diferentes).
drop index public.clientes_documento_unico;
create unique index clientes_documento_unico on public.clientes (carteira_id, documento_tipo, documento);

-- Filhas herdam a carteira do pai (ignora o que vier no insert).
create or replace function public.tg_herdar_carteira()
returns trigger language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  execute format('select carteira_id from public.%I where id = $1', tg_argv[0])
    into v using (to_jsonb(new) ->> tg_argv[1])::uuid;
  if v is null then
    raise exception '% inexistente', tg_argv[1] using errcode = '23503';
  end if;
  new.carteira_id := v;
  return new;
end $$;

create trigger herdar_carteira before insert on public.operacoes
  for each row execute function public.tg_herdar_carteira('clientes', 'cliente_id');
create trigger herdar_carteira before insert on public.parcelas
  for each row execute function public.tg_herdar_carteira('operacoes', 'operacao_id');
create trigger herdar_carteira before insert on public.pagamentos
  for each row execute function public.tg_herdar_carteira('parcelas', 'parcela_id');
create trigger herdar_carteira before insert on public.notificacoes_enviadas
  for each row execute function public.tg_herdar_carteira('regras_notificacao', 'regra_id');
create trigger herdar_carteira before insert on public.cliente_documentos
  for each row execute function public.tg_herdar_carteira('clientes', 'cliente_id');

-- A carteira de um registro nunca muda.
create or replace function public.tg_carteira_imutavel()
returns trigger language plpgsql as $$
begin
  if new.carteira_id is distinct from old.carteira_id then
    raise exception 'carteira_id não pode ser alterado' using errcode = '42501';
  end if;
  return new;
end $$;
do $$
declare t text;
begin
  foreach t in array array['clientes', 'operacoes', 'parcelas', 'pagamentos', 'eventos',
                           'regras_notificacao', 'notificacoes_enviadas', 'configuracoes', 'cliente_documentos'] loop
    execute format('create trigger carteira_imutavel before update on public.%I
                    for each row execute function public.tg_carteira_imutavel()', t);
  end loop;
end $$;

-- Auditoria grava na carteira do registro.
create or replace function public.tg_auditar()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  v_id := case when tg_table_name = 'configuracoes' then null else (to_jsonb(new) ->> 'id')::uuid end;
  insert into eventos (carteira_id, entidade, entidade_id, acao, payload)
  values (
    (to_jsonb(new) ->> 'carteira_id')::uuid,
    tg_table_name,
    coalesce(v_id, '00000000-0000-0000-0000-000000000000'),
    lower(tg_op),
    jsonb_build_object(
      'antes', case when tg_op = 'UPDATE' then to_jsonb(old) - 'updated_at' end,
      'depois', to_jsonb(new) - 'updated_at',
      'chave', to_jsonb(new) ->> 'chave'
    )
  );
  return new;
end $$;

-- ───────────────────────── RLS por carteira ─────────────────────────
do $$
declare t text;
begin
  foreach t in array array['clientes', 'operacoes', 'parcelas', 'pagamentos', 'eventos',
                           'regras_notificacao', 'notificacoes_enviadas', 'configuracoes', 'cliente_documentos'] loop
    execute format('drop policy if exists painel_leitura on public.%I', t);
    execute format('drop policy if exists painel_insert on public.%I', t);
    execute format('drop policy if exists painel_update on public.%I', t);
    execute format('create policy carteira_leitura on public.%I for select to authenticated
                    using (carteira_id = public.minha_carteira())', t);
  end loop;
  foreach t in array array['clientes', 'regras_notificacao', 'configuracoes', 'cliente_documentos'] loop
    execute format('create policy carteira_insert on public.%I for insert to authenticated
                    with check (carteira_id = public.minha_carteira())', t);
    execute format('create policy carteira_update on public.%I for update to authenticated
                    using (carteira_id = public.minha_carteira()) with check (carteira_id = public.minha_carteira())', t);
  end loop;
end $$;

alter table public.carteiras enable row level security;
alter table public.membros enable row level security;
alter table public.vinculos_telegram enable row level security;
alter table public.codigos_vinculo enable row level security;
create policy carteira_leitura on public.carteiras for select to authenticated using (id = public.minha_carteira());
create policy carteira_leitura on public.membros for select to authenticated using (carteira_id = public.minha_carteira());
create policy carteira_leitura on public.vinculos_telegram for select to authenticated using (carteira_id = public.minha_carteira());
-- Desvincular um Telegram da própria carteira pelo painel.
create policy carteira_delete on public.vinculos_telegram for delete to authenticated using (carteira_id = public.minha_carteira());
revoke all on public.carteiras, public.membros, public.vinculos_telegram, public.codigos_vinculo from anon;

-- Storage: só arquivos de clientes da própria carteira (caminho <cliente_id>/...).
drop policy if exists documentos_clientes_leitura on storage.objects;
drop policy if exists documentos_clientes_envio on storage.objects;
create policy documentos_clientes_leitura on storage.objects for select to authenticated
  using (bucket_id = 'documentos-clientes'
         and exists (select 1 from public.clientes c
                     where c.id::text = (storage.foldername(name))[1] and c.carteira_id = public.minha_carteira()));
create policy documentos_clientes_envio on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos-clientes'
              and exists (select 1 from public.clientes c
                          where c.id::text = (storage.foldername(name))[1] and c.carteira_id = public.minha_carteira()));

-- ───────────────────────── RPCs com carteira ─────────────────────────
-- Usuário logado: a carteira dele. service_role (bot): p.carteira_id (obrigatório).
create or replace function public._carteira(p jsonb)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v uuid;
begin
  if auth.role() = 'service_role' then
    v := (p ->> 'carteira_id')::uuid;
  elsif auth.role() = 'authenticated' then
    v := minha_carteira();
  end if;
  if v is null then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
  return v;
end $$;
revoke execute on function public._carteira(jsonb) from public, anon;

create or replace function public.rpc_criar_operacao(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_carteira uuid := _carteira(p);
  v_op uuid;
  v_par jsonb;
begin
  if not exists (select 1 from clientes where id = (p ->> 'cliente_id')::uuid and carteira_id = v_carteira) then
    raise exception 'cliente não encontrado' using errcode = '42501';
  end if;

  insert into operacoes (
    cliente_id, data_emprestimo, valor_principal, valor_total_receber, juros_total,
    taxa_periodo, taxa_efetiva_mensal, tipo, periodicidade, observacoes, origem, mensagem_origem_id
  ) values (
    (p ->> 'cliente_id')::uuid, (p ->> 'data_emprestimo')::date,
    (p ->> 'valor_principal')::bigint, (p ->> 'valor_total_receber')::bigint,
    (p ->> 'juros_total')::bigint, (p ->> 'taxa_periodo')::numeric,
    (p ->> 'taxa_efetiva_mensal')::numeric, (p ->> 'tipo')::tipo_operacao,
    (p ->> 'periodicidade')::periodicidade, p ->> 'observacoes',
    (p ->> 'origem')::origem_lancamento, (p ->> 'mensagem_origem_id')::bigint
  ) returning id into v_op;

  for v_par in select * from jsonb_array_elements(p -> 'parcelas') loop
    insert into parcelas (operacao_id, numero, vencimento, valor, valor_principal, valor_juros)
    values (
      v_op, (v_par ->> 'numero')::int, (v_par ->> 'vencimento')::date,
      (v_par ->> 'valor')::bigint, (v_par ->> 'valor_principal')::bigint, (v_par ->> 'valor_juros')::bigint
    );
  end loop;

  if (select sum(valor) from parcelas where operacao_id = v_op) <> (p ->> 'valor_total_receber')::bigint then
    raise exception 'soma das parcelas difere do total a receber';
  end if;

  insert into eventos (carteira_id, entidade, entidade_id, acao, payload, mensagem_telegram)
  values (v_carteira, 'operacao', v_op, 'criar', p - 'mensagem_telegram' - 'carteira_id', p ->> 'mensagem_telegram');
  return v_op;
end $$;

create or replace function public.rpc_registrar_pagamento(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_carteira uuid := _carteira(p);
  v_lote uuid := gen_random_uuid();
  v_a jsonb;
  v_o jsonb;
  v_ok boolean;
begin
  for v_a in select * from jsonb_array_elements(p -> 'alocacoes') loop
    update parcelas set
      valor_pago = valor_pago + (v_a ->> 'valor')::bigint,
      principal_pago = principal_pago + (v_a ->> 'principal')::bigint,
      juros_pago = juros_pago + (v_a ->> 'juros')::bigint,
      status = (v_a ->> 'status')::status_parcela
    where id = (v_a ->> 'parcela_id')::uuid
      and carteira_id = v_carteira
      and valor_pago = (v_a ->> 'valor_pago_anterior')::bigint
    returning true into v_ok;
    if v_ok is null then
      raise exception 'conflito: parcela % foi alterada por outro lançamento', v_a ->> 'parcela_id'
        using errcode = '40001';
    end if;
    v_ok := null;

    insert into pagamentos (parcela_id, lote_id, data, valor, valor_principal_alocado, valor_juros_alocado,
                            forma, observacoes, origem)
    values ((v_a ->> 'parcela_id')::uuid, v_lote, (p ->> 'data')::date, (v_a ->> 'valor')::bigint,
            (v_a ->> 'principal')::bigint, (v_a ->> 'juros')::bigint, p ->> 'forma', p ->> 'observacoes',
            (p ->> 'origem')::origem_lancamento);
  end loop;

  for v_o in select * from jsonb_array_elements(coalesce(p -> 'operacoes', '[]')) loop
    update operacoes set status = (v_o ->> 'status')::status_operacao
    where id = (v_o ->> 'id')::uuid and carteira_id = v_carteira;
    insert into eventos (carteira_id, entidade, entidade_id, acao, payload, mensagem_telegram)
    values (v_carteira, 'operacao', (v_o ->> 'id')::uuid, 'pagamento',
            jsonb_build_object('lote_id', v_lote, 'data', p -> 'data', 'alocacoes',
              (select jsonb_agg(a) from jsonb_array_elements(p -> 'alocacoes') a
                where (a ->> 'operacao_id') = (v_o ->> 'id')),
              'status', v_o -> 'status'),
            p ->> 'mensagem_telegram');
  end loop;
  return v_lote;
end $$;

create or replace function public.rpc_renegociar_parcela(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_carteira uuid := _carteira(p);
  v_parcela uuid := (p ->> 'parcela_id')::uuid;
  v_op uuid;
begin
  update parcelas set
    vencimento = (p #>> '{depois,vencimento}')::date,
    valor = (p #>> '{depois,valor}')::bigint,
    valor_juros = (p #>> '{depois,valor_juros}')::bigint,
    status = (p ->> 'status')::status_parcela
  where id = v_parcela
    and carteira_id = v_carteira
    and vencimento = (p #>> '{antes,vencimento}')::date
    and valor = (p #>> '{antes,valor}')::bigint
  returning operacao_id into v_op;
  if v_op is null then
    raise exception 'conflito: parcela % foi alterada por outro lançamento', v_parcela using errcode = '40001';
  end if;

  update operacoes set
    valor_total_receber = (select sum(valor) from parcelas where operacao_id = v_op and status <> 'cancelada'),
    juros_total = (select sum(valor) from parcelas where operacao_id = v_op and status <> 'cancelada') - valor_principal,
    taxa_periodo = coalesce((p ->> 'taxa_periodo')::numeric, taxa_periodo),
    taxa_efetiva_mensal = coalesce((p ->> 'taxa_efetiva_mensal')::numeric, taxa_efetiva_mensal),
    renegociacoes = renegociacoes + case when (p ->> 'alterou_valor')::boolean then 1 else 0 end,
    status = (p ->> 'operacao_status')::status_operacao
  where id = v_op;

  insert into eventos (carteira_id, entidade, entidade_id, acao, payload, mensagem_telegram)
  values (v_carteira, 'parcela', v_parcela, p ->> 'acao',
          jsonb_build_object('operacao_id', v_op, 'antes', p -> 'antes', 'depois', p -> 'depois',
                             'acrescimo', p -> 'acrescimo'),
          p ->> 'mensagem_telegram');
end $$;

create or replace function public.rpc_marcar_perda(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_carteira uuid := _carteira(p);
  v_id uuid := (p ->> 'operacao_id')::uuid;
begin
  update operacoes set status = 'perdida', perdida_em = (p ->> 'perdida_em')::date,
                       valor_prejuizo = (p ->> 'valor_prejuizo')::bigint
  where id = v_id and carteira_id = v_carteira and status in ('ativa', 'atrasada', 'renegociada');
  if not found then raise exception 'operação não está em aberto'; end if;
  insert into eventos (carteira_id, entidade, entidade_id, acao, payload, mensagem_telegram)
  values (v_carteira, 'operacao', v_id, 'perda', p - 'mensagem_telegram' - 'carteira_id', p ->> 'mensagem_telegram');
end $$;

create or replace function public.rpc_cancelar_operacao(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_carteira uuid := _carteira(p);
  v_id uuid := (p ->> 'operacao_id')::uuid;
begin
  update operacoes set status = 'cancelada', cancelado_em = now()
  where id = v_id and carteira_id = v_carteira and status <> 'cancelada';
  if not found then raise exception 'operação inexistente ou já cancelada'; end if;
  update parcelas set status = 'cancelada', cancelado_em = now()
  where operacao_id = v_id and status <> 'paga';
  insert into eventos (carteira_id, entidade, entidade_id, acao, payload, mensagem_telegram)
  values (v_carteira, 'operacao', v_id, 'cancelar', p - 'mensagem_telegram' - 'carteira_id', p ->> 'mensagem_telegram');
end $$;

create or replace function public.rpc_atualizar_status(p jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_carteira uuid := _carteira(p);
  v_n integer := 0;
  v_x jsonb;
begin
  for v_x in select * from jsonb_array_elements(coalesce(p -> 'parcelas', '[]')) loop
    update parcelas set status = (v_x ->> 'status')::status_parcela
    where id = (v_x ->> 'id')::uuid and carteira_id = v_carteira and status <> (v_x ->> 'status')::status_parcela;
    v_n := v_n + (case when found then 1 else 0 end);
  end loop;
  for v_x in select * from jsonb_array_elements(coalesce(p -> 'operacoes', '[]')) loop
    update operacoes set status = (v_x ->> 'status')::status_operacao
    where id = (v_x ->> 'id')::uuid and carteira_id = v_carteira and status <> (v_x ->> 'status')::status_operacao;
    v_n := v_n + (case when found then 1 else 0 end);
  end loop;
  return v_n;
end $$;

create or replace function public.rpc_renovar_parcela(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_carteira uuid := _carteira(p);
  v_parcela uuid := (p ->> 'parcela_id')::uuid;
  v_op uuid;
  v_lote uuid := gen_random_uuid();
  v_nova uuid;
  v_ok boolean;
begin
  update parcelas set
    valor_pago = valor_pago + (p #>> '{pagamento,valor}')::bigint,
    principal_pago = principal_pago + (p #>> '{pagamento,principal}')::bigint,
    juros_pago = juros_pago + (p #>> '{pagamento,juros}')::bigint,
    valor = (p #>> '{fechada,valor}')::bigint,
    valor_principal = (p #>> '{fechada,valor_principal}')::bigint,
    valor_juros = (p #>> '{fechada,valor_juros}')::bigint,
    status = 'paga'
  where id = v_parcela
    and carteira_id = v_carteira
    and valor_pago = (p ->> 'valor_pago_anterior')::bigint
    and status <> 'cancelada'
  returning operacao_id, true into v_op, v_ok;
  if v_ok is null then
    raise exception 'conflito: parcela % foi alterada por outro lançamento', v_parcela using errcode = '40001';
  end if;

  insert into pagamentos (parcela_id, lote_id, data, valor, valor_principal_alocado, valor_juros_alocado, forma, observacoes, origem)
  values (v_parcela, v_lote, (p #>> '{pagamento,data}')::date, (p #>> '{pagamento,valor}')::bigint,
          (p #>> '{pagamento,principal}')::bigint, (p #>> '{pagamento,juros}')::bigint,
          p #>> '{pagamento,forma}', 'renovação (pagou os juros)', (p ->> 'origem')::origem_lancamento);

  insert into parcelas (operacao_id, numero, vencimento, valor, valor_principal, valor_juros)
  values (v_op, (p #>> '{nova,numero}')::int, (p #>> '{nova,vencimento}')::date, (p #>> '{nova,valor}')::bigint,
          (p #>> '{nova,valor_principal}')::bigint, (p #>> '{nova,valor_juros}')::bigint)
  returning id into v_nova;

  update operacoes set
    valor_total_receber = (select sum(valor) from parcelas where operacao_id = v_op and status <> 'cancelada'),
    juros_total = (select sum(valor) from parcelas where operacao_id = v_op and status <> 'cancelada') - valor_principal,
    taxa_periodo = coalesce((p #>> '{operacao,taxa_periodo}')::numeric, taxa_periodo),
    taxa_efetiva_mensal = coalesce((p #>> '{operacao,taxa_efetiva_mensal}')::numeric, taxa_efetiva_mensal),
    renegociacoes = renegociacoes + 1,
    status = 'renegociada'
  where id = v_op;

  insert into eventos (carteira_id, entidade, entidade_id, acao, payload, mensagem_telegram)
  values (v_carteira, 'parcela', v_parcela, 'renovar',
          jsonb_build_object('operacao_id', v_op, 'lote_id', v_lote, 'nova_parcela_id', v_nova,
                             'pagamento', p -> 'pagamento', 'fechada', p -> 'fechada', 'nova', p -> 'nova'),
          p ->> 'mensagem_telegram');
  return v_nova;
end $$;

-- Busca de clientes restrita à carteira.
drop function public.buscar_clientes(text, int);
create function public.buscar_clientes(p_termo text, p_limite int default 5, p_carteira uuid default null)
returns table (id uuid, nome text, apelidos text[], documento_tipo public.tipo_documento, documento text, similaridade real)
language sql stable security definer set search_path = public, extensions as $$
  select c.id, c.nome, c.apelidos, c.documento_tipo, c.documento,
         greatest(
           similarity(unaccent(lower(c.nome)), unaccent(lower(p_termo))),
           coalesce((select max(similarity(unaccent(lower(a)), unaccent(lower(p_termo))))
                     from unnest(c.apelidos) a), 0)
         ) as similaridade
  from clientes c
  where c.ativo
    and c.carteira_id = case when auth.role() = 'service_role' then p_carteira else minha_carteira() end
  order by similaridade desc, c.nome
  limit p_limite;
$$;
revoke execute on function public.buscar_clientes(text, int, uuid) from public, anon;
grant execute on function public.buscar_clientes(text, int, uuid) to authenticated, service_role;

-- ───────────────────────── criação de carteira e vínculo do Telegram ─────────────────────────
-- Nova carteira com as configurações e regras padrão (uso administrativo: service_role).
create or replace function public.criar_carteira(p_nome text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  insert into carteiras (nome) values (p_nome) returning id into v;
  insert into configuracoes (carteira_id, chave, valor) values
    (v, 'moeda', '"BRL"'),
    (v, 'locale', '"pt-BR"'),
    (v, 'timezone', '"America/Sao_Paulo"'),
    (v, 'horario_silencio', '{"inicio": "22:00", "fim": "07:00"}'),
    (v, 'estrategia_alocacao', '"proporcional"'),
    (v, 'canal_alertas', 'false');
  insert into regras_notificacao (carteira_id, tipo, offset_dias, horario, dia_semana, ativo) values
    (v, 'lembrete_antes', 1, '09:00', null, false),
    (v, 'no_dia', 0, '09:00', null, true),
    (v, 'atraso', 1, '10:00', null, false),
    (v, 'atraso', 3, '10:00', null, false),
    (v, 'atraso', 7, '10:00', null, false),
    (v, 'resumo_diario', 0, '08:00', null, true),
    (v, 'resumo_semanal', 0, '08:00', 1, true),
    (v, 'lista_atrasados', 0, '09:00', null, true),
    (v, 'lista_atrasados', 0, '13:00', null, true),
    (v, 'lista_atrasados', 0, '18:00', null, true),
    (v, 'lista_amanha', 1, '20:00', null, true);
  return v;
end $$;
revoke execute on function public.criar_carteira(text) from public, anon, authenticated;
grant execute on function public.criar_carteira(text) to service_role;

-- Painel: gera um código (válido por 15 min) para o usuário logado vincular o Telegram.
create or replace function public.gerar_codigo_vinculo()
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  v_carteira uuid := minha_carteira();
  -- 12 caracteres hexadecimais de um UUID v4 (aleatório); uso único e válido por 15 min.
  v_codigo text := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
begin
  if v_carteira is null then raise exception 'acesso negado' using errcode = '42501'; end if;
  insert into codigos_vinculo (codigo, user_id, carteira_id, expira_em)
  values (v_codigo, auth.uid(), v_carteira, now() + interval '15 minutes');
  return v_codigo;
end $$;
revoke execute on function public.gerar_codigo_vinculo() from public, anon;
grant execute on function public.gerar_codigo_vinculo() to authenticated;

-- Bot: consome o código e vincula o Telegram à carteira. Devolve a carteira (null se inválido).
create or replace function public.vincular_telegram(p_codigo text, p_telegram_user_id bigint, p_nome text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v record;
begin
  update codigos_vinculo set usado_em = now()
  where codigo = upper(p_codigo) and usado_em is null and expira_em > now()
  returning user_id, carteira_id into v;
  if not found then return null; end if;
  insert into vinculos_telegram (telegram_user_id, carteira_id, user_id, nome)
  values (p_telegram_user_id, v.carteira_id, v.user_id, p_nome)
  on conflict (telegram_user_id) do update
    set carteira_id = excluded.carteira_id, user_id = excluded.user_id, nome = excluded.nome;
  return v.carteira_id;
end $$;
revoke execute on function public.vincular_telegram(text, bigint, text) from public, anon, authenticated;
grant execute on function public.vincular_telegram(text, bigint, text) to service_role;
