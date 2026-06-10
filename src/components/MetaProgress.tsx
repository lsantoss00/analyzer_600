import { Progress } from '@/components/ui/progress';

interface MetaProgressProps {
  count: number;
  meta: number;
}

export function MetaProgress({ count, meta }: MetaProgressProps) {
  const pct = meta > 0 ? Math.min(Math.round((count / meta) * 100), 100) : 0;
  const colorClass =
    count >= meta
      ? 'text-green-400'
      : count >= Math.round(meta * 0.67)
        ? 'text-amber-400'
        : 'text-red-400';

  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-2xl font-bold tabular-nums ${colorClass}`}>{count.toLocaleString('pt-BR')}</span>
          <span className="text-sm text-muted-foreground">/ {meta.toLocaleString('pt-BR')} IEs válidas</span>
        </div>
        <span className={`text-sm font-semibold tabular-nums ${colorClass}`}>{pct}%</span>
      </div>
      <Progress value={pct} className="h-2" />
      {count >= meta && (
        <p className="text-xs text-green-400 font-medium">Meta atingida!</p>
      )}
    </div>
  );
}
