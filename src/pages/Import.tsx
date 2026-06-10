import { CheckCircle2, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import MesAccordion from '@/components/MesAccordion';
import StatCard from '@/components/StatCard';
import { Badge } from '@/components/ui/badge';
import { useAppData } from '@/contexts/AppDataContext';
import { fetchNotas } from '@/lib/db';
import type { NFe } from '@/lib/types';

function brl(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function Import() {
  const { data } = useAppData();

  const activeLote = data.empresas
    .flatMap((e) => e.lotes)
    .find((l) => l.id === data.loteAtivo);

  const [viewNotas, setViewNotas] = useState<NFe[]>([]);
  const [loadingNotas, setLoadingNotas] = useState(false);

  useEffect(() => {
    if (!activeLote || activeLote.status !== 'done') {
      setViewNotas([]);
      return;
    }
    setLoadingNotas(true);
    fetchNotas(activeLote.id)
      .then(setViewNotas)
      .catch(console.error)
      .finally(() => setLoadingNotas(false));
  }, [activeLote?.id, activeLote?.status]);

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        {activeLote && activeLote.status === 'done' && activeLote.resumo ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <h2 className="text-lg font-semibold">{activeLote.nome}</h2>
              <Badge variant="outline" className="text-green-600">
                {activeLote.totalValido.toLocaleString('pt-BR')} notas válidas
              </Badge>
              <Badge variant="secondary" className="ml-1">
                de {activeLote.totalArquivos.toLocaleString('pt-BR')} arquivos
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard
                label="Total de Notas"
                value={activeLote.resumo.notasTotais.toLocaleString('pt-BR')}
                icon={CheckCircle2}
                accent="blue"
              />
              <StatCard
                label="Total de IEs"
                value={activeLote.resumo.iesTotal.toLocaleString('pt-BR')}
                icon={CheckCircle2}
              />
              <StatCard
                label="IEs Cons. Final"
                value={activeLote.resumo.iesConsumidorFinal.toLocaleString('pt-BR')}
                icon={CheckCircle2}
                accent="green"
              />
              <StatCard
                label="Valor Total"
                value={`R$ ${brl(activeLote.resumo.valorTotal)}`}
                icon={CheckCircle2}
                accent="amber"
              />
            </div>

            {loadingNotas ? (
              <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Carregando notas...</span>
              </div>
            ) : (
              <MesAccordion notas={viewNotas} />
            )}
          </div>
        ) : activeLote && activeLote.status === 'processing' ? (
          <div className="flex items-center gap-2 text-muted-foreground py-20 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Processando lote...</span>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground text-sm">
            <p>Selecione um lote na barra lateral para visualizar as notas.</p>
            <p className="text-xs">Para criar um novo lote, clique em <strong>+</strong> ao lado do nome da empresa.</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
