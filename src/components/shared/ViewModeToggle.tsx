import { LayoutGrid, Table as TableIcon } from 'lucide-react';
import type { ViewMode } from '@/hooks/use-view-mode';
import { cn } from '@/lib/utils';

interface Props {
  mode: ViewMode;
  onChange: (m: ViewMode) => void;
  className?: string;
}

/**
 * Compact two-icon segmented control: table on the left, cards on the right.
 * Uses semantic tokens only.
 */
export function ViewModeToggle({ mode, onChange, className }: Props) {
  return (
    <div
      role="tablist"
      aria-label="Modo de visualização"
      className={cn(
        'inline-flex items-center gap-0.5 rounded-md border border-border bg-card p-0.5',
        className,
      )}
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'table'}
        onClick={() => onChange('table')}
        title="Visão tabular"
        className={cn(
          'p-1.5 rounded-sm transition-colors',
          mode === 'table'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <TableIcon className="h-4 w-4" />
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'cards'}
        onClick={() => onChange('cards')}
        title="Visão em cartões"
        className={cn(
          'p-1.5 rounded-sm transition-colors',
          mode === 'cards'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <LayoutGrid className="h-4 w-4" />
      </button>
    </div>
  );
}