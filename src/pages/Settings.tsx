import { useState } from 'react';
import { toast } from 'sonner';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { DEFAULT_RULES, loadRules, saveRules } from '@/lib/rules';

export default function Settings() {
  const initial = loadRules();

  const [ufs, setUfs] = useState(initial.ufs.join(', '));
  const [cfops, setCfops] = useState(initial.cfops.join(', '));
  const [metaIes, setMetaIes] = useState(String(initial.metaIes));
  const [valorMinimoIe, setValorMinimoIe] = useState(String(initial.valorMinimoIe));

  function restoreDefaults() {
    setUfs(DEFAULT_RULES.ufs.join(', '));
    setCfops(DEFAULT_RULES.cfops.join(', '));
    setMetaIes(String(DEFAULT_RULES.metaIes));
    setValorMinimoIe(String(DEFAULT_RULES.valorMinimoIe));
  }

  function saveAll() {
    const parsedUfs = ufs.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    const parsedCfops = cfops.split(',').map((s) => s.trim()).filter(Boolean);
    const parsedMeta = parseInt(metaIes, 10);
    const parsedValor = parseFloat(valorMinimoIe);

    if (parsedUfs.length === 0) {
      toast.error('Informe pelo menos uma UF de destino.');
      return;
    }
    if (parsedCfops.length === 0) {
      toast.error('Informe pelo menos um CFOP válido.');
      return;
    }
    if (isNaN(parsedMeta) || parsedMeta <= 0) {
      toast.error('Meta de IEs inválida. Informe um número maior que zero.');
      return;
    }
    if (isNaN(parsedValor) || parsedValor < 0) {
      toast.error('Valor mínimo inválido.');
      return;
    }

    saveRules({
      ufs: parsedUfs,
      cfops: parsedCfops,
      metaIes: parsedMeta,
      valorMinimoIe: parsedValor,
    });

    // Normalize display
    setUfs(parsedUfs.join(', '));
    setCfops(parsedCfops.join(', '));

    toast.success('Regras salvas. Os filtros do Tabelão e Dashboard serão atualizados na próxima abertura.');
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold">Configurações</h1>
          <p className="text-sm text-muted-foreground mt-1">Regras de negócio e preferências</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Regras de Negócio — Decreto 9.025</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <p className="text-sm text-muted-foreground">
              Parâmetros que definem quais notas e IEs são elegíveis para o decreto.
              Alterações se aplicam ao Tabelão e Dashboard (não requerem reimportação).
            </p>

            {/* Row 1: UF + CFOP */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="regra-ufs">UF(s) de destino</Label>
                <Input
                  id="regra-ufs"
                  value={ufs}
                  onChange={(e) => setUfs(e.target.value)}
                  placeholder="RJ"
                  className="font-mono uppercase"
                />
                <p className="text-xs text-muted-foreground">Separadas por vírgula. Ex: <span className="font-mono">RJ, SP</span></p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="regra-cfops">CFOPs válidos</Label>
                <Input
                  id="regra-cfops"
                  value={cfops}
                  onChange={(e) => setCfops(e.target.value)}
                  placeholder="5102, 5403, 5405"
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">Separados por vírgula</p>
              </div>
            </div>

            {/* Row 2: Meta + Valor mínimo */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="meta-ies">Meta de IEs por trimestre</Label>
                <Input
                  id="meta-ies"
                  type="number"
                  min={1}
                  value={metaIes}
                  onChange={(e) => setMetaIes(e.target.value)}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">IEs Não-CF distintas exigidas pelo decreto</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="valor-minimo">Valor mínimo por IE (R$)</Label>
                <Input
                  id="valor-minimo"
                  type="number"
                  min={0}
                  step={0.01}
                  value={valorMinimoIe}
                  onChange={(e) => setValorMinimoIe(e.target.value)}
                  placeholder="0"
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">Filtra IEs cuja maior nota seja inferior ao valor. 0 = sem filtro</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-1">
              <Button onClick={saveAll}>Salvar regras</Button>
              <Button variant="outline" onClick={restoreDefaults}>Restaurar padrões</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sobre</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Aplicativo</span>
              <span className="font-medium">Analisador NF-e</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Versão</span>
              <span className="font-medium">0.1.0</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Banco de dados</span>
              <span className="font-medium font-mono text-xs">SQLite local</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
