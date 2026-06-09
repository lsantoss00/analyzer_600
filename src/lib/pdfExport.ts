import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { buildMesGroups } from './db';
import type { NFe, Resumo } from './types';

function brl(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function generatePdfBytes(notas: NFe[], resumo: Resumo, loteNome: string, empresaNome: string): Uint8Array {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  // Header
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Relatório de NF-e', 14, 18);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Empresa: ${empresaNome}`, 14, 26);
  doc.text(`Lote: ${loteNome}`, 14, 31);

  // KPI summary
  const kpis = [
    ['Total de Notas', resumo.notasTotais.toLocaleString('pt-BR')],
    ['Total de IEs', resumo.iesTotal.toLocaleString('pt-BR')],
    ['IEs Consumidor Final', resumo.iesConsumidorFinal.toLocaleString('pt-BR')],
    ['IEs Não Consumidor', resumo.iesNaoConsumidor.toLocaleString('pt-BR')],
    ['Valor Total', `R$ ${brl(resumo.valorTotal)}`],
  ];

  autoTable(doc, {
    startY: 36,
    head: [['Indicador', 'Valor']],
    body: kpis,
    theme: 'striped',
    headStyles: { fillColor: [30, 64, 175] },
    styles: { fontSize: 10 },
    columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  });

  // Monthly breakdown
  const mesGroups = buildMesGroups(notas);
  const mesRows = mesGroups.map((g) => [
    g.label,
    g.resumo.notasTotais.toLocaleString('pt-BR'),
    g.resumo.iesTotal.toLocaleString('pt-BR'),
    g.resumo.iesConsumidorFinal.toLocaleString('pt-BR'),
    `R$ ${brl(g.resumo.valorTotal)}`,
  ]);

  const prevY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? 80;

  autoTable(doc, {
    startY: prevY + 10,
    head: [['Mês', 'Notas', 'IEs', 'Cons. Final', 'Valor Total']],
    body: mesRows,
    theme: 'striped',
    headStyles: { fillColor: [30, 64, 175] },
    styles: { fontSize: 9 },
    columnStyles: {
      0: { fontStyle: 'bold' },
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
    },
    margin: { left: 14, right: 14 },
  });

  return new Uint8Array(doc.output('arraybuffer') as ArrayBuffer);
}
