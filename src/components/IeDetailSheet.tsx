import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { IeGroup, Lote, NFe } from '@/lib/types';

function brl(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatCnpj(v: string) {
  const d = (v ?? '').replace(/\D/g, '');
  if (d.length !== 14) return v;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

interface LoteRow {
  lote: Lote;
  qtdNotas: number;
  valorTotal: number;
  dataMax: string;
  isCf: boolean;
}

interface IeDetailSheetProps {
  group: IeGroup | null;
  allNotas: NFe[];
  lotes: Lote[];
  open: boolean;
  onClose: () => void;
}

export function IeDetailSheet({ group, allNotas, lotes, open, onClose }: IeDetailSheetProps) {
  if (!group) return null;

  const loteMap = new Map(lotes.map((l) => [l.id, l]));

  // Group all notas for this IE across all lotes
  const byLote = new Map<string, NFe[]>();
  for (const n of allNotas) {
    const key = n.ieDest || n.cnpjDest;
    if (key !== group.ie) continue;
    if (!byLote.has(n.loteId)) byLote.set(n.loteId, []);
    byLote.get(n.loteId)!.push(n);
  }

  const rows: LoteRow[] = [];
  for (const [loteId, ns] of byLote.entries()) {
    const lote = loteMap.get(loteId);
    if (!lote) continue;
    rows.push({
      lote,
      qtdNotas: ns.length,
      valorTotal: ns.reduce((s, n) => s + n.vNf, 0),
      dataMax: ns.reduce((max, n) => (n.dataEmissao > max ? n.dataEmissao : max), ''),
      isCf: ns.every((n) => n.indFinal),
    });
  }
  rows.sort((a, b) => a.lote.ordem - b.lote.ordem);

  function formatDate(iso: string) {
    if (!iso || iso.length < 10) return iso ?? '';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-[520px] sm:max-w-[520px] overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-base">Histórico da IE</SheetTitle>
          <div className="space-y-0.5 text-sm text-left">
            <p className="font-medium">{group.xNome}</p>
            <p className="text-muted-foreground font-mono text-xs">IE: {group.ie || '—'}</p>
            <p className="text-muted-foreground font-mono text-xs">CNPJ: {formatCnpj(group.cnpjDest)}</p>
          </div>
        </SheetHeader>

        <div className="space-y-4">
          <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wide">
            Aparições por lote
          </p>
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Lote</TableHead>
                  <TableHead className="text-xs text-right">Notas</TableHead>
                  <TableHead className="text-xs text-right">Valor Total</TableHead>
                  <TableHead className="text-xs">Data</TableHead>
                  <TableHead className="text-xs">CF?</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-6 text-sm">
                      Nenhum dado disponível
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.lote.id}>
                      <TableCell className="text-xs font-medium">{r.lote.nome}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums">{r.qtdNotas}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums">R$ {brl(r.valorTotal)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(r.dataMax)}</TableCell>
                      <TableCell>
                        {r.isCf ? (
                          <Badge variant="outline" className="text-xs text-green-500 border-green-500/30">Sim</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-muted-foreground">Não</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {rows.length > 1 && (
            <div className="rounded-lg bg-muted/30 px-4 py-3 text-sm space-y-1">
              <p className="font-medium">Total acumulado</p>
              <p className="text-muted-foreground">
                {rows.reduce((s, r) => s + r.qtdNotas, 0)} notas ·{' '}
                R$ {brl(rows.reduce((s, r) => s + r.valorTotal, 0))}
              </p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
