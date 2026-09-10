import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import {
  AlertTriangle,
  ArrowLeftRight,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Columns2,
  Copy,
  FileSpreadsheet,
  FileText,
  ListFilter,
  Loader2,
  MapPin,
  Search,
  Users,
  X,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import AppLayout from '@/components/AppLayout';
import { IeDetailSheet } from '@/components/IeDetailSheet';
import { MetaProgress } from '@/components/MetaProgress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAppData } from '@/contexts/AppDataContext';
import { buildIeGroups, compareIeGroups, fetchNotasByLotes, fetchNotasCanceladasByLotes, fetchNotasCompletasByLotes } from '@/lib/db';
import { applyNotaRules } from '@/lib/rules';
import type { BusinessRules } from '@/lib/rules';
import { useSelectedEmpresa } from '@/lib/useSelectedEmpresa';
import { gerarExcelComparacao, gerarExcelTabelao } from '@/lib/excelClient';
import { generatePdfBytes, type PdfMode } from '@/lib/pdfExport';
import type { IeGroup, Lote, NFe, NFeCompleta, NFeDescartada, Resumo } from '@/lib/types';
import { brl, formatCnpj, formatDate } from '@/lib/utils';

// ── helpers ────────────────────────────────────────────────────────────────────

type SortKey = 'ie' | 'xNome' | 'valorTotal' | 'qtdNotas' | 'dataEmissaoLatest';
type SortDir = 'asc' | 'desc';

// ── LoteChips ──────────────────────────────────────────────────────────────────

function LoteChips({
  lotes,
  selected,
  onToggle,
  onSelectAll,
}: {
  lotes: Lote[];
  selected: string[];
  onToggle: (id: string) => void;
  onSelectAll: () => void;
}) {
  if (lotes.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {lotes.length > 1 && (
        <button
          type="button"
          className={[
            'text-xs px-3 py-1 rounded-full border transition-colors',
            selected.length === lotes.length
              ? 'bg-primary text-primary-foreground border-primary'
              : 'border-border text-muted-foreground hover:border-primary/50',
          ].join(' ')}
          onClick={onSelectAll}
        >
          Todos
        </button>
      )}
      {lotes.map((l) => (
        <button
          key={l.id}
          type="button"
          className={[
            'text-xs px-3 py-1 rounded-full border transition-colors',
            selected.includes(l.id)
              ? 'bg-primary text-primary-foreground border-primary'
              : 'border-border text-muted-foreground hover:border-primary/50',
          ].join(' ')}
          onClick={() => onToggle(l.id)}
        >
          {l.nome}
        </button>
      ))}
    </div>
  );
}

// ── Column definitions ─────────────────────────────────────────────────────────

const COL_DEFS = [
  { id: 'cnpj',       label: 'CNPJ',         default: true  },
  { id: 'municipio',  label: 'Município',     default: true  },
  { id: 'data',       label: 'Data',          default: true  },
  { id: 'valorTotal', label: 'Valor Total',   default: true  },
  { id: 'qtd',        label: 'Qtd NF',        default: true  },
  { id: 'cf',         label: 'Cons. Final',   default: true  },
  { id: 'indFinal',   label: 'Qt. indFinal',  default: false },
  { id: 'uf',         label: 'UF',            default: false },
] as const;

type ColId = typeof COL_DEFS[number]['id'];

const DEFAULT_COLS = new Set<ColId>(COL_DEFS.filter((c) => c.default).map((c) => c.id));

function loadCols(): Set<ColId> {
  try {
    const saved = localStorage.getItem('tabelao_cols');
    if (saved) return new Set(JSON.parse(saved) as ColId[]);
  } catch {}
  return new Set(DEFAULT_COLS);
}

// ── CompareView ────────────────────────────────────────────────────────────────

function CompareView({
  lotes,
  valorMinimoIe,
  rules,
  onRowClick,
}: {
  lotes: Lote[];
  valorMinimoIe: number;
  rules: BusinessRules;
  onRowClick: (g: IeGroup, origem: string) => void;
}) {
  const [loteIdsA, setLoteIdsA] = useState<string[]>([]);
  const [loteIdsB, setLoteIdsB] = useState<string[]>([]);
  const [notasA, setNotasA] = useState<NFe[]>([]);
  const [notasB, setNotasB] = useState<NFe[]>([]);
  const [loadingA, setLoadingA] = useState(false);
  const [loadingB, setLoadingB] = useState(false);

  useEffect(() => {
    if (loteIdsA.length === 0) { setNotasA([]); return; }
    setLoadingA(true);
    fetchNotasByLotes(loteIdsA)
      .then(setNotasA)
      .catch((err) => { console.error(err); toast.error(`Erro ao carregar o período A: ${String(err)}`); })
      .finally(() => setLoadingA(false));
  }, [loteIdsA.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (loteIdsB.length === 0) { setNotasB([]); return; }
    setLoadingB(true);
    fetchNotasByLotes(loteIdsB)
      .then(setNotasB)
      .catch((err) => { console.error(err); toast.error(`Erro ao carregar o período B: ${String(err)}`); })
      .finally(() => setLoadingB(false));
  }, [loteIdsB.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredA = useMemo(() => applyNotaRules(notasA, rules), [notasA, rules]);
  const filteredB = useMemo(() => applyNotaRules(notasB, rules), [notasB, rules]);
  const groupsA = useMemo(() => buildIeGroups(filteredA, valorMinimoIe), [filteredA, valorMinimoIe]);
  const groupsB = useMemo(() => buildIeGroups(filteredB, valorMinimoIe), [filteredB, valorMinimoIe]);
  const diff = useMemo(() => compareIeGroups(groupsA, groupsB), [groupsA, groupsB]);

  function toggleA(id: string) {
    setLoteIdsA((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }
  function toggleB(id: string) {
    setLoteIdsB((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  const hasSelection = loteIdsA.length > 0 && loteIdsB.length > 0;
  const loading = loadingA || loadingB;
  const [exportando, setExportando] = useState(false);

  async function exportarComparacao() {
    const savePath = await save({
      filters: [{ name: 'Excel', extensions: ['xlsx'] }],
      defaultPath: 'comparacao-ies.xlsx',
    });
    if (!savePath) return;
    setExportando(true);
    try {
      const bytes = await gerarExcelComparacao(diff);
      await writeFile(savePath, bytes);
      toast.success(
        `Excel: ${diff.gained.length} ganhas, ${diff.lost.length} perdidas, ${diff.common.length} em comum`,
      );
    } catch (err) {
      console.error(err);
      toast.error(`Erro ao exportar a comparação: ${String(err)}`);
    } finally {
      setExportando(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Period selectors */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-border px-4 py-3 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Período A (base)</p>
          <div className="flex flex-wrap gap-1.5">
            {lotes.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => toggleA(l.id)}
                className={[
                  'text-xs px-2.5 py-1 rounded-full border transition-colors',
                  loteIdsA.includes(l.id)
                    ? 'bg-blue-500/20 text-blue-400 border-blue-500/40'
                    : 'border-border text-muted-foreground hover:border-blue-500/40',
                ].join(' ')}
              >
                {l.nome}
              </button>
            ))}
          </div>
          {loteIdsA.length > 0 && (
            <p className="text-xs text-blue-400">{groupsA.filter((g) => !g.isConsumidorFinal).length} IEs válidas</p>
          )}
        </div>
        <div className="rounded-lg border border-border px-4 py-3 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Período B (comparar)</p>
          <div className="flex flex-wrap gap-1.5">
            {lotes.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => toggleB(l.id)}
                className={[
                  'text-xs px-2.5 py-1 rounded-full border transition-colors',
                  loteIdsB.includes(l.id)
                    ? 'bg-primary/20 text-primary border-primary/40'
                    : 'border-border text-muted-foreground hover:border-primary/40',
                ].join(' ')}
              >
                {l.nome}
              </button>
            ))}
          </div>
          {loteIdsB.length > 0 && (
            <p className="text-xs text-primary">{groupsB.filter((g) => !g.isConsumidorFinal).length} IEs válidas</p>
          )}
        </div>
      </div>

      {!hasSelection && (
        <p className="text-sm text-muted-foreground text-center py-8">
          Selecione lotes nos dois períodos para comparar.
        </p>
      )}

      {hasSelection && loading && (
        <div className="flex items-center gap-2 justify-center py-10 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Carregando comparação...</span>
        </div>
      )}

      {hasSelection && !loading && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={exportarComparacao}
              disabled={
                exportando ||
                diff.gained.length + diff.lost.length +
                diff.common.length + diff.changedToCF.length === 0
              }
            >
              {exportando ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />
              )}
              {exportando ? 'Gerando...' : 'Excel da comparação'}
            </Button>
          </div>

          {/* Summary badges */}
          <div className="flex flex-wrap gap-3">
            <div className="rounded-lg bg-green-500/10 border border-green-500/20 px-4 py-2 text-center min-w-28">
              <p className="text-xl font-bold text-green-400">{diff.gained.length}</p>
              <p className="text-xs text-muted-foreground">IEs ganhas</p>
            </div>
            <div className="rounded-lg bg-muted/30 border border-border px-4 py-2 text-center min-w-28">
              <p className="text-xl font-bold">{diff.common.length}</p>
              <p className="text-xs text-muted-foreground">Em comum</p>
            </div>
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2 text-center min-w-28">
              <p className="text-xl font-bold text-destructive">{diff.lost.length}</p>
              <p className="text-xs text-muted-foreground">IEs perdidas</p>
            </div>
            {diff.changedToCF.length > 0 && (
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-2 text-center min-w-28">
                <p className="text-xl font-bold text-amber-400">{diff.changedToCF.length}</p>
                <p className="text-xs text-muted-foreground">Viraram CF</p>
              </div>
            )}
          </div>

          {/* Gained */}
          {diff.gained.length > 0 && (
            <DiffSection title="IEs ganhas no período B" color="green" groups={diff.gained} origem="Período B" onRowClick={onRowClick} />
          )}

          {/* Lost */}
          {diff.lost.length > 0 && (
            <DiffSection title="IEs perdidas (saíram)" color="red" groups={diff.lost} origem="Período A" onRowClick={onRowClick} />
          )}

          {/* Changed to CF */}
          {diff.changedToCF.length > 0 && (
            <DiffSection title="Viraram Consumidor Final" color="amber" groups={diff.changedToCF} origem="Período A" onRowClick={onRowClick} />
          )}

          {/* Common */}
          {diff.common.length > 0 && (
            <DiffSection title={`Em comum (${diff.common.length})`} color="default" groups={diff.common} origem="Período A" onRowClick={onRowClick} collapsed />
          )}
        </div>
      )}
    </div>
  );
}

function DiffSection({
  title,
  color,
  groups,
  origem,
  onRowClick,
  collapsed = false,
}: {
  title: string;
  color: 'green' | 'red' | 'amber' | 'default';
  groups: IeGroup[];
  // compareIeGroups devolve lost/common/changedToCF com os objetos do período A
  // e só gained vem do B — o painel precisa dizer de qual período são os números.
  origem: string;
  onRowClick: (g: IeGroup, origem: string) => void;
  collapsed?: boolean;
}) {
  const [open, setOpen] = useState(!collapsed);
  const borderColor = {
    green: 'border-green-500/30',
    red: 'border-red-500/30',
    amber: 'border-amber-500/30',
    default: 'border-border',
  }[color];
  const textColor = {
    green: 'text-green-400',
    red: 'text-destructive',
    amber: 'text-amber-400',
    default: 'text-foreground',
  }[color];

  return (
    <div className={`rounded-lg border ${borderColor} overflow-hidden`}>
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium hover:bg-accent/30 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <span className={textColor}>{title}</span>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>IE</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Município</TableHead>
              <TableHead>UF</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((g) => (
              <TableRow key={g.ie} className="cursor-pointer hover:bg-accent/50" onClick={() => onRowClick(g, origem)}>
                <TableCell className="font-mono text-xs">{g.ie || '—'}</TableCell>
                <TableCell className="text-sm max-w-48 truncate" title={g.xNome}>{g.xNome}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{g.municipio}</TableCell>
                <TableCell className="font-mono text-xs">{g.ufEnd || '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

// ── main component ─────────────────────────────────────────────────────────────

export default function Tabelao() {
  const { data } = useAppData();

  const empresasComLotes = useMemo(
    () => data.empresas.filter((e) => e.lotes.some((l) => l.status === 'done')),
    [data.empresas],
  );

  const [selectedEmpresaId, setSelectedEmpresaId] = useSelectedEmpresa(
    empresasComLotes,
    data.empresaAtiva,
  );

  const empresa = empresasComLotes.find((e) => e.id === selectedEmpresaId) ?? null;

  const doneLotes = useMemo(
    () => empresa?.lotes.filter((l) => l.status === 'done') ?? [],
    [empresa],
  );

  const [selectedLoteIds, setSelectedLoteIds] = useState<string[]>([]);
  const [compareMode, setCompareMode] = useState(false);

  // Abre sempre zerado — a usuária escolhe o período nos chips.
  useEffect(() => {
    setSelectedLoteIds([]);
  }, [empresa?.id]);

  function handleEmpresaChange(id: string | null) {
    if (!id) return;
    setSelectedEmpresaId(id);
    setSelectedLoteIds([]);
    setCompareMode(false);
  }

  const [notas, setNotas] = useState<NFe[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (compareMode) return;
    if (selectedLoteIds.length === 0) { setNotas([]); setLoadError(null); return; }
    setLoading(true);
    setLoadError(null);
    fetchNotasByLotes(selectedLoteIds)
      .then(setNotas)
      .catch((err) => {
        // Antes era console.error, e a tabela exibia "Nenhum lote selecionado" —
        // factualmente errado, já que havia lote selecionado.
        console.error(err);
        setLoadError(String(err));
        setNotas([]);
      })
      .finally(() => setLoading(false));
  }, [selectedLoteIds.join(','), compareMode, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── column visibility ────────────────────────────────────────────────────────
  const [visibleCols, setVisibleCols] = useState<Set<ColId>>(loadCols);

  function toggleCol(id: ColId) {
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem('tabelao_cols', JSON.stringify([...next]));
      return next;
    });
  }

  // ── copy to clipboard ────────────────────────────────────────────────────────
  function copyToClipboard(text: string, label: string, e: React.MouseEvent) {
    e.stopPropagation();
    navigator.clipboard.writeText(text).catch(() => {});
    toast.success(`${label} copiado`, { duration: 1500 });
  }

  // ── keyboard shortcut Ctrl+F → foca busca ────────────────────────────────────
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── regras de negócio ───────────────────────────────────────────────────────
  // Vêm do contexto: uma alteração no Settings reflete aqui na hora.
  const rules = data.rules;
  const metaIes = rules.metaIes;

  // Filtro de sessão, NÃO a regra. Antes este campo gravava direto em
  // localStorage['valor_minimo_ie'] a cada tecla, sobrescrevendo a regra
  // configurada no Settings e movendo os KPIs do Dashboard e do Import —
  // telas que nem exibem um campo de valor mínimo.
  const [valorMinimoIe, setValorMinimoIe] = useState(rules.valorMinimoIe);

  // Ressincroniza quando a regra muda no Settings, desde que o usuário não
  // tenha um filtro próprio em vigor.
  const regraValorMinimo = rules.valorMinimoIe;
  const valorMinimoTocado = useRef(false);
  useEffect(() => {
    if (!valorMinimoTocado.current) setValorMinimoIe(regraValorMinimo);
  }, [regraValorMinimo]);

  function handleValorMinimoChange(v: string) {
    valorMinimoTocado.current = true;
    setValorMinimoIe(parseFloat(v) || 0);
  }

  function resetValorMinimo() {
    valorMinimoTocado.current = false;
    setValorMinimoIe(regraValorMinimo);
  }

  // ── filters & sort ──────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  // O input continua respondendo a cada tecla; só o filtro espera. Sem isto,
  // cada tecla refazia o filtro sobre TODOS os grupos — e o pior caso varre
  // todas as notas do conjunto procurando a chave.
  const [searchDebounced, setSearchDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 200);
    return () => clearTimeout(t);
  }, [search]);
  const [cfFilter, setCfFilter] = useState<'all' | 'cf' | 'ncf'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showCols, setShowCols] = useState(false);
  const [trimestreAno, setTrimestreAno] = useState(new Date().getFullYear());

  const TRIMESTRES = useMemo(() => [
    { label: 'T1', from: `${trimestreAno}-01-01`, to: `${trimestreAno}-03-31` },
    { label: 'T2', from: `${trimestreAno}-04-01`, to: `${trimestreAno}-06-30` },
    { label: 'T3', from: `${trimestreAno}-07-01`, to: `${trimestreAno}-09-30` },
    { label: 'T4', from: `${trimestreAno}-10-01`, to: `${trimestreAno}-12-31` },
  ], [trimestreAno]);

  function handleTrimestre(idx: number) {
    const t = TRIMESTRES[idx];
    if (dateFrom === t.from && dateTo === t.to) {
      setDateFrom(''); setDateTo('');
    } else {
      setDateFrom(t.from); setDateTo(t.to);
    }
  }

  const activeTrimestre = TRIMESTRES.findIndex((t) => dateFrom === t.from && dateTo === t.to);
  const [sortKey, setSortKey] = useState<SortKey>('valorTotal');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const notasDateFiltered = useMemo(() => {
    if (!dateFrom && !dateTo) return notas;
    return notas.filter((n) => {
      const d = n.dataEmissao.slice(0, 10);
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      return true;
    });
  }, [notas, dateFrom, dateTo]);

  const notasRuleFiltered = useMemo(
    () => applyNotaRules(notasDateFiltered, rules),
    [notasDateFiltered, rules],
  );

  const allGroups = useMemo(
    () => buildIeGroups(notasRuleFiltered, valorMinimoIe),
    [notasRuleFiltered, valorMinimoIe],
  );

  const filteredGroups: IeGroup[] = useMemo(() => {
    let g = allGroups;
    if (searchDebounced.trim()) {
      const q = searchDebounced.toLowerCase();
      const qDigits = q.replace(/\D/g, '');
      g = g.filter(
        (ie) =>
          ie.ie.toLowerCase().includes(q) ||
          (qDigits && ie.cnpjDest.replace(/\D/g, '').includes(qDigits)) ||
          ie.xNome.toLowerCase().includes(q) ||
          ie.notas.some((n) => n.nNf === q || n.chave.includes(q)),
      );
    }
    if (cfFilter === 'cf') g = g.filter((ie) => ie.isConsumidorFinal);
    if (cfFilter === 'ncf') g = g.filter((ie) => !ie.isConsumidorFinal);
    return [...g].sort((a, b) => {
      const av = a[sortKey] as string | number;
      const bv = b[sortKey] as string | number;
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
  }, [allGroups, searchDebounced, cfFilter, sortKey, sortDir]);

  // ── derived stats ───────────────────────────────────────────────────────────
  const ufsSet = useMemo(
    () => new Set(allGroups.map((g) => g.ufEnd).filter(Boolean)),
    [allGroups],
  );

  const ufLabel = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of allGroups) if (g.ufEnd) counts.set(g.ufEnd, (counts.get(g.ufEnd) ?? 0) + 1);
    return [...counts.entries()].map(([uf, n]) => `${uf}: ${n}`).join(', ');
  }, [allGroups]);

  const cfopCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const n of notasRuleFiltered) map.set(n.cfop, (map.get(n.cfop) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [notasRuleFiltered]);

  const resumo: Resumo = useMemo(() => ({
    notasTotais: notasRuleFiltered.length,
    iesTotal: allGroups.length,
    iesConsumidorFinal: allGroups.filter((g) => g.isConsumidorFinal).length,
    iesNaoConsumidor: allGroups.filter((g) => !g.isConsumidorFinal).length,
    valorTotal: notasRuleFiltered.reduce((s, n) => s + n.vNf, 0),
  }), [notasRuleFiltered, allGroups]);

  // ── breadcrumb ──────────────────────────────────────────────────────────────
  const loteBreadcrumb =
    selectedLoteIds.length === 1
      ? (doneLotes.find((l) => l.id === selectedLoteIds[0])?.nome ?? '')
      : selectedLoteIds.length === 0
        ? 'Nenhum lote'
        : `${selectedLoteIds.length} lotes`;

  // Descreve o recorte da tabela principal para o painel da IE deixar claro
  // sobre que conjunto os números da primeira seção foram calculados.
  const recorteLabel = [
    loteBreadcrumb,
    dateFrom || dateTo
      ? `${dateFrom ? formatDate(dateFrom) : '...'} a ${dateTo ? formatDate(dateTo) : '...'}`
      : null,
    valorMinimoIe > 0 ? `valor mín. R$ ${valorMinimoIe.toLocaleString('pt-BR')}` : null,
  ].filter(Boolean).join(' · ');

  // ── lote toggle ─────────────────────────────────────────────────────────────
  function toggleLote(id: string) {
    setSelectedLoteIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  // ── sort ────────────────────────────────────────────────────────────────────
  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return null;
    return sortDir === 'asc'
      ? <ChevronUp className="inline h-3 w-3 ml-0.5" />
      : <ChevronDown className="inline h-3 w-3 ml-0.5" />;
  }

  // ── export ──────────────────────────────────────────────────────────────────
  const notasFiltradas = useMemo(
    () => filteredGroups.flatMap((g) => g.notas),
    [filteredGroups],
  );

  const resumoFiltrado: Resumo = useMemo(() => ({
    notasTotais: notasFiltradas.length,
    iesTotal: filteredGroups.length,
    iesConsumidorFinal: filteredGroups.filter((g) => g.isConsumidorFinal).length,
    iesNaoConsumidor: filteredGroups.filter((g) => !g.isConsumidorFinal).length,
    valorTotal: notasFiltradas.reduce((s, n) => s + n.vNf, 0),
  }), [notasFiltradas, filteredGroups]);

  // A montagem roda num Worker: com 80 mil notas são ~1,4 milhão de células e
  // antes isso congelava a janela, sem spinner e com o botão ainda clicável.
  const [exportandoExcel, setExportandoExcel] = useState(false);

  async function exportExcel() {
    const savePath = await save({ filters: [{ name: 'Excel', extensions: ['xlsx'] }], defaultPath: 'relatorio-nfe.xlsx' });
    if (!savePath) return;
    setExportandoExcel(true);
    try {
      // As telas carregam só as 15 colunas que usam; a aba "Lista de Notas"
      // precisa das 22. Buscar aqui e cruzar pelos ids já filtrados evita
      // reimplementar regras, data, CF e busca — e evita pagar essas 7 colunas
      // em toda carga de tela.
      const idsFiltrados = new Set(notasFiltradas.map((n) => n.id));
      const completas = await fetchNotasCompletasByLotes(selectedLoteIds);
      const notasExport = completas.filter((n) => idsFiltrados.has(n.id));

      // Aba de descartadas: as canceladas vêm marcadas do banco; as que caíram
      // por CFOP/UF são as que sobram do conjunto completo. Mesmo predicado do
      // applyNotaRules, inclusive a saída de lista de UF vazia.
      const canceladas = await fetchNotasCanceladasByLotes(selectedLoteIds);
      const cfopSet = new Set(rules.cfops);
      const ufSet = new Set(rules.ufs.map((u) => u.toUpperCase()));
      const ufOk = (n: NFeCompleta) =>
        ufSet.size === 0 || ufSet.has(n.ufDestino.toUpperCase());

      const porRegra: NFeDescartada[] = completas
        .filter((n) => !cfopSet.has(n.cfop) || !ufOk(n))
        .map((n) => ({
          ...n,
          motivo: (!cfopSet.has(n.cfop) && !ufOk(n)
            ? 'cfop+uf'
            : !cfopSet.has(n.cfop)
              ? 'cfop'
              : 'uf') as NFeDescartada['motivo'],
        }));

      const descartadas: NFeDescartada[] = [
        ...canceladas.map((n) => ({ ...n, motivo: 'cancelada' as const })),
        ...porRegra,
      ];

      const loteAtual = doneLotes.find((l) => l.id === selectedLoteIds[0]);
      const bytes = await gerarExcelTabelao(notasExport, filteredGroups, {
        notas: descartadas,
        // Só faz sentido com um lote: com vários, os totais e o detalhe de
        // motivos seriam de lotes diferentes misturados.
        descartes: selectedLoteIds.length === 1 ? (loteAtual?.descartes ?? null) : null,
        totalArquivos: doneLotes
          .filter((l) => selectedLoteIds.includes(l.id))
          .reduce((s, l) => s + l.totalArquivos, 0),
        totalValido: doneLotes
          .filter((l) => selectedLoteIds.includes(l.id))
          .reduce((s, l) => s + l.totalValido, 0),
      });
      await writeFile(savePath, bytes);
      toast.success(`Excel: ${filteredGroups.length} IEs, ${notasFiltradas.length} notas`);
    } catch (err) {
      console.error(err);
      toast.error(`Erro ao exportar Excel: ${String(err)}`);
    } finally {
      setExportandoExcel(false);
    }
  }

  // O PDF antes saía só com KPIs — nenhuma IE — apesar de vir de uma tela
  // chamada "Tabelão de IEs Distintas". Agora o conteúdo é escolhido na hora.
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);

  async function exportPdf(mode: PdfMode) {
    setPdfDialogOpen(false);
    const savePath = await save({ filters: [{ name: 'PDF', extensions: ['pdf'] }], defaultPath: 'relatorio-nfe.pdf' });
    if (!savePath) return;
    try {
      await writeFile(
        savePath,
        generatePdfBytes(
          notasFiltradas,
          resumoFiltrado,
          loteBreadcrumb,
          empresa?.nome ?? '',
          mode,
          filteredGroups,
        ),
      );
      toast.success('PDF exportado');
    } catch (err) {
      console.error(err);
      toast.error(`Erro ao exportar PDF: ${String(err)}`);
    }
  }

  // ── IE detail sheet ─────────────────────────────────────────────────────────
  const [selectedGroup, setSelectedGroup] = useState<IeGroup | null>(null);
  const [selectedOrigem, setSelectedOrigem] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);

  // ── virtual table ────────────────────────────────────────────────────────────
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: filteredGroups.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 36,
    overscan: 15,
  });

  function openIeDetail(g: IeGroup, origem?: string) {
    setSelectedGroup(g);
    setSelectedOrigem(origem ?? recorteLabel);
    setSheetOpen(true);
  }

  // ── no empresa ──────────────────────────────────────────────────────────────
  if (!empresa) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-full py-32 text-muted-foreground text-sm gap-2">
          <p>Nenhuma empresa com lotes processados.</p>
          <p className="text-xs">Clique em <strong>+</strong> ao lado de uma empresa para importar XMLs.</p>
        </div>
      </AppLayout>
    );
  }

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* ── top bar ── */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border shrink-0">
          <h1 className="text-xl font-bold">Tabelão de IEs Distintas</h1>
          <div className="flex items-center gap-2">
            {empresasComLotes.length > 1 && (
              <Select value={selectedEmpresaId} onValueChange={handleEmpresaChange}>
                <SelectTrigger className="w-44">
                  <SelectValue>
                    {empresa.nome}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {empresasComLotes.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button
              variant={compareMode ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCompareMode((v) => !v)}
            >
              <ArrowLeftRight className="h-3.5 w-3.5 mr-1.5" /> Comparar
            </Button>
            {!compareMode && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportExcel}
                  disabled={exportandoExcel || notasFiltradas.length === 0}
                >
                  {exportandoExcel ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  {exportandoExcel ? 'Gerando...' : 'Excel'}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPdfDialogOpen(true)} disabled={notasFiltradas.length === 0}>
                  <FileText className="h-3.5 w-3.5 mr-1.5" /> PDF
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* ── compare mode ── */}
          {compareMode ? (
            <CompareView lotes={doneLotes} valorMinimoIe={valorMinimoIe} rules={rules} onRowClick={openIeDetail} />
          ) : (
            <>
              {/* ── lote filter chips ── */}
              <LoteChips
                lotes={doneLotes}
                selected={selectedLoteIds}
                onToggle={toggleLote}
                onSelectAll={() => setSelectedLoteIds(doneLotes.map((l) => l.id))}
              />

              {/* ── meta progress ── */}
              {!loading && notas.length > 0 && (
                <MetaProgress count={resumo.iesNaoConsumidor} meta={metaIes} />
              )}

              {selectedLoteIds.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-muted-foreground text-sm gap-2">
                  <ListFilter className="h-6 w-6 opacity-40" />
                  <p>Selecione um período acima para carregar o tabelão.</p>
                  {doneLotes.length > 1 && (
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      onClick={() => setSelectedLoteIds([doneLotes[doneLotes.length - 1].id])}
                    >
                      Usar o último período ({doneLotes[doneLotes.length - 1].nome})
                    </button>
                  )}
                </div>
              ) : loadError ? (
                <div className="flex flex-col items-center justify-center py-24 gap-3 text-sm">
                  <AlertTriangle className="h-6 w-6 text-destructive" />
                  <p className="text-muted-foreground">Não foi possível carregar as notas do período.</p>
                  <p className="text-xs text-muted-foreground/70 max-w-md text-center font-mono">{loadError}</p>
                  <Button variant="outline" size="sm" onClick={() => setReloadKey((k) => k + 1)}>
                    Tentar novamente
                  </Button>
                </div>
              ) : loading ? (
                <div className="flex items-center gap-2 justify-center py-20 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Carregando...</span>
                </div>
              ) : (
                <>
                  {/* ── KPI cards ── */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Card>
                      <CardContent className="py-4 px-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-2xl font-bold">{resumo.iesTotal.toLocaleString('pt-BR')}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">Total IEs Distintas</p>
                          </div>
                          <BarChart3 className="h-5 w-5 text-primary/60 shrink-0" />
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="py-4 px-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-2xl font-bold">{resumo.iesNaoConsumidor.toLocaleString('pt-BR')}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">Não Consumidor Final</p>
                            <p className="text-xs text-muted-foreground/60">Elegíveis para incentivo</p>
                          </div>
                          <Users className="h-5 w-5 text-green-400/60 shrink-0" />
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="py-4 px-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-2xl font-bold">{resumo.iesConsumidorFinal.toLocaleString('pt-BR')}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">Consumidor Final</p>
                            <p className="text-xs text-muted-foreground/60">indFinal = 1</p>
                          </div>
                          <Users className="h-5 w-5 text-muted-foreground shrink-0" />
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="py-4 px-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-2xl font-bold">{ufsSet.size}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">UFs Representadas</p>
                            {ufLabel && <p className="text-xs text-muted-foreground/60 truncate max-w-28">{ufLabel}</p>}
                          </div>
                          <MapPin className="h-5 w-5 text-muted-foreground shrink-0" />
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* ── CFOP distribution ── */}
                  {cfopCounts.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                        Distribuição por CFOP
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {cfopCounts.map(([cfop, count]) => (
                          <Badge key={cfop} variant="secondary" className="text-xs font-mono">
                            {cfop} <span className="ml-1 text-muted-foreground">({count})</span>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── search + filter bar ── */}
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                      <Input
                        ref={searchRef}
                        className="pl-9"
                        placeholder="Buscar por IE, CNPJ, Nome, Nº NF-e, Chave… (Ctrl+F)"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                      {search && (
                        <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => setSearch('')}>
                          <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                        </button>
                      )}
                    </div>
                    <Button
                      variant={showFilters || cfFilter !== 'all' || dateFrom || dateTo ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setShowFilters((v) => !v)}
                    >
                      <ListFilter className="h-3.5 w-3.5 mr-1.5" /> Filtros
                      {(cfFilter !== 'all' || dateFrom || dateTo || valorMinimoIe > 0) && (
                        <Badge className="ml-1.5 h-4 w-4 p-0 text-[10px] flex items-center justify-center">
                          {(cfFilter !== 'all' ? 1 : 0) + (dateFrom || dateTo ? 1 : 0) + (valorMinimoIe > 0 ? 1 : 0)}
                        </Badge>
                      )}
                    </Button>
                    <Button
                      variant={visibleCols.size !== DEFAULT_COLS.size ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setShowCols((v) => !v)}
                      title="Configurar colunas visíveis"
                    >
                      <Columns2 className="h-3.5 w-3.5" />
                    </Button>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {filteredGroups.length} de {allGroups.length}
                    </span>
                  </div>

                  {/* ── expanded filter panel ── */}
                  {showFilters && (
                    <div className="rounded-lg border border-border px-4 py-3 space-y-3">
                      {/* Atalhos de trimestre */}
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-xs text-muted-foreground font-medium w-24 shrink-0">Trimestre:</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent text-xs"
                            onClick={() => setTrimestreAno((y) => y - 1)}
                          >‹</button>
                          <span className="text-xs font-mono w-10 text-center">{trimestreAno}</span>
                          <button
                            type="button"
                            className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent text-xs"
                            onClick={() => setTrimestreAno((y) => y + 1)}
                          >›</button>
                        </div>
                        <div className="flex gap-1.5">
                          {TRIMESTRES.map((t, i) => (
                            <button
                              key={t.label}
                              type="button"
                              onClick={() => handleTrimestre(i)}
                              className={[
                                'text-xs px-2.5 py-1 rounded border transition-colors font-mono',
                                activeTrimestre === i
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'border-border text-muted-foreground hover:border-primary/50',
                              ].join(' ')}
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>
                        {activeTrimestre >= 0 && (
                          <button type="button" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1" onClick={() => { setDateFrom(''); setDateTo(''); }}>
                            <X className="h-3 w-3" /> limpar
                          </button>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-xs text-muted-foreground font-medium w-24 shrink-0">Período:</span>
                        <div className="flex items-center gap-2">
                          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-36 text-xs h-8" />
                          <span className="text-xs text-muted-foreground">até</span>
                          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-36 text-xs h-8" />
                          {(dateFrom || dateTo) && activeTrimestre < 0 && (
                            <button type="button" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1" onClick={() => { setDateFrom(''); setDateTo(''); }}>
                              <X className="h-3 w-3" /> limpar
                            </button>
                          )}
                        </div>
                        {(dateFrom || dateTo) && (
                          <span className="text-xs text-primary ml-1">
                            {notas.length - notasDateFiltered.length > 0
                              ? `${notas.length - notasDateFiltered.length} notas filtradas por data`
                              : 'Todas as notas no período'}
                          </span>
                        )}
                      </div>

                      {/* Valor mínimo */}
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-xs text-muted-foreground font-medium w-24 shrink-0">Valor mín. (R$):</span>
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          value={valorMinimoIe || ''}
                          placeholder="0 = sem filtro"
                          onChange={(e) => handleValorMinimoChange(e.target.value)}
                          className="w-36 text-xs h-8 font-mono"
                        />
                        {valorMinimoIe > 0 && (
                          <button
                            type="button"
                            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                            onClick={() => handleValorMinimoChange('0')}
                          >
                            <X className="h-3 w-3" /> limpar
                          </button>
                        )}
                        {valorMinimoIe !== regraValorMinimo && (
                          <button
                            type="button"
                            className="text-xs text-muted-foreground hover:text-foreground"
                            onClick={resetValorMinimo}
                            title="Volta ao valor definido em Configurações"
                          >
                            voltar ao padrão (R$ {regraValorMinimo.toLocaleString('pt-BR')})
                          </button>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-xs text-muted-foreground font-medium w-24 shrink-0">Cons. Final:</span>
                        <div className="flex items-center gap-2">
                          {(['all', 'ncf', 'cf'] as const).map((v) => (
                            <button
                              key={v}
                              type="button"
                              onClick={() => setCfFilter(v)}
                              className={[
                                'text-xs px-3 py-1 rounded-full border transition-colors',
                                cfFilter === v
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'border-border text-muted-foreground hover:border-primary/50',
                              ].join(' ')}
                            >
                              {v === 'all' ? 'Todos' : v === 'cf' ? 'Somente CF' : 'Somente Não-CF'}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── column visibility panel ── */}
                  {showCols && (
                    <div className="rounded-lg border border-border px-4 py-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Colunas visíveis</p>
                        <button
                          type="button"
                          className="text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setVisibleCols(new Set(DEFAULT_COLS));
                            localStorage.removeItem('tabelao_cols');
                          }}
                        >
                          Restaurar padrão
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {COL_DEFS.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => toggleCol(c.id)}
                            className={[
                              'text-xs px-2.5 py-1 rounded border transition-colors',
                              visibleCols.has(c.id)
                                ? 'bg-primary/20 text-primary border-primary/40'
                                : 'border-border text-muted-foreground hover:border-primary/50',
                            ].join(' ')}
                          >
                            {c.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── table (virtualized) ── */}
                  <div
                    ref={tableContainerRef}
                    className="rounded-lg border border-border overflow-auto"
                    style={{ height: 'calc(100vh - 420px)', minHeight: '280px' }}
                  >
                    {/* overflow-visible: quem rola é o div acima, não o
                        container interno do Table — sem isto o sticky do
                        cabeçalho gruda no container errado e some ao rolar. */}
                    <Table containerClassName="overflow-visible">
                      <TableHeader className="sticky top-0 z-10 bg-background [&_tr]:border-b [&_tr]:border-border">
                        <TableRow>
                          <TableHead className="cursor-pointer select-none" onClick={() => handleSort('ie')}>
                            IE <SortIcon k="ie" />
                          </TableHead>
                          <TableHead className="cursor-pointer select-none" onClick={() => handleSort('xNome')}>
                            Nome <SortIcon k="xNome" />
                          </TableHead>
                          {visibleCols.has('cnpj')       && <TableHead>CNPJ</TableHead>}
                          {visibleCols.has('municipio')  && <TableHead>Município</TableHead>}
                          {visibleCols.has('data')       && <TableHead className="cursor-pointer select-none" onClick={() => handleSort('dataEmissaoLatest')}>Data <SortIcon k="dataEmissaoLatest" /></TableHead>}
                          {visibleCols.has('valorTotal') && <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort('valorTotal')}>Valor Total <SortIcon k="valorTotal" /></TableHead>}
                          {visibleCols.has('qtd')        && <TableHead className="text-right">Qtd NF</TableHead>}
                          {visibleCols.has('cf')         && <TableHead>Cons. Final</TableHead>}
                          {visibleCols.has('indFinal')   && <TableHead className="text-right">indFinal</TableHead>}
                          {visibleCols.has('uf')         && <TableHead>UF</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredGroups.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={2 + visibleCols.size} className="text-center text-muted-foreground py-12 text-sm">
                              {notas.length === 0
                                ? 'Nenhuma nota encontrada nos períodos selecionados.'
                                : 'Nenhum resultado para os filtros aplicados.'}
                            </TableCell>
                          </TableRow>
                        ) : (() => {
                          const virtualItems = rowVirtualizer.getVirtualItems();
                          const totalSize = rowVirtualizer.getTotalSize();
                          const paddingTop = virtualItems[0]?.start ?? 0;
                          const paddingBottom = totalSize - (virtualItems[virtualItems.length - 1]?.end ?? 0);
                          return (
                            <>
                              {paddingTop > 0 && <tr style={{ height: paddingTop }}><td colSpan={2 + visibleCols.size} /></tr>}
                              {virtualItems.map((vRow) => {
                                const g = filteredGroups[vRow.index];
                                return (
                                  <TableRow
                                    key={vRow.key}
                                    data-index={vRow.index}
                                    className="cursor-pointer hover:bg-accent/50"
                                    onClick={() => openIeDetail(g)}
                                  >
                                    <TableCell
                                      className="font-mono text-xs font-medium group/cell"
                                      onClick={(e) => copyToClipboard(g.ie, 'IE', e)}
                                      title="Clique para copiar"
                                    >
                                      <span className="flex items-center gap-1">
                                        {g.ie || '—'}
                                        <Copy className="h-2.5 w-2.5 text-muted-foreground/0 group-hover/cell:text-muted-foreground/50 transition-colors shrink-0" />
                                      </span>
                                    </TableCell>
                                    <TableCell className="max-w-48 truncate text-sm" title={g.xNome}>{g.xNome}</TableCell>
                                    {visibleCols.has('cnpj') && (
                                      <TableCell
                                        className="font-mono text-xs group/cell"
                                        onClick={(e) => copyToClipboard(g.cnpjDest, 'CNPJ', e)}
                                        title="Clique para copiar"
                                      >
                                        <span className="flex items-center gap-1">
                                          {formatCnpj(g.cnpjDest)}
                                          <Copy className="h-2.5 w-2.5 text-muted-foreground/0 group-hover/cell:text-muted-foreground/50 transition-colors shrink-0" />
                                        </span>
                                      </TableCell>
                                    )}
                                    {visibleCols.has('municipio') && (
                                      <TableCell className="text-xs text-muted-foreground">
                                        {g.municipio}{g.ufEnd ? ` - ${g.ufEnd}` : ''}
                                      </TableCell>
                                    )}
                                    {visibleCols.has('data') && (
                                      <TableCell className="text-xs">{formatDate(g.dataEmissaoLatest)}</TableCell>
                                    )}
                                    {visibleCols.has('valorTotal') && (
                                      <TableCell className="text-right text-xs font-mono">R$ {brl(g.valorTotal)}</TableCell>
                                    )}
                                    {visibleCols.has('qtd') && (
                                      <TableCell className="text-right text-xs font-mono">{g.qtdNotas}</TableCell>
                                    )}
                                    {visibleCols.has('cf') && (
                                      <TableCell>
                                        {g.isConsumidorFinal ? (
                                          <Badge variant="outline" className="text-xs text-muted-foreground">Sim</Badge>
                                        ) : (
                                          <Badge variant="outline" className="text-xs text-green-500 border-green-500/30">Não</Badge>
                                        )}
                                      </TableCell>
                                    )}
                                    {visibleCols.has('indFinal') && (
                                      <TableCell className="text-right text-xs font-mono">{g.indFinalCount}</TableCell>
                                    )}
                                    {visibleCols.has('uf') && (
                                      <TableCell className="text-xs font-mono">{g.ufEnd || g.notas[0]?.ufDestino || '—'}</TableCell>
                                    )}
                                  </TableRow>
                                );
                              })}
                              {paddingBottom > 0 && <tr style={{ height: paddingBottom }}><td colSpan={2 + visibleCols.size} /></tr>}
                            </>
                          );
                        })()}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── escolha do conteúdo do PDF ── */}
      <Dialog open={pdfDialogOpen} onOpenChange={setPdfDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>O que incluir no PDF?</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {([
              ['kpis', 'Somente indicadores', 'Totais de notas, IEs e valor. Sem a lista de IEs.'],
              ['todas', 'Indicadores + todas as IEs', `As ${filteredGroups.length} IEs da tela, com a coluna Cons. Final marcando cada uma.`],
              ['elegiveis', 'Indicadores + IEs elegíveis', `Somente as ${filteredGroups.filter((g) => !g.isConsumidorFinal).length} IEs não Consumidor Final, que contam para a meta.`],
            ] as const).map(([mode, titulo, desc]) => (
              <button
                key={mode}
                type="button"
                className="w-full text-left rounded-lg border border-border px-4 py-3 hover:border-primary/50 hover:bg-accent/30 transition-colors"
                onClick={() => exportPdf(mode)}
              >
                <p className="text-sm font-medium">{titulo}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── IE detail sheet ── */}
      <IeDetailSheet
        group={selectedGroup}
        lotes={doneLotes}
        recorteLabel={selectedOrigem}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
    </AppLayout>
  );
}
