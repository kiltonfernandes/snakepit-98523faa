import { useState } from 'react';
import { Settings as SettingsIcon, Thermometer, Ban, Activity, Plus, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useApp } from '@/contexts/AppContext';

export default function Settings() {
  const { settings, updateSettings, activityLog } = useApp();
  const [newTerm, setNewTerm] = useState('');

  const bannedTerms = settings.banned_terms_text ? settings.banned_terms_text.split('\n').filter(Boolean) : [];

  const addBannedTerm = () => {
    if (!newTerm.trim() || bannedTerms.includes(newTerm.trim())) return;
    const updated = [...bannedTerms, newTerm.trim()].join('\n');
    updateSettings({ banned_terms_text: updated });
    setNewTerm('');
  };

  const removeBannedTerm = (term: string) => {
    const updated = bannedTerms.filter(t => t !== term).join('\n');
    updateSettings({ banned_terms_text: updated });
  };

  const temperature = settings.brand_tone_temperature / 100;

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
              <span className="font-mono text-muted-foreground">{temperature.toFixed(2)}</span>
            </div>
            <Slider
              value={[settings.brand_tone_temperature]}
              max={100}
              step={1}
              onValueChange={([v]) => updateSettings({ brand_tone_temperature: v })}
            />
          </div>
          <div className="flex gap-2 text-xs text-muted-foreground">
            <span>Conservador</span>
            <span className="ml-auto">Criativo</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {[
              { label: 'Cirúrgico', value: 30 },
              { label: 'Sóbrio', value: 50 },
              { label: 'Equilibrado', value: 55 },
              { label: 'Quente', value: 70 },
              { label: 'Incendiário', value: 90 },
            ].map(preset => (
              <Button
                key={preset.label}
                variant={Math.abs(settings.brand_tone_temperature - preset.value) < 3 ? 'default' : 'outline'}
                size="sm"
                className="text-xs"
                onClick={() => updateSettings({ brand_tone_temperature: preset.value })}
              >
                {preset.label}
              </Button>
            ))}
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
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Adicionar termo..."
              value={newTerm}
              onChange={e => setNewTerm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addBannedTerm()}
              className="flex-1"
            />
            <Button size="icon" onClick={addBannedTerm} disabled={!newTerm.trim()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {bannedTerms.length > 0 ? (
            <div className="flex gap-2 flex-wrap">
              {bannedTerms.map(term => (
                <Badge key={term} variant="secondary" className="gap-1 pr-1">
                  {term}
                  <button onClick={() => removeBannedTerm(term)} className="ml-1 hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum termo banido configurado.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Padrões de Exportação</CardTitle>
          <CardDescription>Layout e container padrão para exportação</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Layout</label>
              <Select value={settings.default_export_layout} onValueChange={v => updateSettings({ default_export_layout: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="split">Split</SelectItem>
                  <SelectItem value="unified">Unificado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Container</label>
              <Select value={settings.default_export_container} onValueChange={v => updateSettings({ default_export_container: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="zip">ZIP</SelectItem>
                  <SelectItem value="flat">Flat</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
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
          {activityLog.length > 0 ? (
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {activityLog.map(entry => (
                  <div key={entry.id} className="flex items-start gap-3 p-2 rounded-md bg-muted/30 text-xs">
                    <span className="text-muted-foreground/50 font-mono shrink-0 mt-0.5">
                      {new Date(entry.timestamp).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <div>
                      <span className="font-medium">{entry.action}</span>
                      <span className="text-muted-foreground ml-1.5">{entry.details}</span>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma atividade registrada.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
