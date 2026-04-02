import { Mic, Upload, Sliders, Play } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';

const dspParams = [
  { label: 'Denoise', value: 70 },
  { label: 'De-Reverb', value: 50 },
  { label: 'Breath Reduction', value: 40 },
  { label: 'De-Esser', value: 60 },
  { label: 'EQ Warmth', value: 55 },
  { label: 'Loudness (LUFS)', value: 75 },
];

export default function Rivaldo() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Mic className="h-6 w-6 text-primary" />
          Rivaldo
        </h1>
        <p className="text-muted-foreground mt-1">Engine de produção de áudio</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Upload className="h-4 w-4" /> Upload de Áudio
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center h-40 rounded-lg border-2 border-dashed border-border hover:border-primary/50 transition-colors cursor-pointer">
                <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">Arraste o áudio bruto ou clique para selecionar</p>
                <p className="text-xs text-muted-foreground mt-1">WAV, MP3, FLAC • Max 500MB</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Play className="h-4 w-4" /> Pipeline de Processamento
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center h-24 text-muted-foreground text-sm">
                Aguardando upload de áudio para iniciar pipeline
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Sliders className="h-4 w-4" /> Parâmetros DSP
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {dspParams.map((param) => (
              <div key={param.label} className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{param.label}</span>
                  <span className="font-mono text-muted-foreground">{param.value}%</span>
                </div>
                <Slider defaultValue={[param.value]} max={100} step={1} className="w-full" />
              </div>
            ))}
            <Button className="w-full mt-4" disabled>
              Processar Áudio
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
