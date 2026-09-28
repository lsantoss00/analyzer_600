import {
  BarChart,
  Bar,
  Cell,
  Legend,
  PieChart,
  Pie,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts';
import { AlertTriangle, BarChart3, DollarSign, Loader2, TrendingUp, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { MetaProgress } from '@/components/MetaProgress';
import StatCard from '@/components/StatCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAppData } from '@/contexts/AppDataContext';
import { buildIeGroups, buildMesGroups, fetchNotasByLotes } from '@/lib/db';
import { applyNotaRules } from '@/lib/rules';
import { useSelectedEmpresa } from '@/lib/useSelectedEmpresa';
import { chartTokens } from '@/lib/themeTokens';
import type { IeGroup, MonthStat, NFe, Resumo } from '@/lib/types';
import { brl, brlK } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

function ConcentracaoCard({ groups }: { groups: IeGroup[] }) {
  const sorted = [...groups].sort((a, b) => b.valorTotal - a.valorTotal).slice(0, 8);
  const totalVal = groups.reduce((s, g) => s + g.valorTotal, 0);
  const top8Val = sorted.reduce((s, g) => s + g.valorTotal, 0);
  const top8Pct = totalVal > 0 ? Math.round((top8Val / totalVal) * 100) : 0;
  const maxVal = sorted[0]?.valorTotal ?? 1;

  return (
    <Card className="shrink-0">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Concentração de Valor</CardTitle>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" />
            <span>Top 8 = <span className={`font-semibold ${top8Pct >= 70 ? 'text-amber-400' : 'text-foreground'}`}>{top8Pct}%</span> do total</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 pb-3">
        <div className="space-y-2">
          {sorted.map((g, i) => {
            const pct = totalVal > 0 ? (g.valorTotal / totalVal) * 100 : 0;
            const barWidth = maxVal > 0 ? (g.valorTotal / maxVal) * 100 : 0;
            return (
              <div key={g.ie || g.cnpjDest} className="grid items-center gap-x-3" style={{ gridTemplateColumns: '1rem 1fr auto auto auto' }}>
                <span className="text-[10px] text-muted-foreground/60 tabular-nums text-right">{i + 1}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium truncate">{g.xNome || '—'}</span>
                    {g.isConsumidorFinal && <span className="text-[9px] text-muted-foreground/50 shrink-0">CF</span>}
                  </div>
                  <div className="mt-0.5 h-1 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-primary/70" style={{ width: `${barWidth}%` }} />
                  </div>
                </div>
                <span className="text-[11px] text-muted-foreground/60 shrink-0 tabular-nums">{g.qtdNotas} NF</span>
                <span className="text-xs font-mono text-muted-foreground shrink-0">{brlK(g.valorTotal)}</span>
                <span className={`text-xs font-semibold tabular-nums shrink-0 w-9 text-right ${pct >= 25 ? 'text-amber-400' : 'text-foreground'}`}>
                  {pct < 1 ? '<1' : Math.round(pct)}%
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// Tamanho único para os ticks dos dois gráficos de barra (eram 11 e 10).
const AXIS_FONT_SIZE = 11;

const ALL_LOTES = '__all__';

export default function Dashboard() {
  // Dentro do componente, não no escopo de módulo: chartTokens() usa
  // getComputedStyle e só é confiável depois do CSS aplicado. O helper
  // memoiza, então chamar por render é barato.
  const T = chartTokens();
  const tooltipStyle = {
    contentStyle: {
      background: T.card,
      border: `1px solid ${T.border}`,
      borderRadius: T.radius,
      color: T.foreground,
      fontSize: '12px',
    },
    labelStyle: { color: T.foreground, fontWeight: 600 },
    cursor: { fill: T.cursor },
  };
  // A segunda fatia era slate-700, que some contra o card e fazia "Cons. Final"
  // parecer um buraco em vez de um segmento.
  const PIE_COLORS = [T.series[0], T.series[2]];

  const { data } = useAppData();

  const empresasComLotes = data.empresas.filter((e) =>
    e.lotes.some((l) => l.status === 'done'),
  );

  const [selectedEmpresaId, setSelectedEmpresaId] = useSelectedEmpresa(
    empresasComLotes,
    data.empresaAtiva,
  );

  const lotesEmpresa = empresasComLotes
    .find((e) => e.id === selectedEmpresaId)
    ?.lotes.filter((l) => l.status === 'done') ?? [];

  const [selectedLoteId, setSelectedLoteId] = useState(ALL_LOTES);

  function handleEmpresaChange(id: string | null) {
    if (!id) return;
    setSelectedEmpresaId(id);
    setSelectedLoteId(ALL_LOTES);
  }

  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [monthStats, setMonthStats] = useState<MonthStat[]>([]);
  const [ieGroups, setIeGroups] = useState<IeGroup[]>([]);
  const [allIeGroups, setAllIeGroups] = useState<IeGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Incrementado pelo botão "Tentar novamente" para re-disparar o efeito de carga.
  const [reloadKey, setReloadKey] = useState(0);

  // Do contexto: uma alteração no Settings re-dispara o efeito de carga abaixo,
  // em vez de ficar num loadRules() por render que nunca entrava nas deps.
  const rules = data.rules;
  const metaIes = rules.metaIes;

  // Com "Todos os lotes" (o padrão), importar/excluir/reprocessar muda a lista
  // de ids sem mudar selectedLoteId — sem isto os gráficos ficam no conjunto antigo.
  const lotesEmpresaKey = lotesEmpresa.map((l) => l.id).join(',');

  useEffect(() => {
    if (lotesEmpresa.length === 0) {
      setResumo(null); setMonthStats([]); setIeGroups([]);
      return;
    }
    const ids = selectedLoteId === ALL_LOTES
      ? lotesEmpresa.map((l) => l.id)
      : [selectedLoteId];

    setLoading(true);
    setLoadError(null);
    fetchNotasByLotes(ids)
      .then((ns: NFe[]) => {
        const filtered = applyNotaRules(ns, rules);
        const groups = buildIeGroups(filtered, rules.valorMinimoIe);
        const validNotas = filtered;
        const mesGroups = buildMesGroups(validNotas);

        setAllIeGroups(groups);
        setIeGroups(groups.slice(0, 10));
        setMonthStats(
          mesGroups.map((g) => ({
            mes: g.label,
            valor: g.resumo.valorTotal,
            notas: g.resumo.notasTotais,
          })),
        );
        setResumo({
          notasTotais: validNotas.length,
          iesTotal: groups.length,
          iesConsumidorFinal: groups.filter((g) => g.isConsumidorFinal).length,
          iesNaoConsumidor: groups.filter((g) => !g.isConsumidorFinal).length,
          valorTotal: validNotas.reduce((s, n) => s + n.vNf, 0),
        });
      })
      .catch((err) => {
        // Antes isto era console.error: num build empacotado não há console, e a
        // página ficava vazia abaixo do header sem nenhuma explicação.
        console.error(err);
        setLoadError(String(err));
        setResumo(null); setMonthStats([]); setIeGroups([]); setAllIeGroups([]);
      })
      .finally(() => setLoading(false));
  }, [selectedLoteId, selectedEmpresaId, reloadKey, lotesEmpresaKey, rules]); // eslint-disable-line react-hooks/exhaustive-deps

  const pieData = resumo
    ? [
        { name: 'Não Cons. Final', value: resumo.iesNaoConsumidor },
        { name: 'Cons. Final', value: resumo.iesConsumidorFinal },
      ]
    : [];

  const loteLabel = selectedLoteId === ALL_LOTES
    ? 'Todos os lotes'
    : lotesEmpresa.find((l) => l.id === selectedLoteId)?.nome ?? '';

  return (
    <AppLayout>
      <div className="h-full overflow-y-auto p-5 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-xl font-bold">Dashboard</h1>
            <p className="text-sm text-muted-foreground">{loteLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            {empresasComLotes.length > 1 && (
              <Select value={selectedEmpresaId} onValueChange={handleEmpresaChange}>
                <SelectTrigger className="w-auto min-w-56 max-w-96">
                  <SelectValue>
                    {empresasComLotes.find((e) => e.id === selectedEmpresaId)?.nome}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {empresasComLotes.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={selectedLoteId} onValueChange={(v) => setSelectedLoteId(v ?? ALL_LOTES)}>
              <SelectTrigger className="w-auto min-w-48 max-w-72">
                <SelectValue>{loteLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {lotesEmpresa.length > 1 && (
                  <SelectItem value={ALL_LOTES}>Todos os lotes</SelectItem>
                )}
                {lotesEmpresa.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {lotesEmpresa.length === 0 && (
          <div className="flex justify-center items-center py-32 text-muted-foreground text-sm">
            {data.isLoading
              ? 'Carregando dados...'
              : 'Nenhum lote processado. Importe XMLs primeiro.'}
          </div>
        )}

        {lotesEmpresa.length > 0 && loading && (
          <div className="flex items-center gap-2 justify-center py-32 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Carregando dados...</span>
          </div>
        )}

        {lotesEmpresa.length > 0 && !loading && loadError && (
          <div className="flex flex-col items-center justify-center py-32 gap-3 text-sm">
            <AlertTriangle className="h-6 w-6 text-destructive" />
            <p className="text-muted-foreground">Não foi possível carregar os dados deste lote.</p>
            <p className="text-xs text-muted-foreground/70 max-w-md text-center font-mono">{loadError}</p>
            <Button variant="outline" size="sm" onClick={() => setReloadKey((k) => k + 1)}>
              Tentar novamente
            </Button>
          </div>
        )}

        {lotesEmpresa.length > 0 && !loading && !loadError && resumo && (
          <>
            {/* Meta progress — só mostra quando vendo todos os lotes */}
            {selectedLoteId === ALL_LOTES && (
              <MetaProgress count={resumo.iesNaoConsumidor} meta={metaIes} />
            )}

            {/* KPI row */}
            <div className="grid grid-cols-4 gap-3 shrink-0">
              <StatCard
                label="Total de Notas"
                value={resumo.notasTotais.toLocaleString('pt-BR')}
                icon={BarChart3}
                accent="blue"
              />
              <StatCard
                label="Total de IEs"
                value={resumo.iesTotal.toLocaleString('pt-BR')}
                icon={Users}
              />
              <StatCard
                label="IEs Não Cons. Final"
                value={resumo.iesNaoConsumidor.toLocaleString('pt-BR')}
                sub={`${resumo.iesTotal > 0 ? Math.round((resumo.iesNaoConsumidor / resumo.iesTotal) * 100) : 0}% do total`}
                icon={Users}
                accent="green"
              />
              <StatCard
                label="Valor Total"
                value={`R$ ${brl(resumo.valorTotal)}`}
                icon={DollarSign}
              />
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-3 gap-4" style={{ height: '260px' }}>
              {/* Donut */}
              <Card className="flex flex-col overflow-hidden">
                <CardHeader className="pb-1 shrink-0">
                  <CardTitle className="text-sm font-medium">IEs por Tipo</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 min-h-0 pb-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="45%"
                        innerRadius="45%"
                        outerRadius="65%"
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v) => Number(v).toLocaleString('pt-BR')}
                        {...tooltipStyle}
                      />
                      <Legend
                        verticalAlign="bottom"
                        height={32}
                        formatter={(value) => (
                          <span style={{ color: T.mutedForeground, fontSize: AXIS_FONT_SIZE }}>{value}</span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Monthly bar */}
              <Card className="col-span-2 flex flex-col overflow-hidden">
                <CardHeader className="pb-1 shrink-0">
                  <CardTitle className="text-sm font-medium">Valor por Mês (R$)</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 min-h-0 pb-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthStats} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={T.grid} />
                      <XAxis dataKey="mes" tick={{ fontSize: AXIS_FONT_SIZE, fill: T.mutedForeground }} />
                      <YAxis
                        tick={{ fontSize: AXIS_FONT_SIZE, fill: T.mutedForeground }}
                        tickFormatter={(v: number) =>
                          v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                        }
                      />
                      <Tooltip
                        formatter={(v) => [`R$ ${brl(Number(v))}`, 'Valor']}
                        {...tooltipStyle}
                      />
                      <Bar dataKey="valor" fill={T.series[0]} radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Concentração de valor */}
            {allIeGroups.length > 0 && <ConcentracaoCard groups={allIeGroups} />}

            {/* IE ranking */}
            <Card className="shrink-0" style={{ height: '220px' }}>
              <CardHeader className="pb-1">
                <CardTitle className="text-sm font-medium">Top 10 IEs por Valor</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 min-h-0 pb-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={ieGroups}
                    margin={{ top: 0, right: 60, left: 20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={T.grid} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: AXIS_FONT_SIZE, fill: T.mutedForeground }}
                      tickFormatter={(v: number) =>
                        v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                      }
                    />
                    <YAxis
                      type="category"
                      dataKey="ie"
                      width={90}
                      tick={{ fontSize: AXIS_FONT_SIZE, fill: T.mutedForeground }}
                    />
                    <Tooltip
                      formatter={(v) => [`R$ ${brl(Number(v))}`, 'Valor Total']}
                      labelFormatter={(ie) =>
                        ieGroups.find((g) => g.ie === String(ie))?.xNome ?? String(ie)
                      }
                      {...tooltipStyle}
                    />
                    <Bar dataKey="valorTotal" fill={T.series[0]} radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
