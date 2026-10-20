-- Configurações e regras de notificação padrão.

insert into public.configuracoes (chave, valor) values
  ('moeda', '"BRL"'),
  ('locale', '"pt-BR"'),
  ('timezone', '"America/Sao_Paulo"'),
  ('horario_silencio', '{"inicio": "22:00", "fim": "07:00"}'),
  ('estrategia_alocacao', '"proporcional"')
on conflict (chave) do nothing;

insert into public.regras_notificacao (tipo, offset_dias, horario, dia_semana) values
  ('lembrete_antes', 1, '09:00', null),  -- D-1
  ('no_dia',         0, '09:00', null),  -- D0
  ('atraso',         1, '10:00', null),  -- D+1
  ('atraso',         3, '10:00', null),  -- D+3
  ('atraso',         7, '10:00', null),  -- D+7
  ('resumo_diario',  0, '08:00', null),
  ('resumo_semanal', 0, '08:00', 1);     -- segunda
