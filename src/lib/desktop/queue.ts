import { getPresetAssetUrl } from '@/lib/assets/presets';
import { buildOutputPath, getDesktopApi, isDesktopRuntime } from '@/lib/desktop/runtime';
import { DesktopBulkJobPayload, DesktopFileRef, DesktopJob, DesktopPipelineJobPayload, DesktopState } from '@/lib/desktop/types';
import { AudioParams, ProcessingProfile } from '@/lib/audio/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Result<T> = { ok: true; value: T } | { ok: false; error: any };

interface QueueRowLike {
  masterMode: 'single' | 'multi';
  masterFile: File | null;
  masterTracks: File[];
  bgmFile: File | null;
  bgmPreset: string | null;
  filename: string;
}

function ok<T>(value: T): Result<T> { return { ok: true, value }; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fail(error: any): Result<any> { return { ok: false, error }; }

function getOutputDirectory(desktopState: DesktopState | null): Result<string> {
  if (!desktopState) return fail({ code: 'desktop_state_unavailable', message: 'Fila desktop ainda inicializando.' });
  const outputDirectory = desktopState.preferences.outputDirectory?.trim();
  if (!outputDirectory) return fail({ code: 'output_directory_unavailable', message: 'A pasta de saida do desktop nao esta disponivel.' });
  return ok(outputDirectory);
}

function validateFilename(filename: string, field = 'filename'): Result<string> {
  const normalized = filename.trim();
  if (!normalized) return fail({ code: 'filename_missing', message: 'Informe um nome para o arquivo final.', field });
  return ok(normalized);
}

function makePresetRef(assetUrl: string): DesktopFileRef {
  return { name: assetUrl.split('/').pop() || 'preset.mp3', assetUrl };
}

type DesktopTaggedFile = File & { path?: string; __rivaldoDesktopCachedPath?: string; __rivaldoDesktopCachedMtime?: number; };

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
  const existingPath = taggedFile.path || taggedFile.__rivaldoDesktopCachedPath;
  if (existingPath || resolvedAssetUrl) {
    return ok({ path: existingPath, assetUrl: resolvedAssetUrl, name: file.name, size: file.size, mtimeMs: taggedFile.__rivaldoDesktopCachedMtime ?? Date.now() });
  }
  if (!isDesktopRuntime()) return fail({ code: 'file_path_unavailable', message: `O arquivo ${file.name} nao expos um path local.`, field: options.field });
  const desktopApi = getDesktopApi();
  if (!desktopApi) return fail({ code: 'desktop_bridge_unavailable', message: 'Bridge desktop indisponivel.' });
  try {
    const cachedPath = await desktopApi.cacheInputFile({ name: file.name, data: await file.arrayBuffer() });
    Object.defineProperty(taggedFile, '__rivaldoDesktopCachedPath', { value: cachedPath, configurable: true });
    Object.defineProperty(taggedFile, '__rivaldoDesktopCachedMtime', { value: Date.now(), configurable: true });
    return ok({ path: cachedPath, name: file.name, size: file.size, mtimeMs: Date.now() });
  } catch (error) {
    return fail({ code: 'file_path_unavailable', message: error instanceof Error ? error.message : 'Falha ao cachear arquivo.' });
  }
}

async function toMasterRefs(mode: 'single' | 'multi', masterFile: File | null, masterTracks: File[]): Promise<Result<{ master: DesktopFileRef | null; masterTracks: DesktopFileRef[] }>> {
  if (mode === 'single') {
    const r = await toDesktopFileRefResult(masterFile, { field: 'master', label: 'A locucao principal' });
    if (!r.ok) return r;
    return ok({ master: r.value, masterTracks: [] });
  }
  if (masterTracks.length === 0) return fail({ code: 'required_file_missing', message: 'Adicione ao menos uma trilha de voz.' });
  const refs: DesktopFileRef[] = [];
  for (const [index, track] of masterTracks.entries()) {
    const r = await toDesktopFileRefResult(track, { field: `masterTracks[${index}]`, label: `Trilha ${index + 1}` });
    if (!r.ok) return r;
    refs.push(r.value);
  }
  return ok({ master: null, masterTracks: refs });
}

export async function prepareDesktopPipelinePayload(args: {
  desktopState: DesktopState | null; masterMode: 'single' | 'multi'; masterFile: File | null; masterTracks: File[];
  bgmFile: File | null; introFile: File | null; outroFile: File | null; processingProfile: ProcessingProfile; audioParams: AudioParams; filename: string;
}): Promise<Result<DesktopPipelineJobPayload>> {
  const odR = getOutputDirectory(args.desktopState); if (!odR.ok) return odR;
  const fnR = validateFilename(args.filename); if (!fnR.ok) return fnR;
  const mR = await toMasterRefs(args.masterMode, args.masterFile, args.masterTracks); if (!mR.ok) return mR;
  const bgmR = await toDesktopFileRefResult(args.bgmFile, { field: 'bgm', label: 'A BGM', assetUrl: getPresetAssetUrl(args.bgmFile) }); if (!bgmR.ok) return bgmR;
  const introR = await toDesktopFileRefResult(args.introFile, { field: 'intro', label: 'A intro', assetUrl: getPresetAssetUrl(args.introFile) }); if (!introR.ok) return introR;
  const outroR = await toDesktopFileRefResult(args.outroFile, { field: 'outro', label: 'A outro', assetUrl: getPresetAssetUrl(args.outroFile) }); if (!outroR.ok) return outroR;
  return ok({
    masterMode: args.masterMode, master: mR.value.master, masterTracks: mR.value.masterTracks,
    processingProfile: args.processingProfile, audioParams: args.audioParams, bgm: bgmR.value,
    intro: introR.value, outro: outroR.value, filename: fnR.value,
    outputPath: buildOutputPath(odR.value, fnR.value),
  });
}

export async function prepareDesktopBulkPayload(args: {
  desktopState: DesktopState | null; rows: QueueRowLike[]; introFile: File | null; outroFile: File | null;
  audioParams: AudioParams; processingProfile: ProcessingProfile; generateFinalEpisode: boolean;
}): Promise<Result<DesktopBulkJobPayload>> {
  const odR = getOutputDirectory(args.desktopState); if (!odR.ok) return odR;
  const introR = await toDesktopFileRefResult(args.introFile, { field: 'intro', label: 'A intro', assetUrl: getPresetAssetUrl(args.introFile) }); if (!introR.ok) return introR;
  const outroR = await toDesktopFileRefResult(args.outroFile, { field: 'outro', label: 'A outro', assetUrl: getPresetAssetUrl(args.outroFile) }); if (!outroR.ok) return outroR;
  const items: DesktopBulkJobPayload['items'] = [];
  for (const [index, row] of args.rows.entries()) {
    const fnR = validateFilename(row.filename, `items[${index}].filename`); if (!fnR.ok) return fnR;
    const mR = await toMasterRefs(row.masterMode, row.masterFile, row.masterTracks);
    if (!mR.ok) return fail({ ...mR.error, field: mR.error?.field ? `items[${index}].${mR.error.field}` : `items[${index}]` });
    const bgmR = await toDesktopFileRefResult(row.bgmFile, { field: `items[${index}].bgm`, label: `BGM ${index + 1}`, fallbackAssetUrl: row.bgmPreset }); if (!bgmR.ok) return bgmR;
    items.push({ masterMode: row.masterMode, master: mR.value.master, masterTracks: mR.value.masterTracks, bgm: bgmR.value, filename: fnR.value });
  }
  return ok({
    batchName: `Bulk ${new Date().toLocaleString()}`, items, intro: introR.value, outro: outroR.value,
    audioParams: args.audioParams, processingProfile: args.processingProfile, generateFinalEpisode: args.generateFinalEpisode,
    finalEpisodePath: args.generateFinalEpisode ? buildOutputPath(odR.value, 'episodio_final') : undefined,
  });
}

export function mergeQueuedJobIntoState(state: DesktopState | null, job: DesktopJob): DesktopState | null {
  if (!state) return state;
  return { ...state, jobs: [job, ...state.jobs.filter((e) => e.id !== job.id)] };
}