import { motion } from 'framer-motion';
import { TrackReport, MasterReport } from '@/lib/audio/types';

interface ProcessingReportPanelProps {
  trackReports: TrackReport[];
  masterReport: MasterReport | null;
}

export function ProcessingReportPanel({ trackReports, masterReport }: ProcessingReportPanelProps) {
  if (trackReports.length === 0 && !masterReport) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-lg p-4 space-y-3"
      style={{ boxShadow: '0 4px 20px -4px hsl(220 15% 0% / 0.5)' }}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-mono uppercase tracking-[0.18em] text-primary">Relatorio 3.2</h3>
        {masterReport && (
          <span className="text-[11px] font-mono text-muted-foreground">
            {masterReport.loudness.lufs.toFixed(1)} LUFS / {masterReport.loudness.truePeakDbtp.toFixed(1)} dBTP
          </span>
        )}
      </div>

      <div className="space-y-2">
        {trackReports.map((report) => (
          <div key={report.trackName} className="rounded-md border border-border/60 p-3 bg-muted/20">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium truncate">{report.trackName}</span>
              <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                fala {(report.metricsAfter.speechRatio * 100).toFixed(0)}%
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2 text-[10px] font-mono text-muted-foreground">
              <span>Noise {report.metricsBefore.noiseScore.toFixed(1)} -&gt; {report.metricsAfter.noiseScore.toFixed(1)} dB</span>
              <span>Reverb {report.reverbScoreBefore.toFixed(2)} -&gt; {report.reverbScoreAfter.toFixed(2)}</span>
              <span>LUFS {report.metricsBefore.loudness.lufs.toFixed(1)} -&gt; {report.metricsAfter.loudness.lufs.toFixed(1)}</span>
              <span>Clipping {report.metricsBefore.clippedSamples} -&gt; {report.metricsAfter.clippedSamples}</span>
              <span>Smart mute {(report.metricsAfter.mutedRatio * 100).toFixed(0)}%</span>
              <span>{report.dereverbApplied ? `Dereverb ${report.dereverbMode}` : `Dereverb skip${report.dereverbFallbackReason ? `: ${report.dereverbFallbackReason}` : ''}`}</span>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
