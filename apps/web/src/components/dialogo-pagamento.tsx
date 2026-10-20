'use client';

import { useActionState, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { registrarPagamento } from '@/app/(painel)/acoes';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function DialogoPagamento({
  parcelaId,
  cliente,
  saldo,
  saldoFormatado,
  hoje,
}: {
  parcelaId: string;
  cliente: string;
  saldo: number;
  saldoFormatado: string;
  hoje: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [estado, acao, pendente] = useActionState(registrarPagamento, null);

  useEffect(() => {
    if (!estado) return;
    if (estado.ok) {
      toast.success(estado.mensagem);
      setAberto(false);
    } else toast.error(estado.mensagem);
  }, [estado]);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Registrar pagamento</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pagamento de {cliente}</DialogTitle>
          <DialogDescription>Saldo desta parcela: {saldoFormatado}. Valor acima abate as próximas parcelas.</DialogDescription>
        </DialogHeader>
        <form action={acao} className="space-y-3">
          <input type="hidden" name="parcelaId" value={parcelaId} />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="valor">Valor</Label>
              <Input id="valor" name="valor" inputMode="decimal" defaultValue={(saldo / 100).toFixed(2).replace('.', ',')} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="data">Data</Label>
              <Input id="data" name="data" type="date" defaultValue={hoje} max={hoje} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="forma">Forma (opcional)</Label>
            <Input id="forma" name="forma" placeholder="pix, dinheiro…" />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pendente}>
              {pendente ? 'Registrando…' : 'Confirmar pagamento'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
