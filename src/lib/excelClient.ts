import type { IeComparison } from './db';
import type { IeGroup, NFeCompleta } from './types';
import type { DadosDescarte } from './excelExport';
import type { PedidoExcel, RespostaExcel } from './excelWorker';

/**
 * Dispara a montagem da planilha num Worker e resolve com os bytes.
 *
 * O worker é descartado ao fim de cada exportação: são raras e a memória de uma
 * planilha de 80 mil linhas não deve ficar retida.
 */
function executar(pedido: PedidoExcel, transferir: Transferable[]): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./excelWorker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (e: MessageEvent<RespostaExcel>) => {
      worker.terminate();
      if (e.data.ok) resolve(e.data.bytes);
      else reject(new Error(e.data.erro));
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || 'Falha no worker do Excel'));
    };
    worker.postMessage(pedido, transferir);
  });
}

export function gerarExcelTabelao(
  notas: NFeCompleta[],
  grupos: IeGroup[],
  descarte?: DadosDescarte,
): Promise<Uint8Array> {
  return executar({ tipo: 'tabelao', notas, grupos, descarte }, []);
}

export function gerarExcelComparacao(diff: IeComparison): Promise<Uint8Array> {
  return executar({ tipo: 'comparar', diff }, []);
}
