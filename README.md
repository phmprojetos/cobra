# Cobra: gestão de empréstimos com assistente no Telegram

Plataforma pessoal (um usuário) para controlar empréstimos com juros.

- **Telegram**: todo lançamento do dia a dia, em linguagem natural ("emprestei 2000 pro Carlos, volta 2400 dia 15/12"). Nada é gravado sem você tocar em ✅. O bot também manda lembretes e alertas de atraso com botões de baixa e adiamento.
- **Painel web**: relatórios (KPIs, fluxo projetado, operações, clientes) e configurações.

## Arquitetura

```
apps/web          Next.js 16 (App Router) + Tailwind + shadcn/ui + Recharts — painel (Vercel)
apps/bot          Node + grammY — bot (webhook em produção, polling em dev) + job de notificações
packages/core     Regras de negócio puras (taxas, parcelamento, alocação, status, notificações, relatórios)
packages/db       Tipos do Supabase, repositório e serviços (planejar → confirmar → executar via RPC)
supabase/         Migrations SQL (schema, RLS, RPCs, padrões) e seed opcional
```

Princípios:

- **Dinheiro em centavos** (inteiros) em todo lugar.
- **Nada é apagado**: cancelamentos e perdas viram status, e toda alteração gera um registro em `eventos` com o valor anterior.
- **Regras no `core`**: o banco só aplica o resultado, de forma atômica, via funções `rpc_*`. Elas fazem uma checagem otimista de concorrência, então um clique duplo ou um plano velho não grava duas vezes.
- **IA só extrai dados**: o modelo (Claude, tools com schema `strict`) devolve uma intenção. Clientes, datas e valores são validados de forma determinística. Na dúvida, o bot pergunta.

## Requisitos

- Node ≥ 22 e pnpm 12 (`brew install pnpm` ou `corepack enable`)
- Supabase CLI (`brew install supabase/tap/supabase`), usado só para migrations e geração de tipos
- Um **projeto no Supabase (plataforma)**. Não é preciso rodar Supabase nem Docker localmente.
- Um bot do Telegram (crie com o [@BotFather](https://t.me/BotFather)) e uma chave da Claude API

## Setup

### 1. Dependências e variáveis

```bash
pnpm install
cp .env.example .env   # preencha os valores
```

| Variável | Onde obter / para que serve |
|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API. A service role é **só do servidor** (bot). |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Os mesmos URL e anon key, expostos ao painel |
| `NEXT_PUBLIC_SITE_URL` | URL pública do painel (destino do magic link) |
| `TELEGRAM_BOT_TOKEN` | @BotFather |
| `TELEGRAM_BOT_USERNAME` | Username do bot (sem @). Usado no link de vínculo do Telegram no painel. |
| `TELEGRAM_WEBHOOK_SECRET` | `openssl rand -hex 32`. Validado no header `X-Telegram-Bot-Api-Secret-Token`. |
| `TELEGRAM_WEBHOOK_URL` | `https://<domínio do bot>/telegram` (usado por `webhook:set`) |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Claude API. Padrão: `claude-haiku-5-5` (o mais barato). |
| `BOT_MODO` | `polling` (dev) ou `webhook` (produção) |
| `NOTIFICACOES_CRON` | `true` liga o agendador interno (a cada 15 min) |
| `JOB_SECRET` | Protege `POST /jobs/notificacoes` (header `x-job-secret`) se você quiser acionar por fora |
| `SUPABASE_DB_URL` | Connect → *Session pooler* (com a senha do banco). Usado por `db:push` e `db:types`. |
| `SUPABASE_TEST_*` | Projeto Supabase separado para `pnpm test:db` |
| `MOEDA`, `LOCALE`, `TIMEZONE` | Padrões. A tabela `configuracoes`, editável no painel, tem precedência. |
| `DOMINIO` | Domínio do painel e do bot (HTTPS automático do Caddy, só no docker-compose) |

### 2. Banco (Supabase na plataforma)

```bash
pnpm db:push       # aplica as migrations (schema, RLS, RPCs, regras de notificação padrão)
# opcional, só em projeto de desenvolvimento: dados fictícios
pnpm db:seed
pnpm db:types      # regenera packages/db/src/database.types.ts após mudar o schema
```

No painel do Supabase, em **Authentication**:

1. **Sign In / Providers → Email**: mantenha habilitado e **desligue "Allow new users to sign up"**. Usuários são criados pelo administrador (abaixo).
2. **URL Configuration**: *Site URL* = URL do painel. Em *Redirect URLs*, adicione `https://<painel>/auth/callback` e `http://localhost:3100/auth/callback`.

### Usuários e carteiras (multiusuário)

Cada **carteira** tem seus próprios clientes, empréstimos, regras de alerta e canal; quem está numa carteira não vê as outras (RLS + filtro por `carteira_id`). Todos os usuários de uma carteira têm as mesmas permissões.

```bash
pnpm usuario:criar ana@exemplo.com                        # carteira nova (nome = e-mail)
pnpm usuario:criar ana@exemplo.com --nova "Carteira Ana"  # carteira nova com nome
pnpm usuario:criar socio@exemplo.com --carteira Principal # entra numa carteira existente
```

O usuário entra no painel pelo magic link e, em **Configurações → Telegram → Vincular meu Telegram**, gera um link de uso único (15 min) que libera o bot para o Telegram dele, já apontando para a carteira certa. O bot ignora quem não está vinculado (no privado, explica como vincular).

> O SMTP padrão do Supabase tem limite baixo de envios por hora. Para uso contínuo, configure um SMTP próprio em *Authentication → Emails*.

### 3. Rodar localmente

```bash
pnpm dev     # painel em http://localhost:3000 + bot em modo polling
```

O bot em polling remove qualquer webhook registrado. Não rode em polling com o mesmo token da produção.

## Testes

```bash
pnpm test          # core (100% de linhas) + parser do bot + unitários
pnpm test:llm      # parser contra a Claude API real (custa tokens; precisa de ANTHROPIC_API_KEY)
pnpm test:db       # integração (db + fluxos do bot) contra o projeto de TESTE (SUPABASE_TEST_*)
pnpm --filter @cobra/core coverage
```

O `test:db` **grava dados de teste** (clientes, operações e um usuário de Auth `@teste.local`), por isso usa variáveis próprias `SUPABASE_TEST_*` e se recusa a rodar contra a URL de produção. Para limpar: `psql "<db url do projeto de teste>" -f scripts/limpar-dados-teste.sql`.

As frases de exemplo do produto estão em `apps/bot/test/fixtures.ts`. Elas servem de resposta gravada nos testes determinísticos e de gabarito no `test:llm`.

## Deploy

Tudo numa VPS com Docker: **painel + bot + Caddy** (HTTPS automático) num domínio só.

| Endereço | Serviço |
|---|---|
| `https://DOMINIO/` | painel |
| `https://DOMINIO/telegram` | webhook do bot (registrado no Telegram automaticamente ao subir) |

O agendador de alertas roda dentro do bot (`NOTIFICACOES_CRON=true`). `/health` e `/jobs` não ficam expostos.

### 1. Preparar a VPS (uma vez)

```bash
curl -fsSL https://get.docker.com | sh     # Docker + compose
ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw enable   # se usar ufw
```

O domínio precisa apontar para o IP da VPS (DuckDNS: `cobraphm.duckdns.org → IP`).

### 2. Enviar o código

Sem repositório remoto, copie da sua máquina (sem `node_modules`/builds):

```bash
rsync -az --exclude node_modules --exclude .next --exclude .next-build --exclude dist --exclude coverage \
  ./ root@IP_DA_VPS:/opt/cobra/
```

### 3. `.env` de produção (em `/opt/cobra/.env`)

Parta do `.env` local e ajuste:

```bash
DOMINIO=cobraphm.duckdns.org
NEXT_PUBLIC_SITE_URL=https://cobraphm.duckdns.org
TELEGRAM_WEBHOOK_SECRET=<openssl rand -hex 32>
NOTIFICACOES_CRON=true
```

(`BOT_MODO`, `PORT` e `TELEGRAM_WEBHOOK_URL` são definidos pelo `docker-compose.yml`.)

### 4. Subir

```bash
cd /opt/cobra
docker compose up -d --build
docker compose logs -f bot     # deve mostrar "webhook registrado"
```

### 5. Supabase e Telegram

- **Authentication → URL Configuration**: *Site URL* = `https://DOMINIO`; em *Redirect URLs*, `https://DOMINIO/auth/callback`.
- **Pare o bot local** (`pnpm dev`): em modo polling ele apaga o webhook de produção ao iniciar.
- Conferir o webhook: `pnpm --filter @cobra/bot webhook:info`.

### Atualizar

```bash
rsync ... (mesmo comando do passo 2)
ssh root@IP_DA_VPS 'cd /opt/cobra && docker compose up -d --build'
```

Migrations continuam sendo aplicadas da sua máquina: `pnpm db:push`.

Endpoints do bot:

- `POST /telegram`: webhook (exige o secret)
- `POST /jobs/notificacoes`: executa o job agora (header `x-job-secret: $JOB_SECRET`)
- `GET /health`

**Sem Docker**: `pnpm --filter @cobra/bot build && node apps/bot/dist/main.js`, atrás de um proxy HTTPS, com pm2 ou systemd para manter o processo no ar. O bundle (`dist/main.js`) é autocontido.

## Notificações

O job roda a cada 15 minutos (minutos 00/15/30/45). A cada execução, ele:

1. Recalcula os status: uma parcela não paga vira `atrasada` depois do fim do dia do vencimento, no timezone configurado.
2. Avalia as regras ativas. Padrões: lembrete D-1, no dia, atraso D+1/D+3/D+7, resumo diário às 08:00 e semanal na segunda às 08:00.
3. Respeita o horário de silêncio (o alerta é **adiado** até o fim do silêncio, não descartado) e os clientes silenciados.
4. Reserva cada envio em `notificacoes_enviadas` antes de mandar. A chave única é regra + parcela + data, então o mesmo alerta nunca sai duas vezes. Se o envio falhar, a reserva é liberada para a próxima execução.

**Canal de alertas (recomendado):** crie um canal privado no Telegram e adicione o bot como administrador. O bot detecta e passa a publicar lá: 🆕 novos empréstimos, ⚠️ vencimentos próximos, 📅 vencimentos do dia e 🔴 a lista diária de atrasados, agrupados em uma mensagem por tipo. Cada contrato traz um link que abre o bot no chat privado já com as ações. Remover o bot do canal devolve os alertas ao chat privado. `/canal` mostra o status e manda um teste.

No chat privado (sem canal), cada alerta de parcela traz botões: 💰 Recebido total · 🪙 Recebido parcial · 📅 +1/+3/+7 dias ou outra data. Todos passam pela confirmação ✅.

## Regras de negócio (resumo)

| Regra | Comportamento |
|---|---|
| Cliente | Nome + documento (CPF/CNPJ validados; RG ou outro com o tipo escrito antes). O documento é único: lançar com outro nome e o mesmo documento reaproveita o cliente e guarda o nome como apelido. |
| Documentos do cliente | PDF/JPG/PNG/WEBP/HEIC até 10 MB no Supabase Storage (bucket **privado** `documentos-clientes`). O navegador envia direto ao Storage por URL assinada de uso único (evita o limite de 4,5 MB da Vercel); o servidor confere tipo/tamanho reais e registra em `cliente_documentos`. Visualização por links que expiram em 5 min. Remover é lógico. |
| Taxa efetiva mensal | Parcela única: `(total/principal)^(30/dias) − 1`. Parcelada: TIR mensal (base 30 dias). A taxa do período também é exibida. |
| Parcelamento | N parcelas iguais (semanal, quinzenal ou mensal), com o ajuste de centavos na última. Principal e juros são divididos proporcionalmente. |
| Alocação de pagamento | Proporcional entre principal e juros (padrão) ou juros primeiro, configurável. O excedente abate as próximas parcelas na ordem de vencimento, gerando várias linhas de pagamento com o mesmo `lote_id`. |
| Pagamento por cliente | "Carlos pagou 1200" abate a parcela em aberto mais antiga entre todas as operações do cliente. O resumo mostra onde cada valor cai. |
| Prorrogação | Altera vencimento e/ou valor. O acréscimo conta como juros, e o antes/depois fica em `eventos`. "Dia N" nunca antecipa: se cair antes do vencimento atual, avança para o mês seguinte. Alterar o valor marca a operação como `renegociada`. |
| Perda | O prejuízo registrado é o principal em aberto. Juros não recebidos não contam como prejuízo. |
| Lucro | Realizado: juros alocados nos pagamentos do período. A realizar: juros em aberto das parcelas que vencem no período. |

## Fora do escopo do MVP

Áudio, multiusuário, score de risco, inadimplência por safra e geração de contrato. A arquitetura já facilita esses itens: as políticas RLS estão centralizadas (basta trocar `true` por `owner_id = auth.uid()`), as regras ficam isoladas no `core` e a IA está atrás da interface `Interpretador`.
