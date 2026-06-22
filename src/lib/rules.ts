import type { NFe } from './types';

export interface BusinessRules {
  ufs: string[];
  cfops: string[];
  metaIes: number;
  valorMinimoIe: number;
}

export const DEFAULT_RULES: BusinessRules = {
  ufs: ['RJ'],
  cfops: ['5102', '5403', '5405'],
  metaIes: 600,
  valorMinimoIe: 0,
};

export function loadRules(): BusinessRules {
  const ufsRaw = localStorage.getItem('regra_ufs');
  const cfopsRaw = localStorage.getItem('regra_cfops');
  return {
    ufs: ufsRaw
      ? ufsRaw.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
      : DEFAULT_RULES.ufs,
    cfops: cfopsRaw
      ? cfopsRaw.split(',').map((s) => s.trim()).filter(Boolean)
      : DEFAULT_RULES.cfops,
    metaIes: parseInt(localStorage.getItem('meta_ies') ?? '', 10) || DEFAULT_RULES.metaIes,
    valorMinimoIe: parseFloat(localStorage.getItem('valor_minimo_ie') ?? '') || DEFAULT_RULES.valorMinimoIe,
  };
}

export function saveRules(rules: Partial<BusinessRules>): void {
  if (rules.ufs !== undefined) localStorage.setItem('regra_ufs', rules.ufs.join(','));
  if (rules.cfops !== undefined) localStorage.setItem('regra_cfops', rules.cfops.join(','));
  if (rules.metaIes !== undefined) localStorage.setItem('meta_ies', String(rules.metaIes));
  if (rules.valorMinimoIe !== undefined) localStorage.setItem('valor_minimo_ie', String(rules.valorMinimoIe));
}

export function applyNotaRules(notas: NFe[], rules: BusinessRules): NFe[] {
  const cfopSet = new Set(rules.cfops);
  const ufSet = new Set(rules.ufs.map((u) => u.toUpperCase()));
  return notas.filter(
    (n) =>
      cfopSet.has(n.cfop) &&
      (ufSet.size === 0 || ufSet.has(n.ufDestino.toUpperCase())),
  );
}
