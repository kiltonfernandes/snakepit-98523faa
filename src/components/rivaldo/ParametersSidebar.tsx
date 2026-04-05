import { motion } from 'framer-motion';
import { RotateCcw, Sparkles } from 'lucide-react';
import { AudioParams, DEFAULT_PARAMS, DEFAULT_PROCESSING_PROFILE, ProcessingProfile } from '@/lib/audio/types';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { HeavynautaBrand } from '@/components/rivaldo/HeavynautaBrand';

interface ParametersSidebarProps {
  params: AudioParams;
  onParamsChange: (params: AudioParams) => void;
  profile: ProcessingProfile;
  onProfileChange: (profile: ProcessingProfile) => void;
}

function sliderField(
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  onChange: (value: number) => void,
  unit?: string
) {
  return (
    <div className="space-y-1.5">
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
          {unit && <span className="text-[9px] text-muted-foreground">{unit}</span>}
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
      className="bg-card rounded-lg p-5 space-y-5"
      style={{ boxShadow: '0 4px 20px -4px hsl(220 15% 0% / 0.5)' }}
    >
      <HeavynautaBrand />

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xs font-mono uppercase tracking-[0.2em] text-primary">Rivaldo by Heavynauta 3.2.0</h2>
          <p className="text-[11px] text-muted-foreground mt-1">Desktop-only, com bandeja, fila local e render focado em qualidade.</p>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={reset} title="Restaurar padroes">
          <RotateCcw className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-xs font-medium">Auto Enhance</span>
          </div>
          <Switch
            checked={profile.uiMode === 'advanced'}
            onCheckedChange={(checked) => onProfileChange({ ...profile, uiMode: checked ? 'advanced' : 'auto' })}
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          {profile.uiMode === 'auto'
            ? 'Modo automatico com decisoes seguras por trilha.'
            : 'Modo avancado com controle de denoise, WPE, voz e loudness.'}
        </p>
      </div>

      {/* Silence cutting */}
      <div className="space-y-3">
        <span className="text-[11px] font-medium text-foreground uppercase tracking-wider">Corte de Silêncio</span>
        {sliderField('Threshold (dB)', params.silenceThresholdDb, -40, -10, 1, (value) =>
          onParamsChange({ ...params, silenceThresholdDb: value }), 'dB'
        )}
        {sliderField('Silêncio máximo (s)', params.maxPause, 0.5, 6, 0.1, (value) =>
          onParamsChange({ ...params, maxPause: value }), 's'
        )}
        {sliderField('Duração alvo após corte (s)', params.silenceCutTarget, 0.2, 2, 0.1, (value) =>
          onParamsChange({ ...params, silenceCutTarget: value }), 's'
        )}
        {sliderField('Buffer antes/depois (ms)', params.silenceCutBufferMs, 0, 500, 10, (value) =>
          onParamsChange({ ...params, silenceCutBufferMs: value }), 'ms'
        )}
      </div>

      {/* Auto-duck */}
      <div className="space-y-3 border-t border-border pt-4">
        <span className="text-[11px] font-medium text-foreground uppercase tracking-wider">Auto-Duck</span>
        {sliderField('Redução (dB)', params.duckReductionDb, -30, -6, 1, (value) =>
          onParamsChange({ ...params, duckReductionDb: value }), 'dB'
        )}
        {sliderField('Fade down (s)', params.fadeDownDuration, 0.1, 3, 0.01, (value) =>
          onParamsChange({ ...params, fadeDownDuration: value }), 's'
        )}
        {sliderField('Fade up (s)', params.fadeUpDuration, 0.05, 2, 0.01, (value) =>
          onParamsChange({ ...params, fadeUpDuration: value }), 's'
        )}
        {sliderField('BGM tail after master (s)', params.bgmTailAfterMaster, 0, 30, 1, (value) =>
          onParamsChange({ ...params, bgmTailAfterMaster: value }), 's'
        )}
      </div>

      {/* Cleanup */}
      <div className="space-y-3 border-t border-border pt-4">
        <span className="text-[11px] font-medium text-foreground uppercase tracking-wider">Limpeza</span>
        {sliderField('Denoise amount', profile.cleanup.denoiseAmount, 0, 100, 1, (value) =>
          onProfileChange({ ...profile, cleanup: { ...profile.cleanup, denoiseAmount: value } })
        )}
        {sliderField('Breath reduction', profile.cleanup.breathReductionAmount, 0, 100, 1, (value) =>
          onProfileChange({ ...profile, cleanup: { ...profile.cleanup, breathReductionAmount: value } })
        )}
      </div>

      {/* Dereverb & smart mute */}
      <div className="space-y-3 border-t border-border pt-4">
        <div className="space-y-1">
          <span className="text-[11px] text-muted-foreground">Dereverb WPE</span>
          <div className="grid grid-cols-3 gap-1">
            {(['off', 'auto', 'strong'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => onProfileChange({ ...profile, dereverb: { ...profile.dereverb, mode } })}
                className={`rounded px-2 py-1 text-[10px] font-mono transition-colors ${
                  profile.dereverb.mode === mode ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Smart mute</span>
          <Switch
            checked={profile.cleanup.smartMute}
            onCheckedChange={(checked) => onProfileChange({ ...profile, cleanup: { ...profile.cleanup, smartMute: checked } })}
          />
        </div>
      </div>

      {/* Export quality */}
      <div className="space-y-3 border-t border-border pt-4">
        <span className="text-[11px] font-medium text-foreground uppercase tracking-wider">Qualidade do Export</span>
        <div className="grid grid-cols-4 gap-1">
          {[128, 192, 256, 320].map(br => (
            <button
              key={br}
              onClick={() => onParamsChange({ ...params, outputBitrate: br })}
              className={`rounded px-2 py-1.5 text-[10px] font-mono transition-colors ${
                params.outputBitrate === br ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              }`}
            >
              {br}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground">kbps — maior = melhor qualidade, arquivo maior</p>
      </div>

      {profile.uiMode === 'advanced' && (
        <div className="space-y-4 border-t border-border pt-4">
          <div className="space-y-3">
            {sliderField('De-esser', profile.tone.deEsserAmount, 0, 100, 1, (value) =>
              onProfileChange({ ...profile, tone: { ...profile.tone, deEsserAmount: value } })
            )}
            {sliderField('De-plosive', profile.tone.dePlosiveAmount, 0, 100, 1, (value) =>
              onProfileChange({ ...profile, tone: { ...profile.tone, dePlosiveAmount: value } })
            )}
            {sliderField('Track target LUFS', params.trackTargetLufs, -24, -14, 0.5, (value) =>
              onParamsChange({ ...params, trackTargetLufs: value }), 'LUFS'
            )}
            {sliderField('Final target LUFS', params.masterTargetLufs, -20, -12, 0.5, (value) =>
              onParamsChange({ ...params, masterTargetLufs: value }), 'LUFS'
            )}
          </div>

          <div className="space-y-1">
            <span className="text-[11px] text-muted-foreground">EQ preset</span>
            <div className="grid grid-cols-3 gap-1">
              {([
                { key: 'natural', label: 'Natural' },
                { key: 'podcast', label: 'Podcast' },
                { key: 'bright', label: 'Bright' },
              ] as const).map((preset) => (
                <button
                  key={preset.key}
                  onClick={() => onProfileChange({ ...profile, tone: { ...profile.tone, eqPreset: preset.key } })}
                  className={`rounded px-2 py-1 text-[10px] font-mono transition-colors ${
                    profile.tone.eqPreset === preset.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="pt-4 border-t border-border text-[10px] text-muted-foreground/70 font-mono leading-relaxed">
        Desktop-only, com engine em segundo plano, fila local e relatorios por trilha e master para debug e rollback.
      </div>
    </motion.aside>
  );
}
