-- Dados fictícios para desenvolvimento (opcional). Datas relativas a hoje.
-- Aplicado automaticamente por `supabase db reset`.

create or replace function pg_temp.seed_op(
  p_cliente uuid, p_data date, p_principal bigint, p_total bigint, p_n int, p_primeiro date, p_passo interval
) returns uuid language plpgsql as $$
declare
  v_op uuid;
  v_base bigint := p_total / p_n;
  v_valor bigint;
  v_princ bigint;
  v_princ_rest bigint := p_principal;
  i int;
begin
  insert into operacoes (cliente_id, data_emprestimo, valor_principal, valor_total_receber, juros_total,
                         taxa_periodo, taxa_efetiva_mensal, tipo, periodicidade, origem)
  values (p_cliente, p_data, p_principal, p_total, p_total - p_principal,
          p_total::numeric / p_principal - 1,
          power(p_total::numeric / p_principal, 30.0 / greatest(1, (p_primeiro + p_passo * (p_n - 1))::date - p_data)) - 1,
          case when p_n = 1 then 'unica' else 'parcelada' end::tipo_operacao,
          case when p_n = 1 then null when p_passo = interval '7 days' then 'semanal'
               when p_passo = interval '15 days' then 'quinzenal' else 'mensal' end::periodicidade,
          'web')
  returning id into v_op;
  for i in 1..p_n loop
    v_valor := case when i = p_n then p_total - v_base * (p_n - 1) else v_base end;
    v_princ := case when i = p_n then v_princ_rest else round(v_valor::numeric * p_principal / p_total) end;
    v_princ_rest := v_princ_rest - v_princ;
    insert into parcelas (operacao_id, numero, vencimento, valor, valor_principal, valor_juros)
    values (v_op, i, (p_primeiro + p_passo * (i - 1))::date, v_valor, v_princ, v_valor - v_princ);
  end loop;
  return v_op;
end $$;

create or replace function pg_temp.seed_pagar(p_op uuid, p_numero int, p_valor bigint, p_data date)
returns void language plpgsql as $$
declare
  v_p parcelas%rowtype;
  v_princ bigint;
begin
  select * into v_p from parcelas where operacao_id = p_op and numero = p_numero;
  v_princ := round(p_valor::numeric * (v_p.valor_principal - v_p.principal_pago)
                   / (v_p.valor - v_p.valor_pago));
  insert into pagamentos (parcela_id, lote_id, data, valor, valor_principal_alocado, valor_juros_alocado, forma, origem)
  values (v_p.id, gen_random_uuid(), p_data, p_valor, v_princ, p_valor - v_princ, 'pix', 'web');
  update parcelas set valor_pago = valor_pago + p_valor, principal_pago = principal_pago + v_princ,
                      juros_pago = juros_pago + p_valor - v_princ
  where id = v_p.id;
end $$;

do $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  c_carlos uuid; c_ana uuid; c_bia uuid; c_joao uuid; c_marcos uuid;
  op uuid;
begin
  insert into clientes (nome, apelidos, telefone) values ('Carlos Souza', '{Carlão}', '+55 11 90000-0001') returning id into c_carlos;
  insert into clientes (nome, apelidos) values ('Ana Paula', '{Aninha}') returning id into c_ana;
  insert into clientes (nome, apelidos) values ('Beatriz Lima', '{Bia}') returning id into c_bia;
  insert into clientes (nome, apelidos) values ('João Pedro', '{JP,Joãozinho}') returning id into c_joao;
  insert into clientes (nome, apelidos, observacoes) values ('Marcos Silva', '{}', 'Indicado pelo Carlos') returning id into c_marcos;

  -- Carlos: 2000 → 2400 em parcela única, vence em 3 semanas; pagou 1200
  op := pg_temp.seed_op(c_carlos, hoje - 35, 200000, 240000, 1, hoje + 21, interval '0');
  perform pg_temp.seed_pagar(op, 1, 120000, hoje - 10);

  -- Ana: 500 → 600 em 4x semanais; 1ª paga, 2ª atrasada, 3ª vence em 6 dias
  op := pg_temp.seed_op(c_ana, hoje - 15, 50000, 60000, 4, hoje - 8, interval '7 days');
  perform pg_temp.seed_pagar(op, 1, 15000, hoje - 8);

  -- Bia: quitada no passado (paga com 2 dias de atraso)
  op := pg_temp.seed_op(c_bia, hoje - 60, 100000, 130000, 1, hoje - 30, interval '0');
  perform pg_temp.seed_pagar(op, 1, 130000, hoje - 28);

  -- Bia: nova, vence hoje
  perform pg_temp.seed_op(c_bia, hoje - 20, 80000, 96000, 1, hoje, interval '0');

  -- João: 3000 → 3900 em 3x mensais
  op := pg_temp.seed_op(c_joao, hoje - 40, 300000, 390000, 3, hoje - 10, interval '1 month');

  -- Marcos: atrasado há 12 dias, pagou parcial
  op := pg_temp.seed_op(c_marcos, hoje - 42, 150000, 180000, 1, hoje - 12, interval '0');
  perform pg_temp.seed_pagar(op, 1, 30000, hoje - 5);

  -- Status coerentes com hoje (o job do bot faz isso continuamente)
  update parcelas set status = case
    when valor_pago = valor then 'paga'
    when vencimento < hoje then 'atrasada'
    when valor_pago > 0 then 'parcial'
    else 'aberta' end::status_parcela;
  update operacoes o set status = case
    when not exists (select 1 from parcelas p where p.operacao_id = o.id and p.status <> 'paga') then 'quitada'
    when exists (select 1 from parcelas p where p.operacao_id = o.id and p.status = 'atrasada') then 'atrasada'
    else 'ativa' end::status_operacao;
end $$;
