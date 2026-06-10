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
import { BarChart3, DollarSign, Loader2, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import StatCard from '@/components/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAppData } from '@/contexts/AppDataContext';
import { buildIeGroups, fetchMonthStats, fetchNotas } from '@/lib/db';
import type { IeGroup, MonthStat } from '@/lib/types';
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

// Recharts tooltip styled for dark theme
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

export default function Dashboard() {
  const { data } = useAppData();

  const allLotes = data.empresas.flatMap((e) =>
    e.lotes.filter((l) => l.status === 'done'),
  );

  const [selectedLoteId, setSelectedLoteId] = useState<string>(
    data.loteAtivo ?? allLotes[0]?.id ?? '',
  );

  const lote = allLotes.find((l) => l.id === selectedLoteId);
  const resumo = lote?.resumo;

  const [monthStats, setMonthStats] = useState<MonthStat[]>([]);
  const [ieGroups, setIeGroups] = useState<IeGroup[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedLoteId) return;
    setLoading(true);
    Promise.all([fetchNotas(selectedLoteId), fetchMonthStats(selectedLoteId)])
      .then(([ns, ms]) => {
        setMonthStats(ms);
        setIeGroups(buildIeGroups(ns).slice(0, 10));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedLoteId]);

  useEffect(() => {
    if (data.loteAtivo && allLotes.some((l) => l.id === data.loteAtivo)) {
      setSelectedLoteId(data.loteAtivo);
    }
  }, [data.loteAtivo]); // eslint-disable-line react-hooks/exhaustive-deps

  const pieData = resumo
    ? [
        { name: 'Não Cons. Final', value: resumo.iesNaoConsumidor },
        { name: 'Cons. Final', value: resumo.iesConsumidorFinal },
      ]
    : [];

  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-hidden p-5 gap-4">
        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-xl font-bold">Dashboard</h1>
            <p className="text-sm text-muted-foreground">Análise do lote selecionado</p>
          </div>
          <Select value={selectedLoteId} onValueChange={(v) => setSelectedLoteId(v ?? '')}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Selecione um lote">
                {selectedLoteId ? allLotes.find((l) => l.id === selectedLoteId)?.nome : undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {data.empresas.map((empresa) => {
                const doneLotes = empresa.lotes.filter((l) => l.status === 'done');
                if (doneLotes.length === 0) return null;
                return (
                  <div key={empresa.id}>
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                      {empresa.nome}
                    </div>
                    {doneLotes.map((l) => (
                      <SelectItem key={l.id} value={l.id} className="pl-5">
                        {l.nome}
                      </SelectItem>
                    ))}
                  </div>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {!lote && (
          <div className="flex justify-center items-center flex-1 text-muted-foreground text-sm">
            Nenhum lote processado. Importe XMLs primeiro.
          </div>
        )}

        {lote && loading && (
          <div className="flex items-center gap-2 justify-center flex-1 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Carregando dados...</span>
          </div>
        )}

        {lote && !loading && resumo && (
          <>
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
                label="IEs Cons. Final"
                value={resumo.iesConsumidorFinal.toLocaleString('pt-BR')}
                sub={`${resumo.iesTotal > 0 ? Math.round((resumo.iesConsumidorFinal / resumo.iesTotal) * 100) : 0}% do total`}
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

            {/* Charts row — fills remaining height */}
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

              {/* Monthly bar — 2 cols */}
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

            {/* IE ranking — fixed portion */}
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
