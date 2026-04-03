import { DAY_SLOTS } from '@/lib/constants';
import { DayColumn } from './DayColumn';
import { DaySlot } from '@/lib/types';

interface WorkspaceShellProps {
  weekLabel: string;
  renderDay: (daySlot: typeof DAY_SLOTS[number]) => React.ReactNode;
  actions?: React.ReactNode;
  excludeDays?: DaySlot[];
}

export function WorkspaceShell({ weekLabel, renderDay, actions, excludeDays }: WorkspaceShellProps) {
  const visibleDays = excludeDays
    ? DAY_SLOTS.filter(d => !excludeDays.includes(d.key))
    : DAY_SLOTS;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{weekLabel}</h2>
          <p className="text-sm text-muted-foreground">Workspace Semanal</p>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-4">
        {visibleDays.map((day) => (
          <DayColumn key={day.key} label={day.label} shortLabel={day.short}>
            {renderDay(day)}
          </DayColumn>
        ))}
      </div>
    </div>
  );
}
