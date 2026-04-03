import { AudioParams, LogEntry, MasterReport, ProcessingProfile, TrackReport } from '@/lib/audio/types';

export interface DesktopFileRef {
  path?: string;
  assetUrl?: string;
  name: string;
  size?: number;
  mtimeMs?: number;
}

export interface DesktopPipelineJobPayload {
  masterMode: 'single' | 'multi';
  master: DesktopFileRef | null;
  masterTracks: DesktopFileRef[];
  processingProfile: ProcessingProfile;
  audioParams: AudioParams;
  bgm: DesktopFileRef;
  intro: DesktopFileRef;
  outro: DesktopFileRef;
  filename: string;
  outputPath: string;
}

export interface DesktopBulkItemPayload {
  masterMode: 'single' | 'multi';
  master: DesktopFileRef | null;
  masterTracks: DesktopFileRef[];
  bgm: DesktopFileRef;
  filename: string;
}

export interface DesktopBulkJobPayload {
  batchName: string;
  items: DesktopBulkItemPayload[];
  intro: DesktopFileRef;
  outro: DesktopFileRef;
  audioParams: AudioParams;
  processingProfile: ProcessingProfile;
  generateFinalEpisode: boolean;
  finalEpisodePath?: string;
}

export type DesktopJobPayload = DesktopPipelineJobPayload | DesktopBulkJobPayload;
export type DesktopJobKind = 'pipeline' | 'bulk';
export type DesktopJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'interrupted';

export interface DesktopJob {
  id: string;
  kind: DesktopJobKind;
  name: string;
  status: DesktopJobStatus;
  createdAt: number;
  updatedAt: number;
  progress: number;
  progressLabel: string;
  payload: DesktopJobPayload;
  logs: LogEntry[];
  trackReports: TrackReport[];
  masterReport: MasterReport | null;
  outputPaths: string[];
  error: string | null;
}

export interface DesktopPreferences {
  closeBehavior: 'tray' | 'quit';
  notifications: boolean;
  maxConcurrency: number;
  renderMode: 'preview' | 'final';
  outputDirectory: string;
  cacheRetentionDays: number;
}

export interface DesktopState {
  jobs: DesktopJob[];
  preferences: DesktopPreferences;
  activeJobId: string | null;
}

export interface DesktopProcessorJobEnvelope {
  job: DesktopJob;
  preferences: DesktopPreferences;
}