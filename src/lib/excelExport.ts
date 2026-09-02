import * as XLSX from 'xlsx';
import { buildIeGroups } from './db';
import type { IeComparison } from './db';
import type { IeGroup, NFe } from './types';

function sheetNotas(notas: NFe[]): XLSX.WorkSheet {
  const rows = notas.map((n) => ({
    'Chave NF-e': n.chave,
    'Data Emissão': n.dataEmissao,
    CFOP: n.cfop,
    'IE Destinatário': n.ieDest,
    'CNPJ Destinatário': n.cnpjDest,
    'Nome Destinatário': n.xNome,
    Município: n.municipio,
    UF: n.ufDestino,
    'Cons. Final': n.indFinal ? 'Sim' : 'Não',
    'Nº NF': n.nNf,
    Série: n.serie,
    'Valor NF (R$)': n.vNf,
    'Valor Prod (R$)': n.vProd,
    'Valor ICMS (R$)': n.vIcms,
    'Valor ST (R$)': n.vSt,
    'CNPJ Emitente': n.cnpjEmit,
    'Nome Emitente': n.xNomeEmit,
    'Nat. Operação': n.naturezaOperacao,
  }));
  return XLSX.utils.json_to_sheet(rows);
}

function sheetIes(groups: IeGroup[]): XLSX.WorkSheet {
  const rows = groups.map((g) => ({
    'IE': g.ie,
    'CNPJ': g.cnpjDest,
    'Nome': g.xNome,
    'Município': g.municipio,
    'Chave NF-e 1 (maior valor)': g.chaveNfe1,
    'Valor da Nota (R$)': g.valorNfe1,
    'Chaves NF-e (todas)': g.notas.map((n) => n.chave).join(';'),
    'Valor Total (R$)': g.valorTotal,
    'Cons. Final': g.isConsumidorFinal ? 'Sim' : 'Não',
    'Qtd Notas': g.qtdNotas,
  }));
  return XLSX.utils.json_to_sheet(rows);
}

function sheetIesNcf(groups: IeGroup[]): XLSX.WorkSheet {
  const rows = groups
    .filter((g) => !g.isConsumidorFinal)
    .map((g) => ({
      'IE': g.ie,
      'CNPJ': g.cnpjDest,
      'Nome': g.xNome,
      'Município': g.municipio,
      'UF': g.ufEnd,
      'Chave NF-e (maior valor)': g.chaveNfe1,
      'Valor da Nota (R$)': g.valorNfe1,
      'Valor Total (R$)': g.valorTotal,
      'Qtd Notas': g.qtdNotas,
    }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 18 }, { wch: 18 }, { wch: 30 }, { wch: 20 }, { wch: 5 },
    { wch: 46 }, { wch: 16 }, { wch: 16 }, { wch: 10 },
  ];
  return ws;
}

/** Uma aba do diff, com as mesmas colunas da aba de IEs elegíveis. */
function sheetDiff(groups: IeGroup[]): XLSX.WorkSheet {
  const rows = groups.map((g) => ({
    'IE': g.ie,
    'CNPJ': g.cnpjDest,
    'Nome': g.xNome,
    'Município': g.municipio,
    'UF': g.ufEnd,
    'Valor Total (R$)': g.valorTotal,
    'Qtd Notas': g.qtdNotas,
    'Última Emissão': g.dataEmissaoLatest,
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 18 }, { wch: 18 }, { wch: 30 }, { wch: 20 }, { wch: 5 },
    { wch: 16 }, { wch: 10 }, { wch: 14 },
  ];
  return ws;
}

/**
 * Planilha do modo Comparar: uma aba por bucket do diff. Antes as listas de
 * ganhas/perdidas — o resultado da comparação trimestral — só existiam na tela,
 * sem nenhuma forma de exportar.
 */
export function generateCompareExcelBytes(diff: IeComparison): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetDiff(diff.gained), 'IEs ganhas');
  XLSX.utils.book_append_sheet(wb, sheetDiff(diff.lost), 'IEs perdidas');
  XLSX.utils.book_append_sheet(wb, sheetDiff(diff.changedToCF), 'Viraram CF');
  XLSX.utils.book_append_sheet(wb, sheetDiff(diff.common), 'Em comum');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}

export function generateExcelBytes(notas: NFe[]): Uint8Array {
  const groups = buildIeGroups(notas);
  const wb = XLSX.utils.book_new();

  const wsNotas = sheetNotas(notas);
  const wsIes = sheetIes(groups);
  const wsNcf = sheetIesNcf(groups);

  wsNotas['!cols'] = [
    { wch: 46 }, { wch: 12 }, { wch: 6 }, { wch: 18 }, { wch: 18 },
    { wch: 30 }, { wch: 20 }, { wch: 4 }, { wch: 10 }, { wch: 10 },
    { wch: 6 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
    { wch: 18 }, { wch: 30 }, { wch: 30 },
  ];
  wsIes['!cols'] = [
    { wch: 18 }, { wch: 18 }, { wch: 30 }, { wch: 20 },
    { wch: 46 }, { wch: 16 }, { wch: 60 }, { wch: 16 }, { wch: 12 }, { wch: 10 },
  ];

  XLSX.utils.book_append_sheet(wb, wsNcf, 'IEs Elegíveis (NCF)');
  XLSX.utils.book_append_sheet(wb, wsNotas, 'Lista de Notas');
  XLSX.utils.book_append_sheet(wb, wsIes, 'IEs Distintas');

  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}
