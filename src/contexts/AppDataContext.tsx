import { toast } from 'sonner';
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
  recoverStuckLotes,
  savePreferences,
  updateEmpresa,
  updateEmpresaOrdem,
  updateLoteNome,
} from '@/lib/db';
import {
  addEmpresa,
  addLote,
  removeEmpresa,
  removeLote,
  reorderEmpresas,
  updateEmpresa as updateEmpresaLocal,
  updateLote,
} from '@/lib/storage';
import type { AppData, Lote } from '@/lib/types';
import { loadRules, saveRules, type BusinessRules } from '@/lib/rules';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface State extends AppData {
  isLoading: boolean;
  /** Regras de negócio no contexto para que o Settings as altere e as telas de
   *  análise reajam na hora, em vez de cada uma congelar o que o localStorage
   *  tinha quando montou. */
  rules: BusinessRules;
}

type Action =
  | { type: 'LOAD'; payload: AppData }
  | { type: 'SET'; payload: Partial<State> }
  | { type: 'SET_RULES'; payload: Partial<BusinessRules> }
  | { type: 'LOADING'; payload: boolean };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'LOAD':
      return { ...state, ...action.payload, isLoading: false };
    case 'SET':
      return { ...state, ...action.payload };
    // Merge no reducer em vez de no callback: não há janela de leitura obsoleta
    // se duas atualizações caírem no mesmo tick.
    case 'SET_RULES':
      return { ...state, rules: { ...state.rules, ...action.payload } };
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
  // Leitura síncrona do localStorage — ao contrário das preferências (SQLite,
  // assíncrono), as regras já estão corretas no primeiro render.
  rules: loadRules(),
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
  setEmpresaAtiva: (id: string | null) => void;
  setLoteAtivo: (id: string | null) => void;
  updateRules: (partial: Partial<BusinessRules>) => void;
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
      // Antes de ler: qualquer lote ainda em 'processing' é resto de um import
      // que morreu — sem isto ele gira um spinner eterno e some da análise.
      const recovered = await recoverStuckLotes();
      if (recovered > 0) {
        toast.warning(
          recovered === 1
            ? '1 lote ficou incompleto e foi marcado com erro. Reprocesse ou exclua.'
            : `${recovered} lotes ficaram incompletos e foram marcados com erro.`,
        );
      }
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
      toast.error(`Erro ao carregar os dados: ${String(err)}`);
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
      descartes: null,
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
    savePreferences(id, null).catch((err) => {
      console.error(err);
      toast.error('Não foi possível salvar a empresa ativa.');
    });
  }, []);

  const setLoteAtivo = useCallback((id: string | null) => {
    dispatch({ type: 'SET', payload: { loteAtivo: id } });
    savePreferences(empresaAtivaRef.current, id).catch((err) => {
      console.error(err);
      toast.error('Não foi possível salvar o lote ativo.');
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Regras de negócio
  // ---------------------------------------------------------------------------

  // Mesmo padrão dos setters acima: despacha para o estado e persiste na mesma
  // função. O armazenamento continua sendo o localStorage (saveRules), então
  // não há migration envolvida — o que muda é que as telas agora reagem.
  const updateRulesFn = useCallback((partial: Partial<BusinessRules>) => {
    saveRules(partial);
    dispatch({ type: 'SET_RULES', payload: partial });
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
        setEmpresaAtiva,
        setLoteAtivo,
        updateRules: updateRulesFn,
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
