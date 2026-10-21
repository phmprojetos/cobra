/**
 * Cria (ou reaproveita) um usuário do painel e o coloca numa carteira.
 *
 *   pnpm usuario:criar email@exemplo.com                       → carteira nova (nome = e-mail)
 *   pnpm usuario:criar email@exemplo.com --nova "Carteira Ana" → carteira nova com esse nome
 *   pnpm usuario:criar email@exemplo.com --carteira Principal  → entra numa carteira existente (nome ou id)
 *   ... --senha "SenhaInicial123"                              → senha inicial escolhida (senão, uma aleatória)
 *   pnpm usuario:criar email@exemplo.com --carteira X --redefinir-senha → usuário existente: nova senha
 *
 * O usuário entra com e-mail e senha (o cadastro público fica desligado) e pode trocá-la em
 * Configurações ou por "Esqueci minha senha". Usa SUPABASE_URL e
 * SUPABASE_SERVICE_ROLE_KEY do .env — atenção: o .env aponta para PRODUÇÃO.
 */
import { randomBytes } from 'node:crypto';
import { Contas, criarClienteServico } from '@cobra/db';

const args = process.argv.slice(2);
const email = args[0]?.trim().toLowerCase();
const opcao = (nome: string) => {
  const i = args.indexOf(nome);
  return i >= 0 ? args[i + 1] : undefined;
};
if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
  console.error('Uso: pnpm usuario:criar <email> [--nova "Nome da carteira" | --carteira <nome ou id>] [--senha <senha>] [--redefinir-senha]');
  process.exit(1);
}
const url = process.env.SUPABASE_URL;
const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !chave) {
  console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env');
  process.exit(1);
}

const db = criarClienteServico(url, chave);
const contas = new Contas(db);

// Senha inicial: a informada ou uma aleatória legível (12 caracteres, sem 0/O/1/l).
const senhaInformada = opcao('--senha');
if (senhaInformada !== undefined && senhaInformada.length < 8) {
  console.error('A senha precisa ter pelo menos 8 caracteres.');
  process.exit(1);
}
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const senha = senhaInformada ?? [...randomBytes(12)].map((b) => ALFABETO[b % ALFABETO.length]).join('');

// Usuário: reaproveita se já existir (a senha só muda com --senha ou --redefinir-senha).
const { data: lista, error: erroLista } = await db.auth.admin.listUsers({ perPage: 1000 });
if (erroLista) throw erroLista;
let usuario = lista.users.find((u) => u.email?.toLowerCase() === email);
let senhaDefinida = false;
if (!usuario) {
  const { data, error } = await db.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (error) throw error;
  usuario = data.user;
  senhaDefinida = true;
  console.log(`✔ usuário criado: ${email}`);
} else {
  console.log(`• usuário já existia: ${email}`);
  if (senhaInformada !== undefined || args.includes('--redefinir-senha')) {
    const { error } = await db.auth.admin.updateUserById(usuario.id, { password: senha });
    if (error) throw error;
    senhaDefinida = true;
  }
}

// Carteira: existente (--carteira) ou nova.
const existente = opcao('--carteira');
let carteiraId: string;
if (existente) {
  const porId = /^[0-9a-f-]{36}$/i.test(existente) ? (await contas.carteiras()).find((c) => c.id === existente)?.id : null;
  const id = porId ?? (await contas.carteiraPorNome(existente));
  if (!id) {
    console.error(`Carteira "${existente}" não encontrada. Existentes: ${(await contas.carteiras()).map((c) => c.nome).join(', ')}`);
    process.exit(1);
  }
  carteiraId = id;
} else {
  carteiraId = await contas.criarCarteira(opcao('--nova') ?? email);
  console.log('✔ carteira nova criada (com regras e configurações padrão)');
}

await contas.adicionarMembro(usuario.id, carteiraId, email);
const nome = (await contas.carteiras()).find((c) => c.id === carteiraId)?.nome;
console.log(`✔ ${email} → carteira "${nome}"`);
if (senhaDefinida) console.log(`🔑 senha inicial: ${senha}   (peça para trocar em Configurações → Alterar minha senha)`);
console.log('Próximo passo: entrar no painel com e-mail e senha e vincular o Telegram em Configurações → Telegram.');
