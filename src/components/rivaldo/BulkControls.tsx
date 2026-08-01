import { useState } from 'react';
import { motion } from 'framer-motion';
import { Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRivaldoBulk } from '@/contexts/RivaldoBulkContext';
import type { AudioParams, ProcessingProfile } from '@/lib/audio/types';
import type { DesktopJob, DesktopState } from '@/lib/desktop/types';
import { BulkModal } from './BulkModal';

interface BulkControlsProps {
  introFile: File | null;
  outroFile: File | null;
  audioParams: AudioParams;
  processingProfile: ProcessingProfile;
  desktopMode: boolean;
  desktopState: DesktopState | null;
  desktopQueueAvailable: boolean;
  desktopQueueStatusMessage: string | null;
  onDesktopJobQueued: (job: DesktopJob) => void;
}

export function BulkControls(props: BulkControlsProps) {
  const [open, setOpen] = useState(false);
  const bulk = useRivaldoBulk();

  return (
    <>
      {bulk.isProcessing && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-mono text-primary hover:bg-primary/20 transition-colors"
          title="Reabrir modal do bulk em andamento"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
            className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full"
          />
          <span className="truncate max-w-[160px]">{bulk.currentBatchName ?? 'Bulk em andamento'}</span>
          <span className="font-semibold">{Math.round(bulk.progress)}%</span>
        </button>
      )}
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="flex items-center gap-1.5">
        <Layers className="w-4 h-4" /> Bulk 3.2
      </Button>
      <BulkModal open={open} onOpenChange={setOpen} {...props} />
    </>
  );
}
