import { getDesktopApi, isDesktopRuntime } from '@/lib/desktop/runtime';

const PRESET_ASSET_URL = '__rivaldoPresetAssetUrl';

type TaggedFile = File & { [PRESET_ASSET_URL]?: string };

export interface PresetDefinition {
  label: string;
  url: string;
}

function tagPresetFile(file: File, assetUrl: string): File {
  Object.defineProperty(file, PRESET_ASSET_URL, {
    value: assetUrl, enumerable: false, configurable: true, writable: false,
  });
  return file;
}

async function loadAssetBytes(assetUrl: string): Promise<ArrayBuffer> {
  if (isDesktopRuntime()) {
    const desktopApi = getDesktopApi();
    if (!desktopApi) throw new Error('Desktop API indisponivel para carregar preset empacotado.');
    return desktopApi.readAsset(assetUrl);
  }
  const response = await fetch(assetUrl);
  if (!response.ok) throw new Error(`Falha ao carregar preset ${assetUrl}: ${response.status}`);
  return response.arrayBuffer();
}

export async function loadPresetAsFile(preset: PresetDefinition): Promise<File> {
  const bytes = await loadAssetBytes(preset.url);
  const filename = preset.url.split('/').pop() || `${preset.label}.mp3`;
  return tagPresetFile(new File([bytes], filename, { type: 'audio/mpeg' }), preset.url);
}

export function getPresetAssetUrl(file: File | null): string | undefined {
  if (!file) return undefined;
  return (file as TaggedFile)[PRESET_ASSET_URL];
}