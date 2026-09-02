import { useEffect, useState } from 'react';
import type { Empresa } from './types';

/**
 * Mantém a empresa selecionada de uma página em sincronia com o AppDataContext.
 *
 * O provider renderiza os filhos enquanto o load do SQLite ainda está em voo, então
 * a lista chega vazia no primeiro render. Sem o efeito abaixo, um `useState(inicial)`
 * congelaria '' para sempre e a página ficaria em branco até ser remontada.
 */
export function useSelectedEmpresa(
  empresas: Empresa[],
  empresaAtiva: string | null,
): [string, (id: string) => void] {
  const pick = () =>
    empresaAtiva && empresas.some((e) => e.id === empresaAtiva)
      ? empresaAtiva
      : (empresas[0]?.id ?? '');

  const [selectedId, setSelectedId] = useState(pick);

  useEffect(() => {
    // Só corrige quando não há seleção válida — nunca sobrescreve a escolha do usuário.
    if (selectedId && empresas.some((e) => e.id === selectedId)) return;
    const next = pick();
    if (next) setSelectedId(next);
  }, [empresas, empresaAtiva, selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  return [selectedId, setSelectedId];
}
