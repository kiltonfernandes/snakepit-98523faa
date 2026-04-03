import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface DayColumnProps {
  label: string;
  shortLabel: string;
  children?: React.ReactNode;
  className?: string;
  isActive?: boolean;
}

export function DayColumn({ label, shortLabel, children, className, isActive }: DayColumnProps) {
  return (
    <Card className={cn(
      'flex-1 transition-colors',
      isActive && 'border-primary/50 shadow-lg shadow-primary/5',
      className
    )}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary">
            {shortLabel}
          </span>
          <span className="hidden sm:inline">{label}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {children || (
          <p className="text-xs text-muted-foreground italic">Sem conteúdo</p>
        )}
      </CardContent>
    </Card>
  );
}
