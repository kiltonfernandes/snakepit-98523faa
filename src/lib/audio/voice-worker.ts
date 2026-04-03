/// <reference lib="webworker" />

import { VoiceTrackProcessRequest, VoiceWorkerMessage } from './types';
import { processVoiceTrack } from './voice-processor';

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = async (event: MessageEvent<VoiceTrackProcessRequest>) => {
  const request = event.data;
  try {
    const result = await processVoiceTrack(request, (progress, label) => {
      const message: VoiceWorkerMessage = { type: 'progress', id: request.id, progress, label };
      self.postMessage(message);
    });
    const message: VoiceWorkerMessage = { type: 'result', payload: result };
    self.postMessage(message, [result.channelData.buffer]);
  } catch (error) {
    const message: VoiceWorkerMessage = {
      type: 'error', id: request.id,
      message: error instanceof Error ? error.message : 'Erro no worker de voz',
    };
    self.postMessage(message);
  }
};

export {};