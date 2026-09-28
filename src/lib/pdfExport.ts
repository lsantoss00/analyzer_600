import jsPDF from 'jspdf';
import autoTable, { type CellHookData } from 'jspdf-autotable';
import { buildMesGroups } from './db';
import type { IeGroup, NFe, Resumo } from './types';
import { brl, formatCnpj } from '@/lib/utils';

/**
 * O que entra no PDF. 'kpis' é o relatório histórico (só indicadores);
 * as outras duas incluem a tabela de IEs, que é o que sustenta a apuração.
 */
export type PdfMode = 'kpis' | 'todas' | 'elegiveis';

type Alinhamento = 'left' | 'right' | 'center';

/**
 * Repete no cabeçalho o alinhamento de cada coluna.
 *
 * O jspdf-autotable aplica columnStyles SÓ ao corpo da tabela
 * (`sectionName === 'body' ? columnStyles : {}`), então uma coluna numérica
 * ficava com o valor à direita e o título à esquerda — e, sem largura definida,
 * a coluna esticava pela página inteira, deixando os dois a centímetros um do
 * outro. Isto é o que alinha os dois.
 */
function alinharCabecalho(alinhamentos: Record<number, Alinhamento>) {
  return (data: CellHookData) => {
    if (data.section !== 'head') return;
    const a = alinhamentos[data.column.index];
    if (a) data.cell.styles.halign = a;
  };
}

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
    // tableWidth wrap + larguras fixas: sem isso a tabela ocupa os 269mm da
    // página e o valor fica longe do indicador.
    tableWidth: 'wrap',
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 62 },
      1: { halign: 'right', cellWidth: 40 },
    },
    didParseCell: alinharCabecalho({ 1: 'right' }),
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
    tableWidth: 'wrap',
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 30 },
      1: { halign: 'right', cellWidth: 24 },
      2: { halign: 'right', cellWidth: 22 },
      3: { halign: 'right', cellWidth: 28 },
      4: { halign: 'right', cellWidth: 40 },
    },
    didParseCell: alinharCabecalho({ 1: 'right', 2: 'right', 3: 'right', 4: 'right' }),
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
      didParseCell: alinharCabecalho({ 4: 'right', 5: 'right', 6: 'center' }),
      margin: { left: 14, right: 14 },
    });
  }

  return new Uint8Array(doc.output('arraybuffer') as ArrayBuffer);
}
