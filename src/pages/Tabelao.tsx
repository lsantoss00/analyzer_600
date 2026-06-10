import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import {
  BarChart3,
  ChevronDown,
  ChevronUp,
  Download,
  FileSpreadsheet,
  FileText,
  ListFilter,
  Loader2,
  MapPin,
  Search,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import AppLayout from '@/components/AppLayout';
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
import { buildIeGroups, fetchNotasByLotes } from '@/lib/db';
import { generateExcelBytes } from '@/lib/excelExport';
import { generatePdfBytes } from '@/lib/pdfExport';
import type { IeGroup, NFe, Resumo } from '@/lib/types';

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

// ── component ──────────────────────────────────────────────────────────────────

export default function Tabelao() {
  const { data } = useAppData();

  // Active empresa — prefer empresaAtiva, fall back to first with done lotes
  const empresa = useMemo(
    () =>
      data.empresas.find((e) => e.id === data.empresaAtiva) ??
      data.empresas.find((e) => e.lotes.some((l) => l.status === 'done')) ??
      null,
    [data.empresas, data.empresaAtiva],
  );

  const doneLotes = useMemo(
    () => empresa?.lotes.filter((l) => l.status === 'done') ?? [],
    [empresa],
  );

  // Lote filter within this empresa
  const [selectedLoteIds, setSelectedLoteIds] = useState<string[]>([]);

  useEffect(() => {
    const ids = doneLotes.map((l) => l.id);
    // If loteAtivo belongs to this empresa, pre-select it; otherwise select all
    if (data.loteAtivo && ids.includes(data.loteAtivo)) {
      setSelectedLoteIds([data.loteAtivo]);
    } else {
      setSelectedLoteIds(ids);
    }
  }, [empresa?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const [notas, setNotas] = useState<NFe[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedLoteIds.length === 0) { setNotas([]); return; }
    setLoading(true);
    fetchNotasByLotes(selectedLoteIds)
      .then(setNotas)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedLoteIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── filters & sort ──────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [cfFilter, setCfFilter] = useState<'all' | 'cf' | 'ncf'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('valorTotal');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const allGroups = useMemo(() => buildIeGroups(notas), [notas]);

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
    for (const n of notas) map.set(n.cfop, (map.get(n.cfop) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [notas]);

  const resumo: Resumo = useMemo(() => ({
    notasTotais: notas.length,
    iesTotal: allGroups.length,
    iesConsumidorFinal: allGroups.filter((g) => g.isConsumidorFinal).length,
    iesNaoConsumidor: allGroups.filter((g) => !g.isConsumidorFinal).length,
    valorTotal: notas.reduce((s, n) => s + n.vNf, 0),
  }), [notas, allGroups]);

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
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-border shrink-0">
          <div>
            <h1 className="text-xl font-bold">Tabelão de IEs Distintas</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {empresa.nome}
              {loteBreadcrumb && <> <span className="opacity-40">•</span> {loteBreadcrumb}</>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportExcel} disabled={notasFiltradas.length === 0}>
              <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" /> Excel
            </Button>
            <Button variant="outline" size="sm" onClick={exportPdf} disabled={notasFiltradas.length === 0}>
              <FileText className="h-3.5 w-3.5 mr-1.5" /> PDF
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* ── lote filter chips ── */}
          {doneLotes.length > 1 && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={[
                  'text-xs px-3 py-1 rounded-full border transition-colors',
                  selectedLoteIds.length === doneLotes.length
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-muted-foreground hover:border-primary/50',
                ].join(' ')}
                onClick={() => setSelectedLoteIds(doneLotes.map((l) => l.id))}
              >
                Todos
              </button>
              {doneLotes.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  className={[
                    'text-xs px-3 py-1 rounded-full border transition-colors',
                    selectedLoteIds.includes(l.id)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border text-muted-foreground hover:border-primary/50',
                  ].join(' ')}
                  onClick={() => toggleLote(l.id)}
                >
                  {l.nome}
                </button>
              ))}
            </div>
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
                  variant={showFilters || cfFilter !== 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setShowFilters((v) => !v)}
                >
                  <ListFilter className="h-3.5 w-3.5 mr-1.5" /> Filtros
                  {cfFilter !== 'all' && (
                    <Badge className="ml-1.5 h-4 w-4 p-0 text-[10px] flex items-center justify-center">1</Badge>
                  )}
                </Button>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {filteredGroups.length} de {allGroups.length}
                </span>
              </div>

              {/* ── expanded filter panel ── */}
              {showFilters && (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-4 py-3">
                  <span className="text-xs text-muted-foreground font-medium">Consumidor Final:</span>
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
                  {cfFilter !== 'all' && (
                    <button type="button" className="text-xs text-muted-foreground hover:text-foreground ml-auto" onClick={() => setCfFilter('all')}>
                      Limpar
                    </button>
                  )}
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
                        <TableRow key={g.ie}>
                          <TableCell className="font-mono text-xs font-medium">{g.ie || '—'}</TableCell>
                          <TableCell className="font-mono text-xs">{formatCnpj(g.cnpjDest)}</TableCell>
                          <TableCell className="max-w-48 truncate text-sm" title={g.xNome}>
                            {g.xNome}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {g.municipio}{g.ufEnd ? ` - ${g.ufEnd}` : ''}
                          </TableCell>
                          <TableCell className="text-xs">{formatDate(g.dataEmissaoLatest)}</TableCell>
                          <TableCell>
                            {g.isConsumidorFinal ? (
                              <Badge variant="outline" className="text-xs text-green-500 border-green-500/30">
                                Sim
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs text-muted-foreground">
                                Não
                              </Badge>
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
        </div>
      </div>
    </AppLayout>
  );
}
