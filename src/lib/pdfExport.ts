import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { buildMesGroups } from './db';
import type { IeGroup, NFe, Resumo } from './types';
import { brl, formatCnpj } from '@/lib/utils';

/**
 * O que entra no PDF. 'kpis' é o relatório histórico (só indicadores);
 * as outras duas incluem a tabela de IEs, que é o que sustenta a apuração.
 */
export type PdfMode = 'kpis' | 'todas' | 'elegiveis';

export function generatePdfBytes(
  notas: NFe[],
  resumo: Resumo,
  loteNome: string,
  empresaNome: string,
  mode: PdfMode = 'kpis',
  // Já ordenados como na tela — o PDF não re-deriva os grupos, justamente para
  // não discordar do que o usuário está vendo.
  groups: IeGroup[] = [],
): Uint8Array {
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

  if (mode !== 'kpis') {
    const listados = mode === 'elegiveis' ? groups.filter((g) => !g.isConsumidorFinal) : groups;

    const ieRows = listados.map((g) => [
      g.ie || '—',
      g.xNome,
      formatCnpj(g.cnpjDest),
      g.municipio + (g.ufEnd ? ' - ' + g.ufEnd : ''),
      g.qtdNotas.toLocaleString('pt-BR'),
      'R$ ' + brl(g.valorTotal),
      g.isConsumidorFinal ? 'Sim' : 'Não',
    ]);

    const y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? 80;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(
      mode === 'elegiveis'
        ? `IEs elegíveis (não Consumidor Final) — ${listados.length}`
        : `IEs distintas — ${listados.length}`,
      14,
      y + 12,
    );

    autoTable(doc, {
      startY: y + 16,
      head: [['IE', 'Nome', 'CNPJ', 'Município', 'Qtd NF', 'Valor Total', 'CF']],
      body: ieRows,
      theme: 'striped',
      headStyles: { fillColor: [30, 64, 175] },
      styles: { fontSize: 8, cellPadding: 1.5 },
      columnStyles: {
        0: { cellWidth: 26 },
        2: { cellWidth: 34 },
        4: { halign: 'right', cellWidth: 16 },
        5: { halign: 'right', cellWidth: 28 },
        6: { halign: 'center', cellWidth: 12 },
      },
      margin: { left: 14, right: 14 },
    });
  }

  return new Uint8Array(doc.output('arraybuffer') as ArrayBuffer);
}
