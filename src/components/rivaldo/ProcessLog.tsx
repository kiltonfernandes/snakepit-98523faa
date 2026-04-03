import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { LogEntry } from '@/lib/audio/types';

interface ProcessLogProps {
  logs: LogEntry[];
}

export function ProcessLog({ logs }: ProcessLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [logs]);

  const typeColors: Record<LogEntry['type'], string> = {
    info: 'text-muted-foreground',
    success: 'text-primary',
    error: 'text-destructive',
    step: 'text-foreground',
  };

  const typePrefix: Record<LogEntry['type'], string> = {
    info: '  ℹ',
    success: '  ✓',
    error: '  ✗',
    step: '  ▶',
  };

  return (
    <div
      ref={scrollRef}
      className="bg-card rounded-lg p-4 font-mono text-xs max-h-48 overflow-y-auto"
      style={{ boxShadow: 'inset 0 2px 8px hsl(220 15% 0% / 0.4)' }}
    >
      {logs.length === 0 ? (
        <p className="text-muted-foreground">$ aguardando processamento...</p>
      ) : (
        logs.map((entry, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.15 }}
            className={`${typeColors[entry.type]} leading-relaxed`}
          >
            <span className="text-muted-foreground/50 mr-2 select-none">{typePrefix[entry.type]}</span>
            {entry.message}
          </motion.div>
        ))
      )}
    </div>
  );
}
