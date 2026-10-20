-- RLS, auditoria e funções transacionais.
-- Os cálculos (alocação, status, taxas) são feitos em packages/core; as funções abaixo
-- apenas aplicam o resultado de forma atômica, com checagem otimista de concorrência.

-- ───────────────────────── RLS ─────────────────────────
alter table public.clientes enable row level security;
alter table public.operacoes enable row level security;
alter table public.parcelas enable row level security;
alter table public.pagamentos enable row level security;
alter table public.eventos enable row level security;
alter table public.sessoes_bot enable row level security;
alter table public.regras_notificacao enable row level security;
alter table public.notificacoes_enviadas enable row level security;
alter table public.configuracoes enable row level security;

-- Painel: usuário autenticado lê tudo (exceto sessões do bot) e edita cadastros/configuração.
-- O bot usa service_role, que ignora RLS. Para multiusuário no futuro, trocar `true` por
-- `owner_id = auth.uid()` nestas políticas.
do $$
declare t text;
begin
  foreach t in array array['clientes', 'operacoes', 'parcelas', 'pagamentos', 'eventos',
                           'regras_notificacao', 'notificacoes_enviadas', 'configuracoes'] loop
    execute format('create policy painel_leitura on public.%I for select to authenticated using (true)', t);
  end loop;
  foreach t in array array['clientes', 'regras_notificacao', 'configuracoes'] loop
    execute format('create policy painel_insert on public.%I for insert to authenticated with check (true)', t);
    execute format('create policy painel_update on public.%I for update to authenticated using (true) with check (true)', t);
  end loop;
end $$;

revoke all on all tables in schema public from anon;

-- ───────────────────────── auditoria de cadastros ─────────────────────────
create or replace function public.tg_auditar()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  v_id := case when tg_table_name = 'configuracoes' then null else (to_jsonb(new) ->> 'id')::uuid end;
  insert into eventos (entidade, entidade_id, acao, payload)
  values (
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

create trigger auditar after insert or update on public.clientes
  for each row execute function public.tg_auditar();
create trigger auditar after update on public.regras_notificacao
  for each row execute function public.tg_auditar();
create trigger auditar after insert or update on public.configuracoes
  for each row execute function public.tg_auditar();

-- ───────────────────────── helpers ─────────────────────────
create or replace function public._exigir_autenticado()
returns void language plpgsql as $$
begin
  if coalesce(auth.role(), '') not in ('authenticated', 'service_role') then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
end $$;

-- ───────────────────────── criar operação ─────────────────────────
create or replace function public.rpc_criar_operacao(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_op uuid;
  v_par jsonb;
begin
  perform _exigir_autenticado();

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

  insert into eventos (entidade, entidade_id, acao, payload, mensagem_telegram)
  values ('operacao', v_op, 'criar', p - 'mensagem_telegram', p ->> 'mensagem_telegram');
  return v_op;
end $$;

-- ───────────────────────── registrar pagamento ─────────────────────────
create or replace function public.rpc_registrar_pagamento(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_lote uuid := gen_random_uuid();
  v_a jsonb;
  v_o jsonb;
  v_ok boolean;
begin
  perform _exigir_autenticado();

  for v_a in select * from jsonb_array_elements(p -> 'alocacoes') loop
    update parcelas set
      valor_pago = valor_pago + (v_a ->> 'valor')::bigint,
      principal_pago = principal_pago + (v_a ->> 'principal')::bigint,
      juros_pago = juros_pago + (v_a ->> 'juros')::bigint,
      status = (v_a ->> 'status')::status_parcela
    where id = (v_a ->> 'parcela_id')::uuid
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
    update operacoes set status = (v_o ->> 'status')::status_operacao where id = (v_o ->> 'id')::uuid;
    insert into eventos (entidade, entidade_id, acao, payload, mensagem_telegram)
    values ('operacao', (v_o ->> 'id')::uuid, 'pagamento',
            jsonb_build_object('lote_id', v_lote, 'data', p -> 'data', 'alocacoes',
              (select jsonb_agg(a) from jsonb_array_elements(p -> 'alocacoes') a
                where (a ->> 'operacao_id') = (v_o ->> 'id')),
              'status', v_o -> 'status'),
            p ->> 'mensagem_telegram');
  end loop;
  return v_lote;
end $$;

-- ───────────────────────── renegociar / prorrogar parcela ─────────────────────────
create or replace function public.rpc_renegociar_parcela(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_parcela uuid := (p ->> 'parcela_id')::uuid;
  v_op uuid;
begin
  perform _exigir_autenticado();

  update parcelas set
    vencimento = (p #>> '{depois,vencimento}')::date,
    valor = (p #>> '{depois,valor}')::bigint,
    valor_juros = (p #>> '{depois,valor_juros}')::bigint,
    status = (p ->> 'status')::status_parcela
  where id = v_parcela
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

  insert into eventos (entidade, entidade_id, acao, payload, mensagem_telegram)
  values ('parcela', v_parcela, p ->> 'acao',
          jsonb_build_object('operacao_id', v_op, 'antes', p -> 'antes', 'depois', p -> 'depois',
                             'acrescimo', p -> 'acrescimo'),
          p ->> 'mensagem_telegram');
end $$;

-- ───────────────────────── perda / cancelamento ─────────────────────────
create or replace function public.rpc_marcar_perda(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_id uuid := (p ->> 'operacao_id')::uuid;
begin
  perform _exigir_autenticado();
  update operacoes set status = 'perdida', perdida_em = (p ->> 'perdida_em')::date,
                       valor_prejuizo = (p ->> 'valor_prejuizo')::bigint
  where id = v_id and status in ('ativa', 'atrasada', 'renegociada');
  if not found then raise exception 'operação não está em aberto'; end if;
  insert into eventos (entidade, entidade_id, acao, payload, mensagem_telegram)
  values ('operacao', v_id, 'perda', p - 'mensagem_telegram', p ->> 'mensagem_telegram');
end $$;

create or replace function public.rpc_cancelar_operacao(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_id uuid := (p ->> 'operacao_id')::uuid;
begin
  perform _exigir_autenticado();
  update operacoes set status = 'cancelada', cancelado_em = now()
  where id = v_id and status <> 'cancelada';
  if not found then raise exception 'operação inexistente ou já cancelada'; end if;
  update parcelas set status = 'cancelada', cancelado_em = now()
  where operacao_id = v_id and status <> 'paga';
  insert into eventos (entidade, entidade_id, acao, payload, mensagem_telegram)
  values ('operacao', v_id, 'cancelar', p - 'mensagem_telegram', p ->> 'mensagem_telegram');
end $$;

-- ───────────────────────── atualização de status (job) ─────────────────────────
create or replace function public.rpc_atualizar_status(p jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_n integer := 0;
  v_x jsonb;
begin
  perform _exigir_autenticado();
  for v_x in select * from jsonb_array_elements(coalesce(p -> 'parcelas', '[]')) loop
    update parcelas set status = (v_x ->> 'status')::status_parcela
    where id = (v_x ->> 'id')::uuid and status <> (v_x ->> 'status')::status_parcela;
    v_n := v_n + (case when found then 1 else 0 end);
  end loop;
  for v_x in select * from jsonb_array_elements(coalesce(p -> 'operacoes', '[]')) loop
    update operacoes set status = (v_x ->> 'status')::status_operacao
    where id = (v_x ->> 'id')::uuid and status <> (v_x ->> 'status')::status_operacao;
    v_n := v_n + (case when found then 1 else 0 end);
  end loop;
  return v_n;
end $$;

-- ───────────────────────── busca de clientes ─────────────────────────
create or replace function public.buscar_clientes(p_termo text, p_limite int default 5)
returns table (id uuid, nome text, apelidos text[], similaridade real)
language sql stable security definer set search_path = public, extensions as $$
  select c.id, c.nome, c.apelidos,
         greatest(
           similarity(unaccent(lower(c.nome)), unaccent(lower(p_termo))),
           coalesce((select max(similarity(unaccent(lower(a)), unaccent(lower(p_termo))))
                     from unnest(c.apelidos) a), 0)
         ) as similaridade
  from clientes c
  where c.ativo
  order by similaridade desc, c.nome
  limit p_limite;
$$;

do $$
declare f text;
begin
  foreach f in array array['rpc_criar_operacao(jsonb)', 'rpc_registrar_pagamento(jsonb)',
                           'rpc_renegociar_parcela(jsonb)', 'rpc_marcar_perda(jsonb)',
                           'rpc_cancelar_operacao(jsonb)', 'rpc_atualizar_status(jsonb)',
                           'buscar_clientes(text, int)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
