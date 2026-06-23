import type { ReactNode } from 'react';
import { BarChart3, FolderOpen, LayoutGrid } from 'lucide-react';
import AppSidebar from './AppSidebar';
import { useAppData } from '@/contexts/AppDataContext';

function OnboardingScreen() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-10 px-8 select-none">
      <div className="text-center space-y-2">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground text-xl font-bold mx-auto mb-4">
          NF
        </div>
        <h1 className="text-2xl font-bold">Bem-vindo ao Analisador NF-e</h1>
        <p className="text-muted-foreground text-sm max-w-md">
          Acompanhe o progresso rumo às 600 IEs distintas do Decreto 9.025 — RIOLOG.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-6 max-w-xl w-full">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <span className="text-lg font-bold">+</span>
          </div>
          <div>
            <p className="text-sm font-medium">1. Crie uma empresa</p>
            <p className="text-xs text-muted-foreground mt-1">
              Clique em <strong>+</strong> na barra lateral, ao lado de "Empresas"
            </p>
          </div>
        </div>

        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FolderOpen className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium">2. Importe os XMLs</p>
            <p className="text-xs text-muted-foreground mt-1">
              Clique em <strong>+</strong> ao lado da empresa e selecione a pasta com os XMLs de NF-e
            </p>
          </div>
        </div>

        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <LayoutGrid className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium">3. Analise os dados</p>
            <p className="text-xs text-muted-foreground mt-1">
              Veja o progresso no <strong>Dashboard</strong> e detalhe as IEs no <strong>Tabelão</strong>
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground/50">
        <BarChart3 className="h-3.5 w-3.5" />
        <span>100% local — nenhum dado sai do seu computador</span>
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const { data } = useAppData();

  const doneLotes = data.empresas.flatMap((e) => e.lotes).filter((l) => l.status === 'done');
  const totalNotas = doneLotes.reduce((s, l) => s + l.totalValido, 0);

  return (
    <div className="flex h-screen bg-background">
      <AppSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-hidden">
          {data.empresas.length === 0 ? <OnboardingScreen /> : children}
        </main>
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
