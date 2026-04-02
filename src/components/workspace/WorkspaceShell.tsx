import { DAY_SLOTS } from '@/lib/constants';
import { DayColumn } from './DayColumn';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

interface WorkspaceShellProps {
  weekLabel: string;
  renderDay: (daySlot: typeof DAY_SLOTS[number]) => React.ReactNode;
  actions?: React.ReactNode;
}

export function WorkspaceShell({ weekLabel, renderDay, actions }: WorkspaceShellProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{weekLabel}</h2>
          <p className="text-sm text-muted-foreground">Workspace Semanal</p>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>

      <ScrollArea className="w-full">
        <div className="flex gap-4 pb-4">
          {DAY_SLOTS.map((day) => (
            <DayColumn key={day.key} label={day.label} shortLabel={day.short}>
              {renderDay(day)}
            </DayColumn>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
