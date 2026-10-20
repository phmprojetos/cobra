-- Remove o que os testes de integração (pnpm test:db) gravam: clientes com nomes de teste,
-- suas operações/parcelas/pagamentos/eventos/notificações, sessões do usuário fake e o
-- usuário de Auth "@teste.local". Não toca em nenhum outro registro.
begin;
create temp table _cli on commit drop as
  select id from public.clientes
  where nome ~ '^(Carlos Teste|Ana Xavier Q|Ana Yara Q|Zé Ninguém |Zezinho |Teste )[0-9A-Za-z]+$';
create temp table _op on commit drop as select id from public.operacoes where cliente_id in (select id from _cli);
create temp table _par on commit drop as select id from public.parcelas where operacao_id in (select id from _op);
delete from public.notificacoes_enviadas where parcela_id in (select id from _par);
delete from public.pagamentos where parcela_id in (select id from _par);
delete from public.eventos where entidade_id in (select id from _cli union select id from _op union select id from _par);
delete from public.parcelas where id in (select id from _par);
delete from public.operacoes where id in (select id from _op);
delete from public.clientes where id in (select id from _cli);
delete from public.sessoes_bot where telegram_user_id in (1, 4242);
delete from public.eventos where entidade = 'configuracoes' and payload->>'chave' = 'moeda'
  and payload #>> '{antes,valor}' = payload #>> '{depois,valor}';
delete from auth.users where email like '%@teste.local';
select (select count(*) from _cli) as clientes_removidos, (select count(*) from _op) as operacoes_removidas;
commit;
