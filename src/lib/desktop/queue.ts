import { getPresetAssetUrl } from '@/lib/assets/presets';
import { buildOutputPath, getDesktopApi, isDesktopRuntime } from '@/lib/desktop/runtime';
import { DesktopBulkJobPayload, DesktopFileRef, DesktopJob, DesktopPipelineJobPayload, DesktopState } from '@/lib/desktop/types';
import { AudioParams, ProcessingProfile } from '@/lib/audio/types';

export interface DesktopEnqueueError {
  code: 'desktop_bridge_unavailable' | 'desktop_state_unavailable' | 'output_directory_unavailable' | 'filename_missing' | 'required_file_missing' | 'file_path_unavailable';
  message: string;
  field?: string;
}

type Result<T> = { ok: true; value: T } | { ok: false; error: DesktopEnqueueError };

interface QueueRowLike {
  masterMode: 'single' | 'multi';
  masterFile: File | null;
  masterTracks: File[];
  bgmFile: File | null;
  bgmPreset: string | null;
  filename: string;
}

interface PrepareDesktopPipelineArgs {
  desktopState: DesktopState | null;
  masterMode: 'single' | 'multi';
  masterFile: File | null;
  masterTracks: File[];
  bgmFile: File | null;
  introFile: File | null;
  outroFile: File | null;
  processingProfile: ProcessingProfile;
  audioParams: AudioParams;
  filename: string;
}

interface PrepareDesktopBulkArgs {
  desktopState: DesktopState | null;
  rows: QueueRowLike[];
  introFile: File | null;
  outroFile: File | null;
  audioParams: AudioParams;
  processingProfile: ProcessingProfile;
  generateFinalEpisode: boolean;
}

const CACHED_DESKTOP_PATH = '__rivaldoDesktopCachedPath';
const CACHED_DESKTOP_MTIME = '__rivaldoDesktopCachedMtime';

type DesktopTaggedFile = File & { path?: string; [CACHED_DESKTOP_PATH]?: string; [CACHED_DESKTOP_MTIME]?: number; };

function ok<T>(value: T): Result<T> { return { ok: true, value }; }
function fail<T>(error: DesktopEnqueueError): Result<T> { return { ok: false, error }; }

function getOutputDirectory(desktopState: DesktopState | null): Result<string> {
  if (!desktopState) return fail({ code: 'desktop_state_unavailable', message: 'Fila desktop ainda inicializando.', field: 'desktopState' });
  const outputDirectory = desktopState.preferences.outputDirectory?.trim();
  if (!outputDirectory) return fail({ code: 'output_directory_unavailable', message: 'A pasta de saida do desktop nao esta disponivel.', field: 'outputDirectory' });
  return ok(outputDirectory);
}

function validateFilename(filename: string, field = 'filename'): Result<string> {
  const normalized = filename.trim();
  if (!normalized) return fail({ code: 'filename_missing', message: 'Informe um nome para o arquivo final antes de enfileirar.', field });
  return ok(normalized);
}

function makePresetRef(assetUrl: string): DesktopFileRef {
  const name = assetUrl.split('/').pop() || 'preset.mp3';
  return { name, assetUrl };
}

function getAccessibleDesktopPath(file: DesktopTaggedFile): { path?: string; mtimeMs?: number } {
  return { path: file.path || file[CACHED_DESKTOP_PATH], mtimeMs: file[CACHED_DESKTOP_MTIME] };
}

async function readFileBytes(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return new Response(file).arrayBuffer();
}

async function ensureDesktopPath(file: DesktopTaggedFile): Promise<Result<{ path: string; mtimeMs?: number }>> {
  const accessible = getAccessibleDesktopPath(file);
  if (accessible.path) return ok({ path: accessible.path, mtimeMs: accessible.mtimeMs });
  if (!isDesktopRuntime()) return fail({ code: 'file_path_unavailable', message: `O arquivo ${file.name} nao expos um path local no runtime desktop.`, field: 'file' });
  const desktopApi = getDesktopApi();
  if (!desktopApi) return fail({ code: 'desktop_bridge_unavailable', message: 'Bridge desktop indisponivel no renderer.', field: 'desktopApi' });
  try {
    const cachedPath = await desktopApi.cacheInputFile({ name: file.name, data: await readFileBytes(file) });
    Object.defineProperty(file, CACHED_DESKTOP_PATH, { value: cachedPath, configurable: true });
    Object.defineProperty(file, CACHED_DESKTOP_MTIME, { value: Date.now(), configurable: true });
    return ok({ path: cachedPath, mtimeMs: file[CACHED_DESKTOP_MTIME] });
  } catch (error) {
    return fail({ code: 'file_path_unavailable', message: error instanceof Error ? error.message : `O arquivo ${file.name} nao expos um path local no runtime desktop.`, field: 'file' });
  }
}

export async function toDesktopFileRefResult(
  file: File | null,
  options: { field: string; label: string; assetUrl?: string; fallbackAssetUrl?: string | null }
): Promise<Result<DesktopFileRef>> {
  const resolvedAssetUrl = options.assetUrl ?? options.fallbackAssetUrl ?? undefined;
  if (!file) {
    if (resolvedAssetUrl) return ok(makePresetRef(resolvedAssetUrl));
    return fail({ code: 'required_file_missing', message: `${options.label} nao foi selecionado.`, field: options.field });
  }
  const taggedFile = file as DesktopTaggedFile;
  const accessible = getAccessibleDesktopPath(taggedFile);
  if (accessible.path || resolvedAssetUrl) {
    return ok({ path: accessible.path, assetUrl: resolvedAssetUrl, name: file.name, size: file.size, mtimeMs: accessible.mtimeMs ?? Date.now() });
  }
  const pathResult = await ensureDesktopPath(taggedFile);
  if (!pathResult.ok) return fail({ ...pathResult.error, field: options.field });
  return ok({ path: pathResult.value.path, name: file.name, size: file.size, mtimeMs: pathResult.value.mtimeMs ?? Date.now() });
}

async function toMasterRefs(mode: 'single' | 'multi', masterFile: File | null, masterTracks: File[]): Promise<Result<{ master: DesktopFileRef | null; masterTracks: DesktopFileRef[] }>> {
  if (mode === 'single') {
    const masterResult = await toDesktopFileRefResult(masterFile, { field: 'master', label: 'A locucao principal' });
    if (!masterResult.ok) return masterResult;
    return ok({ master: masterResult.value, masterTracks: [] });
  }
  if (masterTracks.length === 0) return fail({ code: 'required_file_missing', message: 'Adicione ao menos uma trilha de voz antes de enfileirar.', field: 'masterTracks' });
  const refs: DesktopFileRef[] = [];
  for (const [index, track] of masterTracks.entries()) {
    const refResult = await toDesktopFileRefResult(track, { field: `masterTracks[${index}]`, label: `A trilha de voz ${index + 1}` });
    if (!refResult.ok) return refResult;
    refs.push(refResult.value);
  }
  return ok({ master: null, masterTracks: refs });
}

export async function prepareDesktopPipelinePayload(args: PrepareDesktopPipelineArgs): Promise<Result<DesktopPipelineJobPayload>> {
  const outputDirectoryResult = getOutputDirectory(args.desktopState);
  if (!outputDirectoryResult.ok) return outputDirectoryResult;
  const filenameResult = validateFilename(args.filename);
  if (!filenameResult.ok) return filenameResult;
  const masterResult = await toMasterRefs(args.masterMode, args.masterFile, args.masterTracks);
  if (!masterResult.ok) return masterResult;
  const bgmResult = await toDesktopFileRefResult(args.bgmFile, { field: 'bgm', label: 'A BGM', assetUrl: getPresetAssetUrl(args.bgmFile) });
  if (!bgmResult.ok) return bgmResult;
  const introResult = await toDesktopFileRefResult(args.introFile, { field: 'intro', label: 'A intro', assetUrl: getPresetAssetUrl(args.introFile) });
  if (!introResult.ok) return introResult;
  const outroResult = await toDesktopFileRefResult(args.outroFile, { field: 'outro', label: 'A outro', assetUrl: getPresetAssetUrl(args.outroFile) });
  if (!outroResult.ok) return outroResult;
  return ok({
    masterMode: args.masterMode, master: masterResult.value.master, masterTracks: masterResult.value.masterTracks,
    processingProfile: args.processingProfile, audioParams: args.audioParams, bgm: bgmResult.value,
    intro: introResult.value, outro: outroResult.value, filename: filenameResult.value,
    outputPath: buildOutputPath(outputDirectoryResult.value, filenameResult.value),
  });
}

export async function prepareDesktopBulkPayload(args: PrepareDesktopBulkArgs): Promise<Result<DesktopBulkJobPayload>> {
  const outputDirectoryResult = getOutputDirectory(args.desktopState);
  if (!outputDirectoryResult.ok) return outputDirectoryResult;
  const introResult = await toDesktopFileRefResult(args.introFile, { field: 'intro', label: 'A intro', assetUrl: getPresetAssetUrl(args.introFile) });
  if (!introResult.ok) return introResult;
  const outroResult = await toDesktopFileRefResult(args.outroFile, { field: 'outro', label: 'A outro', assetUrl: getPresetAssetUrl(args.outroFile) });
  if (!outroResult.ok) return outroResult;
  const items: DesktopBulkJobPayload['items'] = [];
  for (const [index, row] of args.rows.entries()) {
    const filenameResult = validateFilename(row.filename, `items[${index}].filename`);
    if (!filenameResult.ok) return filenameResult;
    const masterResult = await toMasterRefs(row.masterMode, row.masterFile, row.masterTracks);
    if (!masterResult.ok) return fail({ ...masterResult.error, field: masterResult.error.field ? `items[${index}].${masterResult.error.field}` : `items[${index}]` });
    const bgmResult = await toDesktopFileRefResult(row.bgmFile, { field: `items[${index}].bgm`, label: `A BGM do item ${index + 1}`, fallbackAssetUrl: row.bgmPreset });
    if (!bgmResult.ok) return bgmResult;
    items.push({ masterMode: row.masterMode, master: masterResult.value.master, masterTracks: masterResult.value.masterTracks, bgm: bgmResult.value, filename: filenameResult.value });
  }
  return ok({
    batchName: `Bulk ${new Date().toLocaleString()}`, items, intro: introResult.value, outro: outroResult.value,
    audioParams: args.audioParams, processingProfile: args.processingProfile, generateFinalEpisode: args.generateFinalEpisode,
    finalEpisodePath: args.generateFinalEpisode ? buildOutputPath(outputDirectoryResult.value, 'episodio_final') : undefined,
  });
}

export function mergeQueuedJobIntoState(state: DesktopState | null, job: DesktopJob): DesktopState | null {
  if (!state) return state;
  const jobs = [job, ...state.jobs.filter((existing) => existing.id !== job.id)];
  return { ...state, jobs };
}