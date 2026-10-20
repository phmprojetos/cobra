import { type CarteiraCompleta, type ClienteRow, type OperacaoRow, type ParcelaRow } from '@cobra/db';
import { paraOperacao, paraParcela } from '@cobra/db';
import { describe, expect, it } from 'vitest';
import { intencaoRapida } from '../src/atalhos';
import { botoesClientes, textoClientes } from '../src/consultas';

const agora = '2026-10-20T00:00:00Z';
const cli = (id: string, nome: string, tipo: ClienteRow['documento_tipo'], doc: string, apelidos: string[] = []): ClienteRow => ({
  id, nome, apelidos, documento_tipo: tipo, documento: doc, telefone: null, observacoes: null, ativo: true, created_at: agora, updated_at: agora,
});

const clientes = [
  cli('1', 'Pedro Miquiles', 'cpf', '11219819417', ['Pedrão']),
  cli('2', 'Ana Paula Silva', 'cnpj', '11222333000181'),
  cli('3', 'Beatriz Lima', 'rg', '123456789', ['Bia']),
];
const op: OperacaoRow = {
  id: 'op1', cliente_id: '1', data_emprestimo: '2026-10-20', valor_principal: 100000, valor_total_receber: 130000, juros_total: 30000,
  taxa_periodo: 0.3, taxa_efetiva_mensal: 0.289, tipo: 'unica', periodicidade: null, status: 'ativa', renegociacoes: 0, valor_prejuizo: 0,
  perdida_em: null, cancelado_em: null, observacoes: null, origem: 'telegram', mensagem_origem_id: null, created_at: agora, updated_at: agora,
};
const par: ParcelaRow = {
  id: 'p1', operacao_id: 'op1', numero: 1, vencimento: '2026-11-20', valor: 130000, valor_principal: 100000, valor_juros: 30000,
  valor_pago: 0, principal_pago: 0, juros_pago: 0, status: 'aberta', cancelado_em: null, created_at: agora, updated_at: agora,
};
const carteira: CarteiraCompleta = {
  clientes: new Map(clientes.map((c) => [c.id, c])),
  operacoes: [op],
  parcelas: [par],
  pagamentos: [],
  carteira: { operacoes: [paraOperacao(op)], parcelas: [paraParcela(par)], pagamentos: [] },
};
const hoje = '2026-10-20';

describe('lista de clientes', () => {
  it('só nome completo, tipo + número do documento e nº de contratos, em ordem alfabética', () => {
    const t = textoClientes(carteira, null, hoje);
    expect(t).toContain('👥 <b>Clientes</b> · 3');
    expect(t).toContain('<b>1. Ana Paula Silva</b>\n    🪪 CNPJ <code>11.222.333/0001-81</code>\n    📄 nenhum contrato');
    expect(t).toContain('<b>2. Beatriz Lima</b>\n    🪪 RG <code>123456789</code>');
    expect(t).toContain('<b>3. Pedro Miquiles</b>\n    🪪 CPF <code>112.198.194-17</code>\n    📄 1 contrato · 1 em aberto');
    expect(t).not.toContain('Pedrão');
    expect(t).not.toContain('R$');
  });
  it('filtra por nome, apelido (sem acento) e pedaço do documento', () => {
    expect(textoClientes(carteira, 'silva', hoje)).toContain('· 1');
    expect(textoClientes(carteira, 'pedrao', hoje)).toContain('Pedro Miquiles');
    expect(textoClientes(carteira, '112.198', hoje)).toContain('Pedro Miquiles');
    expect(textoClientes(carteira, '0001-81', hoje)).toContain('Ana Paula Silva');
    expect(textoClientes(carteira, 'zé', hoje)).toContain('Nenhum cliente encontrado');
  });
  it('termo curto é "começa com"; a partir de 3 letras, "contém"', () => {
    expect(textoClientes(carteira, 'P', hoje)).toContain('Pesquisa "P"</b> · 1 cliente');
    expect(textoClientes(carteira, 'b', hoje)).toContain('Beatriz Lima'); // apelido/nome com B
    expect(textoClientes(carteira, 'li', hoje)).toContain('Nenhum cliente encontrado'); // ninguém começa com "li"
    expect(textoClientes(carteira, 'lim', hoje)).toContain('Beatriz Lima');
    expect(textoClientes(carteira, '11', hoje)).toContain('Ana Paula Silva');
    expect(textoClientes(carteira, '11', hoje)).toContain('Pedro Miquiles');
  });
  it('botões abrem a ficha de cada cliente, 2 por linha', () => {
    expect(botoesClientes(carteira, null)).toEqual([
      [{ texto: '1. Ana Paula Silva', dados: 'fc:2' }, { texto: '2. Beatriz Lima', dados: 'fc:3' }],
      [{ texto: '3. Pedro Miquiles', dados: 'fc:1' }],
    ]);
    expect(botoesClientes(carteira, 'bia')).toEqual([[{ texto: '1. Beatriz Lima', dados: 'fc:3' }]]);
  });
  it('limite e lista vazia', () => {
    expect(textoClientes(carteira, null, hoje, 2)).toContain('… e mais 1');
    expect(textoClientes({ ...carteira, clientes: new Map() }, null, hoje)).toContain('Nenhum cliente cadastrado');
  });
});

describe('atalhos de listagem', () => {
  it.each(['liste os clientes', 'Listar clientes', 'clientes', 'meus clientes', 'lista de clientes', 'ver clientes'])('%s', (t) => {
    expect(intencaoRapida(t)).toEqual({ tipo: 'consultar', dados: { tipo: 'listar_clientes', cliente: null, data_inicio: null, data_fim: null } });
  });
});
