import Image from 'next/image';
import { cn } from '@/lib/utils';

export function Marca({ className, claro = false }: { className?: string; claro?: boolean }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      {/* Símbolo recortado do logo (public/marca/cobra-logo.png) */}
      <Image src="/cobra.png" alt="" width={36} height={36} priority className="size-9 rounded-[10px] shadow-sm ring-1 ring-white/10" />
      <span className={cn('leading-tight', claro ? 'text-white' : '')}>
        <span className="block text-sm font-semibold tracking-tight">Cobra</span>
        <span className={cn('block text-[11px]', claro ? 'text-white/60' : 'text-muted-foreground')}>Gestão de empréstimos</span>
      </span>
    </span>
  );
}
