import type { ExecutorMessage, ExecutorRequest } from './executor.worker';
import type { ExecuteResult } from './execute';
import type { TreatmentPlanV1 } from '../contracts/treatment-plan-v1';

/**
 * Client main-thread do executor. Corre o DSP num worker ES para não travar
 * a UI mesmo com trilhas longas.
 */
export class ExecutorClient {
  private worker: Worker;
  constructor() {
    this.worker = new Worker(new URL('./executor.worker.ts', import.meta.url), { type: 'module' });
  }
  execute(
    req: Omit<ExecutorRequest, 'id'>,
    onProgress?: (progress: number, stage: string) => void,
  ): Promise<ExecuteResult> {
    const id = `ex-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    return new Promise((resolve, reject) => {
      const handler = (ev: MessageEvent<ExecutorMessage>) => {
        if (ev.data.id !== id) return;
        if (ev.data.type === 'progress') onProgress?.(ev.data.progress, ev.data.stage);
        else if (ev.data.type === 'result') { this.worker.removeEventListener('message', handler); resolve(ev.data.result); }
        else if (ev.data.type === 'error') { this.worker.removeEventListener('message', handler); reject(new Error(ev.data.message)); }
      };
      this.worker.addEventListener('message', handler);
      const payload: ExecutorRequest = { ...req, id };
      this.worker.postMessage(payload, [payload.channelData.buffer]);
    });
  }
  terminate() { this.worker.terminate(); }
}