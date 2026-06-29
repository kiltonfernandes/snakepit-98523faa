import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Hammer, ChevronLeft, ChevronRight, Plus, Newspaper, Star, Trash2, Loader2 } from 'lucide-react';
import {
  addDays, addMonths, addQuarters, addYears, addWeeks,
  startOfDay, startOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear,
  format, isSameDay, isSameMonth, isToday, getQuarter,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type View = 'year' | 'quarter' | 'month' | 'week' | 'day';

const VIEW_LABELS: Record<View, string> = {
  year: 'Anual',
  quarter: 'Trimestral',
  month: 'Mensal',
  week: 'Semanal',
  day: 'Diário',
};

const WEEKDAYS_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

export default function PreProducao() {
  const [view, setView] = useState<View>('month');
  const [anchor, setAnchor] = useState<Date>(startOfDay(new Date()));
  const [newPautaDate, setNewPautaDate] = useState<Date | null>(null);

  const title = useMemo(() => {
    switch (view) {
      case 'year': return format(anchor, 'yyyy', { locale: ptBR });
      case 'quarter': return `Q${getQuarter(anchor)} ${format(anchor, 'yyyy', { locale: ptBR })}`;
      case 'month': return format(anchor, "MMMM 'de' yyyy", { locale: ptBR });
      case 'week': {
        const ws = startOfWeek(anchor, { weekStartsOn: 1 });
        const we = addDays(ws, 6);
        return `${format(ws, 'dd MMM', { locale: ptBR })} – ${format(we, 'dd MMM yyyy', { locale: ptBR })}`;
      }
      case 'day': return format(anchor, "EEEE, dd 'de' MMMM yyyy", { locale: ptBR });
    }
  }, [view, anchor]);

  const step = (dir: 1 | -1) => {
    setAnchor(prev => {
      switch (view) {
        case 'year': return addYears(prev, dir);
        case 'quarter': return addQuarters(prev, dir);
        case 'month': return addMonths(prev, dir);
        case 'week': return addWeeks(prev, dir);
        case 'day': return addDays(prev, dir);
      }
    });
  };

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Hammer className="h-6 w-6 text-primary" />
            Pré-produção
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Calendário editorial — visão anual, trimestral, mensal, semanal e diária.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Tabs value={view} onValueChange={(v) => setView(v as View)}>
            <TabsList>
              {(Object.keys(VIEW_LABELS) as View[]).map(v => (
                <TabsTrigger key={v} value={v}>{VIEW_LABELS[v]}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Button size="sm" className="gap-2" onClick={() => setNewPautaDate(anchor)}>
            <Plus className="h-4 w-4" />
            Nova pauta
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => step(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => step(1)}><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" className="ml-2" onClick={() => setAnchor(startOfDay(new Date()))}>Hoje</Button>
        </div>
        <div className="text-sm font-semibold capitalize">{title}</div>
        <div className="w-[120px]" />
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        {view === 'year' && <YearGrid anchor={anchor} onPickMonth={(d) => { setAnchor(d); setView('month'); }} />}
        {view === 'quarter' && <QuarterGrid anchor={anchor} onPickMonth={(d) => { setAnchor(d); setView('month'); }} />}
        {view === 'month' && <MonthGrid anchor={anchor} onPickDay={(d) => { setAnchor(d); setView('day'); }} onAdd={setNewPautaDate} />}
        {view === 'week' && <WeekGrid anchor={anchor} onPickDay={(d) => { setAnchor(d); setView('day'); }} onAdd={setNewPautaDate} />}
        {view === 'day' && <DayView anchor={anchor} onAdd={setNewPautaDate} />}
      </div>

      <NewPautaDialog date={newPautaDate} onClose={() => setNewPautaDate(null)} />
    </motion.div>
  );
}

// ---------- Year ----------
function YearGrid({ anchor, onPickMonth }: { anchor: Date; onPickMonth: (d: Date) => void }) {
  const yearStart = startOfYear(anchor);
  const months = Array.from({ length: 12 }, (_, i) => addMonths(yearStart, i));
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {months.map((m) => (
        <button
          key={m.toISOString()}
          onClick={() => onPickMonth(m)}
          className="text-left rounded-md border border-border p-3 hover:bg-accent transition"
        >
          <div className="text-xs font-semibold capitalize mb-2">{format(m, 'MMMM', { locale: ptBR })}</div>
          <MiniMonth month={m} />
        </button>
      ))}
    </div>
  );
}

function QuarterGrid({ anchor, onPickMonth }: { anchor: Date; onPickMonth: (d: Date) => void }) {
  const qs = startOfQuarter(anchor);
  const months = [qs, addMonths(qs, 1), addMonths(qs, 2)];
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {months.map((m) => (
        <button
          key={m.toISOString()}
          onClick={() => onPickMonth(m)}
          className="text-left rounded-md border border-border p-3 hover:bg-accent transition"
        >
          <div className="text-xs font-semibold capitalize mb-2">{format(m, 'MMMM yyyy', { locale: ptBR })}</div>
          <MiniMonth month={m} />
        </button>
      ))}
    </div>
  );
}

function MiniMonth({ month }: { month: Date }) {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  return (
    <div className="grid grid-cols-7 gap-0.5 text-[10px]">
      {WEEKDAYS_SHORT.map(d => <div key={d} className="text-center text-muted-foreground">{d[0]}</div>)}
      {days.map((d) => (
        <div
          key={d.toISOString()}
          className={cn(
            'text-center py-0.5 rounded',
            !isSameMonth(d, month) && 'text-muted-foreground/40',
            isToday(d) && 'bg-primary text-primary-foreground font-semibold',
          )}
        >
          {format(d, 'd')}
        </div>
      ))}
    </div>
  );
}

// ---------- Month ----------
function MonthGrid({ anchor, onPickDay, onAdd }: { anchor: Date; onPickDay: (d: Date) => void; onAdd: (d: Date) => void }) {
  const start = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 });
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  return (
    <div>
      <div className="grid grid-cols-7 gap-1 mb-2">
        {WEEKDAYS_SHORT.map(d => (
          <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => (
          <div
            key={d.toISOString()}
            className={cn(
              'group relative aspect-square rounded-md border border-border p-2 text-left text-xs hover:bg-accent transition flex flex-col cursor-pointer',
              !isSameMonth(d, anchor) && 'opacity-40',
              isToday(d) && 'border-primary',
            )}
            onClick={() => onPickDay(d)}
          >
            <span className={cn('font-semibold', isToday(d) && 'text-primary')}>{format(d, 'd')}</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onAdd(d); }}
              className="absolute top-1 right-1 h-5 w-5 rounded-md bg-primary/10 text-primary opacity-0 group-hover:opacity-100 hover:bg-primary hover:text-primary-foreground transition flex items-center justify-center"
              title="Nova pauta neste dia"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Week ----------
function WeekGrid({ anchor, onPickDay, onAdd }: { anchor: Date; onPickDay: (d: Date) => void; onAdd: (d: Date) => void }) {
  const start = startOfWeek(anchor, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((d) => (
        <div
          key={d.toISOString()}
          onClick={() => onPickDay(d)}
          className={cn(
            'group relative min-h-[180px] rounded-md border border-border p-3 text-left hover:bg-accent transition flex flex-col cursor-pointer',
            isToday(d) && 'border-primary',
          )}
        >
          <span className="text-[10px] uppercase text-muted-foreground">{format(d, 'EEE', { locale: ptBR })}</span>
          <span className={cn('text-2xl font-bold', isToday(d) && 'text-primary')}>{format(d, 'd')}</span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onAdd(d); }}
            className="absolute top-2 right-2 h-6 w-6 rounded-md bg-primary/10 text-primary opacity-0 group-hover:opacity-100 hover:bg-primary hover:text-primary-foreground transition flex items-center justify-center"
            title="Nova pauta neste dia"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------- Day ----------
function DayView({ anchor, onAdd }: { anchor: Date; onAdd: (d: Date) => void }) {
  return (
    <div className="min-h-[400px] flex flex-col items-center justify-center text-center text-sm text-muted-foreground">
      <div className="text-5xl font-bold text-foreground mb-2">{format(anchor, 'dd')}</div>
      <div className="capitalize">{format(anchor, "EEEE, MMMM yyyy", { locale: ptBR })}</div>
      <div className="mt-6 text-xs">Sem itens.</div>
      <Button size="sm" variant="outline" className="mt-4 gap-2" onClick={() => onAdd(anchor)}>
        <Plus className="h-3.5 w-3.5" />
        Nova pauta neste dia
      </Button>
    </div>
  );
}

// ---------- New Pauta Dialog (stub) ----------
function NewPautaDialog({ date, onClose }: { date: Date | null; onClose: () => void }) {
  return (
    <Dialog open={!!date} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova pauta</DialogTitle>
          <DialogDescription>
            {date ? format(date, "EEEE, dd 'de' MMMM yyyy", { locale: ptBR }) : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="text-sm text-muted-foreground py-4">
          Fluxo de criação será definido no próximo passo.
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}