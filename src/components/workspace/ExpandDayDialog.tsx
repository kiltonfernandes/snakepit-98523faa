import { useState, ReactNode } from 'react';
import { Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ExpandDayDialogProps {
  dayLabel: string;
  weekLabel?: string;
  children: ReactNode;
}

/**
 * Renders an "Expand" icon button that opens a near-fullscreen dialog
 * showing the same day content with more breathing room.
 */
export function ExpandDayDialog({ dayLabel, weekLabel, children }: ExpandDayDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 absolute top-2 right-2 z-10 opacity-60 hover:opacity-100"
        title="Expandir dia em tela cheia"
        onClick={() => setOpen(true)}
      >
        <Maximize2 className="h-3.5 w-3.5" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[92vh] max-h-[92vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle className="flex items-center gap-2">
              <span>{dayLabel}</span>
              {weekLabel && (
                <span className="text-sm font-normal text-muted-foreground">— {weekLabel}</span>
              )}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1">
            <div className="px-6 py-5 max-w-3xl mx-auto space-y-4">
              {children}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
