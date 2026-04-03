import { getPresetAssetUrl } from '@/lib/assets/presets';
import { buildOutputPath, getDesktopApi, isDesktopRuntime } from '@/lib/desktop/runtime';
import { DesktopBulkJobPayload, DesktopFileRef, DesktopJob, DesktopPipelineJobPayload, DesktopState } from '@/lib/desktop/types';
import { AudioParams, ProcessingProfile } from '@/lib/audio/types';

export interface DesktopEnqueueError {
  code: string;
  message: string;
  field?: string;
}

type Result<T> = { ok: true; value: T } | { ok: false; error: DesktopEnqueueError };

function ok<T>(value: T): Result<T> { return { ok: true, value }; }
function fail(error: DesktopEnqueueError): Result<never> { return { ok: false, error }; }

function getOutputDirectory(desktopState: DesktopState | null): Result<string> {
  if (!desktopState) return fail({ code: 'desktop_state_unavailable', message: 'Fila desktop ainda inicializando.', field: 'desktopState' });
  const dir = desktopState.preferences.outputDirectory?.trim();
  if (!dir) return fail({ code: 'output_directory_unavailable', message: 'Pasta de saida indisponivel.', field: 'outputDirectory' });
  return ok(dir);
}

function validateFilename(filename: string, field = 'filename'): Result<string> {
  const n = filename.trim();
  if (!n) return fail({ code: 'filename_missing', message: 'Informe um nome para o arquivo final.', field });
  return ok(n);
}

function makePresetRef(assetUrl: string): DesktopFileRef {
  return { name: assetUrl.split('/').pop() || 'preset.mp3', assetUrl };
}

type DesktopTaggedFile = File & { path?: string; __rivaldoDesktopCachedPath?: string; __rivaldoDesktopCachedMtime?: number };

function getAccessibleDesktopPath(file: DesktopTaggedFile) {
  return { path: file.path || file.__rivaldoDesktopCachedPath, mtimeMs: file.__rivaldoDesktopCachedMtime };
}

async function ensureDesktopPath(file: DesktopTaggedFile): Promise<Result<{ path: string; mtimeMs?: number }>> {
  const acc = getAccessibleDesktopPath(file);
  if (acc.path) return ok({ path: acc.path, mtimeMs: acc.mtimeMs });
  if (!isDesktopRuntime()) return fail({ code: 'file_path_unavailable', message: `${file.name} sem path local.`, field: 'file' });
  const api = getDesktopApi();
  if (!api) return fail({ code: 'desktop_bridge_unavailable', message: 'Bridge desktop indisponivel.', field: 'desktopApi' });
  try {
    const cached = await api.cacheInputFile({ name: file.name, data: await file.arrayBuffer() });
    Object.defineProperty(file, '__rivaldoDesktopCachedPath', { value: cached, configurable: true });
    Object.defineProperty(file, '__rivaldoDesktopCachedMtime', { value: Date.now(), configurable: true });
    return ok({ path: cached, mtimeMs: file.__rivaldoDesktopCachedMtime });
  } catch (e) {
    return fail({ code: 'file_path_unavailable', message: e instanceof Error ? e.message : `${file.name} sem path.`, field: 'file' });
  }
}

export async function toDesktopFileRefResult(file: File | null, options: { field: string; label: string; assetUrl?: string; fallbackAssetUrl?: string | null }): Promise<Result<DesktopFileRef>> {
  const resolved = options.assetUrl ?? options.fallbackAssetUrl ?? undefined;
  if (!file) {
    if (resolved) return ok(makePresetRef(resolved));
    return fail({ code: 'required_file_missing', message: `${options.label} nao foi selecionado.`, field: options.field });
  }
  const tagged = file as DesktopTaggedFile;
  const acc = getAccessibleDesktopPath(tagged);
  if (acc.path || resolved) return ok({ path: acc.path, assetUrl: resolved, name: file.name, size: file.size, mtimeMs: acc.mtimeMs ?? Date.now() });
  const pr = await ensureDesktopPath(tagged);
  if (!pr.ok) return fail({ ...pr.error, field: options.field });
  return ok({ path: pr.value.path, name: file.name, size: file.size, mtimeMs: pr.value.mtimeMs ?? Date.now() });
}

async function toMasterRefs(mode: 'single' | 'multi', masterFile: File | null, masterTracks: File[]): Promise<Result<{ master: DesktopFileRef | null; masterTracks: DesktopFileRef[] }>> {
  if (mode === 'single') {
    const r = await toDesktopFileRefResult(masterFile, { field: 'master', label: 'A locucao principal' });
    if (!r.ok) return r as unknown as Result<{ master: DesktopFileRef | null; masterTracks: DesktopFileRef[] }>;
    return ok({ master: r.value, masterTracks: [] });
  }
  if (masterTracks.length === 0) return fail({ code: 'required_file_missing', message: 'Adicione ao menos uma trilha.', field: 'masterTracks' });
  const refs: DesktopFileRef[] = [];
  for (const [i, t] of masterTracks.entries()) {
    const r = await toDesktopFileRefResult(t, { field: `masterTracks[${i}]`, label: `Trilha ${i + 1}` });
    if (!r.ok) return r as unknown as Result<{ master: DesktopFileRef | null; masterTracks: DesktopFileRef[] }>;
    refs.push(r.value);
  }
  return ok({ master: null, masterTracks: refs });
}

interface PrepareDesktopPipelineArgs { desktopState: DesktopState | null; masterMode: 'single' | 'multi'; masterFile: File | null; masterTracks: File[]; bgmFile: File | null; introFile: File | null; outroFile: File | null; processingProfile: ProcessingProfile; audioParams: AudioParams; filename: string; }

export async function prepareDesktopPipelinePayload(args: PrepareDesktopPipelineArgs): Promise<Result<DesktopPipelineJobPayload>> {
  const od = getOutputDirectory(args.desktopState); if (!od.ok) return od as unknown as Result<DesktopPipelineJobPayload>;
  const fn = validateFilename(args.filename); if (!fn.ok) return fn as unknown as Result<DesktopPipelineJobPayload>;
  const mr = await toMasterRefs(args.masterMode, args.masterFile, args.masterTracks); if (!mr.ok) return mr as unknown as Result<DesktopPipelineJobPayload>;
  const bgm = await toDesktopFileRefResult(args.bgmFile, { field: 'bgm', label: 'A BGM', assetUrl: getPresetAssetUrl(args.bgmFile) }); if (!bgm.ok) return bgm as unknown as Result<DesktopPipelineJobPayload>;
  const intro = await toDesktopFileRefResult(args.introFile, { field: 'intro', label: 'A intro', assetUrl: getPresetAssetUrl(args.introFile) }); if (!intro.ok) return intro as unknown as Result<DesktopPipelineJobPayload>;
  const outro = await toDesktopFileRefResult(args.outroFile, { field: 'outro', label: 'A outro', assetUrl: getPresetAssetUrl(args.outroFile) }); if (!outro.ok) return outro as unknown as Result<DesktopPipelineJobPayload>;
  return ok({ masterMode: args.masterMode, master: mr.value.master, masterTracks: mr.value.masterTracks, processingProfile: args.processingProfile, audioParams: args.audioParams, bgm: bgm.value, intro: intro.value, outro: outro.value, filename: fn.value, outputPath: buildOutputPath(od.value, fn.value) });
}

interface QueueRowLike { masterMode: 'single' | 'multi'; masterFile: File | null; masterTracks: File[]; bgmFile: File | null; bgmPreset: string | null; filename: string; }
interface PrepareDesktopBulkArgs { desktopState: DesktopState | null; rows: QueueRowLike[]; introFile: File | null; outroFile: File | null; audioParams: AudioParams; processingProfile: ProcessingProfile; generateFinalEpisode: boolean; }

export async function prepareDesktopBulkPayload(args: PrepareDesktopBulkArgs): Promise<Result<DesktopBulkJobPayload>> {
  const od = getOutputDirectory(args.desktopState); if (!od.ok) return od as unknown as Result<DesktopBulkJobPayload>;
  const intro = await toDesktopFileRefResult(args.introFile, { field: 'intro', label: 'A intro', assetUrl: getPresetAssetUrl(args.introFile) }); if (!intro.ok) return intro as unknown as Result<DesktopBulkJobPayload>;
  const outro = await toDesktopFileRefResult(args.outroFile, { field: 'outro', label: 'A outro', assetUrl: getPresetAssetUrl(args.outroFile) }); if (!outro.ok) return outro as unknown as Result<DesktopBulkJobPayload>;
  const items: DesktopBulkJobPayload['items'] = [];
  for (const [i, row] of args.rows.entries()) {
    const fn = validateFilename(row.filename, `items[${i}].filename`); if (!fn.ok) return fn as unknown as Result<DesktopBulkJobPayload>;
    const mr = await toMasterRefs(row.masterMode, row.masterFile, row.masterTracks);
    if (!mr.ok) return fail({ ...mr.error, field: mr.error.field ? `items[${i}].${mr.error.field}` : `items[${i}]` }) as unknown as Result<DesktopBulkJobPayload>;
    const bgm = await toDesktopFileRefResult(row.bgmFile, { field: `items[${i}].bgm`, label: `BGM ${i + 1}`, fallbackAssetUrl: row.bgmPreset }); if (!bgm.ok) return bgm as unknown as Result<DesktopBulkJobPayload>;
    items.push({ masterMode: row.masterMode, master: mr.value.master, masterTracks: mr.value.masterTracks, bgm: bgm.value, filename: fn.value });
  }
  return ok({ batchName: `Bulk ${new Date().toLocaleString()}`, items, intro: intro.value, outro: outro.value, audioParams: args.audioParams, processingProfile: args.processingProfile, generateFinalEpisode: args.generateFinalEpisode, finalEpisodePath: args.generateFinalEpisode ? buildOutputPath(od.value, 'episodio_final') : undefined });
}

export function mergeQueuedJobIntoState(state: DesktopState | null, job: DesktopJob): DesktopState | null {
  if (!state) return state;
  return { ...state, jobs: [job, ...state.jobs.filter((e) => e.id !== job.id)] };
}
