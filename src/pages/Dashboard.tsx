import {
  BarChart,
  Bar,
  Cell,
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

const COLORS = ['#4f8ef7', '#334155'];

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

  // Keep in sync with sidebar selection
  useEffect(() => {
    if (data.loteAtivo && allLotes.some((l) => l.id === data.loteAtivo)) {
      setSelectedLoteId(data.loteAtivo);
    }
  }, [data.loteAtivo]);

  const pieData = resumo
    ? [
        { name: 'Cons. Final', value: resumo.iesConsumidorFinal },
        { name: 'Não Cons. Final', value: resumo.iesNaoConsumidor },
      ]
    : [];

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">Análise do lote selecionado</p>
          </div>
          <Select value={selectedLoteId} onValueChange={(v) => setSelectedLoteId(v ?? '')}>
            <SelectTrigger className="w-60">
              <SelectValue placeholder="Selecione um lote">
                {selectedLoteId ? allLotes.find((l) => l.id === selectedLoteId)?.nome : undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {allLotes.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!lote && (
          <div className="flex justify-center py-20 text-muted-foreground text-sm">
            Nenhum lote processado. Importe XMLs primeiro.
          </div>
        )}

        {lote && loading && (
          <div className="flex items-center gap-2 justify-center py-20 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Carregando dados...</span>
          </div>
        )}

        {lote && !loading && resumo && (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
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

            {/* Charts row */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {/* Donut */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">IEs por Tipo</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={80}
                        paddingAngle={3}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`}
                        labelLine={false}
                      >
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => Number(v).toLocaleString('pt-BR')} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Monthly bar */}
              <Card className="lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Valor por Mês (R$)</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={monthStats} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v: number) =>
                          v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                        }
                      />
                      <Tooltip
                        formatter={(v) => [`R$ ${brl(Number(v))}`, 'Valor']}
                      />
                      <Bar dataKey="valor" fill="#4f8ef7" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* IE ranking */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Top 10 IEs por Valor</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    layout="vertical"
                    data={ieGroups}
                    margin={{ top: 0, right: 60, left: 20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v: number) =>
                        v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                      }
                    />
                    <YAxis
                      type="category"
                      dataKey="ie"
                      width={110}
                      tick={{ fontSize: 10 }}
                    />
                    <Tooltip
                      formatter={(v) => [`R$ ${brl(Number(v))}`, 'Valor Total']}
                      labelFormatter={(ie) =>
                        ieGroups.find((g) => g.ie === String(ie))?.xNome ?? String(ie)
                      }
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
