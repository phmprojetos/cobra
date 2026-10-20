import { Suspense } from 'react';
import type { Periodo } from '@cobra/core';
import { FiltroPeriodo } from './filtro-periodo';

export function Cabecalho({
  titulo,
  subtitulo,
  periodo,
  children,
}: {
  titulo: string;
  subtitulo?: React.ReactNode;
  periodo?: Periodo;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
        {subtitulo && <p className="text-muted-foreground mt-1 text-sm">{subtitulo}</p>}
      </div>
      <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
        {children}
        {periodo && (
          <Suspense>
            <FiltroPeriodo inicio={periodo.inicio} fim={periodo.fim} />
          </Suspense>
        )}
      </div>
    </div>
  );
}
