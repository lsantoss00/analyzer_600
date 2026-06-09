import { save } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import {
  FileSpreadsheet,
  FileText,
  Filter,
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
import type { IeGroup, NFe, Resumo } from '@/lib/types';

function brl(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type SortKey = 'valorTotal' | 'qtdNotas' | 'ie' | 'xNome';
type SortDir = 'asc' | 'desc';

export default function Tabelao() {
  const { data } = useAppData();

  const allDoneLotes = data.empresas.flatMap((e) =>
    e.lotes.filter((l) => l.status === 'done'),
  );

  const [selectedLoteIds, setSelectedLoteIds] = useState<string[]>(
    data.loteAtivo ? [data.loteAtivo] : [],
  );
  const [notas, setNotas] = useState<NFe[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [cfFilter, setCfFilter] = useState<'all' | 'cf' | 'ncf'>('all');
  const [sort, setSort] = useState<SortKey>('valorTotal');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Keep in sync with sidebar
  useEffect(() => {
    if (data.loteAtivo && !selectedLoteIds.includes(data.loteAtivo)) {
      setSelectedLoteIds([data.loteAtivo]);
    }
  }, [data.loteAtivo]);

  // Load notas
  useEffect(() => {
    if (selectedLoteIds.length === 0) { setNotas([]); return; }
    setLoading(true);
    fetchNotasByLotes(selectedLoteIds)
      .then(setNotas)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedLoteIds.join(',')]);

  // Build IE groups + apply filters
  const groups: IeGroup[] = useMemo(() => {
    let g = buildIeGroups(notas);

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

    g = [...g].sort((a, b) => {
      const aVal = a[sort] as string | number;
      const bVal = b[sort] as string | number;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return sortDir === 'asc'
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });

    return g;
  }, [notas, search, cfFilter, sort, sortDir]);

  function toggleSort(key: SortKey) {
    if (sort === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSort(key); setSortDir('desc'); }
  }

  function toggleLote(id: string) {
    setSelectedLoteIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  const resumoFiltrado: Resumo = useMemo(() => ({
    notasTotais: groups.reduce((s, g) => s + g.qtdNotas, 0),
    iesTotal: groups.length,
    iesConsumidorFinal: groups.filter((g) => g.isConsumidorFinal).length,
    iesNaoConsumidor: groups.filter((g) => !g.isConsumidorFinal).length,
    valorTotal: groups.reduce((s, g) => s + g.valorTotal, 0),
  }), [groups]);

  // Notas que correspondem exatamente aos grupos filtrados e visíveis na tabela
  const notasFiltradas = useMemo(
    () => groups.flatMap((g) => g.notas),
    [groups],
  );

  async function exportExcel() {
    const savePath = await save({
      filters: [{ name: 'Excel', extensions: ['xlsx'] }],
      defaultPath: 'relatorio-nfe.xlsx',
    });
    if (!savePath) return;
    try {
      const bytes = generateExcelBytes(notasFiltradas);
      await invoke<void>('save_bytes', { path: savePath, bytes: Array.from(bytes) });
      toast.success(`Excel exportado: ${groups.length} IEs, ${notasFiltradas.length} notas`);
    } catch {
      toast.error('Erro ao exportar Excel');
    }
  }

  async function exportPdf() {
    const savePath = await save({
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
      defaultPath: 'relatorio-nfe.pdf',
    });
    if (!savePath) return;
    try {
      const loteNome = selectedLoteIds.length === 1
        ? allDoneLotes.find((l) => l.id === selectedLoteIds[0])?.nome ?? 'Lote'
        : `${selectedLoteIds.length} lotes`;
      const bytes = generatePdfBytes(notasFiltradas, resumoFiltrado, loteNome);
      await invoke<void>('save_bytes', { path: savePath, bytes: Array.from(bytes) });
      toast.success('PDF exportado com sucesso');
    } catch {
      toast.error('Erro ao exportar PDF');
    }
  }

  const sortIndicator = (key: SortKey) =>
    sort === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  return (
    <AppLayout>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Tabelão</h1>
            <p className="text-sm text-muted-foreground mt-1">
              IEs consolidadas e desduplicadas por chave
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportExcel} disabled={notas.length === 0}>
              <FileSpreadsheet className="h-4 w-4 mr-2" /> Excel
            </Button>
            <Button variant="outline" onClick={exportPdf} disabled={notas.length === 0}>
              <FileText className="h-4 w-4 mr-2" /> PDF
            </Button>
          </div>
        </div>

        {/* Lote multi-select */}
        <div className="flex flex-wrap gap-2">
          {allDoneLotes.map((l) => (
            <Badge
              key={l.id}
              variant={selectedLoteIds.includes(l.id) ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => toggleLote(l.id)}
            >
              {l.nome}
            </Badge>
          ))}
          {allDoneLotes.length === 0 && (
            <span className="text-xs text-muted-foreground">Nenhum lote disponível</span>
          )}
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
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="cf">Somente CF</SelectItem>
                  <SelectItem value="ncf">Somente Não-CF</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Summary badges */}
            <div className="ml-auto flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary">{resumoFiltrado.iesTotal} IEs</Badge>
              <Badge variant="secondary">{resumoFiltrado.notasTotais} notas</Badge>
              <Badge variant="outline" className="text-green-600 border-green-200">
                {resumoFiltrado.iesConsumidorFinal} CF
              </Badge>
              <Badge variant="outline" className="font-mono">
                R$ {brl(resumoFiltrado.valorTotal)}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        {loading ? (
          <div className="flex items-center gap-2 justify-center py-20 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Carregando...</span>
          </div>
        ) : (
          <ScrollArea className="h-[calc(100vh-360px)] rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead
                    className="cursor-pointer select-none"
                    onClick={() => toggleSort('ie')}
                  >
                    IE{sortIndicator('ie')}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none"
                    onClick={() => toggleSort('xNome')}
                  >
                    Nome{sortIndicator('xNome')}
                  </TableHead>
                  <TableHead>Município</TableHead>
                  <TableHead>Chave NFe 1</TableHead>
                  <TableHead className="text-right">Valor Nota 1</TableHead>
                  <TableHead
                    className="text-right cursor-pointer select-none"
                    onClick={() => toggleSort('valorTotal')}
                  >
                    Valor Total{sortIndicator('valorTotal')}
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer select-none"
                    onClick={() => toggleSort('qtdNotas')}
                  >
                    Notas{sortIndicator('qtdNotas')}
                  </TableHead>
                  <TableHead className="text-center">CF</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
                      {notas.length === 0
                        ? 'Selecione um ou mais lotes acima.'
                        : 'Nenhum resultado para os filtros aplicados.'}
                    </TableCell>
                  </TableRow>
                )}
                {groups.map((g) => (
                  <TableRow key={g.ie}>
                    <TableCell className="font-mono text-xs">{g.ie || '—'}</TableCell>
                    <TableCell className="max-w-[180px] truncate" title={g.xNome}>
                      {g.xNome}
                    </TableCell>
                    <TableCell className="text-xs">{g.municipio}</TableCell>
                    <TableCell className="font-mono text-xs truncate max-w-[120px]" title={g.chaveNfe1}>
                      {g.chaveNfe1.slice(0, 12)}…
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">{brl(g.valorNfe1)}</TableCell>
                    <TableCell className="text-right font-mono text-xs font-semibold">
                      {brl(g.valorTotal)}
                    </TableCell>
                    <TableCell className="text-right">{g.qtdNotas}</TableCell>
                    <TableCell className="text-center">
                      {g.isConsumidorFinal ? (
                        <Badge variant="outline" className="text-green-600 border-green-200 text-xs px-1">
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
    </AppLayout>
  );
}
