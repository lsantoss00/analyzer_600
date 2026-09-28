/**
 * Limites de tamanho dos campos de texto.
 *
 * Ficam num lugar só porque criar e editar a mesma entidade são telas
 * diferentes (AppSidebar cria a empresa, EmpresaItem edita) e os valores
 * divergiriam com o tempo.
 *
 * Nomes muito longos não são só feios: o nome da empresa entra no título do
 * diálogo de import e o do lote vira chip no Tabelão e aba no Excel.
 */
export const MAX_NOME_EMPRESA = 60;
/** `00.000.000/0000-00` com máscara. */
export const MAX_CNPJ = 18;
export const MAX_NOME_LOTE = 60;

/** Corta preservando o que o usuário digitou até o limite. */
export function limitar(valor: string, max: number): string {
  return valor.length <= max ? valor : valor.slice(0, max);
}
