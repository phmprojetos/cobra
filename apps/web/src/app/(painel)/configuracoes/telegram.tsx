'use client';

import { Copy, ExternalLink, Send, Unlink } from 'lucide-react';
import { useActionState, useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { desvincularTelegram, gerarLinkTelegram } from './acoes';

export interface Vinculo {
  telegram_user_id: number;
  nome: string | null;
  created_at: string;
}

/** Vincular o Telegram de quem está logado (link de uso único) e listar/desvincular os existentes. */
export function VinculosTelegram({ vinculos }: { vinculos: Vinculo[] }) {
  const [link, setLink] = useState<string | null>(null);
  const [gerando, iniciar] = useTransition();
  const [estado, desvincular, removendo] = useActionState(desvincularTelegram, null);
  useEffect(() => {
    if (estado) (estado.ok ? toast.success : toast.error)(estado.mensagem);
  }, [estado]);

  const gerar = () =>
    iniciar(async () => {
      const r = await gerarLinkTelegram();
      if (r.ok && r.link) setLink(r.link);
      else toast.error(r.mensagem);
    });

  return (
    <div className="space-y-4">
      {vinculos.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nenhum Telegram vinculado: ninguém consegue usar o bot com esta carteira.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {vinculos.map((v) => (
            <li key={v.telegram_user_id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium">{v.nome || 'Telegram'}</span>
                <span className="text-muted-foreground text-xs tabular-nums">ID {v.telegram_user_id}</span>
              </span>
              <form action={desvincular}>
                <input type="hidden" name="telegram_user_id" value={v.telegram_user_id} />
                <Button type="submit" size="sm" variant="ghost" disabled={removendo} className="text-atraso">
                  <Unlink className="size-3.5" /> Desvincular
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {link ? (
        <div className="bg-muted/50 space-y-2 rounded-lg border p-3 text-sm">
          <p>
            Abra este link <b>no celular com o seu Telegram</b> e toque em <b>Iniciar</b>. Ele vale por 15 minutos e só pode ser usado uma vez.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" nativeButton={false} render={<a href={link} target="_blank" rel="noreferrer" />}>
              <ExternalLink className="size-3.5" /> Abrir no Telegram
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigator.clipboard.writeText(link).then(() => toast.success('Link copiado.'), () => toast.error('Não foi possível copiar.'))}
            >
              <Copy className="size-3.5" /> Copiar link
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" onClick={gerar} disabled={gerando}>
          <Send className="size-3.5" /> {gerando ? 'Gerando…' : 'Vincular meu Telegram'}
        </Button>
      )}
    </div>
  );
}
