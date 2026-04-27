import { DetailedLogEntry } from './types';

/**
 * Granular, append-only log for Rivaldo audio processing.
 * Every meaningful event (decode step, silence cut, duck event, encode chunk,
 * upload chunk, error) is recorded with wall-clock timestamp, elapsed time
 * since pipeline start, optional audio timestamp, and structured data.
 *
 * At the end of the run the log is serialized to a human-readable .txt and
 * downloaded automatically — regardless of whether the run succeeded or
 * failed — so the operator always has a forensic record.
 */
export interface LoggerMeta {
  filename: string;
  mode: 'single' | 'bulk';
  startedIso: string;
  finishedIso: string;
  status: 'SUCCESS' | 'ERROR';
  pipelineVersion?: string;
  errorMessage?: string;
  extra?: Record<string, unknown>;
}

function pad(n: number, w = 2): string {
  return String(n).padStart(w, '0');
}

function fmtElapsed(ms: number): string {
  const totalMs = Math.max(0, Math.floor(ms));
  const minutes = Math.floor(totalMs / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const millis = totalMs % 1000;
  return `+${pad(minutes)}:${pad(seconds)}.${pad(millis, 3)}`;
}

function fmtAudio(ts?: number): string {
  if (ts === undefined || ts === null || !isFinite(ts)) return 'audio --:--';
  const totalMs = Math.max(0, Math.floor(ts * 1000));
  const minutes = Math.floor(totalMs / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const millis = totalMs % 1000;
  return `audio ${pad(minutes)}:${pad(seconds)}.${pad(millis, 3)}`;
}

const SEV_GLYPH: Record<DetailedLogEntry['severity'], string> = {
  info: 'i',
  step: '▶',
  success: '✓',
  warn: '!',
  error: '✗',
};

export class DetailedLogger {
  private entries: DetailedLogEntry[] = [];
  private startedAtMs = Date.now();
  private dataAppendix: Array<{ key: string; payload: unknown }> = [];

  resetClock(): void {
    this.startedAtMs = Date.now();
  }

  log(
    stage: string,
    severity: DetailedLogEntry['severity'],
    message: string,
    opts?: { audioTs?: number; data?: Record<string, unknown> },
  ): void {
    this.entries.push({
      isoTime: new Date().toISOString(),
      elapsedMs: Date.now() - this.startedAtMs,
      audioTsSec: opts?.audioTs,
      stage,
      severity,
      message,
      data: opts?.data,
    });
  }

  attachData(key: string, payload: unknown): void {
    this.dataAppendix.push({ key, payload });
  }

  count(): number {
    return this.entries.length;
  }

  /**
   * Returns entries sorted primarily by audio timestamp when present,
   * secondarily by elapsed time. Entries without `audioTsSec` keep their
   * original elapsed-time order between audio-anchored neighbours.
   */
  private sortedEntries(): DetailedLogEntry[] {
    return [...this.entries].sort((a, b) => {
      const aHas = a.audioTsSec !== undefined;
      const bHas = b.audioTsSec !== undefined;
      if (aHas && bHas) {
        if (a.audioTsSec! !== b.audioTsSec!) return a.audioTsSec! - b.audioTsSec!;
        return a.elapsedMs - b.elapsedMs;
      }
      // Keep wall-clock order when one side lacks an audio timestamp
      return a.elapsedMs - b.elapsedMs;
    });
  }

  toTxt(meta: LoggerMeta): string {
    const header: string[] = [];
    header.push('================================================================');
    header.push('RIVALDO PROCESSING LOG');
    header.push(`Mode: ${meta.mode} | Filename: ${meta.filename}`);
    header.push(`Started:  ${meta.startedIso}`);
    header.push(`Finished: ${meta.finishedIso}`);
    const totalMs = Math.max(0, new Date(meta.finishedIso).getTime() - new Date(meta.startedIso).getTime());
    header.push(`Status: ${meta.status} | Duration: ${fmtElapsed(totalMs)}`);
    if (meta.pipelineVersion) header.push(`Pipeline version: ${meta.pipelineVersion}`);
    if (meta.errorMessage) header.push(`Error: ${meta.errorMessage}`);
    if (meta.extra) {
      header.push('Extra:');
      for (const [k, v] of Object.entries(meta.extra)) {
        header.push(`  ${k}: ${JSON.stringify(v)}`);
      }
    }
    header.push('================================================================');
    header.push('');
    header.push(`Total events: ${this.entries.length}`);
    header.push('Order: by audio timestamp when available, otherwise by elapsed time.');
    header.push('');

    const rows: string[] = [];
    for (const e of this.sortedEntries()) {
      const elapsed = fmtElapsed(e.elapsedMs).padStart(13, ' ');
      const audio = fmtAudio(e.audioTsSec).padEnd(18, ' ');
      const stage = `[${e.stage}]`.padEnd(14, ' ');
      const glyph = SEV_GLYPH[e.severity];
      let line = `[${elapsed}] [${audio}] ${stage} ${glyph} ${e.message}`;
      if (e.data && Object.keys(e.data).length > 0) {
        line += `  | ${safeJson(e.data)}`;
      }
      rows.push(line);
    }

    const appendix: string[] = [];
    if (this.dataAppendix.length > 0) {
      appendix.push('');
      appendix.push('================================================================');
      appendix.push('DATA APPENDIX');
      appendix.push('================================================================');
      for (const entry of this.dataAppendix) {
        appendix.push('');
        appendix.push(`-- ${entry.key} --`);
        appendix.push(safeJson(entry.payload, 2));
      }
    }

    return [...header, ...rows, ...appendix].join('\n');
  }

  /**
   * Trigger an immediate browser download of the .txt log.
   * Safe to call from both success and failure paths.
   */
  download(filename: string, meta: LoggerMeta): void {
    try {
      const text = this.toTxt(meta);
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename.endsWith('.log.txt') ? filename : `${filename}.log.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    } catch (err) {
      // Logger download must never throw — swallow & console.warn.
      // eslint-disable-next-line no-console
      console.warn('[DetailedLogger] failed to download log', err);
    }
  }
}

function safeJson(value: unknown, space?: number): string {
  try {
    return JSON.stringify(value, (_k, v) => {
      if (v instanceof Float32Array || v instanceof Float64Array) return `Float32Array(len=${v.length})`;
      if (v instanceof Uint8Array) return `Uint8Array(len=${v.length})`;
      if (typeof v === 'number' && !isFinite(v)) return String(v);
      return v;
    }, space);
  } catch {
    return String(value);
  }
}