import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
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
import { useAppData } from '@/contexts/AppDataContext';
import { fetchNotasByIe } from '@/lib/db';
import { applyNotaRules } from '@/lib/rules';
import type { IeGroup, Lote, NFe } from '@/lib/types';

function brl(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

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

interface LoteRow {
  lote: Lote;
  qtdNotas: number;
  valorTotal: number;
  dataMax: string;
  isCf: boolean;
}

/** Agrupa notas por lote. `lotes` serve só de lookup para o nome e a ordem. */
function buildLoteRows(notas: NFe[], lotes: Lote[]): LoteRow[] {
  const loteMap = new Map(lotes.map((l) => [l.id, l]));
  const byLote = new Map<string, NFe[]>();
  for (const n of notas) {
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
  return rows.sort((a, b) => a.lote.ordem - b.lote.ordem);
}

function LoteRowsTable({
  rows,
  loading,
  emptyText,
}: {
  rows: LoteRow[];
  loading?: boolean;
  emptyText: string;
}) {
  return (
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
          {loading ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-6 text-sm">
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando...
                </span>
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-6 text-sm">
                {emptyText}
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
  );
}

function Totals({ rows }: { rows: LoteRow[] }) {
  if (rows.length <= 1) return null;
  return (
    <div className="rounded-lg bg-muted/30 px-4 py-2.5 text-xs">
      <span className="font-medium">Total acumulado: </span>
      <span className="text-muted-foreground">
        {rows.reduce((s, r) => s + r.qtdNotas, 0)} notas ·{' '}
        R$ {brl(rows.reduce((s, r) => s + r.valorTotal, 0))}
      </span>
    </div>
  );
}

/**
 * Conteúdo do painel. Separado da casca porque precisa de hooks e o
 * `IeDetailSheet` faz um early-return quando não há grupo selecionado.
 */
function IeDetailContent({
  group,
  lotes,
  recorteLabel,
}: {
  group: IeGroup;
  lotes: Lote[];
  recorteLabel: string;
}) {
  const { data } = useAppData();

  // Seção 1 — vem do próprio grupo clicado, que já passou pelas regras e pelo
  // filtro de data. Antes o painel lia as notas cruas dos lotes selecionados,
  // então os números podiam contradizer a linha que o usuário acabara de clicar.
  const recorteRows = buildLoteRows(group.notas, lotes);

  // Seção 2 — todos os lotes processados da empresa, não só os selecionados.
  const [histNotas, setHistNotas] = useState<NFe[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const [histError, setHistError] = useState<string | null>(null);

  const loteIdsKey = lotes.map((l) => l.id).join(',');

  useEffect(() => {
    let ignorar = false;
    setHistLoading(true);
    setHistError(null);
    fetchNotasByIe(group.ie, lotes.map((l) => l.id))
      .then((ns) => {
        // Abrir IEs em sequência é o uso normal — descarta resposta fora de ordem.
        if (ignorar) return;
        setHistNotas(ns);
      })
      .catch((err) => {
        if (ignorar) return;
        console.error(err);
        setHistError(String(err));
        setHistNotas([]);
      })
      .finally(() => {
        if (!ignorar) setHistLoading(false);
      });
    return () => { ignorar = true; };
  }, [group.ie, loteIdsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mesmas regras da seção 1, para as duas serem comparáveis. A diferença que
  // sobra entre elas é só o recorte de lotes e o filtro de data.
  const histRows = buildLoteRows(applyNotaRules(histNotas, data.rules), lotes);

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <div>
          <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wide">
            Neste recorte
          </p>
          <p className="text-xs text-muted-foreground/70">{recorteLabel}</p>
        </div>
        <LoteRowsTable rows={recorteRows} emptyText="Nenhuma nota neste recorte." />
        <Totals rows={recorteRows} />
      </section>

      <section className="space-y-2">
        <div>
          <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wide">
            Histórico na empresa
          </p>
          <p className="text-xs text-muted-foreground/70">
            Todos os lotes processados, sem o filtro de data
          </p>
        </div>
        {histError ? (
          <div className="rounded-lg border border-border px-4 py-6 text-center text-sm text-muted-foreground">
            Não foi possível carregar o histórico.
            <p className="mt-1 text-xs font-mono text-muted-foreground/70">{histError}</p>
          </div>
        ) : (
          <>
            <LoteRowsTable
              rows={histRows}
              loading={histLoading}
              emptyText="Esta IE não aparece em nenhum outro lote."
            />
            <Totals rows={histRows} />
          </>
        )}
      </section>
    </div>
  );
}

interface IeDetailSheetProps {
  group: IeGroup | null;
  lotes: Lote[];
  /** Descreve de onde veio a linha clicada (período selecionado, ou A/B no modo Comparar). */
  recorteLabel: string;
  open: boolean;
  onClose: () => void;
}

export function IeDetailSheet({ group, lotes, recorteLabel, open, onClose }: IeDetailSheetProps) {
  if (!group) return null;

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

        <IeDetailContent group={group} lotes={lotes} recorteLabel={recorteLabel} />
      </SheetContent>
    </Sheet>
  );
}
