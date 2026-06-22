import type { ReactNode } from 'react';
import AppSidebar from './AppSidebar';
import { useAppData } from '@/contexts/AppDataContext';

export default function AppLayout({ children }: { children: ReactNode }) {
  const { data } = useAppData();

  const doneLotes = data.empresas.flatMap((e) => e.lotes).filter((l) => l.status === 'done');
  const totalNotas = doneLotes.reduce((s, l) => s + l.totalValido, 0);

  return (
    <div className="flex h-screen bg-background">
      <AppSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-hidden">{children}</main>
        <div className="h-6 border-t border-border/40 px-4 flex items-center gap-3 shrink-0 select-none">
          <span className="text-[11px] text-muted-foreground/40 font-mono">
            {data.empresas.length} {data.empresas.length === 1 ? 'empresa' : 'empresas'}
            <span className="mx-2">·</span>
            {doneLotes.length} {doneLotes.length === 1 ? 'lote' : 'lotes'}
            <span className="mx-2">·</span>
            {totalNotas.toLocaleString('pt-BR')} notas no banco
          </span>
        </div>
      </div>
    </div>
  );
}
