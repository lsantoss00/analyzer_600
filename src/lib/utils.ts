import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Formata em pt-BR com 2 casas. Sem o "R$" — cada tela decide o prefixo. */
export function brl(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Abrevia valores grandes: 1.2M, 340k. Usado nos eixos de gráfico. */
export function brlK(v: number): string {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}k`;
  return `R$ ${brl(v)}`;
}

/** Devolve o valor original se não tiver 14 dígitos. */
export function formatCnpj(v: string): string {
  const d = (v ?? '').replace(/\D/g, '');
  if (d.length !== 14) return v;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/** ISO (YYYY-MM-DD ou com hora) para dd/mm/aaaa. */
export function formatDate(iso: string): string {
  if (!iso || iso.length < 10) return iso ?? '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
