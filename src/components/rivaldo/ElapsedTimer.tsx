import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Timer } from 'lucide-react';

interface ElapsedTimerProps {
  isRunning: boolean;
  label?: string;
}

function formatTime(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  const tenths = Math.floor((ms % 1000) / 100);
  if (mins > 0) {
    return `${mins}:${secs.toString().padStart(2, '0')}.${tenths}`;
  }
  return `${secs}.${tenths}s`;
}

export function ElapsedTimer({ isRunning, label }: ElapsedTimerProps) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number>(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (isRunning) {
      startRef.current = performance.now();
      setElapsed(0);
      const tick = () => {
        setElapsed(performance.now() - startRef.current);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(rafRef.current);
    }
  }, [isRunning]);

  if (!isRunning && elapsed === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3"
    >
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10">
        {isRunning ? (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
          >
            <Timer className="w-4 h-4 text-primary" />
          </motion.div>
        ) : (
          <Timer className="w-4 h-4 text-primary" />
        )}
      </div>
      <div className="flex flex-col">
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          {label || (isRunning ? 'Tempo decorrido' : 'Tempo total')}
        </span>
        <span className="text-lg font-mono font-semibold text-foreground tabular-nums">
          {formatTime(elapsed)}
        </span>
      </div>
      {isRunning && (
        <motion.div
          animate={{ opacity: [1, 0.3] }}
          transition={{ repeat: Infinity, duration: 1, ease: 'easeInOut' }}
          className="ml-auto w-2 h-2 rounded-full bg-primary"
        />
      )}
    </motion.div>
  );
}
