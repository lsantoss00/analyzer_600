/// <reference lib="webworker" />
import { generateCompareExcelBytes, generateExcelBytes } from './excelExport';
import type { IeComparison } from './db';
import type { IeGroup, NFeCompleta } from './types';

/**
 * Monta a planilha fora da main thread.
 *
 * Com 80 mil notas a aba "Lista de Notas" sozinha tem 18 colunas × 80k = ~1,4
 * milhão de células, e a montagem era síncrona: a janela congelava por dezenas
 * de segundos, sem spinner e com o botão ainda clicável.
 */
export type PedidoExcel =
  | { tipo: 'tabelao'; notas: NFeCompleta[]; grupos: IeGroup[] }
  | { tipo: 'comparar'; diff: IeComparison };

export type RespostaExcel =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; erro: string };

self.onmessage = (e: MessageEvent<PedidoExcel>) => {
  try {
    const bytes =
      e.data.tipo === 'tabelao'
        ? generateExcelBytes(e.data.notas, e.data.grupos)
        : generateCompareExcelBytes(e.data.diff);
    const resposta: RespostaExcel = { ok: true, bytes };
    // Transferir evita copiar a planilha de volta para a main thread, mas só
    // se houver um ArrayBuffer de verdade: passar undefined aqui quebra o
    // postMessage com "Failed to convert value to 'object'".
    const transferiveis =
      bytes.buffer instanceof ArrayBuffer ? [bytes.buffer] : [];
    (self as unknown as Worker).postMessage(resposta, transferiveis);
  } catch (err) {
    const resposta: RespostaExcel = { ok: false, erro: String(err) };
    (self as unknown as Worker).postMessage(resposta);
  }
};
