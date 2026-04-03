import {
  ProgressCallback, TrackReport, VoiceTrackProcessRequest, VoiceTrackProcessResult, VoiceWorkerMessage,
} from './types';

interface PendingRequest {
  resolve: (value: VoiceTrackProcessResult) => void;
  reject: (reason?: unknown) => void;
  onProgress?: ProgressCallback;
}

export class VoiceWorkerClient {
  private worker: Worker;
  private pending = new Map<string, PendingRequest>();

  constructor() {
    this.worker = new Worker(new URL('./voice-worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<VoiceWorkerMessage>) => {
      const message = event.data;
      if (message.type === 'progress') {
        const pending = this.pending.get(message.id);
        pending?.onProgress?.(message.progress, message.label);
        return;
      }
      if (message.type === 'error') {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        pending.reject(new Error(message.message));
        return;
      }
      const pending = this.pending.get(message.payload.id);
      if (!pending) return;
      this.pending.delete(message.payload.id);
      pending.resolve(message.payload);
    };
  }

  process(request: VoiceTrackProcessRequest, onProgress?: ProgressCallback): Promise<VoiceTrackProcessResult> {
    return new Promise((resolve, reject) => {
      this.pending.set(request.id, { resolve, reject, onProgress });
      this.worker.postMessage(request, [request.channelData.buffer]);
    });
  }

  terminate() {
    this.worker.terminate();
    this.pending.clear();
  }
}

export interface ProcessedVoiceTrack {
  sampleRate: number;
  data: Float32Array;
  report: TrackReport;
}