import { useEffect, useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Check, Loader2, AlertCircle, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export type GenerationItemStatus = 'pending' | 'generating' | 'done' | 'error';

export interface GenerationItem {
  id: string;
  label: string;
  status: GenerationItemStatus;
  error?: string;
}

interface GenerationProgressModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  items: GenerationItem[];
  logs?: string[];
}

export function GenerationProgressModal({ open, onOpenChange, title = 'Gerando conteúdo...', items, logs = [] }: GenerationProgressModalProps) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const isRunning = items.some(i => i.status === 'generating' || i.status === 'pending');
  const doneCount = items.filter(i => i.status === 'done').length;
  const errorCount = items.filter(i => i.status === 'error').length;
  const progressPct = items.length > 0 ? Math.round(((doneCount + errorCount) / items.length) * 100) : 0;

  useEffect(() => {
    if (!open || !isRunning) { startRef.current = null; return; }
    if (!startRef.current) startRef.current = Date.now();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - (startRef.current || Date.now())) / 1000));
    }, 500);
    return () => clearInterval(interval);
  }, [open, isRunning]);

  useEffect(() => {
    if (open && !isRunning) startRef.current = null;
    if (!open) { setElapsed(0); startRef.current = null; }
  }, [open, isRunning]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length]);

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  const StatusIcon = ({ status }: { status: GenerationItemStatus }) => {
    switch (status) {
      case 'done': return <Check className="h-3.5 w-3.5 text-emerald-400" />;
      case 'generating': return <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />;
      case 'error': return <AlertCircle className="h-3.5 w-3.5 text-destructive" />;
      default: return <Clock className="h-3.5 w-3.5 text-muted-foreground/40" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={isRunning ? undefined : onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm">{title}</DialogTitle>
          <DialogDescription className="sr-only">Progresso da geração</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Progress value={progressPct} className="flex-1 h-2" />
            <span className="text-xs font-mono text-muted-foreground w-10 text-right">{progressPct}%</span>
          </div>

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="font-mono">{formatTime(elapsed)}</span>
            <span className="flex-1" />
            <Badge variant="secondary" className="text-[10px]">{doneCount}/{items.length} concluídos</Badge>
            {errorCount > 0 && <Badge variant="destructive" className="text-[10px]">{errorCount} erros</Badge>}
          </div>

          <ScrollArea className="max-h-[240px]">
            <div className="space-y-1">
              <AnimatePresence>
                {items.map(item => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs transition-colors ${
                      item.status === 'generating' ? 'bg-primary/10 border border-primary/20' :
                      item.status === 'done' ? 'bg-muted/20' :
                      item.status === 'error' ? 'bg-destructive/10 border border-destructive/20' :
                      'bg-transparent'
                    }`}
                  >
                    <StatusIcon status={item.status} />
                    <span className={`flex-1 truncate ${item.status === 'done' ? 'text-muted-foreground' : 'text-foreground'}`}>{item.label}</span>
                    {item.error && <span className="text-[10px] text-destructive truncate max-w-[120px]">{item.error}</span>}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </ScrollArea>

          {logs.length > 0 && (
            <div className="border-t border-border pt-3">
              <p className="text-[10px] font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Log</p>
              <ScrollArea className="max-h-[100px]">
                <div className="space-y-0.5 font-mono text-[10px] text-muted-foreground/70">
                  {logs.map((log, i) => <div key={i}>{log}</div>)}
                  <div ref={logsEndRef} />
                </div>
              </ScrollArea>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
