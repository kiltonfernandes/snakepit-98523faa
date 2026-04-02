import { Settings as SettingsIcon, Thermometer, Ban, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';

export default function Settings() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <SettingsIcon className="h-6 w-6 text-primary" />
          Configurações
        </h1>
        <p className="text-muted-foreground mt-1">Preferências da workstation</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Thermometer className="h-4 w-4" /> Laboratório de Tom
          </CardTitle>
          <CardDescription>Controle da temperatura do tom Heavynauta</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Temperatura</span>
              <span className="font-mono text-muted-foreground">0.7</span>
            </div>
            <Slider defaultValue={[70]} max={100} step={1} />
          </div>
          <div className="flex gap-2 text-xs text-muted-foreground">
            <span>Conservador</span>
            <span className="ml-auto">Criativo</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Ban className="h-4 w-4" /> Termos Banidos
          </CardTitle>
          <CardDescription>Palavras e expressões proibidas nos prompts</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Nenhum termo banido configurado.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4" /> Log de Atividade
          </CardTitle>
          <CardDescription>Histórico de ações do sistema</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Nenhuma atividade registrada.</p>
        </CardContent>
      </Card>
    </div>
  );
}
