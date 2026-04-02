import { useState, useRef, useCallback } from 'react';
import { Mic, Upload, Sliders, Play, Pause, Square, Zap, FileAudio, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useApp } from '@/contexts/AppContext';

interface DspParams {
  denoise: number;
  dereverb: number;
  breathReduction: number;
  deEsser: number;
  eqWarmth: number;
  loudness: number;
}

interface LogEntry {
  time: string;
  message: string;
  type: 'info' | 'success' | 'error';
}

const PIPELINE_STEPS = [
  { key: 'upload', label: 'Upload' },
  { key: 'denoise', label: 'Denoise' },
  { key: 'dereverb', label: 'De-Reverb' },
  { key: 'breath', label: 'Breath Reduction' },
  { key: 'deesser', label: 'De-Esser' },
  { key: 'eq', label: 'EQ & Compress' },
  { key: 'loudness', label: 'Loudness' },
  { key: 'export', label: 'Export MP3' },
];

export default function Rivaldo() {
  const { logActivity } = useApp();
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [stepProgress, setStepProgress] = useState(0);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [params, setParams] = useState<DspParams>({
    denoise: 70, dereverb: 50, breathReduction: 40, deEsser: 60, eqWarmth: 55, loudness: 75,
  });

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), message, type }]);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAudioFile(file);
    setAudioUrl(URL.createObjectURL(file));
    setProcessedUrl(null);
    setLogs([]);
    setCurrentStep(-1);
    addLog(`Arquivo carregado: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
  };

  const simulateProcess = async () => {
    if (!audioFile) return;
    setProcessing(true);
    setLogs([]);
    addLog('Iniciando pipeline de processamento...');

    for (let i = 0; i < PIPELINE_STEPS.length; i++) {
      setCurrentStep(i);
      addLog(`[${i + 1}/${PIPELINE_STEPS.length}] ${PIPELINE_STEPS[i].label}...`);

      for (let p = 0; p <= 100; p += 10) {
        setStepProgress(p);
        await new Promise(r => setTimeout(r, 80));
      }

      addLog(`✓ ${PIPELINE_STEPS[i].label} concluído`, 'success');
    }

    setProcessedUrl(audioUrl);
    setProcessing(false);
    setCurrentStep(PIPELINE_STEPS.length);
    addLog('Pipeline concluído com sucesso!', 'success');
    logActivity('Áudio processado', audioFile.name);
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); } else { audioRef.current.play(); }
    setPlaying(!playing);
  };

  const downloadProcessed = () => {
    if (!processedUrl || !audioFile) return;
    const a = document.createElement('a');
    a.href = processedUrl;
    a.download = `rivaldo_${audioFile.name}`;
    a.click();
  };

  const overallProgress = currentStep < 0 ? 0 : currentStep >= PIPELINE_STEPS.length ? 100 : Math.round(((currentStep + stepProgress / 100) / PIPELINE_STEPS.length) * 100);

  const paramDefs = [
    { key: 'denoise' as const, label: 'Denoise' },
    { key: 'dereverb' as const, label: 'De-Reverb' },
    { key: 'breathReduction' as const, label: 'Breath Reduction' },
    { key: 'deEsser' as const, label: 'De-Esser' },
    { key: 'eqWarmth' as const, label: 'EQ Warmth' },
    { key: 'loudness' as const, label: 'Loudness (LUFS)' },
  ];

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
          {/* Upload */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Upload className="h-4 w-4" /> Upload de Áudio
              </CardTitle>
            </CardHeader>
            <CardContent>
              <input ref={inputRef} type="file" accept="audio/*" className="hidden" onChange={handleFileSelect} />
              {audioFile ? (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <FileAudio className="h-8 w-8 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{audioFile.name}</p>
                    <p className="text-xs text-muted-foreground">{(audioFile.size / 1024 / 1024).toFixed(1)} MB</p>
                  </div>
                  <div className="flex gap-2">
                    {audioUrl && (
                      <Button variant="outline" size="icon" className="h-8 w-8" onClick={togglePlay}>
                        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>Trocar</Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-40 rounded-lg border-2 border-dashed border-border hover:border-primary/50 transition-colors cursor-pointer" onClick={() => inputRef.current?.click()}>
                  <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">Arraste o áudio bruto ou clique para selecionar</p>
                  <p className="text-xs text-muted-foreground mt-1">WAV, MP3, FLAC • Max 500MB</p>
                </div>
              )}
              {audioUrl && <audio ref={audioRef} src={audioUrl} onEnded={() => setPlaying(false)} />}
            </CardContent>
          </Card>

          {/* Pipeline */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="h-4 w-4" /> Pipeline de Processamento
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Step indicators */}
              <div className="grid grid-cols-4 gap-2">
                {PIPELINE_STEPS.map((step, i) => (
                  <div key={step.key} className={`flex items-center gap-1.5 p-2 rounded-md text-xs ${
                    i < currentStep ? 'bg-green-500/10 text-green-400' :
                    i === currentStep && processing ? 'bg-primary/10 text-primary' :
                    'bg-muted/50 text-muted-foreground'
                  }`}>
                    {i < currentStep ? <CheckCircle className="h-3 w-3 shrink-0" /> :
                     i === currentStep && processing ? <Loader2 className="h-3 w-3 shrink-0 animate-spin" /> :
                     <span className="h-3 w-3 shrink-0 rounded-full border border-current" />}
                    <span className="truncate">{step.label}</span>
                  </div>
                ))}
              </div>

              {/* Overall progress */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Progresso geral</span>
                  <span className="font-mono text-muted-foreground">{overallProgress}%</span>
                </div>
                <Progress value={overallProgress} className="h-2" />
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button className="flex-1" onClick={simulateProcess} disabled={!audioFile || processing}>
                  {processing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processando...</> : 'Processar Áudio'}
                </Button>
                {processedUrl && (
                  <Button variant="outline" onClick={downloadProcessed}>
                    <FileAudio className="h-4 w-4 mr-2" /> Download
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Process Log */}
          {logs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Log de Processamento</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[200px]">
                  <div className="space-y-1 font-mono text-xs">
                    {logs.map((log, i) => (
                      <div key={i} className={`flex gap-2 ${
                        log.type === 'success' ? 'text-green-400' : log.type === 'error' ? 'text-destructive' : 'text-muted-foreground'
                      }`}>
                        <span className="text-muted-foreground/50 shrink-0">{log.time}</span>
                        <span>{log.message}</span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </div>

        {/* DSP Parameters */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Sliders className="h-4 w-4" /> Parâmetros DSP
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {paramDefs.map(p => (
              <div key={p.key} className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{p.label}</span>
                  <span className="font-mono text-muted-foreground">{params[p.key]}%</span>
                </div>
                <Slider value={[params[p.key]]} max={100} step={1} onValueChange={([v]) => setParams(prev => ({ ...prev, [p.key]: v }))} className="w-full" />
              </div>
            ))}
            <Button className="w-full mt-4" onClick={simulateProcess} disabled={!audioFile || processing}>
              {processing ? 'Processando...' : 'Processar Áudio'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
