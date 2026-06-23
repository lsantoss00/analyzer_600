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
import { AlertTriangle, BarChart3, DollarSign, Loader2, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { MetaProgress } from '@/components/MetaProgress';
import StatCard from '@/components/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAppData } from '@/contexts/AppDataContext';
import { buildIeGroups, buildMesGroups, fetchNotasByLotes } from '@/lib/db';
import { applyNotaRules, loadRules } from '@/lib/rules';
import type { IeGroup, MonthStat, NFe, Resumo } from '@/lib/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

function brl(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const tooltipStyle = {
  contentStyle: {
    background: 'oklch(0.21 0.028 254)',
    border: '1px solid oklch(0.31 0.024 255)',
    borderRadius: '6px',
    color: 'oklch(0.94 0.007 255)',
    fontSize: '12px',
  },
  labelStyle: { color: 'oklch(0.94 0.007 255)', fontWeight: 600 },
  cursor: { fill: 'oklch(0.31 0.024 255 / 0.4)' },
};

const PIE_COLORS = ['#4f8ef7', '#334155'];

const ALL_LOTES = '__all__';

export default function Dashboard() {
  const { data } = useAppData();

  const empresasComLotes = data.empresas.filter((e) =>
    e.lotes.some((l) => l.status === 'done'),
  );

  const initialEmpresaId =
    data.empresaAtiva && empresasComLotes.some((e) => e.id === data.empresaAtiva)
      ? data.empresaAtiva
      : (empresasComLotes[0]?.id ?? '');

  const [selectedEmpresaId, setSelectedEmpresaId] = useState(initialEmpresaId);

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

  const rules = loadRules();
  const metaIes = rules.metaIes;

  useEffect(() => {
    if (lotesEmpresa.length === 0) {
      setResumo(null); setMonthStats([]); setIeGroups([]);
      return;
    }
    const ids = selectedLoteId === ALL_LOTES
      ? lotesEmpresa.map((l) => l.id)
      : [selectedLoteId];

    setLoading(true);
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
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedLoteId, selectedEmpresaId]); // eslint-disable-line react-hooks/exhaustive-deps

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
      <div className="flex flex-col h-full overflow-hidden p-5 gap-4">
        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-xl font-bold">Dashboard</h1>
            <p className="text-sm text-muted-foreground">{loteLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            {empresasComLotes.length > 1 && (
              <Select value={selectedEmpresaId} onValueChange={handleEmpresaChange}>
                <SelectTrigger className="w-44">
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
              <SelectTrigger className="w-48">
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
          <div className="flex justify-center items-center flex-1 text-muted-foreground text-sm">
            Nenhum lote processado. Importe XMLs primeiro.
          </div>
        )}

        {lotesEmpresa.length > 0 && loading && (
          <div className="flex items-center gap-2 justify-center flex-1 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Carregando dados...</span>
          </div>
        )}

        {lotesEmpresa.length > 0 && !loading && resumo && (
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
                accent="amber"
              />
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-3 gap-4 flex-1 min-h-0">
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
                          <span style={{ color: 'oklch(0.72 0.014 258)', fontSize: 11 }}>{value}</span>
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
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.31 0.024 255 / 0.5)" />
                      <XAxis dataKey="mes" tick={{ fontSize: 11, fill: 'oklch(0.72 0.014 258)' }} />
                      <YAxis
                        tick={{ fontSize: 11, fill: 'oklch(0.72 0.014 258)' }}
                        tickFormatter={(v: number) =>
                          v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                        }
                      />
                      <Tooltip
                        formatter={(v) => [`R$ ${brl(Number(v))}`, 'Valor']}
                        {...tooltipStyle}
                      />
                      <Bar dataKey="valor" fill="#4f8ef7" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Concentração de valor */}
            {allIeGroups.length > 0 && (() => {
              const totalVal = allIeGroups.reduce((s, g) => s + g.valorTotal, 0);
              const sorted = [...allIeGroups].sort((a, b) => b.valorTotal - a.valorTotal);
              const pct = (n: number) =>
                totalVal > 0 ? Math.round(sorted.slice(0, n).reduce((s, g) => s + g.valorTotal, 0) / totalVal * 100) : 0;
              const [p3, p5, p10] = [pct(3), pct(5), pct(10)];
              const risk = p3 >= 60 ? 'high' : p5 >= 60 ? 'mid' : 'low';
              return (
                <Card className="shrink-0">
                  <CardContent className="py-4 px-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="text-sm font-medium">Concentração de Valor</p>
                        <p className="text-xs text-muted-foreground mt-0.5">% do valor total em X IEs</p>
                      </div>
                      {risk === 'high' && (
                        <div className="flex items-center gap-1 text-amber-400 text-xs">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          <span>Concentrado</span>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {[['Top 3', p3], ['Top 5', p5], ['Top 10', p10]].map(([label, val]) => (
                        <div key={label as string} className="space-y-1.5">
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">{label as string}</span>
                            <span className={`font-semibold tabular-nums ${(val as number) >= 70 ? 'text-amber-400' : 'text-foreground'}`}>{val as number}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${(val as number) >= 70 ? 'bg-amber-400' : 'bg-primary'}`}
                              style={{ width: `${val as number}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })()}

            {/* IE ranking */}
            <Card className="shrink-0" style={{ height: '220px' }}>
              <CardHeader className="pb-1">
                <CardTitle className="text-sm font-medium">Top 10 IEs por Valor</CardTitle>
              </CardHeader>
              <CardContent className="h-42">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={ieGroups}
                    margin={{ top: 0, right: 60, left: 20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.31 0.024 255 / 0.5)" />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 10, fill: 'oklch(0.72 0.014 258)' }}
                      tickFormatter={(v: number) =>
                        v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                      }
                    />
                    <YAxis
                      type="category"
                      dataKey="ie"
                      width={90}
                      tick={{ fontSize: 10, fill: 'oklch(0.72 0.014 258)' }}
                    />
                    <Tooltip
                      formatter={(v) => [`R$ ${brl(Number(v))}`, 'Valor Total']}
                      labelFormatter={(ie) =>
                        ieGroups.find((g) => g.ie === String(ie))?.xNome ?? String(ie)
                      }
                      {...tooltipStyle}
                    />
                    <Bar dataKey="valorTotal" fill="#4f8ef7" radius={[0, 3, 3, 0]} />
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
