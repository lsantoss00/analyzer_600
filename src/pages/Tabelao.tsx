import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import {
  ArrowLeftRight,
  BarChart3,
  ChevronDown,
  ChevronUp,
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
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import AppLayout from '@/components/AppLayout';
import { IeDetailSheet } from '@/components/IeDetailSheet';
import { MetaProgress } from '@/components/MetaProgress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { buildIeGroups, compareIeGroups, fetchNotasByLotes } from '@/lib/db';
import { generateExcelBytes } from '@/lib/excelExport';
import { generatePdfBytes } from '@/lib/pdfExport';
import type { IeGroup, Lote, NFe, Resumo } from '@/lib/types';

// ── helpers ────────────────────────────────────────────────────────────────────

function formatCnpj(v: string) {
  const d = (v ?? '').replace(/\D/g, '');
  if (d.length !== 14) return v;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function formatDate(iso: string) {
  if (!iso || iso.length < 10) return iso ?? '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

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
  if (lotes.length <= 1) return null;
  return (
    <div className="flex flex-wrap gap-2">
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

// ── IeTable ────────────────────────────────────────────────────────────────────

function IeTable({
  groups,
  notas,
  loading,
  onRowClick,
}: {
  groups: IeGroup[];
  notas: NFe[];
  loading: boolean;
  onRowClick: (g: IeGroup) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 justify-center py-20 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Carregando...</span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>IE</TableHead>
            <TableHead>CNPJ</TableHead>
            <TableHead>Nome</TableHead>
            <TableHead>Município</TableHead>
            <TableHead>Data Emissão</TableHead>
            <TableHead>Cons. Final</TableHead>
            <TableHead className="text-right">indFinal</TableHead>
            <TableHead>UF</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground py-12 text-sm">
                {notas.length === 0 ? 'Nenhum lote selecionado.' : 'Nenhum resultado.'}
              </TableCell>
            </TableRow>
          ) : (
            groups.map((g) => (
              <TableRow
                key={g.ie}
                className="cursor-pointer hover:bg-accent/50"
                onClick={() => onRowClick(g)}
              >
                <TableCell className="font-mono text-xs font-medium">{g.ie || '—'}</TableCell>
                <TableCell className="font-mono text-xs">{formatCnpj(g.cnpjDest)}</TableCell>
                <TableCell className="max-w-48 truncate text-sm" title={g.xNome}>{g.xNome}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {g.municipio}{g.ufEnd ? ` - ${g.ufEnd}` : ''}
                </TableCell>
                <TableCell className="text-xs">{formatDate(g.dataEmissaoLatest)}</TableCell>
                <TableCell>
                  {g.isConsumidorFinal ? (
                    <Badge variant="outline" className="text-xs text-green-500 border-green-500/30">Sim</Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs text-muted-foreground">Não</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right text-xs font-mono">{g.indFinalCount}</TableCell>
                <TableCell className="text-xs font-mono">{g.ufEnd || g.notas[0]?.ufDestino || '—'}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

// ── CompareView ────────────────────────────────────────────────────────────────

function CompareView({
  lotes,
  valorMinimoIe,
  onRowClick,
}: {
  lotes: Lote[];
  valorMinimoIe: number;
  onRowClick: (g: IeGroup) => void;
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
    fetchNotasByLotes(loteIdsA).then(setNotasA).catch(console.error).finally(() => setLoadingA(false));
  }, [loteIdsA.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (loteIdsB.length === 0) { setNotasB([]); return; }
    setLoadingB(true);
    fetchNotasByLotes(loteIdsB).then(setNotasB).catch(console.error).finally(() => setLoadingB(false));
  }, [loteIdsB.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const groupsA = useMemo(() => buildIeGroups(notasA, valorMinimoIe), [notasA, valorMinimoIe]);
  const groupsB = useMemo(() => buildIeGroups(notasB, valorMinimoIe), [notasB, valorMinimoIe]);
  const diff = useMemo(() => compareIeGroups(groupsA, groupsB), [groupsA, groupsB]);

  function toggleA(id: string) {
    setLoteIdsA((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }
  function toggleB(id: string) {
    setLoteIdsB((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  const hasSelection = loteIdsA.length > 0 && loteIdsB.length > 0;
  const loading = loadingA || loadingB;

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
              <p className="text-xl font-bold text-red-400">{diff.lost.length}</p>
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
            <DiffSection title="IEs ganhas no período B" color="green" groups={diff.gained} onRowClick={onRowClick} />
          )}

          {/* Lost */}
          {diff.lost.length > 0 && (
            <DiffSection title="IEs perdidas (saíram)" color="red" groups={diff.lost} onRowClick={onRowClick} />
          )}

          {/* Changed to CF */}
          {diff.changedToCF.length > 0 && (
            <DiffSection title="Viraram Consumidor Final" color="amber" groups={diff.changedToCF} onRowClick={onRowClick} />
          )}

          {/* Common */}
          {diff.common.length > 0 && (
            <DiffSection title={`Em comum (${diff.common.length})`} color="default" groups={diff.common} onRowClick={onRowClick} collapsed />
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
  onRowClick,
  collapsed = false,
}: {
  title: string;
  color: 'green' | 'red' | 'amber' | 'default';
  groups: IeGroup[];
  onRowClick: (g: IeGroup) => void;
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
    red: 'text-red-400',
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
              <TableRow key={g.ie} className="cursor-pointer hover:bg-accent/50" onClick={() => onRowClick(g)}>
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

  const initialEmpresaId =
    data.empresaAtiva && empresasComLotes.some((e) => e.id === data.empresaAtiva)
      ? data.empresaAtiva
      : (empresasComLotes[0]?.id ?? '');

  const [selectedEmpresaId, setSelectedEmpresaId] = useState(initialEmpresaId);

  const empresa = empresasComLotes.find((e) => e.id === selectedEmpresaId) ?? null;

  const doneLotes = useMemo(
    () => empresa?.lotes.filter((l) => l.status === 'done') ?? [],
    [empresa],
  );

  const [selectedLoteIds, setSelectedLoteIds] = useState<string[]>([]);
  const [compareMode, setCompareMode] = useState(false);

  useEffect(() => {
    const ids = doneLotes.map((l) => l.id);
    if (data.loteAtivo && ids.includes(data.loteAtivo)) {
      setSelectedLoteIds([data.loteAtivo]);
    } else {
      setSelectedLoteIds(ids);
    }
  }, [empresa?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleEmpresaChange(id: string | null) {
    if (!id) return;
    setSelectedEmpresaId(id);
    const lotes = empresasComLotes.find((e) => e.id === id)?.lotes.filter((l) => l.status === 'done') ?? [];
    setSelectedLoteIds(lotes.map((l) => l.id));
    setCompareMode(false);
  }

  const [notas, setNotas] = useState<NFe[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (compareMode) return;
    if (selectedLoteIds.length === 0) { setNotas([]); return; }
    setLoading(true);
    fetchNotasByLotes(selectedLoteIds)
      .then(setNotas)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedLoteIds.join(','), compareMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── meta & valor mínimo ──────────────────────────────────────────────────────
  const metaIes = parseInt(localStorage.getItem('meta_ies') ?? '600', 10);
  const valorMinimoIe = parseFloat(localStorage.getItem('valor_minimo_ie') ?? '0');

  // ── filters & sort ──────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [cfFilter, setCfFilter] = useState<'all' | 'cf' | 'ncf'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
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

  const allGroups = useMemo(
    () => buildIeGroups(notasDateFiltered, valorMinimoIe),
    [notasDateFiltered, valorMinimoIe],
  );

  const filteredGroups: IeGroup[] = useMemo(() => {
    let g = allGroups;
    if (search.trim()) {
      const q = search.toLowerCase();
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
  }, [allGroups, search, cfFilter, sortKey, sortDir]);

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
    for (const n of notasDateFiltered) map.set(n.cfop, (map.get(n.cfop) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [notasDateFiltered]);

  const resumo: Resumo = useMemo(() => ({
    notasTotais: notasDateFiltered.length,
    iesTotal: allGroups.length,
    iesConsumidorFinal: allGroups.filter((g) => g.isConsumidorFinal).length,
    iesNaoConsumidor: allGroups.filter((g) => !g.isConsumidorFinal).length,
    valorTotal: notasDateFiltered.reduce((s, n) => s + n.vNf, 0),
  }), [notasDateFiltered, allGroups]);

  // ── breadcrumb ──────────────────────────────────────────────────────────────
  const loteBreadcrumb =
    selectedLoteIds.length === 1
      ? (doneLotes.find((l) => l.id === selectedLoteIds[0])?.nome ?? '')
      : selectedLoteIds.length === 0
        ? 'Nenhum lote'
        : `${selectedLoteIds.length} lotes`;

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

  async function exportExcel() {
    const savePath = await save({ filters: [{ name: 'Excel', extensions: ['xlsx'] }], defaultPath: 'relatorio-nfe.xlsx' });
    if (!savePath) return;
    try {
      await writeFile(savePath, generateExcelBytes(notasFiltradas));
      toast.success(`Excel: ${filteredGroups.length} IEs, ${notasFiltradas.length} notas`);
    } catch { toast.error('Erro ao exportar Excel'); }
  }

  async function exportPdf() {
    const savePath = await save({ filters: [{ name: 'PDF', extensions: ['pdf'] }], defaultPath: 'relatorio-nfe.pdf' });
    if (!savePath) return;
    try {
      await writeFile(savePath, generatePdfBytes(notasFiltradas, resumoFiltrado, loteBreadcrumb, empresa?.nome ?? ''));
      toast.success('PDF exportado');
    } catch { toast.error('Erro ao exportar PDF'); }
  }

  // ── IE detail sheet ─────────────────────────────────────────────────────────
  const [selectedGroup, setSelectedGroup] = useState<IeGroup | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  function openIeDetail(g: IeGroup) {
    setSelectedGroup(g);
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
                <Button variant="outline" size="sm" onClick={exportExcel} disabled={notasFiltradas.length === 0}>
                  <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" /> Excel
                </Button>
                <Button variant="outline" size="sm" onClick={exportPdf} disabled={notasFiltradas.length === 0}>
                  <FileText className="h-3.5 w-3.5 mr-1.5" /> PDF
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* ── compare mode ── */}
          {compareMode ? (
            <CompareView lotes={doneLotes} valorMinimoIe={valorMinimoIe} onRowClick={openIeDetail} />
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

              {loading ? (
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
                          <Users className="h-5 w-5 text-blue-400/60 shrink-0" />
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
                          <Users className="h-5 w-5 text-green-400/60 shrink-0" />
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
                          <MapPin className="h-5 w-5 text-amber-400/60 shrink-0" />
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
                        className="pl-9"
                        placeholder="Buscar por IE, CNPJ, Nome, Nº NF-e, Chave..."
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
                      {(cfFilter !== 'all' || dateFrom || dateTo) && (
                        <Badge className="ml-1.5 h-4 w-4 p-0 text-[10px] flex items-center justify-center">
                          {(cfFilter !== 'all' ? 1 : 0) + (dateFrom || dateTo ? 1 : 0)}
                        </Badge>
                      )}
                    </Button>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {filteredGroups.length} de {allGroups.length}
                    </span>
                  </div>

                  {/* ── expanded filter panel ── */}
                  {showFilters && (
                    <div className="rounded-lg border border-border px-4 py-3 space-y-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-xs text-muted-foreground font-medium w-24 shrink-0">Período:</span>
                        <div className="flex items-center gap-2">
                          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-36 text-xs h-8" />
                          <span className="text-xs text-muted-foreground">até</span>
                          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-36 text-xs h-8" />
                          {(dateFrom || dateTo) && (
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

                  {/* ── table ── */}
                  <div className="rounded-lg border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="cursor-pointer select-none" onClick={() => handleSort('ie')}>
                            IE <SortIcon k="ie" />
                          </TableHead>
                          <TableHead>CNPJ</TableHead>
                          <TableHead className="cursor-pointer select-none" onClick={() => handleSort('xNome')}>
                            Nome <SortIcon k="xNome" />
                          </TableHead>
                          <TableHead>Município</TableHead>
                          <TableHead className="cursor-pointer select-none" onClick={() => handleSort('dataEmissaoLatest')}>
                            Data Emissão <SortIcon k="dataEmissaoLatest" />
                          </TableHead>
                          <TableHead>Cons. Final</TableHead>
                          <TableHead className="text-right">indFinal</TableHead>
                          <TableHead>UF</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredGroups.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center text-muted-foreground py-12 text-sm">
                              {notas.length === 0
                                ? 'Nenhum lote selecionado.'
                                : 'Nenhum resultado para os filtros aplicados.'}
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredGroups.map((g) => (
                            <TableRow
                              key={g.ie}
                              className="cursor-pointer hover:bg-accent/50"
                              onClick={() => openIeDetail(g)}
                            >
                              <TableCell className="font-mono text-xs font-medium">{g.ie || '—'}</TableCell>
                              <TableCell className="font-mono text-xs">{formatCnpj(g.cnpjDest)}</TableCell>
                              <TableCell className="max-w-48 truncate text-sm" title={g.xNome}>{g.xNome}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {g.municipio}{g.ufEnd ? ` - ${g.ufEnd}` : ''}
                              </TableCell>
                              <TableCell className="text-xs">{formatDate(g.dataEmissaoLatest)}</TableCell>
                              <TableCell>
                                {g.isConsumidorFinal ? (
                                  <Badge variant="outline" className="text-xs text-green-500 border-green-500/30">Sim</Badge>
                                ) : (
                                  <Badge variant="outline" className="text-xs text-muted-foreground">Não</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right text-xs font-mono">{g.indFinalCount}</TableCell>
                              <TableCell className="text-xs font-mono">{g.ufEnd || g.notas[0]?.ufDestino || '—'}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── IE detail sheet ── */}
      <IeDetailSheet
        group={selectedGroup}
        allNotas={notas}
        lotes={doneLotes}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
    </AppLayout>
  );
}
