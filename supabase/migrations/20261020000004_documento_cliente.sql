-- Cliente passa a exigir um documento (CPF, CNPJ, RG ou outro), que é a chave contra duplicidade:
-- nomes podem variar ("Carlos", "Carlinhos"), o documento não.

create type public.tipo_documento as enum ('cpf', 'cnpj', 'rg', 'outro');

alter table public.clientes
  add column documento_tipo public.tipo_documento,
  add column documento text;

-- Normalizado pela aplicação: só dígitos (CPF/CNPJ) ou A-Z0-9 (RG/outro).
alter table public.clientes
  add constraint clientes_documento_formato check (documento is null or documento ~ '^[A-Z0-9]{4,20}$');

-- Obrigatório para novos cadastros e alterações. NOT VALID preserva linhas antigas sem documento
-- (que devem ser completadas pelo painel).
alter table public.clientes
  add constraint clientes_documento_obrigatorio check (documento is not null and documento_tipo is not null) not valid;

create unique index clientes_documento_unico on public.clientes (documento_tipo, documento);

-- Busca também devolve o documento (para exibir nas opções do bot).
drop function public.buscar_clientes(text, int);
create function public.buscar_clientes(p_termo text, p_limite int default 5)
returns table (id uuid, nome text, apelidos text[], documento_tipo public.tipo_documento, documento text, similaridade real)
language sql stable security definer set search_path = public, extensions as $$
  select c.id, c.nome, c.apelidos, c.documento_tipo, c.documento,
         greatest(
           similarity(unaccent(lower(c.nome)), unaccent(lower(p_termo))),
           coalesce((select max(similarity(unaccent(lower(a)), unaccent(lower(p_termo))))
                     from unnest(c.apelidos) a), 0)
         ) as similaridade
  from clientes c
  where c.ativo
  order by similaridade desc, c.nome
  limit p_limite;
$$;
revoke execute on function public.buscar_clientes(text, int) from public, anon;
grant execute on function public.buscar_clientes(text, int) to authenticated, service_role;
