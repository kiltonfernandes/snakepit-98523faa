import { supabase } from '@/integrations/supabase/client';
import { normalizePreprodPauta, preprodDate, type PreprodPauta } from '@/lib/preprod-calendar';

function preprodWeekId(pautaId: string) { return `preprod-${pautaId}`; }
function preprodSlotKey(pautaId: string) { return `preprod-${pautaId.slice(0, 8)}`; }
function preprodMaterialId(pautaId: string) { return `preprod-material-${pautaId}`; }

export async function syncPreprodToEpisodeMaterial(
  pautaId: string,
  publicationDate: string,
  data: Record<string, any>,
): Promise<string> {
  const titles = Array.isArray(data.titles) ? data.titles as { kind?: string; text: string }[] : [];
  const selectedTitle = String(data.selected_title || '').trim();
  const generatedTitleOptions = titles
    .map((title) => ({ text: String(title.text || '').trim() }))
    .filter((title) => title.text);
  const titleOptions = generatedTitleOptions.length > 0
    ? generatedTitleOptions
    : [{ text: selectedTitle || `Pauta de ${publicationDate.split('-').reverse().join('/')}` }];
  let selectedIndex = 0;
  if (selectedTitle) {
    const index = titleOptions.findIndex((title) => title.text === selectedTitle);
    selectedIndex = index >= 0 ? index : 0;
    if (index < 0) titleOptions.unshift({ text: selectedTitle });
  }

  const { data: existingWeek, error: existingWeekError } = await supabase
    .from('editorial_weeks' as any)
    .select('id')
    .eq('start_date', publicationDate)
    .limit(1)
    .maybeSingle();
  if (existingWeekError) throw existingWeekError;

  let weekId = (existingWeek as { id?: string } | null)?.id;
  if (!weekId) {
    weekId = preprodWeekId(pautaId);
    const { error: weekError } = await supabase.from('editorial_weeks' as any).upsert({
      id: weekId,
      start_date: publicationDate,
      status: 'draft',
    } as any, { onConflict: 'id' });
    if (weekError) throw weekError;
  }

  const { data: existingMaterial, error: existingMaterialError } = await supabase
    .from('episode_materials' as any)
    .select('id')
    .eq('preprod_pauta_id', pautaId)
    .limit(1)
    .maybeSingle();
  if (existingMaterialError) throw existingMaterialError;
  const materialId = (existingMaterial as { id?: string } | null)?.id || preprodMaterialId(pautaId);

  const coverUrl = typeof data.cover_url === 'string' && !data.cover_url.startsWith('data:')
    ? data.cover_url
    : null;
  const materialPayload = {
    preprod_pauta_id: pautaId,
    week_id: weekId,
    slot_key: preprodSlotKey(pautaId),
    episode_date: publicationDate,
    title_options_json: titleOptions,
    selected_title_index: selectedIndex,
    description_html: data.description_html || null,
    cover_url: coverUrl,
    cover_source_url: data.cover_source_url || null,
    mentioned_in_episode: data.mentioned || null,
    is_standalone: true,
    updated_at: new Date().toISOString(),
  };
  const materialWrite = existingMaterial
    ? await supabase.from('episode_materials' as any).update(materialPayload as any).eq('id', materialId)
    : await supabase.from('episode_materials' as any).insert({ id: materialId, ...materialPayload } as any);
  const { error: materialError } = materialWrite;
  if (materialError) throw materialError;
  return materialId;
}

/** Rewrites every mirror so legacy and incomplete rows are repaired too. */
export async function backfillPreprodMirrors(pautas: PreprodPauta[]) {
  const results = await Promise.allSettled(pautas.map((pauta) =>
    syncPreprodToEpisodeMaterial(
      pauta.id,
      preprodDate(pauta.publication_date),
      pauta.data || {},
    )
  ));
  const rejected = results.filter((result) => result.status === 'rejected');
  if (rejected.length > 0) {
    console.warn(`[preprod] ${rejected.length} espelho(s) não puderam ser sincronizados`, rejected);
  }
}

/** Called by Rivaldo, making the picker independent from visiting Pré-produção first. */
export async function syncAllPreprodToRivaldo() {
  const { data, error } = await supabase
    .from('preprod_pautas')
    .select('*')
    .order('publication_date', { ascending: true });
  if (error) throw error;
  const pautas = ((data || []) as any[]).map(normalizePreprodPauta);
  await backfillPreprodMirrors(pautas);
}
