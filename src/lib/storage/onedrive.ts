import { supabase } from '@/integrations/supabase/client';

/** Microsoft Graph requires upload chunks to be a multiple of 320 KiB. 10 MiB is a safe + fast default. */
const CHUNK_SIZE = 10 * 1024 * 1024;

export interface OneDriveUploadResult {
  fileId: string;
  webUrl: string;
  filename: string;
  size: number;
}

export interface OneDriveUploadProgress {
  uploaded: number;
  total: number;
  fraction: number;
}

export interface OneDriveUploadOptions {
  folderPath: string;
  filename: string;
  blob: Blob;
  onProgress?: (progress: OneDriveUploadProgress) => void;
}

function buildIsoWeekFolder(date: Date = new Date()): string {
  // ISO week computation
  const target = new Date(date.valueOf());
  const dayNr = (date.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay()) + 7) % 7);
  }
  const week = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  const year = new Date(date).getFullYear();
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Builds Snakepit/<YYYY>-W<NN>/ from an episode date string (YYYY-MM-DD) or now. */
export function buildEpisodeFolderPath(episodeDate?: string): string {
  const date = episodeDate ? new Date(`${episodeDate}T12:00:00`) : new Date();
  return `Snakepit/${buildIsoWeekFolder(date)}`;
}

/** Sanitizes a filename for OneDrive (no <>:"/\|?*) and strips control chars. */
export function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 200);
  return cleaned.toLowerCase().endsWith('.mp3') ? cleaned : `${cleaned}.mp3`;
}

async function callEdgeFunction(payload: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('upload-episode-to-onedrive', { body: payload });
  if (error) throw new Error(error.message || 'Falha ao chamar edge function');
  if (data?.ok === false || data?.error) {
    const details = data?.diagnostics ? ` (${JSON.stringify(data.diagnostics)})` : '';
    throw new Error(`${data.error || 'Falha no upload OneDrive'}${details}`);
  }
  return data;
}

/** Uploads a Blob to OneDrive in chunks via a Graph upload session. */
export async function uploadEpisodeToOneDrive(opts: OneDriveUploadOptions): Promise<OneDriveUploadResult> {
  const filename = sanitizeFilename(opts.filename);
  const total = opts.blob.size;

  // 1. Initiate upload session via edge function (proxies Graph + creates folders)
  const session = await callEdgeFunction({
    action: 'initiate',
    folderPath: opts.folderPath,
    filename,
    fileSize: total,
  }) as { uploadUrl: string; folderItemId: string; filename: string };

  // 2. PUT chunks directly to the Graph upload URL (pre-signed, no auth header needed)
  let uploaded = 0;
  let lastResponse: Response | null = null;
  while (uploaded < total) {
    const end = Math.min(uploaded + CHUNK_SIZE, total);
    const chunk = opts.blob.slice(uploaded, end);
    const range = `bytes ${uploaded}-${end - 1}/${total}`;
    const res = await fetch(session.uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': String(end - uploaded),
        'Content-Range': range,
      },
      body: chunk,
    });
    if (!res.ok && res.status !== 202) {
      const text = await res.text().catch(() => '');
      throw new Error(`Upload chunk falhou [${res.status}]: ${text || range}`);
    }
    lastResponse = res;
    uploaded = end;
    opts.onProgress?.({ uploaded, total, fraction: uploaded / total });
  }

  if (!lastResponse) throw new Error('Nenhum chunk enviado');
  const finalJson = await lastResponse.json().catch(() => null) as { id?: string; webUrl?: string; name?: string; size?: number } | null;
  if (!finalJson?.id) throw new Error('Resposta final do OneDrive sem fileId');

  return {
    fileId: finalJson.id,
    webUrl: finalJson.webUrl || '',
    filename: finalJson.name || filename,
    size: finalJson.size || total,
  };
}
