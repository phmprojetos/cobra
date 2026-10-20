'use client';

import { CalendarRange } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/utils';

const PRESETS: [string, string][] = [
  ['mes', 'Este mês'],
  ['mes_passado', 'Mês passado'],
  ['30d', '30d'],
  ['90d', '90d'],
  ['ano', 'Ano'],
  ['tudo', 'Tudo'],
];

/** Filtro de período global: vive na URL e vale para todas as telas. */
export function FiltroPeriodo({ inicio, fim }: { inicio: string; fim: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const atual = sp.get('de') ? 'custom' : (sp.get('p') ?? 'mes');
  const [de, setDe] = useState(inicio);
  const [ate, setAte] = useState(fim);
  const [abrirDatas, setAbrirDatas] = useState(atual === 'custom');

  function ir(params: Record<string, string | null>) {
    const q = new URLSearchParams(sp.toString());
    for (const k of ['p', 'de', 'ate']) q.delete(k);
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    router.push(`${pathname}${q.toString() ? `?${q}` : ''}`);
  }

  const seg = (on: boolean) =>
    cn('rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors', on ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground');

  return (
    <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
      <div className="bg-card flex min-w-0 max-w-full overflow-x-auto rounded-lg border p-0.5 shadow-xs" role="group" aria-label="Período">
        {PRESETS.map(([v, r]) => (
          <button key={v} type="button" className={seg(atual === v)} onClick={() => ir({ p: v })}>
            {r}
          </button>
        ))}
        <button type="button" className={cn(seg(atual === 'custom'), 'flex items-center gap-1')} onClick={() => setAbrirDatas((x) => !x)} aria-expanded={abrirDatas}>
          <CalendarRange className="size-3.5" aria-hidden /> Datas
        </button>
      </div>
      {abrirDatas && (
        <form
          className="bg-card flex items-center gap-1.5 rounded-lg border p-1 shadow-xs"
          onSubmit={(e) => {
            e.preventDefault();
            ir({ de, ate });
          }}
        >
          <input type="date" aria-label="De" value={de} onChange={(e) => setDe(e.target.value)} className="bg-transparent px-1 text-xs" />
          <span className="text-muted-foreground text-xs">→</span>
          <input type="date" aria-label="Até" value={ate} onChange={(e) => setAte(e.target.value)} className="bg-transparent px-1 text-xs" />
          <button type="submit" className="bg-primary text-primary-foreground rounded-md px-2.5 py-1 text-xs font-medium">
            Aplicar
          </button>
        </form>
      )}
    </div>
  );
}
