/// <reference lib="webworker" />
import { analyzeAudio, type AnalyzeInput } from './analyze';
import type { AudioAnalysisReportV2 } from '../contracts/report-v2';

declare const self: DedicatedWorkerGlobalScope;

export type AnalyzerRequest = AnalyzeInput & { id: string };
export type AnalyzerMessage =
  | { type: 'progress'; id: string; progress: number; stage: string }
  | { type: 'result'; id: string; report: AudioAnalysisReportV2 }
  | { type: 'error'; id: string; message: string };

self.onmessage = (ev: MessageEvent<AnalyzerRequest>) => {
  const { id, channelData, sampleRate, filename, channels } = ev.data;
  try {
    const report = analyzeAudio(
      { channelData, sampleRate, filename, channels },
      (p) => self.postMessage({ type: 'progress', id, progress: p.progress, stage: p.stage } satisfies AnalyzerMessage),
    );
    self.postMessage({ type: 'result', id, report } satisfies AnalyzerMessage);
  } catch (e) {
    self.postMessage({
      type: 'error', id,
      message: e instanceof Error ? e.message : 'Analysis failed',
    } satisfies AnalyzerMessage);
  }
};

export {};