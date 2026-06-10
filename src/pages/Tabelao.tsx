import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import {
  Building2,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  Filter,
  FolderOpen,
  Loader2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import AppLayout from '@/components/AppLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import type { Empresa, IeGroup, Lote, NFe, Resumo } from '@/lib/types';

function brl(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type SortKey = 'valorTotal' | 'qtdNotas' | 'ie' | 'xNome';
type SortDir = 'asc' | 'desc';

interface LoteSection {
  lote: Lote;
  groups: IeGroup[];
  allNotas: NFe[];
}

interface EmpresaSection {
  empresa: Empresa;
  loteSections: LoteSection[];
}

export default function Tabelao() {
  const { data } = useAppData();

  const allDoneIds = useMemo(
    () => data.empresas.flatMap((e) => e.lotes.filter((l) => l.status === 'done').map((l) => l.id)),
    [data.empresas],
  );

  const [notas, setNotas] = useState<NFe[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedLotes, setExpandedLotes] = useState<Set<string>>(new Set());

  const [search, setSearch] = useState('');
  const [cfFilter, setCfFilter] = useState<'all' | 'cf' | 'ncf'>('all');
  const [sort, setSort] = useState<SortKey>('valorTotal');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  useEffect(() => {
    if (allDoneIds.length === 0) { setNotas([]); return; }
    setLoading(true);
    fetchNotasByLotes(allDoneIds)
      .then((ns) => {
        setNotas(ns);
        setExpandedLotes(new Set(allDoneIds));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [allDoneIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const sections: EmpresaSection[] = useMemo(() => {
    function applySort(groups: IeGroup[]): IeGroup[] {
      return [...groups].sort((a, b) => {
        const av = a[sort] as string | number;
        const bv = b[sort] as string | number;
        if (typeof av === 'number' && typeof bv === 'number') {
          return sortDir === 'asc' ? av - bv : bv - av;
        }
        return sortDir === 'asc'
          ? String(av).localeCompare(String(bv))
          : String(bv).localeCompare(String(av));
      });
    }

    function applyFilter(groups: IeGroup[]): IeGroup[] {
      let g = groups;
      if (search.trim()) {
        const q = search.toLowerCase();
        g = g.filter(
          (ie) =>
            ie.ie.toLowerCase().includes(q) ||
            ie.xNome.toLowerCase().includes(q) ||
            ie.cnpjDest.includes(q),
        );
      }
      if (cfFilter === 'cf') g = g.filter((ie) => ie.isConsumidorFinal);
      if (cfFilter === 'ncf') g = g.filter((ie) => !ie.isConsumidorFinal);
      return g;
    }

    return data.empresas
      .map((empresa) => {
        const doneLotes = empresa.lotes.filter((l) => l.status === 'done');
        const loteSections: LoteSection[] = doneLotes
          .map((lote) => {
            const loteNotas = notas.filter((n) => n.loteId === lote.id);
            const groups = applySort(applyFilter(buildIeGroups(loteNotas)));
            return { lote, groups, allNotas: loteNotas };
          })
          .filter((s) => s.allNotas.length > 0);
        return { empresa, loteSections };
      })
      .filter((s) => s.loteSections.length > 0);
  }, [notas, search, cfFilter, sort, sortDir, data.empresas]); // eslint-disable-line react-hooks/exhaustive-deps

  const allFilteredGroups = useMemo(
    () => sections.flatMap((s) => s.loteSections.flatMap((ls) => ls.groups)),
    [sections],
  );

  const notasFiltradas = useMemo(
    () => allFilteredGroups.flatMap((g) => g.notas),
    [allFilteredGroups],
  );

  const resumoGlobal: Resumo = useMemo(() => ({
    notasTotais: allFilteredGroups.reduce((s, g) => s + g.qtdNotas, 0),
    iesTotal: allFilteredGroups.length,
    iesConsumidorFinal: allFilteredGroups.filter((g) => g.isConsumidorFinal).length,
    iesNaoConsumidor: allFilteredGroups.filter((g) => !g.isConsumidorFinal).length,
    valorTotal: allFilteredGroups.reduce((s, g) => s + g.valorTotal, 0),
  }), [allFilteredGroups]);

  function toggleLote(id: string) {
    setExpandedLotes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSort(key: SortKey) {
    if (sort === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSort(key); setSortDir('desc'); }
  }

  const si = (key: SortKey) => sort === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  async function exportExcel() {
    const savePath = await save({ filters: [{ name: 'Excel', extensions: ['xlsx'] }], defaultPath: 'relatorio-nfe.xlsx' });
    if (!savePath) return;
    try {
      const bytes = generateExcelBytes(notasFiltradas);
      await writeFile(savePath, bytes);
      toast.success(`Excel exportado: ${allFilteredGroups.length} IEs, ${notasFiltradas.length} notas`);
    } catch {
      toast.error('Erro ao exportar Excel');
    }
  }

  async function exportPdf() {
    const savePath = await save({ filters: [{ name: 'PDF', extensions: ['pdf'] }], defaultPath: 'relatorio-nfe.pdf' });
    if (!savePath) return;
    try {
      const empresaNome = sections.length === 1 ? sections[0].empresa.nome : 'Múltiplas empresas';
      const loteNome = allDoneIds.length === 1
        ? sections[0]?.loteSections[0]?.lote.nome ?? 'Lote'
        : `${allDoneIds.length} lotes`;
      const bytes = generatePdfBytes(notasFiltradas, resumoGlobal, loteNome, empresaNome);
      await writeFile(savePath, bytes);
      toast.success('PDF exportado com sucesso');
    } catch {
      toast.error('Erro ao exportar PDF');
    }
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Tabelão</h1>
            <p className="text-sm text-muted-foreground mt-1">
              IEs consolidadas por empresa e lote
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportExcel} disabled={notasFiltradas.length === 0}>
              <FileSpreadsheet className="h-4 w-4 mr-2" /> Excel
            </Button>
            <Button variant="outline" onClick={exportPdf} disabled={notasFiltradas.length === 0}>
              <FileText className="h-4 w-4 mr-2" /> PDF
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="flex flex-wrap items-end gap-4 py-4">
            <div className="grid gap-1.5 flex-1 min-w-40">
              <Label className="text-xs flex items-center gap-1">
                <Filter className="h-3 w-3" /> Buscar IE / Nome / CNPJ
              </Label>
              <Input
                placeholder="Filtrar..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Consumidor Final</Label>
              <Select value={cfFilter} onValueChange={(v) => setCfFilter(v as typeof cfFilter)}>
                <SelectTrigger className="w-44">
                  <SelectValue>
                    {cfFilter === 'all' ? 'Todos' : cfFilter === 'cf' ? 'Somente CF' : 'Somente Não-CF'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="cf">Somente CF</SelectItem>
                  <SelectItem value="ncf">Somente Não-CF</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="ml-auto flex flex-wrap gap-2">
              <Badge variant="secondary">{resumoGlobal.iesTotal} IEs</Badge>
              <Badge variant="secondary">{resumoGlobal.notasTotais} notas</Badge>
              <Badge variant="outline" className="text-green-600 border-green-600/30">
                {resumoGlobal.iesConsumidorFinal} CF
              </Badge>
              <Badge variant="outline" className="font-mono">
                R$ {brl(resumoGlobal.valorTotal)}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Content */}
        {loading ? (
          <div className="flex items-center gap-2 justify-center py-20 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Carregando...</span>
          </div>
        ) : sections.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-2 text-muted-foreground text-sm">
            <p>Nenhum lote processado.</p>
            <p className="text-xs">Clique em <strong>+</strong> ao lado do nome da empresa para importar XMLs.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {sections.map(({ empresa, loteSections }) => (
              <div key={empresa.id}>
                {/* Empresa header */}
                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
                  <Building2 className="h-4 w-4 text-primary shrink-0" />
                  <h2 className="text-base font-semibold">{empresa.nome}</h2>
                  {empresa.cnpj && (
                    <span className="text-xs text-muted-foreground font-mono">{empresa.cnpj}</span>
                  )}
                </div>

                {/* Lote sections */}
                <div className="space-y-3 pl-2">
                  {loteSections.map(({ lote, groups, allNotas }) => {
                    const isExpanded = expandedLotes.has(lote.id);
                    const valor = allNotas.reduce((s, n) => s + n.vNf, 0);
                    const cfCount = groups.filter((g) => g.isConsumidorFinal).length;

                    return (
                      <div key={lote.id} className="rounded-lg border border-border overflow-hidden">
                        {/* Lote toggle header */}
                        <button
                          type="button"
                          className="w-full flex items-center gap-3 px-4 py-3 bg-card hover:bg-muted/40 transition-colors text-left"
                          onClick={() => toggleLote(lote.id)}
                        >
                          {isExpanded
                            ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                            : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                          <FolderOpen className="h-4 w-4 shrink-0 text-primary/70" />
                          <span className="font-medium text-sm">{lote.nome}</span>
                          <div className="ml-auto flex items-center gap-2 flex-wrap">
                            <Badge variant="secondary" className="text-xs">
                              {allNotas.length} notas
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              {groups.length} IEs
                            </Badge>
                            <Badge variant="outline" className="text-xs text-green-600 border-green-600/30">
                              {cfCount} CF
                            </Badge>
                            <Badge variant="outline" className="text-xs font-mono">
                              R$ {brl(valor)}
                            </Badge>
                          </div>
                        </button>

                        {/* IE table */}
                        {isExpanded && (
                          <ScrollArea className="max-h-80">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('ie')}>
                                    IE{si('ie')}
                                  </TableHead>
                                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('xNome')}>
                                    Nome{si('xNome')}
                                  </TableHead>
                                  <TableHead>Município</TableHead>
                                  <TableHead>Chave NFe 1</TableHead>
                                  <TableHead className="text-right">Valor Nota 1</TableHead>
                                  <TableHead
                                    className="text-right cursor-pointer select-none"
                                    onClick={() => toggleSort('valorTotal')}
                                  >
                                    Valor Total{si('valorTotal')}
                                  </TableHead>
                                  <TableHead
                                    className="text-right cursor-pointer select-none"
                                    onClick={() => toggleSort('qtdNotas')}
                                  >
                                    Notas{si('qtdNotas')}
                                  </TableHead>
                                  <TableHead className="text-center">CF</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {groups.length === 0 ? (
                                  <TableRow>
                                    <TableCell colSpan={8} className="text-center text-muted-foreground py-6 text-sm">
                                      Nenhum resultado
                                    </TableCell>
                                  </TableRow>
                                ) : groups.map((g) => (
                                  <TableRow key={g.ie}>
                                    <TableCell className="font-mono text-xs">{g.ie || '—'}</TableCell>
                                    <TableCell className="max-w-45 truncate" title={g.xNome}>
                                      {g.xNome}
                                    </TableCell>
                                    <TableCell className="text-xs">{g.municipio}</TableCell>
                                    <TableCell
                                      className="font-mono text-xs truncate max-w-30"
                                      title={g.chaveNfe1}
                                    >
                                      {g.chaveNfe1.slice(0, 12)}…
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-xs">
                                      {brl(g.valorNfe1)}
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-xs font-semibold">
                                      {brl(g.valorTotal)}
                                    </TableCell>
                                    <TableCell className="text-right">{g.qtdNotas}</TableCell>
                                    <TableCell className="text-center">
                                      {g.isConsumidorFinal ? (
                                        <Badge variant="outline" className="text-green-600 border-green-600/30 text-xs px-1">
                                          Sim
                                        </Badge>
                                      ) : (
                                        <span className="text-xs text-muted-foreground">Não</span>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </ScrollArea>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
