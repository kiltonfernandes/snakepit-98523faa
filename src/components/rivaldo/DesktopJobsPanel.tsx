import { motion } from 'framer-motion';
import { FolderOpen, HardDriveDownload, History, LoaderCircle, X } from 'lucide-react';
import { useState } from 'react';
import { DesktopJob } from '@/lib/desktop/types';
import { Button } from '@/components/ui/button';
import { getDesktopApi } from '@/lib/desktop/runtime';

interface DesktopJobsPanelProps {
  jobs: DesktopJob[];
  activeJobId: string | null;
}

const STATUS_LABELS: Record<DesktopJob['status'], string> = {
  pending: 'na fila',
  running: 'renderizando',
  completed: 'concluido',
  failed: 'falhou',
  interrupted: 'interrompido',
};

export function DesktopJobsPanel({ jobs, activeJobId }: DesktopJobsPanelProps) {
  const [removingJobId, setRemovingJobId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  if (jobs.length === 0) return null;

  const handleRemoveJob = async (job: DesktopJob) => {
    const desktopApi = getDesktopApi();
    if (!desktopApi) {
      setRemoveError('Bridge desktop indisponivel para remover jobs.');
      return;
    }

    setRemovingJobId(job.id);
    setRemoveError(null);

    try {
      await desktopApi.removeJob(job.id);
    } catch (error) {
      setRemoveError(error instanceof Error ? error.message : `Falha ao remover o job ${job.name}.`);
    } finally {
      setRemovingJobId((current) => (current === job.id ? null : current));
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-lg p-4 space-y-3"
      style={{ boxShadow: '0 4px 20px -4px hsl(220 15% 0% / 0.5)' }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-primary" />
          <h3 className="text-xs font-mono uppercase tracking-[0.18em] text-primary">Fila desktop 3.2</h3>
        </div>
        <span className="text-[11px] font-mono text-muted-foreground">{jobs.length} jobs</span>
      </div>

      <div className="space-y-2">
        {jobs.slice(0, 6).map((job) => (
          <div key={job.id} className="rounded-md border border-border/60 p-3 bg-muted/20 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-medium truncate">{job.name}</div>
                <div className="text-[10px] font-mono text-muted-foreground truncate">
                  {STATUS_LABELS[job.status]} {job.id === activeJobId ? 'agora' : ''}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="text-[10px] font-mono text-primary shrink-0">
                  {job.status === 'running' ? (
                    <span className="inline-flex items-center gap-1">
                      <LoaderCircle className="w-3 h-3 animate-spin" />
                      {job.progress.toFixed(0)}%
                    </span>
                  ) : (
                    `${job.progress.toFixed(0)}%`
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  aria-label={`Fechar job ${job.name}`}
                  title={
                    job.status === 'running' || job.id === activeJobId
                      ? 'Nao pode remover um job em processamento.'
                      : 'Fechar job'
                  }
                  disabled={job.status === 'running' || job.id === activeJobId || removingJobId === job.id}
                  onClick={() => void handleRemoveJob(job)}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            <div className="h-1 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary transition-all duration-300" style={{ width: `${job.progress}%` }} />
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-mono text-muted-foreground truncate">{job.progressLabel}</span>
              {job.outputPaths[0] && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[10px] font-mono"
                  onClick={() => void getDesktopApi()?.revealInFolder(job.outputPaths[0])}
                >
                  <FolderOpen className="w-3 h-3 mr-1" />
                  Abrir pasta
                </Button>
              )}
            </div>

            {job.error && (
              <div className="text-[10px] font-mono text-destructive">{job.error}</div>
            )}
          </div>
        ))}
      </div>

      {removeError && (
        <div role="alert" className="text-[10px] font-mono text-destructive">
          {removeError}
        </div>
      )}

      <div className="pt-1 text-[10px] font-mono text-muted-foreground/75 flex items-center gap-2">
        <HardDriveDownload className="w-3 h-3" />
        O app pode ficar minimizado na bandeja enquanto renderiza.
      </div>
    </motion.div>
  );
}
