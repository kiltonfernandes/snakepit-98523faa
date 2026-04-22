import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RotateCcw, Sparkles, ChevronDown, Volume2, Scissors, AudioWaveform, Mic, Settings2 } from 'lucide-react';
import { AudioParams, DEFAULT_PARAMS, DEFAULT_PROCESSING_PROFILE, ProcessingProfile } from '@/lib/audio/types';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { HeavynautaBrand } from '@/components/rivaldo/HeavynautaBrand';
import { PresetManager } from '@/components/rivaldo/PresetManager';
import { cn } from '@/lib/utils';

interface ParametersSidebarProps {
  params: AudioParams;
  onParamsChange: (params: AudioParams) => void;
  profile: ProcessingProfile;
  onProfileChange: (profile: ProcessingProfile) => void;
}

function SliderField({
  label, value, min, max, step, onChange, unit,
}: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (value: number) => void; unit?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground truncate">{label}</span>
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={value}
            min={min}
            max={max}
            step={step}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!isNaN(v) && v >= min && v <= max) onChange(v);
            }}
            className="w-14 h-5 text-[10px] font-mono text-right bg-muted border border-border rounded px-1 text-foreground"
          />
          {unit && <span className="text-[9px] text-muted-foreground w-6">{unit}</span>}
        </div>
      </div>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1 accent-primary cursor-pointer"
      />
    </div>
  );
}

function Section({
  title, icon: Icon, children, defaultOpen = false,
}: {
  title: string; icon: React.ElementType; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-border/50 pt-3">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 text-left group"
      >
        <Icon className="w-3.5 h-3.5 text-primary/70 shrink-0" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground flex-1">{title}</span>
        <ChevronDown className={cn("w-3 h-3 text-muted-foreground transition-transform", !open && "-rotate-90")} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-2.5 pt-2.5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SegmentedControl<T extends string>({
  options, value, onChange,
}: {
  options: { key: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-md border border-border overflow-hidden">
      {options.map(opt => (
        <button
          key={opt.key}
          onClick={() => onChange(opt.key)}
          className={cn(
            "flex-1 px-2 py-1 text-[10px] font-mono transition-colors",
            value === opt.key
              ? "bg-primary text-primary-foreground"
              : "bg-muted/50 text-muted-foreground hover:bg-muted"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function ParametersSidebar({ params, onParamsChange, profile, onProfileChange }: ParametersSidebarProps) {
  const reset = () => {
    onParamsChange({ ...DEFAULT_PARAMS });
    onProfileChange({ ...DEFAULT_PROCESSING_PROFILE });
  };

  return (
    <motion.aside
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="bg-card rounded-lg overflow-hidden"
      style={{ boxShadow: '0 4px 20px -4px hsl(220 15% 0% / 0.5)' }}
    >
      {/* Header */}
      <div className="p-4 pb-3 space-y-3">
        <HeavynautaBrand />
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[10px] font-mono uppercase tracking-[0.15em] text-primary">Rivaldo 3.2</h2>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={reset} title="Restaurar padrões">
            <RotateCcw className="w-3 h-3" />
          </Button>
        </div>

        {/* Preset manager */}
        <PresetManager
          currentParams={params}
          currentProfile={profile}
          onApplyPreset={(p, pr) => {
            onParamsChange(p);
            onProfileChange(pr);
          }}
        />

        {/* Auto Enhance toggle */}
        <div className="rounded-md border border-primary/20 bg-primary/5 p-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span className="text-[11px] font-medium">
              {profile.uiMode === 'auto' ? 'Auto' : 'Avançado'}
            </span>
          </div>
          <Switch
            checked={profile.uiMode === 'advanced'}
            onCheckedChange={(checked) => onProfileChange({ ...profile, uiMode: checked ? 'advanced' : 'auto' })}
          />
        </div>
      </div>

      {/* Scrollable parameters */}
      <div className="px-4 pb-4 space-y-1 max-h-[calc(100vh-280px)] overflow-y-auto scrollbar-thin">

        <Section title="Corte de Silêncio" icon={Scissors}>
          <SliderField label="Threshold" value={params.silenceThresholdDb} min={-40} max={-10} step={1}
            onChange={(v) => onParamsChange({ ...params, silenceThresholdDb: v })} unit="dB" />
          <SliderField label="Pausa máxima" value={params.maxPause} min={0.5} max={6} step={0.1}
            onChange={(v) => onParamsChange({ ...params, maxPause: v })} unit="s" />
          <SliderField label="Alvo após corte" value={params.silenceCutTarget} min={0.2} max={2} step={0.1}
            onChange={(v) => onParamsChange({ ...params, silenceCutTarget: v })} unit="s" />
          <SliderField label="Buffer" value={params.silenceCutBufferMs} min={0} max={500} step={10}
            onChange={(v) => onParamsChange({ ...params, silenceCutBufferMs: v })} unit="ms" />
        </Section>

        <Section title="Auto-Duck & BGM" icon={Volume2}>
          <SliderField label="Redução" value={params.duckReductionDb} min={-30} max={-6} step={1}
            onChange={(v) => onParamsChange({ ...params, duckReductionDb: v })} unit="dB" />
          <SliderField label="Fade down" value={params.fadeDownDuration} min={0.1} max={3} step={0.01}
            onChange={(v) => onParamsChange({ ...params, fadeDownDuration: v })} unit="s" />
          <SliderField label="Fade up" value={params.fadeUpDuration} min={0.05} max={2} step={0.01}
            onChange={(v) => onParamsChange({ ...params, fadeUpDuration: v })} unit="s" />
          <SliderField label="Hold após fala" value={params.duckHoldDuration} min={0} max={2} step={0.05}
            onChange={(v) => onParamsChange({ ...params, duckHoldDuration: v })} unit="s" />
          <SliderField label="BGM tail" value={params.bgmTailAfterMaster} min={0} max={30} step={1}
            onChange={(v) => onParamsChange({ ...params, bgmTailAfterMaster: v })} unit="s" />

          <div className="pt-1 border-t border-border/30">
            <p className="text-[9px] text-muted-foreground/70 mb-2">Silêncio pré/pós master — BGM toca sozinha</p>
            <SliderField label="BGM pré-master" value={params.bgmPreMasterSilence} min={0} max={20} step={0.5}
              onChange={(v) => onParamsChange({ ...params, bgmPreMasterSilence: v })} unit="s" />
            <SliderField label="BGM pós-master" value={params.bgmPostMasterSilence} min={0} max={30} step={0.5}
              onChange={(v) => onParamsChange({ ...params, bgmPostMasterSilence: v })} unit="s" />
          </div>
        </Section>

        <Section title="Limpeza de Voz" icon={Mic}>
          <SliderField label="Denoise" value={profile.cleanup.denoiseAmount} min={0} max={100} step={1}
            onChange={(v) => onProfileChange({ ...profile, cleanup: { ...profile.cleanup, denoiseAmount: v } })} />
          <SliderField label="Redução de respiração" value={profile.cleanup.breathReductionAmount} min={0} max={100} step={1}
            onChange={(v) => onProfileChange({ ...profile, cleanup: { ...profile.cleanup, breathReductionAmount: v } })} />

          <div className="space-y-1.5">
            <span className="text-[11px] text-muted-foreground">Dereverb WPE</span>
            <SegmentedControl
              options={[{ key: 'off' as const, label: 'Off' }, { key: 'auto' as const, label: 'Auto' }, { key: 'strong' as const, label: 'Strong' }]}
              value={profile.dereverb.mode}
              onChange={(mode) => onProfileChange({ ...profile, dereverb: { ...profile.dereverb, mode } })}
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">Smart mute</span>
            <Switch
              checked={profile.cleanup.smartMute}
              onCheckedChange={(checked) => onProfileChange({ ...profile, cleanup: { ...profile.cleanup, smartMute: checked } })}
            />
          </div>
        </Section>

        <Section title="Export" icon={AudioWaveform} defaultOpen={false}>
          <div className="space-y-1.5">
            <span className="text-[11px] text-muted-foreground">Bitrate</span>
            <SegmentedControl
              options={[{ key: '128', label: '128' }, { key: '192', label: '192' }, { key: '256', label: '256' }, { key: '320', label: '320' }]}
              value={String(params.outputBitrate)}
              onChange={(v) => onParamsChange({ ...params, outputBitrate: parseInt(v) })}
            />
            <p className="text-[9px] text-muted-foreground/70">kbps — maior = melhor qualidade</p>
          </div>
        </Section>

        {profile.uiMode === 'advanced' && (
          <Section title="Avançado" icon={Settings2} defaultOpen={false}>
            <SliderField label="De-esser" value={profile.tone.deEsserAmount} min={0} max={100} step={1}
              onChange={(v) => onProfileChange({ ...profile, tone: { ...profile.tone, deEsserAmount: v } })} />
            <SliderField label="De-plosive" value={profile.tone.dePlosiveAmount} min={0} max={100} step={1}
              onChange={(v) => onProfileChange({ ...profile, tone: { ...profile.tone, dePlosiveAmount: v } })} />
            <SliderField label="Track LUFS" value={params.trackTargetLufs} min={-24} max={-14} step={0.5}
              onChange={(v) => onParamsChange({ ...params, trackTargetLufs: v })} unit="LUFS" />
            <SliderField label="Master LUFS" value={params.masterTargetLufs} min={-20} max={-12} step={0.5}
              onChange={(v) => onParamsChange({ ...params, masterTargetLufs: v })} unit="LUFS" />

            <div className="space-y-1.5">
              <span className="text-[11px] text-muted-foreground">EQ Preset</span>
              <SegmentedControl
                options={[{ key: 'natural' as const, label: 'Natural' }, { key: 'podcast' as const, label: 'Podcast' }, { key: 'bright' as const, label: 'Bright' }]}
                value={profile.tone.eqPreset}
                onChange={(preset) => onProfileChange({ ...profile, tone: { ...profile.tone, eqPreset: preset as any } })}
              />
            </div>
          </Section>
        )}
      </div>
    </motion.aside>
  );
}
