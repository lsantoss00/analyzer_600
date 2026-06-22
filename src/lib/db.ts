import Database from '@tauri-apps/plugin-sql';
import type { Empresa, IeGroup, Lote, MesGroup, MonthStat, NFe, Resumo } from './types';

let _db: Database | null = null;

async function db(): Promise<Database> {
  if (!_db) _db = await Database.load('sqlite:analyzer.db');
  return _db;
}

// ---------------------------------------------------------------------------
// Row mapping helpers
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

function rowToLote(r: Row): Lote {
  return {
    id: r.id as string,
    empresaId: r.empresa_id as string,
    nome: r.nome as string,
    dataUpload: r.data_upload as string,
    status: r.status as Lote['status'],
    totalArquivos: (r.total_arquivos as number) ?? 0,
    totalValido: (r.total_valido as number) ?? 0,
    resumo: r.resumo ? (JSON.parse(r.resumo as string) as Resumo) : null,
    ordem: (r.ordem as number) ?? 0,
  };
}

function rowToNfe(r: Row): NFe {
  return {
    id: r.id as string,
    loteId: r.lote_id as string,
    chave: r.chave as string,
    dataEmissao: r.data_emissao as string,
    cfop: r.cfop as string,
    ufDestino: r.uf_destino as string,
    ieDest: r.ie_dest as string,
    cnpjDest: r.cnpj_dest as string,
    xNome: r.x_nome as string,
    indFinal: (r.ind_final as number) === 1,
    nNf: r.n_nf as string,
    modNf: r.mod_nf as string,
    serie: r.serie as string,
    vNf: (r.v_nf as number) ?? 0,
    vProd: (r.v_prod as number) ?? 0,
    vIcms: (r.v_icms as number) ?? 0,
    vSt: (r.v_st as number) ?? 0,
    cnpjEmit: r.cnpj_emit as string,
    xNomeEmit: r.x_nome_emit as string,
    naturezaOperacao: r.natureza_operacao as string,
    municipio: r.municipio as string,
    ufEnd: r.uf_end as string,
  };
}

// ---------------------------------------------------------------------------
// Empresas
// ---------------------------------------------------------------------------

export async function fetchEmpresas(): Promise<Empresa[]> {
  const d = await db();
  const rows = await d.select<Row[]>(
    'SELECT * FROM empresas ORDER BY ordem ASC, criada_em ASC',
  );
  const empresas: Empresa[] = rows.map((r) => ({
    id: r.id as string,
    nome: r.nome as string,
    cnpj: (r.cnpj as string) ?? '',
    criadaEm: r.criada_em as string,
    ordem: (r.ordem as number) ?? 0,
    lotes: [],
  }));

  // Load lotes for each empresa in one query
  if (empresas.length === 0) return [];
  const loteRows = await d.select<Row[]>(
    'SELECT * FROM lotes ORDER BY ordem ASC, data_upload ASC',
  );
  const loteMap = new Map<string, Lote[]>();
  for (const r of loteRows) {
    const l = rowToLote(r);
    if (!loteMap.has(l.empresaId)) loteMap.set(l.empresaId, []);
    loteMap.get(l.empresaId)!.push(l);
  }
  for (const e of empresas) {
    e.lotes = loteMap.get(e.id) ?? [];
  }

  return empresas;
}

export async function insertEmpresa(id: string, nome: string, cnpj: string, ordem: number): Promise<void> {
  const d = await db();
  await d.execute(
    'INSERT INTO empresas (id, nome, cnpj, ordem) VALUES ($1, $2, $3, $4)',
    [id, nome, cnpj, ordem],
  );
}

export async function updateEmpresa(id: string, nome: string, cnpj: string): Promise<void> {
  const d = await db();
  await d.execute('UPDATE empresas SET nome=$1, cnpj=$2 WHERE id=$3', [nome, cnpj, id]);
}

export async function updateEmpresaOrdem(id: string, ordem: number): Promise<void> {
  const d = await db();
  await d.execute('UPDATE empresas SET ordem=$1 WHERE id=$2', [ordem, id]);
}

export async function deleteEmpresa(id: string): Promise<void> {
  const d = await db();
  await d.execute('DELETE FROM empresas WHERE id=$1', [id]);
}

// ---------------------------------------------------------------------------
// Lotes
// ---------------------------------------------------------------------------

export async function insertLote(
  id: string,
  empresaId: string,
  nome: string,
  ordem: number,
): Promise<void> {
  const d = await db();
  await d.execute(
    "INSERT INTO lotes (id, empresa_id, nome, status, ordem) VALUES ($1, $2, $3, 'processing', $4)",
    [id, empresaId, nome, ordem],
  );
}

export async function updateLoteNome(id: string, nome: string): Promise<void> {
  const d = await db();
  await d.execute('UPDATE lotes SET nome=$1 WHERE id=$2', [nome, id]);
}

export async function updateLoteOrdem(id: string, ordem: number): Promise<void> {
  const d = await db();
  await d.execute('UPDATE lotes SET ordem=$1 WHERE id=$2', [ordem, id]);
}

export async function deleteLote(id: string): Promise<void> {
  const d = await db();
  await d.execute('DELETE FROM lotes WHERE id=$1', [id]);
}

// ---------------------------------------------------------------------------
// Notas
// ---------------------------------------------------------------------------

export async function fetchNotas(loteId: string): Promise<NFe[]> {
  const d = await db();
  const rows = await d.select<Row[]>('SELECT * FROM notas WHERE lote_id=$1', [loteId]);
  return rows.map(rowToNfe);
}

export async function fetchNotasByLotes(loteIds: string[]): Promise<NFe[]> {
  if (loteIds.length === 0) return [];
  const d = await db();
  const placeholders = loteIds.map((_, i) => `$${i + 1}`).join(',');
  const rows = await d.select<Row[]>(
    `SELECT * FROM notas WHERE lote_id IN (${placeholders})`,
    loteIds,
  );
  return rows.map(rowToNfe);
}

// ---------------------------------------------------------------------------
// Aggregate queries (used by Dashboard)
// ---------------------------------------------------------------------------

export async function fetchMonthStats(loteId: string): Promise<MonthStat[]> {
  const d = await db();
  const rows = await d.select<Row[]>(
    `SELECT substr(data_emissao, 1, 7) as mes, SUM(v_nf) as valor, COUNT(*) as notas
     FROM notas WHERE lote_id=$1
     GROUP BY mes ORDER BY mes`,
    [loteId],
  );
  return rows.map((r) => ({
    mes: formatMesLabel(r.mes as string),
    valor: (r.valor as number) ?? 0,
    notas: (r.notas as number) ?? 0,
  }));
}

function formatMesLabel(ym: string): string {
  if (!ym || ym.length < 7) return ym;
  const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const [year, month] = ym.split('-');
  const m = parseInt(month, 10);
  return `${months[m - 1] ?? month}/${year.slice(2)}`;
}

// ---------------------------------------------------------------------------
// IE groups (used by Tabelão + Dashboard ranking)
// ---------------------------------------------------------------------------

export const CFOPS_VALIDOS = new Set(['5102', '5403', '5405']);

export function buildIeGroups(notas: NFe[], valorMinimoIe = 0): IeGroup[] {
  // Apply CFOP filter on the frontend too — handles lotes imported with the old 16-CFOP list
  const validNotas = notas.filter((n) => CFOPS_VALIDOS.has(n.cfop));

  const map = new Map<string, NFe[]>();
  for (const n of validNotas) {
    const key = n.ieDest || n.cnpjDest;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(n);
  }

  const groups: IeGroup[] = [];
  for (const [ie, ns] of map.entries()) {
    const sorted = [...ns].sort((a, b) => b.vNf - a.vNf);
    const top = sorted[0];
    groups.push({
      ie,
      cnpjDest: ns[0].cnpjDest,
      xNome: ns[0].xNome,
      municipio: ns[0].municipio,
      ufEnd: ns[0].ufEnd ?? '',
      notas: ns,
      valorTotal: ns.reduce((s, n) => s + n.vNf, 0),
      chaveNfe1: top.chave,
      valorNfe1: top.vNf,
      isConsumidorFinal: ns.every((n) => n.indFinal),
      qtdNotas: ns.length,
      dataEmissaoLatest: ns.reduce((max, n) => (n.dataEmissao > max ? n.dataEmissao : max), ''),
      indFinalCount: ns.filter((n) => n.indFinal).length,
    });
  }

  const filtered = valorMinimoIe > 0
    ? groups.filter((g) => g.valorNfe1 >= valorMinimoIe)
    : groups;

  return filtered.sort((a, b) => b.valorTotal - a.valorTotal);
}

// ---------------------------------------------------------------------------
// IE group comparison (Decreto 9.025 — tracks changes between two periods)
// ---------------------------------------------------------------------------

export interface IeComparison {
  lost: IeGroup[];       // NCF in A, gone in B (not CF either)
  common: IeGroup[];     // NCF in both A and B
  gained: IeGroup[];     // NCF in B only (new)
  changedToCF: IeGroup[]; // was NCF in A, now CF in B
}

export function compareIeGroups(a: IeGroup[], b: IeGroup[]): IeComparison {
  const ncfA = new Map(a.filter((g) => !g.isConsumidorFinal).map((g) => [g.ie, g]));
  const ncfB = new Map(b.filter((g) => !g.isConsumidorFinal).map((g) => [g.ie, g]));
  const cfB = new Set(b.filter((g) => g.isConsumidorFinal).map((g) => g.ie));

  return {
    lost: [...ncfA.values()].filter((g) => !ncfB.has(g.ie) && !cfB.has(g.ie)),
    common: [...ncfA.values()].filter((g) => ncfB.has(g.ie)),
    gained: [...ncfB.values()].filter((g) => !ncfA.has(g.ie)),
    changedToCF: [...ncfA.values()].filter((g) => cfB.has(g.ie)),
  };
}

// ---------------------------------------------------------------------------
// Month groups (for MesAccordion)
// ---------------------------------------------------------------------------

export function buildMesGroups(notas: NFe[]): MesGroup[] {
  const map = new Map<string, NFe[]>();
  for (const n of notas) {
    const mes = n.dataEmissao.slice(0, 7);
    if (!map.has(mes)) map.set(mes, []);
    map.get(mes)!.push(n);
  }

  const groups: MesGroup[] = [];
  for (const [mes, ns] of map.entries()) {
    const ieMap = new Map<string, NFe[]>();
    for (const n of ns) {
      const key = n.ieDest || n.cnpjDest;
      if (!ieMap.has(key)) ieMap.set(key, []);
      ieMap.get(key)!.push(n);
    }
    const iesTotal = ieMap.size;
    const iesConsumidorFinal = [...ieMap.values()].filter((arr) =>
      arr.every((n) => n.indFinal),
    ).length;

    groups.push({
      mes,
      label: formatMesLabel(mes),
      notas: ns,
      resumo: {
        notasTotais: ns.length,
        iesTotal,
        iesConsumidorFinal,
        iesNaoConsumidor: iesTotal - iesConsumidorFinal,
        valorTotal: ns.reduce((s, n) => s + n.vNf, 0),
      },
    });
  }

  return groups.sort((a, b) => a.mes.localeCompare(b.mes));
}

// ---------------------------------------------------------------------------
// Reprocessing
// ---------------------------------------------------------------------------

export async function resetLote(id: string): Promise<void> {
  const d = await db();
  await d.execute('DELETE FROM notas WHERE lote_id=$1', [id]);
  await d.execute(
    "UPDATE lotes SET status='pending', total_arquivos=0, total_valido=0, resumo=NULL WHERE id=$1",
    [id],
  );
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

export async function fetchPreferences(): Promise<{ empresaAtiva: string | null; loteAtivo: string | null }> {
  const d = await db();
  const rows = await d.select<Row[]>('SELECT * FROM preferencias WHERE id=1');
  if (rows.length === 0) return { empresaAtiva: null, loteAtivo: null };
  return {
    empresaAtiva: (rows[0].empresa_ativa as string | null) ?? null,
    loteAtivo: (rows[0].lote_ativo as string | null) ?? null,
  };
}

export async function savePreferences(
  empresaAtiva: string | null,
  loteAtivo: string | null,
): Promise<void> {
  const d = await db();
  await d.execute(
    'UPDATE preferencias SET empresa_ativa=$1, lote_ativo=$2 WHERE id=1',
    [empresaAtiva, loteAtivo],
  );
}
