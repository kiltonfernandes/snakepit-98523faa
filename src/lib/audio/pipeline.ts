import { mixAndTrim, concatenate } from './assembler';
import { applyAutoDuck } from './auto-duck';
import { decodeFile, audioBufferToMonoData, monoDataToAudioBuffer, ensureSampleRate } from './decoder';
import { downloadBlob, encodeBufferToMp3Blob, encodeToMp3 } from './encoder';
import { cutSilencesInMaster } from './silence-cut';
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
import { DetailedLogger } from './detailed-logger';

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
  finalBuffer?: AudioBuffer;
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
  returnFinalBuffer?: boolean;
  /**
   * Optional detailed logger. The pipeline will append granular events
   * (decode metadata, silence cuts, mix offsets, encode summary, etc.).
   * Caller is responsible for triggering the .txt download.
   */
  logger?: DetailedLogger;
}

export interface BulkPipelineRunOptions extends PipelineRunOptions {
  onItemEncoded?: (item: BulkItem, index: number, result: PipelineResult) => Promise<void> | void;
  onFinalEpisodeEncoded?: (blob: Blob) => Promise<void> | void;
  downloadIndividualItems?: boolean;
  downloadFinalEpisode?: boolean;
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

function purgeAudioBuffer(buffer: AudioBuffer | null | undefined): void {
  if (!buffer) return;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    buffer.getChannelData(channel).fill(0);
  }
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
  let worker: VoiceWorkerClient | null = null;
  try {
    const exportMode = options.exportMode ?? 'download';
    const maxVoiceConcurrency = Math.max(1, options.maxVoiceConcurrency ?? 1);
    const returnFinalBuffer = options.returnFinalBuffer ?? true;
    const dlog = options.logger;
    // Wrap onLog so every UI log line is also persisted in the detailed log
    const wrappedLog: LogCallback = (message, type = 'info') => {
      onLog(message, type);
      const sev = (type as 'info' | 'success' | 'error' | 'step') || 'info';
      dlog?.log('pipeline', sev, message);
    };
    const processVoice = options.processVoiceBuffer ?? ((context: VoiceProcessContext) => {
      worker ??= new VoiceWorkerClient();
      return processVoiceBufferWithWorker(worker, context);
    });

    wrappedLog('Decodificando arquivos base...', 'step');
    stepProgress(0, 0.1, 0.2, onProgress, 'Decodificando arquivos base...');
    dlog?.log('pipeline', 'step', `Início do pipeline para "${input.filename}" (mode=${input.masterMode})`);
    dlog?.log('pipeline', 'info', `Output bitrate=${params.outputBitrate}kbps, masterTargetLufs=${params.masterTargetLufs}, truePeakCeilingDbtp=${params.truePeakCeilingDbtp}`);

    const voiceBuffers: AudioBuffer[] = [];
    const trackReports: TrackReport[] = [];

    if (input.masterMode === 'multi' && input.masterTracks && input.masterTracks.length > 0) {
      dlog?.log('decode', 'info', `Decodificando ${input.masterTracks.length} trilhas multi-master`);
      const processedTracks = await mapWithConcurrency(input.masterTracks, maxVoiceConcurrency, async (file, index) => {
        const decoded = await decodeFile(file);
        dlog?.log('decode', 'success', `Trilha ${index + 1}/${input.masterTracks!.length}: ${file.name}`, {
          data: { sampleRate: decoded.sampleRate, durationSec: decoded.length / decoded.sampleRate, channels: decoded.numberOfChannels, fileBytes: file.size },
        });
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
        wrappedLog(`Trilha tratada: ${file.name}`, 'info');
        dlog?.attachData(`voice-track[${index}]:${file.name}`, processed.report);
        return processed;
      });

      for (const processed of processedTracks) {
        voiceBuffers.push(processed.buffer);
        trackReports.push(processed.report);
      }
    } else {
      const decoded = await decodeFile(input.master!);
      dlog?.log('decode', 'success', `Master single: ${input.master!.name}`, {
        data: { sampleRate: decoded.sampleRate, durationSec: decoded.length / decoded.sampleRate, channels: decoded.numberOfChannels, fileBytes: input.master!.size },
      });
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
      wrappedLog(`Locucao tratada: ${input.master!.name}`, 'info');
      dlog?.attachData(`voice-track[0]:${input.master!.name}`, processed.report);
    }

    stepProgress(0.66, 0.04, 1, onProgress, 'Montando master de voz...');
    const processedMaster = mixVoiceTracks(voiceBuffers, wrappedLog);
    applyGainToBuffer(processedMaster, params.masterGainDb);
    dlog?.log('mix', 'info', `Master de voz montado (${processedMaster.length / processedMaster.sampleRate} s) com ganho ${params.masterGainDb} dB`);

    // Cut long silences (>= silenceMinDuration) down to silenceCutTarget seconds.
    wrappedLog('Cortando silêncios longos da master...', 'step');
    const masterDurBefore = processedMaster.length / processedMaster.sampleRate;
    const trimmedMaster = cutSilencesInMaster(processedMaster, params, wrappedLog);
    const masterDurAfter = trimmedMaster.length / trimmedMaster.sampleRate;
    dlog?.log('silence-cut', 'success', `Master ${masterDurBefore.toFixed(2)}s → ${masterDurAfter.toFixed(2)}s (corte total ${(masterDurBefore - masterDurAfter).toFixed(2)}s)`, {
      data: { thresholdDb: params.silenceCutThresholdDb, minDurationSec: params.silenceMinDuration, targetSec: params.silenceCutTarget, bufferMs: params.silenceCutBufferMs },
    });

    // Add pre-master silence (BGM plays alone before voice starts)
    const preSilenceSamples = Math.round(trimmedMaster.sampleRate * (params.bgmPreMasterSilence || 0));
    // Add post-master silence (BGM plays alone after voice ends)
    const postSilenceSamples = Math.round(trimmedMaster.sampleRate * (params.bgmPostMasterSilence || 0));

    let masterForDuck: AudioBuffer;
    if (preSilenceSamples > 0 || postSilenceSamples > 0) {
      const extendedLength = preSilenceSamples + trimmedMaster.length + postSilenceSamples;
      masterForDuck = monoDataToAudioBuffer(new Float32Array(extendedLength), trimmedMaster.sampleRate);
      const dst = masterForDuck.getChannelData(0);
      const src = trimmedMaster.getChannelData(0);
      // Pre-silence is zeros (already zeroed), then master, then post-silence (zeros)
      dst.set(src, preSilenceSamples);
      wrappedLog(`Silêncio pré-master: ${params.bgmPreMasterSilence}s | pós-master: ${params.bgmPostMasterSilence}s`, 'info');
      dlog?.log('mix', 'info', `Padding aplicado pré=${params.bgmPreMasterSilence}s pós=${params.bgmPostMasterSilence}s`, { audioTs: 0 });
    } else {
      masterForDuck = trimmedMaster;
    }

    wrappedLog('Decodificando trilha, intro e outro...', 'step');
    const [bgmRaw, introRaw, outroRaw] = await Promise.all([
      decodeFile(input.bgm),
      decodeFile(input.intro),
      decodeFile(input.outro),
    ]);
    dlog?.log('decode', 'success', `BGM/intro/outro decodificados`, {
      data: {
        bgm:   { name: input.bgm.name,   durationSec: bgmRaw.length / bgmRaw.sampleRate,     sampleRate: bgmRaw.sampleRate },
        intro: { name: input.intro.name, durationSec: introRaw.length / introRaw.sampleRate, sampleRate: introRaw.sampleRate },
        outro: { name: input.outro.name, durationSec: outroRaw.length / outroRaw.sampleRate, sampleRate: outroRaw.sampleRate },
      },
    });

    const bgm = ensureSampleRate(bgmRaw, masterForDuck.sampleRate);
    const intro = ensureSampleRate(introRaw, masterForDuck.sampleRate);
    const outro = ensureSampleRate(outroRaw, masterForDuck.sampleRate);

    applyGainToBuffer(bgm, params.bgmGainDb);
    const bgmReady = extendBgmToMatch(bgm, masterForDuck.length + Math.round(masterForDuck.sampleRate * 180));
    const duckedBgm = applyAutoDuck(masterForDuck, bgmReady, wrappedLog, params);
    dlog?.log('duck', 'success', `Auto-duck aplicado (reduction=${params.duckReductionDb}dB, hold=${params.duckHoldDuration}s, fadeDown=${params.fadeDownDuration}s, fadeUp=${params.fadeUpDuration}s)`);

    stepProgress(0.74, 0.08, 0.4, onProgress, 'Mixando trilha com BGM...');
    const mixed = mixAndTrim(masterForDuck, duckedBgm, wrappedLog, params);
    dlog?.log('mix', 'success', `Mix voz+BGM concluído (${(mixed.length / mixed.sampleRate).toFixed(2)}s)`);
    stepProgress(0.82, 0.05, 0.5, onProgress, 'Montando intro e outro...');
    const introDur = intro.length / intro.sampleRate;
    const mixedDur = mixed.length / mixed.sampleRate;
    dlog?.log('assemble', 'info', `Intro=${introDur.toFixed(2)}s, Bloco principal=${mixedDur.toFixed(2)}s, Outro=${(outro.length / outro.sampleRate).toFixed(2)}s`, { audioTs: 0 });
    const assembled = concatenate(intro, mixed, outro, wrappedLog, params);
    dlog?.log('assemble', 'success', `Episódio montado (${(assembled.length / assembled.sampleRate).toFixed(2)}s total)`, { audioTs: introDur });
    const finalMaster = applyFinalMasterTarget(assembled, params, wrappedLog);

    const masterReport = buildMasterReport(finalMaster, params);
    dlog?.log('loudness', 'success', `Master final: ${masterReport.loudness.lufs.toFixed(2)} LUFS / ${masterReport.loudness.truePeakDbtp.toFixed(2)} dBTP / ${masterReport.loudness.rmsDb.toFixed(2)} dB RMS`);
    dlog?.attachData('master-report', masterReport);
    let outputBlob: Blob | undefined;

    if (exportMode !== 'none') {
      stepProgress(0.9, 0.1, 0.2, onProgress, 'Codificando MP3...');
      // Always produce a blob so callers can decide between download / upload / both
      outputBlob = await encodeBufferToMp3Blob(finalMaster, wrappedLog, params.outputBitrate, (fraction) => {
        stepProgress(0.9, 0.1, fraction, onProgress, 'Codificando MP3...');
      });
      dlog?.log('encode', 'success', `MP3 codificado: ${(outputBlob!.size / (1024 * 1024)).toFixed(2)} MB @ ${params.outputBitrate} kbps`);
      if (exportMode === 'download') {
        const a = document.createElement('a');
        const url = URL.createObjectURL(outputBlob);
        a.href = url;
        a.download = input.filename.endsWith('.mp3') ? input.filename : `${input.filename}.mp3`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 3000);
        wrappedLog(`Download disparado: ${a.download}`, 'info');
      }
    }

    wrappedLog(`Exportacao final: ${masterReport.loudness.lufs.toFixed(1)} LUFS / ${masterReport.loudness.truePeakDbtp.toFixed(1)} dBTP`, 'success');
    const result: PipelineResult = {
      trackReports,
      masterReport,
      outputBlob,
      ...(returnFinalBuffer ? { finalBuffer: finalMaster } : {}),
    };

    if (!returnFinalBuffer) {
      purgeAudioBuffer(finalMaster);
    }

    return result;
  } finally {
    worker?.terminate();
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
  const downloadIndividualItems = options.downloadIndividualItems ?? true;
  onLog(`Iniciando fila bulk com ${input.items.length} itens`, 'step');
  const v1Blobs: Blob[] = [];
  const sharedWorker = new VoiceWorkerClient();

  try {
    const processVoiceBuffer: VoiceBufferProcessor = (context) => processVoiceBufferWithWorker(sharedWorker, context);

    for (let index = 0; index < input.items.length; index++) {
      const item = input.items[index];
      const progressEnvelope = input.generateFinalEpisode ? 0.75 : 0.92;
      const progressBase = (index / input.items.length) * progressEnvelope;
      const progressSpan = progressEnvelope / input.items.length;
      onProgress(progressBase * 100, `Processando ${item.filename}...`);
      onLog(`-- Episodio ${index + 1}/${input.items.length}: ${item.filename} --`, 'step');

      const itemOptions: PipelineRunOptions = {
        exportMode: input.generateFinalEpisode ? 'blob' : exportMode,
        maxVoiceConcurrency: options.maxVoiceConcurrency,
        processVoiceBuffer,
        returnFinalBuffer: false,
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

      if (input.generateFinalEpisode) {
        const itemBlob = result.outputBlob;
        if (!itemBlob) {
          throw new Error(`Falha ao gerar MP3 do episódio ${item.filename}.`);
        }
        if (downloadIndividualItems) {
          await downloadBlob(itemBlob, item.filename);
          onLog(`MP3 exportado: ${item.filename}.mp3 (${(itemBlob.size / (1024 * 1024)).toFixed(1)} MB)`, 'success');
          // Small delay between downloads to prevent browser throttling
          if (index < input.items.length - 1) {
            await new Promise(r => setTimeout(r, 2500));
          }
        }
        v1Blobs.push(itemBlob);
      }

      onLog(`Relatorio final: ${result.masterReport.loudness.lufs.toFixed(1)} LUFS`, 'info');
      await options.onItemEncoded?.(item, index, result);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    if (input.generateFinalEpisode && v1Blobs.length > 0) {
      onLog('Gerando episodio final consolidado...', 'step');
      onProgress(78, 'Montando MP3 consolidado...');

      const finalBlob = new Blob([
        input.intro,
        ...v1Blobs,
        input.outro,
      ], { type: 'audio/mpeg' });

      const shouldDownloadFinal = options.downloadFinalEpisode ?? true;
      if (shouldDownloadFinal) {
        await downloadBlob(finalBlob, input.finalFilename || 'episodio_final');
        onLog('Episodio final consolidado exportado', 'success');
      }
      await options.onFinalEpisodeEncoded?.(finalBlob);
    }

    onProgress(100, 'Bulk finalizado');
  } finally {
    sharedWorker.terminate();
  }
}
