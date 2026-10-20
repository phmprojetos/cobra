import type { Centavos, ParcelaEstado } from './tipos';

export interface Saldo {
  total: Centavos;
  principal: Centavos;
  juros: Centavos;
}

type ParcelaSaldoInput = Pick<
  ParcelaEstado,
  'valor' | 'valorPrincipal' | 'valorJuros' | 'valorPago' | 'principalPago' | 'jurosPago' | 'status'
>;

export function saldoParcela(p: ParcelaSaldoInput): Saldo {
  if (p.status === 'cancelada') return { total: 0, principal: 0, juros: 0 };
  const principal = Math.max(0, p.valorPrincipal - p.principalPago);
  const juros = Math.max(0, p.valorJuros - p.jurosPago);
  return { total: principal + juros, principal, juros };
}

export function somarSaldos(saldos: readonly Saldo[]): Saldo {
  return saldos.reduce(
    (a, s) => ({
      total: a.total + s.total,
      principal: a.principal + s.principal,
      juros: a.juros + s.juros,
    }),
    { total: 0, principal: 0, juros: 0 },
  );
}
