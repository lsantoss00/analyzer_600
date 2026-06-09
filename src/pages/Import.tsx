import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { AlertCircle, CheckCircle2, FileUp, FolderOpen, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import AppLayout from '@/components/AppLayout';
import MesAccordion from '@/components/MesAccordion';
import StatCard from '@/components/StatCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useAppData } from '@/contexts/AppDataContext';
import { fetchNotas } from '@/lib/db';
import type { NFe, Resumo } from '@/lib/types';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ProgressPayload {
  done: number;
  total: number;
}

function brl(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function Import() {
  // refresh() recarrega tudo do SQLite — evita o bug de closure stale do refreshLote
  const { data, addLote, setLoteAtivo, refresh } = useAppData();

  const [scanned, setScanned] = useState<string[]>([]);
  const [folderPath, setFolderPath] = useState<string>('');
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [configOpen, setConfigOpen] = useState(false);
  const [loteNome, setLoteNome] = useState('');
  const [empresaId, setEmpresaId] = useState<string>('');

  const activeLote = data.empresas
    .flatMap((e) => e.lotes)
    .find((l) => l.id === data.loteAtivo);
  const [viewNotas, setViewNotas] = useState<NFe[]>([]);
  const [loadingNotas, setLoadingNotas] = useState(false);

  const unlistenRef = useRef<(() => void) | null>(null);

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

  async function handlePickFolder() {
    // Bloqueia se não existe nenhuma empresa cadastrada
    if (data.empresas.length === 0) {
      toast.error('Crie uma empresa na barra lateral antes de importar.');
      return;
    }

    const selected = await open({ directory: true, multiple: false });
    if (!selected || typeof selected !== 'string') return;
    setFolderPath(selected);

    const paths: string[] = await invoke('scan_folder', { path: selected });
    setScanned(paths);

    if (paths.length === 0) {
      toast.warning('Nenhum arquivo XML encontrado na pasta selecionada.');
      return;
    }

    const parts = selected.replace(/\\/g, '/').split('/');
    setLoteNome(parts[parts.length - 1] ?? 'Novo Lote');
    // Pré-seleciona: empresa ativa → primeira da lista
    setEmpresaId(data.empresaAtiva ?? data.empresas[0]?.id ?? '');
    setConfigOpen(true);
  }

  async function handleProcess() {
    if (!loteNome.trim() || !empresaId) {
      toast.error('Selecione uma empresa e defina um nome para o lote.');
      return;
    }

    setConfigOpen(false);
    setProcessing(true);
    setProgress({ done: 0, total: scanned.length });

    const unlisten = await listen<ProgressPayload>('process-progress', (e) => {
      setProgress({ done: e.payload.done, total: e.payload.total });
    });
    unlistenRef.current = unlisten;

    let loteId = '';
    try {
      // addLote cria o registro no SQLite e retorna o ID
      loteId = await addLote(empresaId, loteNome.trim());

      const resumo: Resumo = await invoke('process_lote', {
        loteId,
        xmlPaths: scanned,
      });

      // Recarrega TUDO do SQLite — garante que o sidebar reflita o estado real
      await refresh();

      // Seleciona o lote recém-criado
      setLoteAtivo(loteId);

      toast.success(
        `Lote processado: ${resumo.notasTotais.toLocaleString('pt-BR')} notas válidas de ${scanned.length.toLocaleString('pt-BR')} arquivos`,
      );
    } catch (err) {
      console.error(err);
      toast.error(`Erro ao processar: ${String(err)}`);
    } finally {
      unlisten();
      unlistenRef.current = null;
      setProcessing(false);
      setScanned([]);
      setFolderPath('');
    }
  }

  const pct = progress.total > 0 ? (progress.done / progress.total) * 100 : 0;

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Importar NF-e</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Selecione uma pasta com arquivos XML de NF-e para processar.
          </p>
        </div>

        {/* Aviso se não há empresa */}
        {data.empresas.length === 0 && !processing && (
          <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              Nenhuma empresa cadastrada. Clique no <strong>+</strong> na barra lateral para criar uma antes de importar.
            </span>
          </div>
        )}

        {/* Zona de upload */}
        {!processing && (
          <Card
            className="border-2 border-dashed cursor-pointer hover:border-primary/60 transition-colors"
            onClick={handlePickFolder}
          >
            <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="rounded-full bg-muted p-4">
                <FolderOpen className="h-8 w-8 text-muted-foreground" />
              </div>
              <div className="text-center">
                <p className="font-semibold">Clique para selecionar uma pasta</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Procura recursivamente por arquivos .xml (NF-e e eventos de cancelamento)
                </p>
              </div>
              <Button variant="outline" disabled={data.empresas.length === 0}>
                <FileUp className="h-4 w-4 mr-2" /> Selecionar Pasta
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Progresso */}
        {processing && (
          <Card>
            <CardContent className="py-10 space-y-4">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <div className="flex-1">
                  <p className="font-medium">Processando XMLs em paralelo...</p>
                  <p className="text-sm text-muted-foreground">
                    {progress.done.toLocaleString('pt-BR')} de{' '}
                    {progress.total.toLocaleString('pt-BR')} arquivos
                  </p>
                </div>
                <Badge variant="secondary">{Math.round(pct)}%</Badge>
              </div>
              <Progress value={pct} className="h-2" />
            </CardContent>
          </Card>
        )}

        {/* Lote ativo */}
        {activeLote && activeLote.status === 'done' && activeLote.resumo && (
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
        )}

        {activeLote && activeLote.status === 'processing' && (
          <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Processando lote...</span>
          </div>
        )}

        {!activeLote && !processing && (
          <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
            Selecione um lote na barra lateral para visualizar as notas.
          </div>
        )}
      </div>

      {/* Dialog de configuração do lote */}
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configurar Lote</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-muted px-4 py-3 text-sm">
              <p className="font-medium">
                {scanned.length.toLocaleString('pt-BR')} arquivos XML encontrados
              </p>
              <p className="text-muted-foreground truncate text-xs mt-0.5">{folderPath}</p>
            </div>

            <div className="grid gap-1.5">
              <Label>Nome do lote *</Label>
              <Input
                value={loteNome}
                onChange={(e) => setLoteNome(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleProcess()}
              />
            </div>

            <div className="grid gap-1.5">
              <Label>Empresa *</Label>
              <Select
                value={empresaId}
                onValueChange={(v) => setEmpresaId(v ?? '')}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma empresa">
                    {empresaId ? data.empresas.find((e) => e.id === empresaId)?.nome : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {data.empresas.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleProcess}
              disabled={!loteNome.trim() || !empresaId}
            >
              Processar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
