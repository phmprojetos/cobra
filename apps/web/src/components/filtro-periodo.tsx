'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const PRESETS: [string, string][] = [
  ['mes', 'Este mês'],
  ['mes_passado', 'Mês passado'],
  ['30d', '30 dias'],
  ['90d', '90 dias'],
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

  function ir(params: Record<string, string | null>) {
    const q = new URLSearchParams(sp.toString());
    for (const k of ['p', 'de', 'ate']) q.delete(k);
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    router.push(`${pathname}${q.toString() ? `?${q}` : ''}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-1 overflow-x-auto">
        {PRESETS.map(([v, r]) => (
          <Button key={v} size="sm" variant={atual === v ? 'secondary' : 'ghost'} onClick={() => ir({ p: v })}>
            {r}
          </Button>
        ))}
      </div>
      <form
        className="flex items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          ir({ de, ate });
        }}
      >
        <Input type="date" aria-label="De" value={de} onChange={(e) => setDe(e.target.value)} className="h-7 w-[8.5rem]" />
        <span className="text-muted-foreground text-xs">a</span>
        <Input type="date" aria-label="Até" value={ate} onChange={(e) => setAte(e.target.value)} className="h-7 w-[8.5rem]" />
        <Button size="sm" type="submit" variant={atual === 'custom' ? 'secondary' : 'outline'}>
          Aplicar
        </Button>
      </form>
    </div>
  );
}
