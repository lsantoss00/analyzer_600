import type { AppData, Empresa, Lote } from './types';

export function addEmpresa(data: AppData, empresa: Omit<Empresa, 'lotes'>): AppData {
  return {
    ...data,
    empresas: [...data.empresas, { ...empresa, lotes: [] }],
  };
}

export function removeEmpresa(data: AppData, id: string): AppData {
  const empresaAtiva = data.empresaAtiva === id ? null : data.empresaAtiva;
  const loteAtivo =
    data.empresas.find((e) => e.id === id)?.lotes.some((l) => l.id === data.loteAtivo)
      ? null
      : data.loteAtivo;
  return {
    ...data,
    empresas: data.empresas.filter((e) => e.id !== id),
    empresaAtiva,
    loteAtivo,
  };
}

export function updateEmpresa(
  data: AppData,
  id: string,
  patch: Partial<Pick<Empresa, 'nome' | 'cnpj'>>,
): AppData {
  return {
    ...data,
    empresas: data.empresas.map((e) => (e.id === id ? { ...e, ...patch } : e)),
  };
}

export function addLote(data: AppData, empresaId: string, lote: Lote): AppData {
  return {
    ...data,
    empresas: data.empresas.map((e) =>
      e.id === empresaId ? { ...e, lotes: [...e.lotes, lote] } : e,
    ),
  };
}

export function removeLote(data: AppData, loteId: string): AppData {
  const loteAtivo = data.loteAtivo === loteId ? null : data.loteAtivo;
  return {
    ...data,
    loteAtivo,
    empresas: data.empresas.map((e) => ({
      ...e,
      lotes: e.lotes.filter((l) => l.id !== loteId),
    })),
  };
}

export function updateLote(data: AppData, loteId: string, patch: Partial<Lote>): AppData {
  return {
    ...data,
    empresas: data.empresas.map((e) => ({
      ...e,
      lotes: e.lotes.map((l) => (l.id === loteId ? { ...l, ...patch } : l)),
    })),
  };
}

export function reorderEmpresas(data: AppData, ids: string[]): AppData {
  const map = new Map(data.empresas.map((e) => [e.id, e]));
  return {
    ...data,
    empresas: ids.map((id, i) => ({ ...map.get(id)!, ordem: i })),
  };
}

export function reorderLotes(data: AppData, empresaId: string, ids: string[]): AppData {
  return {
    ...data,
    empresas: data.empresas.map((e) => {
      if (e.id !== empresaId) return e;
      const map = new Map(e.lotes.map((l) => [l.id, l]));
      return { ...e, lotes: ids.map((id, i) => ({ ...map.get(id)!, ordem: i })) };
    }),
  };
}
