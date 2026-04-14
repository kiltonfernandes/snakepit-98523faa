export interface LogEntry {
  timestamp: number;
  message: string;
  type: 'info' | 'success' | 'error' | 'step';
}

export type ProgressCallback = (progress: number, message: string) => void;
export type LogCallback = (message: string, type?: LogEntry['type']) => void;
export type SubProgressCallback = (fraction: number) => void;

export type UiProcessingMode = 'auto' | 'advanced';
export type DereverbMode = 'off' | 'auto' | 'strong';
export type EqPreset = 'natural' | 'podcast' | 'bright';

export interface AudioParams {
  masterGainDb: number;
  bgmGainDb: number;
  duckReductionDb: number;
  silenceThresholdDb: number;
  fadeDownDuration: number;
  fadeUpDuration: number;
  maxPause: number;
  silenceCutTarget: number;
  silenceCutBufferMs: number;
  bgmTailAfterMaster: number;
  bgmPreMasterSilence: number;
  bgmPostMasterSilence: number;
  outputBitrate: number;
  crossfadeDuration: number;
  trackTargetLufs: number;
  masterTargetLufs: number;
  truePeakCeilingDbtp: number;
}

export const DEFAULT_PARAMS: AudioParams = {
  masterGainDb: -1,
  bgmGainDb: -12,
  duckReductionDb: -24,
  silenceThresholdDb: -26,
  fadeDownDuration: 1.23,
  fadeUpDuration: 0.3,
  maxPause: 1.2,
  silenceCutTarget: 0.4,
  silenceCutBufferMs: 418,
  bgmTailAfterMaster: 12,
  bgmPreMasterSilence: 7,
  bgmPostMasterSilence: 12,
  outputBitrate: 192,
  crossfadeDuration: 0.04,
  trackTargetLufs: -19,
  masterTargetLufs: -16,
  truePeakCeilingDbtp: -1.5,
};

export interface AnalysisConfig {
  vadFrameMs: number;
  vadHangoverMs: number;
  muteFadeMs: number;
  minSpeechMs: number;
  reverbAutoThreshold: number;
  minSpeechSecondsForDereverb: number;
}

export interface RepairConfig {
  declip: boolean;
  declickAmount: number;
  decrackleAmount: number;
}

export interface CleanupConfig {
  denoiseAmount: number;
  breathReductionAmount: number;
  smartMute: boolean;
  smartMuteFloorDb: number;
}

export interface DereverbConfig {
  mode: DereverbMode;
  iterations: number;
  predictionDelayFrames: number;
  taps: number;
  fftSize: number;
  hopSize: number;
  chunkSeconds: number;
  overlapSeconds: number;
}

export interface ToneConfig {
  eqPreset: EqPreset;
  eqAmount: number;
  deEsserAmount: number;
  dePlosiveAmount: number;
}

export interface DynamicsConfig {
  compressorAmount: number;
  limiterCeilingDbtp: number;
}

export interface LoudnessConfig {
  trackTargetLufs: number;
  masterTargetLufs: number;
  truePeakCeilingDbtp: number;
}

export interface ProcessingProfile {
  uiMode: UiProcessingMode;
  analysis: AnalysisConfig;
  repair: RepairConfig;
  cleanup: CleanupConfig;
  dereverb: DereverbConfig;
  tone: ToneConfig;
  dynamics: DynamicsConfig;
  loudness: LoudnessConfig;
}

export const DEFAULT_PROCESSING_PROFILE: ProcessingProfile = {
  uiMode: 'auto',
  analysis: {
    vadFrameMs: 20,
    vadHangoverMs: 200,
    muteFadeMs: 50,
    minSpeechMs: 120,
    reverbAutoThreshold: 0.28,
    minSpeechSecondsForDereverb: 1.2,
  },
  repair: {
    declip: true,
    declickAmount: 35,
    decrackleAmount: 28,
  },
  cleanup: {
    denoiseAmount: 58,
    breathReductionAmount: 36,
    smartMute: true,
    smartMuteFloorDb: -18,
  },
  dereverb: {
    mode: 'auto',
    iterations: 3,
    predictionDelayFrames: 2,
    taps: 8,
    fftSize: 1024,
    hopSize: 256,
    chunkSeconds: 10,
    overlapSeconds: 1,
  },
  tone: {
    eqPreset: 'podcast',
    eqAmount: 62,
    deEsserAmount: 24,
    dePlosiveAmount: 28,
  },
  dynamics: {
    compressorAmount: 38,
    limiterCeilingDbtp: -1.5,
  },
  loudness: {
    trackTargetLufs: -19,
    masterTargetLufs: -16,
    truePeakCeilingDbtp: -1.5,
  },
};

export interface LoudnessMetrics {
  rmsDb: number;
  lufs: number;
  truePeakDbtp: number;
}

export interface TrackMetrics {
  durationSec: number;
  sampleRate: number;
  peakDbfs: number;
  clippedSamples: number;
  speechRatio: number;
  mutedRatio: number;
  noiseScore: number;
  reverbScore: number;
  loudness: LoudnessMetrics;
}

export interface TrackEvents {
  clippedSegments: number;
  declickEvents: number;
  decrackleEvents: number;
  breathsReduced: number;
  deEssEvents: number;
  dePlosiveEvents: number;
}

export interface StageTiming {
  stage: string;
  durationMs: number;
}

export interface TrackReport {
  trackName: string;
  dereverbApplied: boolean;
  dereverbMode: DereverbMode;
  dereverbFallbackReason?: string;
  reverbScoreBefore: number;
  reverbScoreAfter: number;
  metricsBefore: TrackMetrics;
  metricsAfter: TrackMetrics;
  events: TrackEvents;
  timings: StageTiming[];
}

export interface MasterReport {
  durationSec: number;
  bitrateKbps: number;
  loudness: LoudnessMetrics;
}

export interface VoiceTrackProcessRequest {
  id: string;
  name: string;
  sampleRate: number;
  channelData: Float32Array;
  profile: ProcessingProfile;
  audioParams: AudioParams;
  smartMuteEnabled: boolean;
}

export interface VoiceTrackProcessResult {
  id: string;
  sampleRate: number;
  channelData: Float32Array;
  report: TrackReport;
}

export interface WorkerProgressMessage {
  type: 'progress';
  id: string;
  progress: number;
  label: string;
}

export interface WorkerResultMessage {
  type: 'result';
  payload: VoiceTrackProcessResult;
}

export interface WorkerErrorMessage {
  type: 'error';
  id: string;
  message: string;
}

export type VoiceWorkerMessage = WorkerProgressMessage | WorkerResultMessage | WorkerErrorMessage;

export interface PipelineStep {
  id: string;
  label: string;
  startPct: number;
  endPct: number;
}

export const PIPELINE_STEPS: PipelineStep[] = [
  { id: 'decode', label: 'Decodificando', startPct: 0, endPct: 10 },
  { id: 'analysis', label: 'Analisando fala', startPct: 10, endPct: 22 },
  { id: 'repair', label: 'Reparando voz', startPct: 22, endPct: 34 },
  { id: 'denoise', label: 'RNNoise', startPct: 34, endPct: 46 },
  { id: 'dereverb', label: 'WPE Dereverb', startPct: 46, endPct: 58 },
  { id: 'voice', label: 'Tratando voz', startPct: 58, endPct: 72 },
  { id: 'loudness', label: 'Alinhando loudness', startPct: 72, endPct: 80 },
  { id: 'mix', label: 'Mixando', startPct: 80, endPct: 90 },
  { id: 'encode', label: 'Codificando MP3', startPct: 90, endPct: 100 },
];