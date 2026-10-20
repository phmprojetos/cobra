-- Schema base do MVP de gestão de empréstimos.
-- Valores monetários em centavos (bigint). Nada é apagado fisicamente.

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- ───────────────────────── enums ─────────────────────────
create type public.tipo_operacao as enum ('unica', 'parcelada');
create type public.status_operacao as enum ('ativa', 'quitada', 'atrasada', 'renegociada', 'perdida', 'cancelada');
create type public.status_parcela as enum ('aberta', 'parcial', 'paga', 'atrasada', 'cancelada');
create type public.periodicidade as enum ('semanal', 'quinzenal', 'mensal');
create type public.origem_lancamento as enum ('telegram', 'web');
create type public.tipo_regra_notificacao as enum ('lembrete_antes', 'no_dia', 'atraso', 'resumo_diario', 'resumo_semanal');

-- ───────────────────────── util ─────────────────────────
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ───────────────────────── clientes ─────────────────────────
create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) > 0),
  apelidos text[] not null default '{}',
  telefone text,
  observacoes text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index clientes_nome_trgm on public.clientes using gin (nome extensions.gin_trgm_ops);

-- ───────────────────────── operações ─────────────────────────
create table public.operacoes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id),
  data_emprestimo date not null,
  valor_principal bigint not null check (valor_principal > 0),
  valor_total_receber bigint not null check (valor_total_receber >= valor_principal),
  juros_total bigint not null,
  taxa_periodo numeric(14, 8) not null,
  taxa_efetiva_mensal numeric(14, 8) not null,
  tipo public.tipo_operacao not null,
  periodicidade public.periodicidade,
  status public.status_operacao not null default 'ativa',
  renegociacoes integer not null default 0,
  valor_prejuizo bigint not null default 0,
  perdida_em date,
  cancelado_em timestamptz,
  observacoes text,
  origem public.origem_lancamento not null,
  mensagem_origem_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index operacoes_cliente on public.operacoes (cliente_id);
create index operacoes_status on public.operacoes (status);
create index operacoes_data on public.operacoes (data_emprestimo);

-- ───────────────────────── parcelas ─────────────────────────
create table public.parcelas (
  id uuid primary key default gen_random_uuid(),
  operacao_id uuid not null references public.operacoes (id),
  numero integer not null check (numero > 0),
  vencimento date not null,
  valor bigint not null check (valor >= 0),
  valor_principal bigint not null check (valor_principal >= 0),
  valor_juros bigint not null,
  valor_pago bigint not null default 0 check (valor_pago >= 0),
  principal_pago bigint not null default 0 check (principal_pago >= 0),
  juros_pago bigint not null default 0 check (juros_pago >= 0),
  status public.status_parcela not null default 'aberta',
  cancelado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (operacao_id, numero),
  check (valor = valor_principal + valor_juros),
  check (valor_pago = principal_pago + juros_pago),
  check (valor_pago <= valor)
);
create index parcelas_vencimento on public.parcelas (vencimento) where status in ('aberta', 'parcial', 'atrasada');

-- ───────────────────────── pagamentos ─────────────────────────
create table public.pagamentos (
  id uuid primary key default gen_random_uuid(),
  parcela_id uuid not null references public.parcelas (id),
  -- Um recebimento que cobre várias parcelas gera várias linhas com o mesmo lote.
  lote_id uuid not null,
  data date not null,
  valor bigint not null check (valor > 0),
  valor_principal_alocado bigint not null,
  valor_juros_alocado bigint not null,
  forma text,
  observacoes text,
  origem public.origem_lancamento not null,
  cancelado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valor = valor_principal_alocado + valor_juros_alocado)
);
create index pagamentos_parcela on public.pagamentos (parcela_id);
create index pagamentos_data on public.pagamentos (data);
create index pagamentos_lote on public.pagamentos (lote_id);

-- ───────────────────────── eventos (auditoria) ─────────────────────────
create table public.eventos (
  id uuid primary key default gen_random_uuid(),
  entidade text not null,
  entidade_id uuid not null,
  acao text not null,
  payload jsonb not null default '{}',
  mensagem_telegram text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index eventos_entidade on public.eventos (entidade, entidade_id, created_at desc);

-- ───────────────────────── sessões do bot ─────────────────────────
create table public.sessoes_bot (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null,
  estado text not null,
  payload jsonb not null default '{}',
  expira_em timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sessoes_bot_user on public.sessoes_bot (telegram_user_id, expira_em desc);

-- ───────────────────────── notificações ─────────────────────────
create table public.regras_notificacao (
  id uuid primary key default gen_random_uuid(),
  tipo public.tipo_regra_notificacao not null,
  offset_dias integer not null default 0 check (offset_dias >= 0),
  horario time not null,
  dia_semana smallint check (dia_semana between 1 and 7),
  ativo boolean not null default true,
  silenciar_clientes uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notificacoes_enviadas (
  id uuid primary key default gen_random_uuid(),
  regra_id uuid not null references public.regras_notificacao (id),
  parcela_id uuid references public.parcelas (id),
  data_referencia date not null,
  enviada_em timestamptz not null default now(),
  telegram_message_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notificacoes_enviadas_unica unique nulls not distinct (regra_id, parcela_id, data_referencia)
);

-- ───────────────────────── configurações ─────────────────────────
create table public.configuracoes (
  chave text primary key,
  valor jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ───────────────────────── triggers updated_at ─────────────────────────
do $$
declare t text;
begin
  foreach t in array array['clientes', 'operacoes', 'parcelas', 'pagamentos', 'eventos', 'sessoes_bot',
                           'regras_notificacao', 'notificacoes_enviadas', 'configuracoes'] loop
    execute format('create trigger set_updated_at before update on public.%I
                    for each row execute function public.tg_set_updated_at()', t);
  end loop;
end $$;
