export interface NFe {
  id: string;
  loteId: string;
  chave: string;
  dataEmissao: string;
  cfop: string;
  ufDestino: string;
  ieDest: string;
  cnpjDest: string;
  xNome: string;
  indFinal: boolean;
  nNf: string;
  modNf: string;
  serie: string;
  vNf: number;
  vProd: number;
  vIcms: number;
  vSt: number;
  cnpjEmit: string;
  xNomeEmit: string;
  naturezaOperacao: string;
  municipio: string;
  ufEnd: string;
}

export interface Resumo {
  notasTotais: number;
  iesTotal: number;
  iesConsumidorFinal: number;
  iesNaoConsumidor: number;
  valorTotal: number;
}

export interface Lote {
  id: string;
  empresaId: string;
  nome: string;
  dataUpload: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  totalArquivos: number;
  totalValido: number;
  resumo: Resumo | null;
  ordem: number;
}

export interface Empresa {
  id: string;
  nome: string;
  cnpj: string;
  criadaEm: string;
  ordem: number;
  lotes: Lote[];
}

export interface AppData {
  empresas: Empresa[];
  empresaAtiva: string | null;
  loteAtivo: string | null;
}

// Computed — not stored
export interface MesGroup {
  mes: string; // "2024-01"
  label: string; // "Janeiro/2024"
  notas: NFe[];
  resumo: Resumo;
}

export interface IeGroup {
  ie: string;
  cnpjDest: string;
  xNome: string;
  municipio: string;
  notas: NFe[];
  valorTotal: number;
  chaveNfe1: string; // chave of highest-value nota
  valorNfe1: number;
  isConsumidorFinal: boolean;
  qtdNotas: number;
}

// Monthly aggregate for Dashboard charts
export interface MonthStat {
  mes: string; // "Jan/24"
  valor: number;
  notas: number;
}
