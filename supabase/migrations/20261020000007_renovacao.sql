-- Renovação (pagou só os juros): numa transação, registra o pagamento, fecha a parcela atual
-- com o que foi pago, cria a nova parcela (principal restante + juros) e atualiza a operação.
-- Os cálculos vêm do core (renovarPagandoJuros); aqui só se aplica, com checagem otimista.

create or replace function public.rpc_renovar_parcela(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_parcela uuid := (p ->> 'parcela_id')::uuid;
  v_op uuid;
  v_lote uuid := gen_random_uuid();
  v_nova uuid;
  v_ok boolean;
begin
  perform _exigir_autenticado();

  -- Pagamento + fechamento da parcela atual num único UPDATE (respeita os CHECKs de valor).
  update parcelas set
    valor_pago = valor_pago + (p #>> '{pagamento,valor}')::bigint,
    principal_pago = principal_pago + (p #>> '{pagamento,principal}')::bigint,
    juros_pago = juros_pago + (p #>> '{pagamento,juros}')::bigint,
    valor = (p #>> '{fechada,valor}')::bigint,
    valor_principal = (p #>> '{fechada,valor_principal}')::bigint,
    valor_juros = (p #>> '{fechada,valor_juros}')::bigint,
    status = 'paga'
  where id = v_parcela
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

  insert into eventos (entidade, entidade_id, acao, payload, mensagem_telegram)
  values ('parcela', v_parcela, 'renovar',
          jsonb_build_object('operacao_id', v_op, 'lote_id', v_lote, 'nova_parcela_id', v_nova,
                             'pagamento', p -> 'pagamento', 'fechada', p -> 'fechada', 'nova', p -> 'nova'),
          p ->> 'mensagem_telegram');
  return v_nova;
end $$;

revoke execute on function public.rpc_renovar_parcela(jsonb) from public, anon;
grant execute on function public.rpc_renovar_parcela(jsonb) to authenticated, service_role;
