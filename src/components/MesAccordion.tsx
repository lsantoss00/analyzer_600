import { buildMesGroups } from '@/lib/db';
import type { NFe } from '@/lib/types';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from './ui/accordion';
import { Badge } from './ui/badge';
import NFeTable from './NFeTable';

function brl(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface Props {
  notas: NFe[];
}

export default function MesAccordion({ notas }: Props) {
  const groups = buildMesGroups(notas);

  return (
    <Accordion multiple className="space-y-2">
      {groups.map((g) => (
        <AccordionItem
          key={g.mes}
          value={g.mes}
          className="border rounded-lg px-4"
        >
          <AccordionTrigger className="hover:no-underline">
            <div className="flex flex-1 items-center gap-4 text-left">
              <span className="font-semibold">{g.label}</span>
              <div className="flex flex-wrap gap-2 ml-auto mr-4">
                <Badge variant="secondary">{g.resumo.notasTotais} notas</Badge>
                <Badge variant="secondary">{g.resumo.iesTotal} IEs</Badge>
                <Badge variant="outline" className="text-green-600 border-green-200">
                  {g.resumo.iesConsumidorFinal} CF
                </Badge>
                <Badge variant="outline" className="font-mono">
                  R$ {brl(g.resumo.valorTotal)}
                </Badge>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-2">
            <NFeTable notas={g.notas} />
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
