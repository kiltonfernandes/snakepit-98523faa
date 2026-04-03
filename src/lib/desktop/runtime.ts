import { DesktopBulkJobPayload, DesktopFileRef, DesktopJob, DesktopPipelineJobPayload, DesktopState } from '@/lib/desktop/types';

declare global {
  interface Window {
    rivaldoDesktop?: {
      isDesktop: boolean;
      isProcessor: boolean;
      getState: () => Promise<DesktopState>;
      enqueuePipelineJob: (payload: DesktopPipelineJobPayload) => Promise<DesktopJob>;
      enqueueBulkJob: (payload: DesktopBulkJobPayload) => Promise<DesktopJob>;
      removeJob: (jobId: string) => Promise<DesktopState>;
      updatePreferences: (patch: Record<string, unknown>) => Promise<unknown>;
      revealInFolder: (targetPath: string) => Promise<void>;
      subscribeState: (listener: (state: DesktopState) => void) => () => void;
      refreshTray: () => void;
      processorReady: () => Promise<boolean>;
      onProcessorJob: (listener: (payload: unknown) => void) => () => void;
      sendProcessorProgress: (payload: unknown) => void;
      sendProcessorLog: (payload: unknown) => void;
      sendProcessorComplete: (payload: unknown) => void;
      sendProcessorFailed: (payload: unknown) => void;
      readFile: (filePath: string) => Promise<ArrayBuffer>;
      readAsset: (assetPath: string) => Promise<ArrayBuffer>;
      cacheInputFile: (payload: { name: string; data: ArrayBuffer }) => Promise<string>;
      statFile: (filePath: string) => Promise<{ path: string; name: string; size: number; mtimeMs: number }>;
      writeOutput: (payload: { filePath: string; data: ArrayBuffer }) => Promise<string>;
    };
  }
}

export function isDesktopRuntime(): boolean {
  return Boolean(window.rivaldoDesktop?.isDesktop);
}

export function isProcessorRuntime(): boolean {
  return Boolean(window.rivaldoDesktop?.isProcessor);
}

export function getDesktopApi() {
  return window.rivaldoDesktop ?? null;
}

export function fileToDesktopRef(file: File | null, assetUrl?: string): DesktopFileRef | null {
  if (!file) return null;
  const pathValue = (file as File & { path?: string }).path;
  if (!pathValue && !assetUrl) throw new Error(`O arquivo ${file.name} nao expos um path local no runtime desktop.`);
  return { path: pathValue, assetUrl, name: file.name, size: file.size, mtimeMs: Date.now() };
}

export function buildOutputPath(baseDirectory: string, filename: string): string {
  const safeName = filename.trim().replace(/[<>:"/\\|?*]+/g, '_');
  return `${baseDirectory.replace(/[\\/]$/, '')}\\${safeName.endsWith('.mp3') ? safeName : `${safeName}.mp3`}`;
}