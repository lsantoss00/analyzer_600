import { useState } from 'react';
import { toast } from 'sonner';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

export default function Settings() {
  const [metaIes, setMetaIes] = useState(
    () => localStorage.getItem('meta_ies') ?? '600',
  );

  function saveMeta() {
    const n = parseInt(metaIes, 10);
    if (isNaN(n) || n <= 0) {
      toast.error('Meta inválida. Informe um número maior que zero.');
      return;
    }
    localStorage.setItem('meta_ies', String(n));
    toast.success('Meta salva com sucesso.');
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold">Configurações</h1>
          <p className="text-sm text-muted-foreground mt-1">Preferências do aplicativo</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Meta — Decreto 9.025</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Número de IEs Não-Consumidor Final distintas por trimestre exigidas pelo decreto para manter o incentivo fiscal.
            </p>
            <div className="flex items-end gap-3">
              <div className="space-y-1.5 flex-1 max-w-45">
                <Label htmlFor="meta-ies" className="text-sm">Meta de IEs por trimestre</Label>
                <Input
                  id="meta-ies"
                  type="number"
                  min={1}
                  value={metaIes}
                  onChange={(e) => setMetaIes(e.target.value)}
                  className="font-mono"
                />
              </div>
              <Button onClick={saveMeta}>Salvar</Button>
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
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Regras de negócio</span>
              <span className="font-medium text-xs">UF=RJ · CFOPs específicos</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">CFOPs Aceitos</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">
              Apenas notas com os CFOPs abaixo e UF de destino = RJ são importadas.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {[
                '5101','5102','5103','5114','5115','5116','5117','5118','5119',
                '5120','5122','5123','5401','5402','5403','5405',
              ].map((c) => (
                <span
                  key={c}
                  className="rounded border px-2 py-0.5 text-xs font-mono bg-muted"
                >
                  {c}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
