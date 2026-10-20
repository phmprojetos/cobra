import { Suspense } from 'react';
import type { Periodo } from '@cobra/core';
import { FiltroPeriodo } from './filtro-periodo';

export function Cabecalho({ titulo, periodo, children }: { titulo: string; periodo?: Periodo; children?: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight">{titulo}</h1>
        {children}
      </div>
      {periodo && (
        <Suspense>
          <FiltroPeriodo inicio={periodo.inicio} fim={periodo.fim} />
        </Suspense>
      )}
    </div>
  );
}
