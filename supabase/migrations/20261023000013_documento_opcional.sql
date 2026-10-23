-- Documento do cliente deixa de ser obrigatório no cadastro. Quando informado, continua único
-- por carteira (índice clientes_documento_unico; NULLs não colidem) e com formato validado.
alter table public.clientes drop constraint clientes_documento_obrigatorio;

-- Tipo e número andam juntos: ou os dois, ou nenhum. NOT VALID: vale para novos cadastros e
-- alterações, sem travar a migration por alguma linha antiga.
alter table public.clientes
  add constraint clientes_documento_completo check ((documento is null) = (documento_tipo is null)) not valid;
