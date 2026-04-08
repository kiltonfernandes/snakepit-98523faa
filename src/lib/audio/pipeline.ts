import { mixAndTrim, concatenate } from './assembler';
import { applyAutoDuck } from './auto-duck';
import { decodeFile, audioBufferToMonoData, monoDataToAudioBuffer, ensureSampleRate } from './decoder';
import { encodeBufferToMp3Blob, encodeToMp3, encodeToMp3Blob } from './encoder';
import { VoiceWorkerClient } from './voice-worker-client';
import {
  AudioParams,
  LogCallback,
  MasterReport,
  ProcessingProfile,
  ProgressCallback,
  TrackReport,
} from './types';
import { clamp, dbToGain, gainToDb, peak, rms } from './dsp';

export interface PipelineInput {
  masterMode: 'single' | 'multi';
  master: File | null;
  masterTracks?: File[];
  processingProfile: ProcessingProfile;
  bgm: File;
  intro: File;
  outro: File;
  filename: string;
}

export interface PipelineResult {
  trackReports: TrackReport[];
  masterReport: MasterReport;
  finalBuffer: AudioBuffer;
  outputBlob?: Blob;
}

export interface BulkItem {
  masterMode: 'single' | 'multi';
  master: File | null;
  masterTracks: File[];
  processingProfile: ProcessingProfile;
  bgm: File;
  filename: string;
}

export interface BulkPipelineInput {
  items: BulkItem[];
  intro: File;
  outro: File;
  generateFinalEpisode: boolean;
  finalFilename?: string;
}

export interface VoiceProcessContext {
  id: string;
  name: string;
  buffer: AudioBuffer;
  profile: ProcessingProfile;
  audioParams: AudioParams;
  smartMuteEnabled: boolean;
  progressBase: number;
  progressSpan: number;
  onProgress: ProgressCallback;
}

export type VoiceBufferProcessor = (context: VoiceProcessContext) => Promise<{ buffer: AudioBuffer; report: TrackReport }>;

export interface PipelineRunOptions {
  exportMode?: 'download' | 'blob' | 'none';
  maxVoiceConcurrency?: number;
  processVoiceBuffer?: VoiceBufferProcessor;
}

export interface BulkPipelineRunOptions extends PipelineRunOptions {
  onItemEncoded?: (item: BulkItem, index: number, result: PipelineResult) => Promise<void> | void;
  onFinalEpisodeEncoded?: (blob: Blob) => Promise<void> | void;
}

function stepProgress(base: number, span: number, fraction: number, onProgress: ProgressCallback, label: string) {
  onProgress((base + span * clamp(fraction, 0, 1)) * 100, label);
}

function applyGainToBuffer(buffer: AudioBuffer, dB: number): void {
  const gain = dbToGain(dB);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < data.length; i++) {
      data[i] *= gain;
    }
  }
}

function buildMasterReport(buffer: AudioBuffer, params: AudioParams): MasterReport {
  const data = buffer.getChannelData(0);
  const peakDb = gainToDb(Math.max(peak(data), 1e-6));
  const rmsDb = gainToDb(Math.max(rms(data), 1e-6));
  const lufs = rmsDb - 0.691;

  return {
    durationSec: buffer.length / buffer.sampleRate,
    bitrateKbps: params.outputBitrate,
    loudness: {
      rmsDb,
      lufs,
      truePeakDbtp: peakDb,
    },
  };
}

function applyFinalMasterTarget(buffer: AudioBuffer, params: AudioParams, log: LogCallback): AudioBuffer {
  const output = monoDataToAudioBuffer(new Float32Array(buffer.getChannelData(0)), buffer.sampleRate);
  const data = output.getChannelData(0);
  const currentLufs = gainToDb(Math.max(rms(data), 1e-6)) - 0.691;
  const delta = params.masterTargetLufs - currentLufs;
  const gain = dbToGain(delta);
  for (let i = 0; i < data.length; i++) {
    data[i] *= gain;
  }

  const ceiling = dbToGain(params.truePeakCeilingDbtp);
  for (let i = 0; i < data.length; i++) {
    data[i] = clamp(data[i], -ceiling, ceiling);
  }

  log(`Master alinhado para ${params.masterTargetLufs} LUFS / ${params.truePeakCeilingDbtp} dBTP`, 'info');
  return output;
}

function extendBgmToMatch(bgm: AudioBuffer, targetLength: number): AudioBuffer {
  if (bgm.length >= targetLength) return bgm;
  const output = monoDataToAudioBuffer(new Float32Array(targetLength), bgm.sampleRate);
  const src = bgm.getChannelData(0);
  const dst = output.getChannelData(0);
  for (let i = 0; i < targetLength; i++) {
    dst[i] = src[i % src.length];
  }
  return output;
}

async function processVoiceBufferWithWorker(worker: VoiceWorkerClient, context: VoiceProcessContext): Promise<{ buffer: AudioBuffer; report: TrackReport }> {
  const monoData = audioBufferToMonoData(context.buffer, 48000);
  const result = await worker.process(
    {
      id: context.id,
      name: context.name,
      sampleRate: 48000,
      channelData: monoData,
      profile: context.profile,
      audioParams: context.audioParams,
      smartMuteEnabled: context.smartMuteEnabled,
    },
    (progress, label) => stepProgress(context.progressBase, context.progressSpan, progress, context.onProgress, `${context.name}: ${label}`)
  );

  return {
    buffer: monoDataToAudioBuffer(result.channelData, result.sampleRate),
    report: result.report,
  };
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const currentIndex = nextIndex++;
      if (currentIndex >= items.length) {
        break;
      }
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  };

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function mixVoiceTracks(buffers: AudioBuffer[], log: LogCallback): AudioBuffer {
  if (buffers.length === 1) return buffers[0];
  const sampleRate = buffers[0].sampleRate;
  const length = Math.max(...buffers.map((buffer) => buffer.length));
  const output = monoDataToAudioBuffer(new Float32Array(length), sampleRate);
  const dst = output.getChannelData(0);
  for (const buffer of buffers) {
    const src = buffer.getChannelData(0);
    for (let i = 0; i < src.length; i++) {
      dst[i] += src[i];
    }
  }
  const peakValue = peak(dst);
  if (peakValue > 0.95) {
    const gain = 0.95 / peakValue;
    for (let i = 0; i < dst.length; i++) dst[i] *= gain;
  }
  log(`Master de voz montado a partir de ${buffers.length} trilhas`, 'info');
  return output;
}

export async function runPipeline(
  input: PipelineInput,
  params: AudioParams,
  onProgress: ProgressCallback,
  onLog: LogCallback,
  options: PipelineRunOptions = {}
): Promise<PipelineResult> {
  const worker = new VoiceWorkerClient();
  try {
    const exportMode = options.exportMode ?? 'download';
    const maxVoiceConcurrency = Math.max(1, options.maxVoiceConcurrency ?? 1);
    const processVoice = options.processVoiceBuffer ?? ((context: VoiceProcessContext) => processVoiceBufferWithWorker(worker, context));

    onLog('Decodificando arquivos base...', 'step');
    stepProgress(0, 0.1, 0.2, onProgress, 'Decodificando arquivos base...');

    const voiceBuffers: AudioBuffer[] = [];
    const trackReports: TrackReport[] = [];

    if (input.masterMode === 'multi' && input.masterTracks && input.masterTracks.length > 0) {
      const processedTracks = await mapWithConcurrency(input.masterTracks, maxVoiceConcurrency, async (file, index) => {
        const decoded = await decodeFile(file);
        const processed = await processVoice({
          id: `${index}-${file.name}`,
          name: file.name,
          buffer: decoded,
          profile: input.processingProfile,
          audioParams: params,
          smartMuteEnabled: input.processingProfile.cleanup.smartMute,
          progressBase: 0.1 + index * (0.55 / input.masterTracks!.length),
          progressSpan: 0.55 / input.masterTracks!.length,
          onProgress,
        });
        onLog(`Trilha tratada: ${file.name}`, 'info');
        return processed;
      });

      for (const processed of processedTracks) {
        voiceBuffers.push(processed.buffer);
        trackReports.push(processed.report);
      }
    } else {
      const decoded = await decodeFile(input.master!);
      const processed = await processVoice({
        id: 'single-master',
        name: input.master!.name,
        buffer: decoded,
        profile: input.processingProfile,
        audioParams: params,
        smartMuteEnabled: false,
        progressBase: 0.1,
        progressSpan: 0.55,
        onProgress,
      });
      voiceBuffers.push(processed.buffer);
      trackReports.push(processed.report);
      onLog(`Locucao tratada: ${input.master!.name}`, 'info');
    }

    stepProgress(0.66, 0.04, 1, onProgress, 'Montando master de voz...');
    const processedMaster = mixVoiceTracks(voiceBuffers, onLog);
    applyGainToBuffer(processedMaster, params.masterGainDb);

    // Add pre-master silence (BGM plays alone before voice starts)
    const preSilenceSamples = Math.round(processedMaster.sampleRate * (params.bgmPreMasterSilence || 0));
    // Add post-master silence (BGM plays alone after voice ends)
    const postSilenceSamples = Math.round(processedMaster.sampleRate * (params.bgmPostMasterSilence || 0));

    let masterForDuck: AudioBuffer;
    if (preSilenceSamples > 0 || postSilenceSamples > 0) {
      const extendedLength = preSilenceSamples + processedMaster.length + postSilenceSamples;
      masterForDuck = monoDataToAudioBuffer(new Float32Array(extendedLength), processedMaster.sampleRate);
      const dst = masterForDuck.getChannelData(0);
      const src = processedMaster.getChannelData(0);
      // Pre-silence is zeros (already zeroed), then master, then post-silence (zeros)
      dst.set(src, preSilenceSamples);
      onLog(`Silêncio pré-master: ${params.bgmPreMasterSilence}s | pós-master: ${params.bgmPostMasterSilence}s`, 'info');
    } else {
      masterForDuck = processedMaster;
    }

    onLog('Decodificando trilha, intro e outro...', 'step');
    const [bgmRaw, introRaw, outroRaw] = await Promise.all([
      decodeFile(input.bgm),
      decodeFile(input.intro),
      decodeFile(input.outro),
    ]);

    const bgm = ensureSampleRate(bgmRaw, masterForDuck.sampleRate);
    const intro = ensureSampleRate(introRaw, masterForDuck.sampleRate);
    const outro = ensureSampleRate(outroRaw, masterForDuck.sampleRate);

    applyGainToBuffer(bgm, params.bgmGainDb);
    const bgmReady = extendBgmToMatch(bgm, masterForDuck.length + Math.round(masterForDuck.sampleRate * 180));
    const duckedBgm = applyAutoDuck(masterForDuck, bgmReady, onLog, params);

    stepProgress(0.74, 0.08, 0.4, onProgress, 'Mixando trilha com BGM...');
    const mixed = mixAndTrim(masterForDuck, duckedBgm, onLog, params);
    stepProgress(0.82, 0.05, 0.5, onProgress, 'Montando intro e outro...');
    const assembled = concatenate(intro, mixed, outro, onLog, params);
    const finalMaster = applyFinalMasterTarget(assembled, params, onLog);

    const masterReport = buildMasterReport(finalMaster, params);
    let outputBlob: Blob | undefined;

    if (exportMode !== 'none') {
      stepProgress(0.9, 0.1, 0.2, onProgress, 'Codificando MP3...');
      if (exportMode === 'download') {
        await encodeToMp3(finalMaster, input.filename, onLog, params.outputBitrate, (fraction) => {
          stepProgress(0.9, 0.1, fraction, onProgress, 'Codificando MP3...');
        });
      } else {
        outputBlob = await encodeBufferToMp3Blob(finalMaster, onLog, params.outputBitrate, (fraction) => {
          stepProgress(0.9, 0.1, fraction, onProgress, 'Codificando MP3...');
        });
      }
    }

    onLog(`Exportacao final: ${masterReport.loudness.lufs.toFixed(1)} LUFS / ${masterReport.loudness.truePeakDbtp.toFixed(1)} dBTP`, 'success');
    return { trackReports, masterReport, finalBuffer: finalMaster, outputBlob };
  } finally {
    worker.terminate();
  }
}

export async function runBulkPipeline(
  input: BulkPipelineInput,
  params: AudioParams,
  onProgress: ProgressCallback,
  onLog: LogCallback,
  options: BulkPipelineRunOptions = {}
): Promise<void> {
  const exportMode = options.exportMode ?? 'download';
  onLog(`Iniciando fila bulk com ${input.items.length} itens`, 'step');
  const [intro, outro] = await Promise.all([decodeFile(input.intro), decodeFile(input.outro)]);
  const introReady = ensureSampleRate(intro, 48000);
  const outroReady = ensureSampleRate(outro, 48000);
  const v1Blobs: Blob[] = [];

  for (let index = 0; index < input.items.length; index++) {
    const item = input.items[index];
    const progressEnvelope = input.generateFinalEpisode ? 0.75 : 0.92;
    const progressBase = (index / input.items.length) * progressEnvelope;
    const progressSpan = progressEnvelope / input.items.length;
    onProgress(progressBase * 100, `Processando ${item.filename}...`);
    onLog(`-- Episodio ${index + 1}/${input.items.length}: ${item.filename} --`, 'step');

    // Always download each individual episode; if generating final episode,
    // also collect blob for consolidation
    const itemExportMode = 'download';
    const itemOptions: PipelineRunOptions = {
      ...options,
      exportMode: itemExportMode,
    };

    const result = await runPipeline(
      {
        masterMode: item.masterMode,
        master: item.master,
        masterTracks: item.masterTracks,
        processingProfile: item.processingProfile,
        bgm: item.bgm,
        intro: input.intro,
        outro: input.outro,
        filename: item.filename,
      },
      params,
      (progress, label) => {
        onProgress(progressBase * 100 + (progress / 100) * (progressSpan * 100), label);
      },
      onLog,
      itemOptions
    );

    onLog(`Relatorio final: ${result.masterReport.loudness.lufs.toFixed(1)} LUFS`, 'info');
    await options.onItemEncoded?.(item, index, result);

    if (input.generateFinalEpisode) {
      v1Blobs.push(result.outputBlob!);
    }
  }

  if (input.generateFinalEpisode && v1Blobs.length > 0) {
    onLog('Gerando episodio final consolidado...', 'step');
    onProgress(78, 'Decodificando itens para consolidação...');
    const decoded: AudioBuffer[] = [];
    for (let i = 0; i < v1Blobs.length; i++) {
      const file = new File([v1Blobs[i]], `bulk_${i}.mp3`, { type: 'audio/mpeg' });
      decoded.push(ensureSampleRate(await decodeFile(file), 48000));
    }

    const totalLength = introReady.length + outroReady.length + decoded.reduce((sum, buffer) => sum + buffer.length, 0);
    const output = monoDataToAudioBuffer(new Float32Array(totalLength), 48000);
    const dst = output.getChannelData(0);
    let offset = 0;
    dst.set(introReady.getChannelData(0), offset);
    offset += introReady.length;
    for (const buffer of decoded) {
      dst.set(buffer.getChannelData(0), offset);
      offset += buffer.length;
    }
    dst.set(outroReady.getChannelData(0), offset);

    onProgress(88, 'Codificando episódio final...');
    // Always download the final consolidated episode
    await encodeToMp3(output, input.finalFilename || 'episodio_final', onLog, params.outputBitrate);
    await options.onFinalEpisodeEncoded?.(new Blob([]));
  }

  onProgress(100, 'Bulk finalizado');
}
