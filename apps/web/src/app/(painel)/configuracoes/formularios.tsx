'use client';

import { useActionState, useEffect } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { salvarGeral, salvarRegra, type Resultado } from './acoes';

function useAviso(estado: Resultado | null) {
  useEffect(() => {
    if (estado) (estado.ok ? toast.success : toast.error)(estado.mensagem);
  }, [estado]);
}

const selectCls = 'bg-background h-8 rounded-md border px-2 text-sm';

export function FormGeral(props: {
  moeda: string;
  locale: string;
  timezone: string;
  estrategia: string;
  silencio: { inicio: string; fim: string } | null;
}) {
  const [estado, acao, pendente] = useActionState(salvarGeral, null);
  useAviso(estado);
  return (
    <form action={acao} className="grid gap-3 sm:grid-cols-2">
      <label className="space-y-1 text-sm">
        <span className="text-muted-foreground text-xs">Moeda (ISO 4217)</span>
        <Input name="moeda" defaultValue={props.moeda} maxLength={3} />
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-muted-foreground text-xs">Locale</span>
        <Input name="locale" defaultValue={props.locale} />
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-muted-foreground text-xs">Timezone (datas e lembretes)</span>
        <Input name="timezone" defaultValue={props.timezone} list="timezones" />
        <datalist id="timezones">
          {['America/Sao_Paulo', 'America/Manaus', 'America/Recife', 'America/New_York', 'Europe/Lisbon', 'UTC'].map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-muted-foreground text-xs">Alocação de pagamentos</span>
        <select name="estrategia" defaultValue={props.estrategia} className={`${selectCls} w-full`}>
          <option value="proporcional">Proporcional (principal e juros)</option>
          <option value="juros_primeiro">Juros primeiro</option>
        </select>
      </label>
      <fieldset className="space-y-2 sm:col-span-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="silencio_ativo" defaultChecked={!!props.silencio} /> Horário de silêncio (alertas são adiados)
        </label>
        <div className="flex items-center gap-2 text-sm">
          <Input type="time" name="silencio_inicio" defaultValue={props.silencio?.inicio ?? '22:00'} className="w-28" aria-label="Início do silêncio" />
          até
          <Input type="time" name="silencio_fim" defaultValue={props.silencio?.fim ?? '07:00'} className="w-28" aria-label="Fim do silêncio" />
        </div>
      </fieldset>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pendente}>
          Salvar
        </Button>
      </div>
    </form>
  );
}

const ROTULOS: Record<string, string> = {
  lembrete_antes: 'Lembrete antes',
  no_dia: 'No dia',
  atraso: 'Atraso',
  resumo_diario: 'Resumo diário',
  resumo_semanal: 'Resumo semanal',
};
const DIAS = ['', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];

export interface RegraForm {
  id: string | null;
  tipo: string;
  offset_dias: number;
  horario: string;
  dia_semana: number | null;
  ativo: boolean;
  silenciar_clientes: string[];
}

export function FormRegra({ regra, clientes }: { regra: RegraForm; clientes: { id: string; nome: string }[] }) {
  const [estado, acao, pendente] = useActionState(salvarRegra, null);
  useAviso(estado);
  const novo = !regra.id;
  const usaOffset = regra.tipo === 'lembrete_antes' || regra.tipo === 'atraso' || novo;
  return (
    <form action={acao} className="flex flex-wrap items-end gap-3 p-3 text-sm">
      {regra.id && <input type="hidden" name="id" value={regra.id} />}
      {novo ? (
        <label className="space-y-1">
          <span className="text-muted-foreground block text-xs">Tipo</span>
          <select name="tipo" defaultValue="atraso" className={selectCls}>
            {Object.entries(ROTULOS).map(([v, r]) => (
              <option key={v} value={v}>
                {r}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <>
          <input type="hidden" name="tipo" value={regra.tipo} />
          <span className="w-32 font-medium">{ROTULOS[regra.tipo]}</span>
        </>
      )}
      {usaOffset && (
        <label className="space-y-1">
          <span className="text-muted-foreground block text-xs">{regra.tipo === 'lembrete_antes' ? 'Dias antes' : 'Dias'}</span>
          <Input type="number" name="offset_dias" min={0} max={90} defaultValue={regra.offset_dias} className="w-20" />
        </label>
      )}
      <label className="space-y-1">
        <span className="text-muted-foreground block text-xs">Horário</span>
        <Input type="time" name="horario" defaultValue={regra.horario} className="w-28" />
      </label>
      {(regra.tipo === 'resumo_semanal' || novo) && (
        <label className="space-y-1">
          <span className="text-muted-foreground block text-xs">Dia (semanal)</span>
          <select name="dia_semana" defaultValue={regra.dia_semana ?? 1} className={selectCls}>
            {DIAS.slice(1).map((d, i) => (
              <option key={d} value={i + 1}>
                {d}
              </option>
            ))}
          </select>
        </label>
      )}
      {!regra.tipo.startsWith('resumo') && clientes.length > 0 && (
        <label className="space-y-1">
          <span className="text-muted-foreground block text-xs">Silenciar clientes</span>
          <select name="silenciar" multiple defaultValue={regra.silenciar_clientes} className="bg-background h-16 w-44 rounded-md border px-1 text-xs">
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="flex items-center gap-1.5 pb-1.5">
        <input type="checkbox" name="ativo" defaultChecked={regra.ativo} /> Ativa
      </label>
      <Button type="submit" size="sm" variant={novo ? 'default' : 'outline'} disabled={pendente}>
        {novo ? 'Adicionar' : 'Salvar'}
      </Button>
    </form>
  );
}
