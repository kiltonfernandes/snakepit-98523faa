import { Check, CloudOff, Loader2, CloudUpload } from 'lucide-react';
import { useAutosaveStatus } from '@/hooks/use-autosave-status';
import { cn } from '@/lib/utils';

/**
 * Small inline badge that reports the global autosave queue state.
 * Lives in headers of Pautas/Materiais so the user always knows whether
 * their last edit landed.
 */
export function AutosaveBadge({ className }: { className?: string }) {
  const { status } = useAutosaveStatus();
  const map = {
    idle:   { icon: Check,        label: 'Sincronizado', cls: 'text-muted-foreground' },
    dirty:  { icon: CloudUpload,  label: 'Alterações pendentes', cls: 'text-foreground' },
    saving: { icon: Loader2,      label: 'Salvando…', cls: 'text-primary' },
    saved:  { icon: Check,        label: 'Salvo', cls: 'text-primary' },
    error:  { icon: CloudOff,     label: 'Falha — tentando novamente', cls: 'text-destructive' },
  } as const;
  const cfg = map[status];
  const Icon = cfg.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-medium select-none',
        cfg.cls,
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <Icon className={cn('h-3.5 w-3.5', status === 'saving' && 'animate-spin')} />
      {cfg.label}
    </span>
  );
}