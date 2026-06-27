import { supabase } from '@/integrations/supabase/client';

export interface BgmTrack {
  id: string;
  name: string;
  genres: string[];
  storage_path: string;
  duration_seconds: number | null;
  created_at: string;
}

const BUCKET = 'bgm';

export async function listBgm(): Promise<BgmTrack[]> {
  const { data, error } = await supabase
    .from('bgm_tracks' as any)
    .select('id, name, genres, storage_path, duration_seconds, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as BgmTrack[];
}

export async function getBgm(id: string): Promise<BgmTrack | null> {
  const { data, error } = await supabase
    .from('bgm_tracks' as any)
    .select('id, name, genres, storage_path, duration_seconds, created_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as BgmTrack) ?? null;
}

function sanitize(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, '_');
}

async function probeDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const audio = document.createElement('audio');
      audio.preload = 'metadata';
      audio.src = url;
      const cleanup = () => { URL.revokeObjectURL(url); };
      audio.onloadedmetadata = () => { const d = audio.duration; cleanup(); resolve(Number.isFinite(d) ? d : null); };
      audio.onerror = () => { cleanup(); resolve(null); };
      setTimeout(() => { cleanup(); resolve(null); }, 8000);
    } catch { resolve(null); }
  });
}

export async function uploadBgm(input: { file: File; name: string; genres: string[] }): Promise<BgmTrack> {
  const ext = (input.file.name.split('.').pop() || 'mp3').toLowerCase();
  const key = `${crypto.randomUUID()}-${sanitize(input.name || 'bgm')}.${ext}`;
  const dur = await probeDuration(input.file);
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(key, input.file, {
    contentType: input.file.type || 'audio/mpeg',
    upsert: false,
  });
  if (upErr) throw upErr;
  const { data, error } = await supabase
    .from('bgm_tracks' as any)
    .insert({
      name: input.name.trim() || input.file.name,
      genres: input.genres,
      storage_path: key,
      duration_seconds: dur,
    })
    .select('id, name, genres, storage_path, duration_seconds, created_at')
    .single();
  if (error) {
    // Try to clean up orphan object
    await supabase.storage.from(BUCKET).remove([key]).catch(() => undefined);
    throw error;
  }
  return data as unknown as BgmTrack;
}

export async function deleteBgm(track: BgmTrack): Promise<void> {
  const { error } = await supabase.from('bgm_tracks' as any).delete().eq('id', track.id);
  if (error) throw error;
  await supabase.storage.from(BUCKET).remove([track.storage_path]).catch(() => undefined);
}

export async function updateBgm(id: string, patch: Partial<Pick<BgmTrack, 'name' | 'genres'>>): Promise<void> {
  const { error } = await supabase.from('bgm_tracks' as any).update(patch).eq('id', id);
  if (error) throw error;
}

/** Create a temporary signed URL for previewing the track in the browser. */
export async function getBgmSignedUrl(track: BgmTrack, expiresIn = 60 * 30): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(track.storage_path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

/** Download the track as a File suitable for the audio pipeline. */
export async function downloadBgmAsFile(idOrTrack: string | BgmTrack): Promise<File> {
  const track = typeof idOrTrack === 'string' ? await getBgm(idOrTrack) : idOrTrack;
  if (!track) throw new Error('BGM não encontrado na biblioteca.');
  const { data, error } = await supabase.storage.from(BUCKET).download(track.storage_path);
  if (error) throw error;
  const safeName = sanitize(track.name) + '.mp3';
  return new File([data], safeName, { type: data.type || 'audio/mpeg' });
}