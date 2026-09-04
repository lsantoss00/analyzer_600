import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';
import type { NFe } from '@/lib/types';
import { Badge } from './ui/badge';
import { brl, formatDate } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';

interface Props {
  notas: NFe[];
}

const COLUNAS = 7;

/**
 * Lista virtualizada das notas de um mês.
 *
 * Antes montava um <tr> por nota dentro de um ScrollArea de 288px que mostra ~8
 * linhas. Como o acordeão permite abrir todos os meses ao mesmo tempo e recebe
 * o lote inteiro, um lote de 80 mil notas geraria ~640 mil nós no DOM.
 */
export default function NFeTable({ notas }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: notas.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 37,
    overscan: 10,
  });

  const itens = virtualizer.getVirtualItems();
  const paddingTop = itens[0]?.start ?? 0;
  const paddingBottom = virtualizer.getTotalSize() - (itens[itens.length - 1]?.end ?? 0);

  return (
    <div ref={containerRef} className="h-72 rounded-md border border-border overflow-auto">
      {/* overflow-visible: quem rola é o div acima. Sem isto o container interno
          do Table vira um segundo scrollport e o cabeçalho sticky não gruda. */}
      <Table containerClassName="overflow-visible">
        <TableHeader className="sticky top-0 z-10 bg-background">
          <TableRow>
            <TableHead className="w-[120px]">NF / Série</TableHead>
            <TableHead>Destinatário</TableHead>
            <TableHead>IE</TableHead>
            <TableHead>CFOP</TableHead>
            <TableHead>Data</TableHead>
            <TableHead className="text-right">Valor (R$)</TableHead>
            <TableHead className="text-center">CF</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {notas.length === 0 ? (
            <TableRow>
              <TableCell colSpan={COLUNAS} className="text-center text-muted-foreground py-8 text-sm">
                Nenhuma nota neste período.
              </TableCell>
            </TableRow>
          ) : (
            <>
              {paddingTop > 0 && (
                <tr style={{ height: paddingTop }}>
                  <td colSpan={COLUNAS} />
                </tr>
              )}
              {itens.map((v) => {
                const n = notas[v.index];
                return (
                  <TableRow key={n.id}>
                    <TableCell className="font-mono text-xs">
                      {n.nNf}/{n.serie}
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate" title={n.xNome}>
                      {n.xNome}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{n.ieDest || '—'}</TableCell>
                    <TableCell>{n.cfop}</TableCell>
                    {/* Antes saía o ISO cru, diferente de todas as outras telas. */}
                    <TableCell className="text-xs">{formatDate(n.dataEmissao)}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{brl(n.vNf)}</TableCell>
                    <TableCell className="text-center">
                      {n.indFinal ? (
                        <Badge variant="outline" className="text-muted-foreground text-xs px-1">
                          Sim
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Não</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {paddingBottom > 0 && (
                <tr style={{ height: paddingBottom }}>
                  <td colSpan={COLUNAS} />
                </tr>
              )}
            </>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
