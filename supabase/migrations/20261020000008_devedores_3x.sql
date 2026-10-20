-- Lista de devedores do dia (vencem hoje + atrasados) 3x ao dia, com o status do momento.
-- A regra das 09:00 já existe (lista_atrasados); acrescenta 13:00 e 18:00.
insert into public.regras_notificacao (tipo, offset_dias, horario, ativo)
select 'lista_atrasados', 0, h::time, true
from unnest(array['13:00', '18:00']) as h
where not exists (select 1 from public.regras_notificacao r where r.tipo = 'lista_atrasados' and r.horario = h::time);
