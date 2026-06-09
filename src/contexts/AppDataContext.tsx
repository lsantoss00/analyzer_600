import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
} from 'react';
import {
  deleteEmpresa,
  deleteLote,
  fetchEmpresas,
  fetchPreferences,
  insertEmpresa,
  insertLote,
  savePreferences,
  updateEmpresa,
  updateEmpresaOrdem,
  updateLoteNome,
  updateLoteOrdem,
} from '@/lib/db';
import {
  addEmpresa,
  addLote,
  removeEmpresa,
  removeLote,
  reorderEmpresas,
  reorderLotes,
  updateEmpresa as updateEmpresaLocal,
  updateLote,
} from '@/lib/storage';
import type { AppData, Lote } from '@/lib/types';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface State extends AppData {
  isLoading: boolean;
}

type Action =
  | { type: 'LOAD'; payload: AppData }
  | { type: 'SET'; payload: Partial<AppData> }
  | { type: 'LOADING'; payload: boolean };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'LOAD':
      return { ...state, ...action.payload, isLoading: false };
    case 'SET':
      return { ...state, ...action.payload };
    case 'LOADING':
      return { ...state, isLoading: action.payload };
    default:
      return state;
  }
}

const initialState: State = {
  empresas: [],
  empresaAtiva: null,
  loteAtivo: null,
  isLoading: true,
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface AppDataContextType {
  data: State;
  refresh: () => Promise<void>;
  addEmpresa: (nome: string, cnpj: string) => Promise<void>;
  editEmpresa: (id: string, nome: string, cnpj: string) => Promise<void>;
  removeEmpresa: (id: string) => Promise<void>;
  reorderEmpresas: (ids: string[]) => Promise<void>;
  addLote: (empresaId: string, nome: string) => Promise<string>;
  editLoteNome: (id: string, nome: string) => Promise<void>;
  removeLote: (id: string) => Promise<void>;
  reorderLotes: (empresaId: string, ids: string[]) => Promise<void>;
  refreshLote: (lote: Lote) => void;
  setEmpresaAtiva: (id: string | null) => void;
  setLoteAtivo: (id: string | null) => void;
}

const AppDataContext = createContext<AppDataContextType | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const load = useCallback(async () => {
    dispatch({ type: 'LOADING', payload: true });
    try {
      const [empresas, prefs] = await Promise.all([fetchEmpresas(), fetchPreferences()]);
      dispatch({
        type: 'LOAD',
        payload: {
          empresas,
          empresaAtiva: prefs.empresaAtiva,
          loteAtivo: prefs.loteAtivo,
        },
      });
    } catch (err) {
      console.error('Failed to load app data', err);
      dispatch({ type: 'LOADING', payload: false });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ---------------------------------------------------------------------------
  // Empresa actions
  // ---------------------------------------------------------------------------

  const addEmpresaFn = useCallback(async (nome: string, cnpj: string) => {
    const id = crypto.randomUUID();
    const ordem = state.empresas.length;
    await insertEmpresa(id, nome, cnpj, ordem);
    dispatch({
      type: 'SET',
      payload: {
        empresas: addEmpresa(
          { empresas: state.empresas, empresaAtiva: state.empresaAtiva, loteAtivo: state.loteAtivo },
          { id, nome, cnpj, criadaEm: new Date().toISOString(), ordem },
        ).empresas,
      },
    });
  }, [state]);

  const editEmpresaFn = useCallback(async (id: string, nome: string, cnpj: string) => {
    await updateEmpresa(id, nome, cnpj);
    dispatch({
      type: 'SET',
      payload: {
        empresas: updateEmpresaLocal(
          { empresas: state.empresas, empresaAtiva: state.empresaAtiva, loteAtivo: state.loteAtivo },
          id,
          { nome, cnpj },
        ).empresas,
      },
    });
  }, [state]);

  const removeEmpresaFn = useCallback(async (id: string) => {
    await deleteEmpresa(id);
    const next = removeEmpresa(
      { empresas: state.empresas, empresaAtiva: state.empresaAtiva, loteAtivo: state.loteAtivo },
      id,
    );
    dispatch({ type: 'SET', payload: next });
    if (next.empresaAtiva !== state.empresaAtiva || next.loteAtivo !== state.loteAtivo) {
      await savePreferences(next.empresaAtiva, next.loteAtivo);
    }
  }, [state]);

  const reorderEmpresasFn = useCallback(async (ids: string[]) => {
    const next = reorderEmpresas(
      { empresas: state.empresas, empresaAtiva: state.empresaAtiva, loteAtivo: state.loteAtivo },
      ids,
    );
    dispatch({ type: 'SET', payload: { empresas: next.empresas } });
    await Promise.all(next.empresas.map((e) => updateEmpresaOrdem(e.id, e.ordem)));
  }, [state]);

  // ---------------------------------------------------------------------------
  // Lote actions
  // ---------------------------------------------------------------------------

  const addLoteFn = useCallback(async (empresaId: string, nome: string): Promise<string> => {
    const id = crypto.randomUUID();
    const empresa = state.empresas.find((e) => e.id === empresaId);
    const ordem = empresa?.lotes.length ?? 0;
    await insertLote(id, empresaId, nome, ordem);
    const lote: Lote = {
      id,
      empresaId,
      nome,
      dataUpload: new Date().toISOString(),
      status: 'processing',
      totalArquivos: 0,
      totalValido: 0,
      resumo: null,
      ordem,
    };
    dispatch({
      type: 'SET',
      payload: {
        empresas: addLote(
          { empresas: state.empresas, empresaAtiva: state.empresaAtiva, loteAtivo: state.loteAtivo },
          empresaId,
          lote,
        ).empresas,
      },
    });
    return id;
  }, [state]);

  const editLoteNomeFn = useCallback(async (id: string, nome: string) => {
    await updateLoteNome(id, nome);
    dispatch({
      type: 'SET',
      payload: {
        empresas: updateLote(
          { empresas: state.empresas, empresaAtiva: state.empresaAtiva, loteAtivo: state.loteAtivo },
          id,
          { nome },
        ).empresas,
      },
    });
  }, [state]);

  const removeLoteFn = useCallback(async (id: string) => {
    await deleteLote(id);
    const next = removeLote(
      { empresas: state.empresas, empresaAtiva: state.empresaAtiva, loteAtivo: state.loteAtivo },
      id,
    );
    dispatch({ type: 'SET', payload: next });
    if (next.loteAtivo !== state.loteAtivo) {
      await savePreferences(state.empresaAtiva, next.loteAtivo);
    }
  }, [state]);

  const reorderLotesFn = useCallback(async (empresaId: string, ids: string[]) => {
    const next = reorderLotes(
      { empresas: state.empresas, empresaAtiva: state.empresaAtiva, loteAtivo: state.loteAtivo },
      empresaId,
      ids,
    );
    dispatch({ type: 'SET', payload: { empresas: next.empresas } });
    const empresa = next.empresas.find((e) => e.id === empresaId);
    if (empresa) {
      await Promise.all(empresa.lotes.map((l) => updateLoteOrdem(l.id, l.ordem)));
    }
  }, [state]);

  const refreshLoteFn = useCallback((lote: Lote) => {
    dispatch({
      type: 'SET',
      payload: {
        empresas: updateLote(
          { empresas: state.empresas, empresaAtiva: state.empresaAtiva, loteAtivo: state.loteAtivo },
          lote.id,
          lote,
        ).empresas,
      },
    });
  }, [state]);

  // ---------------------------------------------------------------------------
  // Selection
  // ---------------------------------------------------------------------------

  // Ref always holds the latest empresaAtiva — lets setLoteAtivo read it
  // without needing it in the dep array (avoids stale closure on rapid switches).
  const empresaAtivaRef = useRef(state.empresaAtiva);
  useEffect(() => {
    empresaAtivaRef.current = state.empresaAtiva;
  }, [state.empresaAtiva]);

  const setEmpresaAtiva = useCallback((id: string | null) => {
    empresaAtivaRef.current = id;
    dispatch({ type: 'SET', payload: { empresaAtiva: id, loteAtivo: null } });
    savePreferences(id, null).catch(console.error);
  }, []);

  const setLoteAtivo = useCallback((id: string | null) => {
    dispatch({ type: 'SET', payload: { loteAtivo: id } });
    savePreferences(empresaAtivaRef.current, id).catch(console.error);
  }, []);

  return (
    <AppDataContext.Provider
      value={{
        data: state,
        refresh: load,
        addEmpresa: addEmpresaFn,
        editEmpresa: editEmpresaFn,
        removeEmpresa: removeEmpresaFn,
        reorderEmpresas: reorderEmpresasFn,
        addLote: addLoteFn,
        editLoteNome: editLoteNomeFn,
        removeLote: removeLoteFn,
        reorderLotes: reorderLotesFn,
        refreshLote: refreshLoteFn,
        setEmpresaAtiva,
        setLoteAtivo,
      }}
    >
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used inside AppDataProvider');
  return ctx;
}
