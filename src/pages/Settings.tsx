import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

export default function Settings() {
  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold">Configurações</h1>
          <p className="text-sm text-muted-foreground mt-1">Preferências do aplicativo</p>
        </div>

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
