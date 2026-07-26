import type { AnalyzerMessage, AnalyzerRequest } from './analyzer.worker';
import type { AudioAnalysisReportV2 } from '../contracts/report-v2';

/** Client main-thread: instancia worker ES, dispara request, resolve com report. */
export class AnalyzerClient {
  private worker: Worker;
  constructor() {
    this.worker = new Worker(new URL('./analyzer.worker.ts', import.meta.url), { type: 'module' });
  }
  analyze(
    req: Omit<AnalyzerRequest, 'id'>,
    onProgress?: (progress: number, stage: string) => void,
  ): Promise<AudioAnalysisReportV2> {
    const id = `an-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    return new Promise((resolve, reject) => {
      const handler = (ev: MessageEvent<AnalyzerMessage>) => {
        if (ev.data.id !== id) return;
        if (ev.data.type === 'progress') onProgress?.(ev.data.progress, ev.data.stage);
        else if (ev.data.type === 'result') { this.worker.removeEventListener('message', handler); resolve(ev.data.report); }
        else if (ev.data.type === 'error') { this.worker.removeEventListener('message', handler); reject(new Error(ev.data.message)); }
      };
      this.worker.addEventListener('message', handler);
      const payload: AnalyzerRequest = { ...req, id };
      // Transfer buffer to avoid copy
      this.worker.postMessage(payload, [payload.channelData.buffer]);
    });
  }
  terminate() { this.worker.terminate(); }
}