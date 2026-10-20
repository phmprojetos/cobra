import { cn } from '@/lib/utils';

export function Marca({ className, claro = false }: { className?: string; claro?: boolean }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 text-sm font-bold text-white shadow-sm">C</span>
      <span className={cn('leading-tight', claro ? 'text-white' : '')}>
        <span className="block text-sm font-semibold tracking-tight">Cobra</span>
        <span className={cn('block text-[11px]', claro ? 'text-white/60' : 'text-muted-foreground')}>Gestão de empréstimos</span>
      </span>
    </span>
  );
}
