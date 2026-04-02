import { useState } from 'react';
import { Settings as SettingsIcon, Thermometer, Ban, Activity, Plus, X, Trash2 } from 'lucide-react';
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

  const addBannedTerm = () => {
    if (!newTerm.trim() || settings.bannedTerms.includes(newTerm.trim())) return;
    updateSettings({ bannedTerms: [...settings.bannedTerms, newTerm.trim()] });
    setNewTerm('');
  };

  const removeBannedTerm = (term: string) => {
    updateSettings({ bannedTerms: settings.bannedTerms.filter(t => t !== term) });
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <SettingsIcon className="h-6 w-6 text-primary" />
          Configurações
        </h1>
        <p className="text-muted-foreground mt-1">Preferências da workstation</p>
      </div>

      {/* Tone Lab */}
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
              <span className="font-mono text-muted-foreground">{settings.toneTemperature.toFixed(2)}</span>
            </div>
            <Slider
              value={[settings.toneTemperature * 100]}
              max={100}
              step={1}
              onValueChange={([v]) => updateSettings({ toneTemperature: v / 100 })}
            />
          </div>
          <div className="flex gap-2 text-xs text-muted-foreground">
            <span>Conservador</span>
            <span className="ml-auto">Criativo</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {[
              { label: 'Técnico', value: 0.3 },
              { label: 'Equilibrado', value: 0.5 },
              { label: 'Heavynauta', value: 0.7 },
              { label: 'Caótico', value: 0.9 },
            ].map(preset => (
              <Button
                key={preset.label}
                variant={Math.abs(settings.toneTemperature - preset.value) < 0.05 ? 'default' : 'outline'}
                size="sm"
                className="text-xs"
                onClick={() => updateSettings({ toneTemperature: preset.value })}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Banned Terms */}
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
          {settings.bannedTerms.length > 0 ? (
            <div className="flex gap-2 flex-wrap">
              {settings.bannedTerms.map(term => (
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

      {/* Export Defaults */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Padrões de Exportação</CardTitle>
          <CardDescription>Configurações padrão para exportação de áudio</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Formato</label>
              <Select value={settings.exportDefaults.format} onValueChange={v => updateSettings({ exportDefaults: { ...settings.exportDefaults, format: v as 'mp3' | 'wav' } })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mp3">MP3</SelectItem>
                  <SelectItem value="wav">WAV</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Bitrate</label>
              <Select value={String(settings.exportDefaults.bitrate)} onValueChange={v => updateSettings({ exportDefaults: { ...settings.exportDefaults, bitrate: Number(v) } })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="128">128 kbps</SelectItem>
                  <SelectItem value="192">192 kbps</SelectItem>
                  <SelectItem value="256">256 kbps</SelectItem>
                  <SelectItem value="320">320 kbps</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Activity Log */}
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
