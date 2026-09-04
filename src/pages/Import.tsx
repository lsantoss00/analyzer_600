import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, FileX, FolderOpen, Loader2, RefreshCw } from 'lucide-react';
import { useRef, useState } from 'react';
import { useEffect } from 'react';
import { toast } from 'sonner';
import AppLayout from '@/components/AppLayout';
import MesAccordion from '@/components/MesAccordion';
import StatCard from '@/components/StatCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { useAppData } from '@/contexts/AppDataContext';
import { buildIeGroups, fetchNotas, markLoteError } from '@/lib/db';
import { notify } from '@/lib/notify';
import { applyNotaRules } from '@/lib/rules';
import type { BusinessRules } from '@/lib/rules';
import type { Lote, NFe, Resumo } from '@/lib/types';
import { brl } from '@/lib/utils';

// ── DiscardedSection ───────────────────────────────────────────────────────────

// A prop `filtered` foi removida: era recebida e nunca usada.
function DiscardedSection({ all, rules }: { all: NFe[]; rules: BusinessRules }) {
  const [open, setOpen] = useState(false);

  const cfopSet = new Set(rules.cfops);
  const ufSet = new Set(rules.ufs.map((u) => u.toUpperCase()));

  // Espelha applyNotaRules, incluindo a saída `ufSet.size === 0`. Sem ela, com a
  // lista de UF vazia este painel reportava TODAS as notas como rejeitadas por UF
  // enquanto applyNotaRules mantinha todas — os dois discordavam na mesma tela.
  const ufOk = (n: NFe) => ufSet.size === 0 || ufSet.has(n.ufDestino.toUpperCase());

  const rejected = all.filter((n) => !cfopSet.has(n.cfop) || !ufOk(n));
  if (rejected.length === 0) return null;

  const byCfop = rejected.filter((n) => !cfopSet.has(n.cfop) && ufOk(n));
  const byUf   = rejected.filter((n) =>  cfopSet.has(n.cfop) && !ufOk(n));
  const byBoth = rejected.filter((n) => !cfopSet.has(n.cfop) && !ufOk(n));

  const distinctCfops = [...new Set(byCfop.concat(byBoth).map((n) => n.cfop))].sort();
  const distinctUfs   = [...new Set(byUf.concat(byBoth).map((n) => n.ufDestino.toUpperCase()))].sort();

  return (
    <div className="rounded-lg border border-amber-500/20 bg-amber-500/5">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
          <span className="text-sm font-medium text-amber-300">
            {rejected.length.toLocaleString('pt-BR')} notas descartadas pelas regras atuais
          </span>
          <Badge variant="outline" className="text-amber-400 border-amber-400/30 text-xs">
            {Math.round((rejected.length / all.length) * 100)}% do total
          </Badge>
        </div>
        {open
          ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
          : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-amber-500/10 pt-3">
          <p className="text-xs text-muted-foreground">
            Estas notas estão no banco mas não aparecem no Tabelão/Dashboard. Para alterar os critérios, vá em{' '}
            <strong>Configurações → Regras de Negócio</strong>.
          </p>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-md bg-muted/40 px-3 py-2">
              <p className="text-lg font-bold text-amber-300">{byCfop.length.toLocaleString('pt-BR')}</p>
              <p className="text-xs text-muted-foreground">CFOP fora das regras</p>
              {distinctCfops.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {distinctCfops.map((c) => (
                    <span key={c} className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">{c}</span>
                  ))}
                </div>
              )}
            </div>
            <div className="rounded-md bg-muted/40 px-3 py-2">
              <p className="text-lg font-bold text-amber-300">{byUf.length.toLocaleString('pt-BR')}</p>
              <p className="text-xs text-muted-foreground">UF fora das regras</p>
              {distinctUfs.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {distinctUfs.map((u) => (
                    <span key={u} className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">{u}</span>
                  ))}
                </div>
              )}
            </div>
            <div className="rounded-md bg-muted/40 px-3 py-2">
              <p className="text-lg font-bold text-amber-300">{byBoth.length.toLocaleString('pt-BR')}</p>
              <p className="text-xs text-muted-foreground">CFOP + UF inválidos</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Arquivos que nunca viraram nota. É OUTRA coisa do DiscardedSection abaixo,
 * que mostra notas já no banco filtradas pelas regras de CFOP/UF — por isso
 * fica visualmente separado e com outra cor.
 */
function DescartesSection({ lote }: { lote: Lote }) {
  const d = lote.descartes;
  if (!d) return null;

  // ?? 0 em tudo: lotes importados com versões anteriores têm o JSON de
  // descartes sem os campos mais novos.
  const linhas = [
    { label: 'Cancelados por evento', qtd: d.cancelados ?? 0, dica: 'Nota anulada por um XML de cancelamento na mesma pasta' },
    { label: 'Eventos de cancelamento', qtd: d.eventos ?? 0, dica: 'O próprio XML do evento: não é nota, mas foi usado para anular uma' },
    { label: 'Chave duplicada', qtd: d.duplicados ?? 0, dica: 'Mesma nota em dois arquivos (NFe_X.xml e nfeProc_X.xml)' },
    { label: 'Não é NF-e', qtd: d.naoEhNfe ?? 0, dica: 'XML de outro tipo de documento' },
    { label: 'XML inválido', qtd: d.xmlInvalido ?? 0, dica: 'Arquivo corrompido ou NF-e sem os blocos obrigatórios' },
    { label: 'Erro de leitura', qtd: d.erroLeitura ?? 0, dica: 'Sem permissão, arquivo em uso ou removido durante o import' },
    { label: 'Arquivo muito grande', qtd: d.arquivoGrande ?? 0, dica: 'Acima de 50 MB' },
    { label: 'Já existiam no lote', qtd: d.jaExistiam ?? 0, dica: 'Chave já gravada anteriormente' },
  ].filter((l) => l.qtd > 0);

  const total = linhas.reduce((s, l) => s + l.qtd, 0);
  if (total === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <FileX className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium">
          {total.toLocaleString('pt-BR')} de {lote.totalArquivos.toLocaleString('pt-BR')} arquivo(s) não viraram nota
        </span>
        {total !== lote.totalArquivos - lote.totalValido && (
          <span className="text-xs text-amber-400" title="As categorias abaixo não somam a diferença entre arquivos lidos e notas gravadas">
            contabilização incompleta
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
        {linhas.map((l) => (
          <div key={l.label} className="flex items-baseline justify-between gap-2" title={l.dica}>
            <span className="text-xs text-muted-foreground truncate">{l.label}</span>
            <span className="text-xs font-mono tabular-nums">{l.qtd.toLocaleString('pt-BR')}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Import() {
  const { data, refresh } = useAppData();

  const activeLote = data.empresas
    .flatMap((e) => e.lotes)
    .find((l) => l.id === data.loteAtivo);

  const [viewNotas, setViewNotas] = useState<NFe[]>([]);
  const [filteredNotas, setFilteredNotas] = useState<NFe[]>([]);
  const [filteredStats, setFilteredStats] = useState<Resumo | null>(null);
  const [activeRules, setActiveRules] = useState<BusinessRules | null>(null);
  const [loadingNotas, setLoadingNotas] = useState(false);
  // Um reprocesso não muda o id nem o status do lote ('done' -> 'done'), então o
  // efeito abaixo não re-executaria e a tela ficaria com as notas antigas —
  // enquanto os badges do header, que leem activeLote, já mostrariam o novo total.
  const [reloadKey, setReloadKey] = useState(0);

  // Primitivas em vez do objeto: fetchEmpresas cria novos objetos Lote a cada
  // refresh(), então depender de `activeLote` re-buscaria as notas em toda
  // atualização do contexto.
  const loteId = activeLote?.id;
  const loteStatus = activeLote?.status;

  useEffect(() => {
    if (!loteId || loteStatus !== 'done') {
      setViewNotas([]); setFilteredNotas([]); setFilteredStats(null); setActiveRules(null);
      return;
    }
    setLoadingNotas(true);
    fetchNotas(loteId)
      .then((notas) => {
        const rules = data.rules;
        const fNotas = applyNotaRules(notas, rules);
        const groups = buildIeGroups(fNotas, rules.valorMinimoIe);
        setViewNotas(notas);
        setFilteredNotas(fNotas);
        setActiveRules(rules);
        setFilteredStats({
          notasTotais: fNotas.length,
          iesTotal: groups.length,
          iesConsumidorFinal: groups.filter((g) => g.isConsumidorFinal).length,
          iesNaoConsumidor: groups.filter((g) => !g.isConsumidorFinal).length,
          valorTotal: fNotas.reduce((s, n) => s + n.vNf, 0),
        });
      })
      .catch((err) => {
        // Antes era console.error: a lista sumia e os KPIs desapareciam sem aviso.
        console.error(err);
        toast.error(`Erro ao carregar as notas do lote: ${String(err)}`);
        setViewNotas([]); setFilteredNotas([]); setFilteredStats(null); setActiveRules(null);
      })
      .finally(() => setLoadingNotas(false));
    // data.rules nas deps: alterar CFOP/UF no Settings deve refazer os KPIs e o
    // painel de descartadas desta tela, não esperar a próxima montagem.
  }, [loteId, loteStatus, reloadKey, data.rules]);

  // ── Reprocess flow ──────────────────────────────────────────────────────────
  type ReprocessPhase = 'idle' | 'confirm' | 'processing';
  const [reprocessPhase, setReprocessPhase] = useState<ReprocessPhase>('idle');
  const [scanned, setScanned] = useState<string[]>([]);
  const [folderPath, setFolderPath] = useState('');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const unlistenRef = useRef<(() => void) | null>(null);

  // Listener global: sem cleanup ele sobrevive ao unmount e segue chamando
  // setProgress num componente morto se a usuária navegar durante o reprocesso.
  useEffect(() => () => { unlistenRef.current?.(); unlistenRef.current = null; }, []);

  async function handleReprocess() {
    const selected = await openDialog({ directory: true, multiple: false });
    if (!selected || typeof selected !== 'string') return;

    let paths: string[];
    try {
      paths = await invoke<string[]>('scan_folder', { path: selected });
    } catch {
      toast.error('Erro ao escanear pasta');
      return;
    }

    if (paths.length === 0) {
      toast.warning('Nenhum XML encontrado na pasta.');
      return;
    }

    setFolderPath(selected);
    setScanned(paths);
    setReprocessPhase('confirm');
  }

  async function handleConfirmReprocess() {
    if (!activeLote) return;
    setReprocessPhase('processing');
    setProgress({ done: 0, total: scanned.length });

    const unlisten = await listen<{ done: number; total: number }>('process-progress', (e) => {
      setProgress({ done: e.payload.done, total: e.payload.total });
    });
    unlistenRef.current = unlisten;

    try {
      // Sem resetLote aqui: o DELETE agora vive na mesma transação dos INSERTs
      // dentro de process_lote, então uma falha deixa as notas antigas intactas.
      const resumo: Resumo = await invoke('process_lote', {
        loteId: activeLote.id,
        xmlPaths: scanned,
      });
      await refresh();
      setReloadKey((k) => k + 1);
      const rMsg = `${resumo.notasTotais.toLocaleString('pt-BR')} notas válidas de ${scanned.length.toLocaleString('pt-BR')} arquivos`;
      toast.success(`Reprocessado: ${rMsg}`);
      notify(`Lote "${activeLote.nome}" reprocessado`, rMsg);
    } catch (err) {
      await markLoteError(activeLote.id).catch(() => {});
      // Sem este refresh a tela segue mostrando as notas antigas em memória e a
      // sidebar segue dizendo 'done' — a UI mentiria sobre o estado do lote.
      await refresh().catch(() => {});
      toast.error(`Erro ao reprocessar: ${String(err)}`);
    } finally {
      unlisten();
      unlistenRef.current = null;
      setReprocessPhase('idle');
      setScanned([]);
      setFolderPath('');
    }
  }

  function closeReprocessDialog() {
    if (reprocessPhase === 'processing') return;
    setReprocessPhase('idle');
    setScanned([]);
    setFolderPath('');
  }

  const pct = progress.total > 0 ? (progress.done / progress.total) * 100 : 0;

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        {activeLote && activeLote.status === 'done' ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <h2 className="text-lg font-semibold">{activeLote.nome}</h2>
              <Badge variant="outline" className="text-muted-foreground">
                {activeLote.totalValido.toLocaleString('pt-BR')} no banco
              </Badge>
              <Badge variant="secondary">
                de {activeLote.totalArquivos.toLocaleString('pt-BR')} arquivos
              </Badge>
              {activeLote.duracoes && (
                <Badge
                  variant="secondary"
                  title={`parse ${activeLote.duracoes.parseMs}ms · dedup ${activeLote.duracoes.dedupMs}ms · gravação ${activeLote.duracoes.gravacaoMs}ms`}
                >
                  importado em {(activeLote.duracoes.totalMs / 1000).toFixed(1)}s
                </Badge>
              )}
              {filteredStats && filteredStats.notasTotais !== activeLote.totalValido && (
                <Badge variant="outline" className="text-blue-400 border-blue-400/30">
                  {filteredStats.notasTotais.toLocaleString('pt-BR')} pelas regras atuais
                </Badge>
              )}
              <Button
                variant="outline"
                size="sm"
                className="ml-auto"
                onClick={handleReprocess}
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Reprocessar
              </Button>
            </div>

            <DescartesSection lote={activeLote} />

            {filteredStats && (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <StatCard
                  label="Notas elegíveis"
                  value={filteredStats.notasTotais.toLocaleString('pt-BR')}
                  icon={CheckCircle2}
                  accent="blue"
                />
                <StatCard
                  label="Total de IEs"
                  value={filteredStats.iesTotal.toLocaleString('pt-BR')}
                  icon={CheckCircle2}
                />
                <StatCard
                  label="IEs Não-CF"
                  value={filteredStats.iesNaoConsumidor.toLocaleString('pt-BR')}
                  icon={CheckCircle2}
                  accent="green"
                />
                <StatCard
                  label="Valor Total"
                  value={`R$ ${brl(filteredStats.valorTotal)}`}
                  icon={CheckCircle2}
                />
              </div>
            )}

            {loadingNotas ? (
              <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Carregando notas...</span>
              </div>
            ) : (
              <>
                {activeRules && viewNotas.length > filteredNotas.length && (
                  <DiscardedSection all={viewNotas} rules={activeRules} />
                )}
                <MesAccordion notas={filteredNotas} />
              </>
            )}
          </div>
        ) : activeLote && activeLote.status === 'processing' ? (
          <div className="flex items-center gap-2 text-muted-foreground py-20 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Processando lote...</span>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground text-sm">
            <FolderOpen className="h-6 w-6 opacity-40" />
            <p>Selecione um lote na barra lateral para visualizar as notas.</p>
            {/* Antes esta tela só dizia para clicar num "+" que ficava escondido
                atrás do hover. Aqui o caminho é explícito. */}
            <p className="text-xs">
              Ou clique no <strong>+</strong> à direita do nome da empresa, na barra
              lateral, para importar uma pasta de XMLs.
            </p>
          </div>
        )}
      </div>

      {/* Reprocess dialog */}
      <Dialog open={reprocessPhase !== 'idle'} onOpenChange={() => closeReprocessDialog()}>
        <DialogContent>
          {reprocessPhase === 'confirm' && (
            <>
              <DialogHeader>
                <DialogTitle>Reprocessar — {activeLote?.nome}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <p className="text-sm text-muted-foreground">
                  As notas atuais serão removidas e substituídas pelos XMLs da nova pasta.
                </p>
                <div className="rounded-lg bg-muted px-4 py-3 text-sm">
                  <p className="font-medium">{scanned.length.toLocaleString('pt-BR')} arquivos XML encontrados</p>
                  <p className="text-muted-foreground truncate text-xs mt-0.5">{folderPath}</p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeReprocessDialog}>Cancelar</Button>
                <Button onClick={handleConfirmReprocess}>Confirmar</Button>
              </DialogFooter>
            </>
          )}

          {reprocessPhase === 'processing' && (
            <>
              <DialogHeader>
                <DialogTitle>Reprocessando XMLs...</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{activeLote?.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {progress.done.toLocaleString('pt-BR')} de {progress.total.toLocaleString('pt-BR')} arquivos
                    </p>
                  </div>
                  <span className="text-sm font-mono">{Math.round(pct)}%</span>
                </div>
                <Progress value={pct} trackClassName="h-2" />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
