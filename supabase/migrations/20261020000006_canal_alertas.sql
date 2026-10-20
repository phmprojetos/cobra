-- Canal de alertas: lista diária de atrasados substitui os alertas de atraso por parcela
-- (D+1/D+3/D+7 ficam desativados, podendo ser religados no painel).
insert into public.regras_notificacao (tipo, offset_dias, horario, dia_semana, ativo)
select 'lista_atrasados', 0, '09:00', null, true
where not exists (select 1 from public.regras_notificacao where tipo = 'lista_atrasados');

update public.regras_notificacao set ativo = false where tipo = 'atraso';

-- Canal do Telegram que recebe os alertas ({"id": -100..., "titulo": "..."}); false = não configurado.
-- Preenchido automaticamente quando o bot é adicionado como administrador de um canal.
insert into public.configuracoes (chave, valor) values ('canal_alertas', 'false')
on conflict (chave) do nothing;
