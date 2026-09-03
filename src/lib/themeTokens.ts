/**
 * Lê os design tokens do index.css em runtime.
 *
 * O Recharts aplica cores como atributos de apresentação SVG (tick.fill,
 * CartesianGrid.stroke), e atributo SVG não resolve `var(--token)` — por isso
 * a leitura via getComputedStyle em vez de simplesmente escrever var() inline.
 * Antes estes valores eram 15 literais oklch/hex copiados à mão no Dashboard,
 * que dessincronizavam em silêncio a cada ajuste de tema.
 */
const cache = new Map<string, string>();

function token(nome: string): string {
  const emCache = cache.get(nome);
  if (emCache !== undefined) return emCache;
  const valor = getComputedStyle(document.documentElement)
    .getPropertyValue(nome)
    .trim();
  cache.set(nome, valor);
  return valor;
}

/** Mesma cor com alfa. `color-mix` evita ter que decompor o oklch na mão. */
function comAlfa(nome: string, pct: number): string {
  return `color-mix(in oklch, ${token(nome)} ${pct}%, transparent)`;
}

export function chartTokens() {
  return {
    card: token('--card'),
    border: token('--border'),
    foreground: token('--foreground'),
    mutedForeground: token('--muted-foreground'),
    radius: token('--radius'),
    grid: comAlfa('--border', 50),
    cursor: comAlfa('--border', 40),
    /** Série categórica. chart-1..5 já existem no index.css e não eram usados. */
    series: [
      token('--chart-1'),
      token('--chart-2'),
      token('--chart-3'),
      token('--chart-4'),
      token('--chart-5'),
    ],
  };
}
