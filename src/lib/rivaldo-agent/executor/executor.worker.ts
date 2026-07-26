/// <reference lib="webworker" />
import { executePlan, type ExecuteResult } from './execute';
import type { TreatmentPlanV1 } from '../contracts/treatment-plan-v1';

declare const self: DedicatedWorkerGlobalScope;

export interface ExecutorRequest {
  id: string;
  channelData: Float32Array;
  sampleRate: number;
  plan: TreatmentPlanV1;
}

export type ExecutorMessage =
  | { type: 'progress'; id: string; progress: number; stage: string }
  | { type: 'result'; id: string; result: ExecuteResult }
  | { type: 'error'; id: string; message: string };

self.onmessage = (ev: MessageEvent<ExecutorRequest>) => {
  const { id, channelData, sampleRate, plan } = ev.data;
  try {
    const result = executePlan(channelData, sampleRate, plan, (p) => {
      self.postMessage({ type: 'progress', id, progress: p.progress, stage: p.stage } satisfies ExecutorMessage);
    });
    self.postMessage(
      { type: 'result', id, result } satisfies ExecutorMessage,
      [result.channelData.buffer],
    );
  } catch (e) {
    self.postMessage({
      type: 'error', id,
      message: e instanceof Error ? e.message : 'Execution failed',
    } satisfies ExecutorMessage);
  }
};

export {};