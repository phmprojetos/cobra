-- Novo tipo de notificação: lista de quem vence amanhã (uma mensagem com todos).
-- (Separado da migration seguinte: um valor novo de enum só pode ser usado após o commit.)
alter type public.tipo_regra_notificacao add value if not exists 'lista_amanha';
