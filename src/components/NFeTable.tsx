import type { NFe } from '@/lib/types';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';

function brl(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface Props {
  notas: NFe[];
}

export default function NFeTable({ notas }: Props) {
  return (
    <ScrollArea className="h-72 rounded-md border">
      <Table>
        <TableHeader>
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
          {notas.map((n) => (
            <TableRow key={n.id}>
              <TableCell className="font-mono text-xs">
                {n.nNf}/{n.serie}
              </TableCell>
              <TableCell className="max-w-[180px] truncate" title={n.xNome}>
                {n.xNome}
              </TableCell>
              <TableCell className="font-mono text-xs">{n.ieDest || '—'}</TableCell>
              <TableCell>{n.cfop}</TableCell>
              <TableCell className="text-xs">{n.dataEmissao}</TableCell>
              <TableCell className="text-right font-mono text-xs">{brl(n.vNf)}</TableCell>
              <TableCell className="text-center">
                {n.indFinal ? (
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
  );
}
