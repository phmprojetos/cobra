import { LogOut } from 'lucide-react';
import { Suspense } from 'react';
import { Marca } from '@/components/marca';
import { NavLateral, NavTopo } from '@/components/navegacao';
import { AlternarTema } from '@/components/tema';
import { Button } from '@/components/ui/button';
import { MODO_DEMO } from '@/lib/demo';
import { SEM_LOGIN } from '@/lib/supabase/painel';
import { sair } from './acoes';

export default function LayoutPainel({ children }: LayoutProps<'/'>) {
  const podeSair = !SEM_LOGIN && !MODO_DEMO;
  const aviso = MODO_DEMO
    ? 'Modo demonstração: dados fictícios em memória.'
    : SEM_LOGIN
      ? 'Painel sem login (somente neste computador).'
      : null;
  return (
    <div className="flex min-h-dvh">
      {/* Menu lateral (desktop) */}
      <aside className="bg-sidebar text-sidebar-foreground sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-sidebar-border lg:flex">
        <div className="flex items-center justify-between py-6 pr-3 pl-6">
          <Marca claro />
          <AlternarTema className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" />
        </div>
        <Suspense>
          <NavLateral />
        </Suspense>
        <div className="mt-auto space-y-3 p-4">
          {aviso && <p className="bg-sidebar-accent/60 text-sidebar-foreground/80 rounded-lg px-3 py-2 text-xs">{aviso}</p>}
          <div className="flex items-center justify-end">
            {podeSair && (
              <form action={sair}>
                <Button variant="ghost" size="sm" type="submit" className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
                  <LogOut /> Sair
                </Button>
              </form>
            )}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topo (celular) */}
        <header className="bg-background/90 supports-[backdrop-filter]:bg-background/75 sticky top-0 z-20 space-y-3 border-b px-4 pt-3 pb-2 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between">
            <Marca />
            <div className="flex items-center">
              <AlternarTema />
              {podeSair && (
                <form action={sair}>
                  <Button variant="ghost" size="icon" aria-label="Sair" type="submit">
                    <LogOut />
                  </Button>
                </form>
              )}
            </div>
          </div>
          <Suspense>
            <NavTopo />
          </Suspense>
        </header>
        {aviso && <p className="text-muted-foreground bg-muted px-4 py-1.5 text-center text-xs lg:hidden">{aviso}</p>}
        <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
