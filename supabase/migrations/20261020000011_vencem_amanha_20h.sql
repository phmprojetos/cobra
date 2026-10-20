-- "Vencem amanhã" às 20:00 para planejar as cobranças do dia seguinte.
insert into public.regras_notificacao (tipo, offset_dias, horario, ativo)
select 'lista_amanha', 1, '20:00', true
where not exists (select 1 from public.regras_notificacao where tipo = 'lista_amanha');

-- O lembrete das 09:00 da véspera repetia o mesmo conteúdo: desligado (pode ser religado no painel).
update public.regras_notificacao set ativo = false
where tipo = 'lembrete_antes' and offset_dias = 1 and horario = '09:00' and ativo;
