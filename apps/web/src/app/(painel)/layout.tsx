import { LogOut } from 'lucide-react';
import { Suspense } from 'react';
import { Navegacao } from '@/components/navegacao';
import { AlternarTema } from '@/components/tema';
import { Button } from '@/components/ui/button';
import { sair } from './acoes';

export default function LayoutPainel({ children }: LayoutProps<'/'>) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col">
      <header className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-10 space-y-2 border-b px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold tracking-tight">Cobra</span>
          <div className="flex items-center">
            <AlternarTema />
            <form action={sair}>
              <Button variant="ghost" size="icon" aria-label="Sair" type="submit">
                <LogOut />
              </Button>
            </form>
          </div>
        </div>
        <Suspense>
          <Navegacao />
        </Suspense>
      </header>
      <main className="flex-1 space-y-6 px-4 py-4">{children}</main>
    </div>
  );
}
