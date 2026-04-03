import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { PIPELINE_STEPS } from '@/lib/audio/types';

interface GranularProgressProps {
  progress: number;
  label: string;
  isRunning: boolean;
}

export function GranularProgress({ progress, label, isRunning }: GranularProgressProps) {
  if (!isRunning && progress === 0) return null;

  const currentStepIdx = PIPELINE_STEPS.findIndex(
    s => progress >= s.startPct && progress < s.endPct
  );
  const activeStep = currentStepIdx >= 0 ? PIPELINE_STEPS[currentStepIdx] : null;

  return (
    <div className="space-y-3">
      <div className="relative">
        <div className="h-3 w-full rounded-full bg-secondary overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-primary via-primary to-primary/80"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          />
          {isRunning && progress < 100 && (
            <motion.div
              className="absolute top-0 h-3 w-16 rounded-full bg-gradient-to-r from-transparent via-primary-foreground/20 to-transparent"
              animate={{ left: ['-4rem', '100%'] }}
              transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
            />
          )}
        </div>

        <div className="absolute -top-1 right-0 -translate-y-full">
          <span className="text-xs font-mono font-bold text-primary tabular-nums">
            {Math.round(progress)}%
          </span>
        </div>
      </div>

      <div className="flex gap-1">
        {PIPELINE_STEPS.map((step) => {
          const isDone = progress >= step.endPct;
          const isActive = activeStep?.id === step.id;

          return (
            <div key={step.id} className="flex-1 flex flex-col gap-1">
              <div className="relative h-1.5 rounded-full overflow-hidden bg-secondary/50">
                {isDone ? (
                  <div className="h-full w-full rounded-full bg-primary" />
                ) : isActive ? (
                  <motion.div
                    className="h-full rounded-full bg-primary/70"
                    initial={{ width: 0 }}
                    animate={{
                      width: `${((progress - step.startPct) / (step.endPct - step.startPct)) * 100}%`
                    }}
                    transition={{ duration: 0.2 }}
                  />
                ) : null}
              </div>
              <span
                className={`text-[8px] font-mono leading-none truncate transition-colors ${
                  isDone
                    ? 'text-primary'
                    : isActive
                    ? 'text-foreground font-semibold'
                    : 'text-muted-foreground/50'
                }`}
                title={step.label}
              >
                {isDone ? (
                  <span className="flex items-center gap-0.5">
                    <Check className="w-2 h-2" />
                    {step.label}
                  </span>
                ) : (
                  step.label
                )}
              </span>
            </div>
          );
        })}
      </div>

      {label && (
        <p className="text-[10px] font-mono text-muted-foreground truncate">
          {isRunning && progress < 100 ? '⏳ ' : progress >= 100 ? '✓ ' : ''}{label}
        </p>
      )}
    </div>
  );
}
