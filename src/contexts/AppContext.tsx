import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Release, EditorialWeek, Pauta, EpisodeMaterial, AppSettings, DaySlot, PautaSections } from '@/lib/types';
import { DAY_SLOTS } from '@/lib/constants';
import { supabase } from '@/integrations/supabase/client';
import { enqueueUpdate, recoverAutosaveSnapshots } from '@/lib/autosave-queue';
import { setQueryTemplateOverrides } from '@/lib/google-query-templates';
import { fetchAllRows } from '@/lib/supabase-paginate';

interface ActivityEntry {
  id: string;
  action: string;
  details: string;
  timestamp: string;
}

interface AppContextType {
  dataReady: boolean;
  loadMaterialCover: (id: string) => Promise<string | null>;
  releases: Release[];
  weeks: EditorialWeek[];
  pautas: Pauta[];
  materials: EpisodeMaterial[];
  settings: AppSettings;
  activityLog: ActivityEntry[];
  addRelease: (r: Omit<Release, 'id' | 'created_at' | 'updated_at'>) => void;
  updateRelease: (id: string, r: Partial<Release>) => void;
  deleteRelease: (id: string) => void;
  addWeek: (startDate: string) => EditorialWeek;
  updateWeek: (id: string, w: Partial<EditorialWeek>) => void;
  deleteWeek: (id: string) => void;
  recalcWeekStatus: (weekId: string) => void;
  addPauta: (pauta: Pauta) => void;
  updatePauta: (id: string, p: Partial<Pauta>) => void;
  deletePauta: (id: string) => void;
  getPautasForWeek: (weekId: string) => Pauta[];
  addMaterial: (material: EpisodeMaterial) => void;
  updateMaterial: (id: string, m: Partial<EpisodeMaterial>) => void;
  getMaterialsForWeek: (weekId: string) => EpisodeMaterial[];
  updateSettings: (s: Partial<AppSettings>) => void;
  logActivity: (action: string, details: string) => void;
  importReleases: (data: Release[]) => void;
  loadReleases: () => Promise<void>;
  savePromptSession: (session: { id: string; scope: string; prompt_text: string; target_json: any; status?: string }) => void;
}

const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

const defaultSettings: AppSettings = {
  singleton_id: 1,
  brand_tone_temperature: 55,
  banned_terms_text: '',
  default_export_layout: 'split',
  default_export_container: 'zip',
  theme_name: 'heavynauta',
  prompt_overrides_json: {},
  description_template_html: '',
  ai_model: 'google/gemini-2.5-flash',
  google_query_templates_json: {},
};

const emptySections: PautaSections = {
  anniversary: '', review_rafa: '', news: '', review_kilton: '', next_week_releases: '',
};

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [releases, setReleases] = useState<Release[]>([]);
  const [weeks, setWeeks] = useState<EditorialWeek[]>([]);
  const [pautas, setPautas] = useState<Pauta[]>([]);
  const [materials, setMaterials] = useState<EpisodeMaterial[]>([]);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([]);
  const [dataReady, setDataReady] = useState(false);

  const loadReleases = useCallback(async () => {
    // Paginate both tables in parallel — bypasses PostgREST's 1000-row default cap.
    const [relData, genreData] = await Promise.all([
      fetchAllRows<any>('releases', '*', { column: 'release_date', ascending: false }),
      fetchAllRows<any>('release_genres', '*'),
    ]);
    const genreMap: Record<string, string[]> = {};
    for (const g of genreData) {
      if (!genreMap[g.release_id]) genreMap[g.release_id] = [];
      genreMap[g.release_id].push(g.genre);
    }
    setReleases(relData.map((r: any) => ({ ...r, genres: genreMap[r.id] || [] })));
  }, []);

  const persistReleaseGenres = useCallback(async (releaseId: string, genres?: string[]) => {
    const cleanedGenres = (genres || []).map((genre) => genre.trim()).filter(Boolean);

    const { error: deleteGenresError } = await supabase.from('release_genres' as any).delete().eq('release_id', releaseId);
    if (deleteGenresError) throw deleteGenresError;

    if (cleanedGenres.length === 0) return;

    const genreRows = cleanedGenres.map((genre) => ({ release_id: releaseId, genre }));
    const { error: insertGenresError } = await supabase.from('release_genres' as any).insert(genreRows as any);
    if (insertGenresError) throw insertGenresError;
  }, []);

  const loadWeeks = useCallback(async () => {
    const { data } = await supabase.from('editorial_weeks' as any).select('*').order('start_date', { ascending: false });
    if (data) setWeeks(data as any[]);
  }, []);

  const loadPautas = useCallback(async () => {
    const data = await fetchAllRows<any>('pautas', '*');
    setPautas(data);
  }, []);

  const loadMaterials = useCallback(async () => {
    // Exclude cover_url from initial load — it can be multi-MB base64 and causes timeouts
    try {
      const data = await fetchAllRows<any>(
        'episode_materials',
        'id,week_id,slot_key,episode_date,source_pauta_id,title_options_json,selected_title_index,description_html,spotify_link,cover_source_url,repository_url,repository_file_id,repository_provider,repository_uploaded_at,mentioned_in_episode,cover_saved_at,created_at,updated_at',
      );
      // Preserve any cover_url already in local state (loaded on demand)
      setMaterials(prev => {
        const coverMap = new Map(prev.filter(m => m.cover_url).map(m => [m.id, m.cover_url]));
        return data.map((m: any) => ({ ...m, cover_url: coverMap.get(m.id) || null }));
      });
    } catch (e: any) {
      console.error('[loadMaterials] error:', e?.message ?? e);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    const { data } = await supabase.from('app_settings' as any).select('*').eq('singleton_id', 1).single();
    if (data) {
      setSettings(data as any);
      setQueryTemplateOverrides((data as any).google_query_templates_json || {});
    }
  }, []);

  const loadActivityLog = useCallback(async () => {
    const { data } = await supabase.from('activity_logs' as any).select('*').order('created_at', { ascending: false }).limit(200);
    if (data) {
      setActivityLog((data as any[]).map((d: any) => ({
        id: d.id, action: d.action_type, details: d.summary, timestamp: d.created_at,
      })));
    }
  }, []);

  useEffect(() => {
    Promise.all([loadReleases(), loadWeeks(), loadPautas(), loadMaterials(), loadSettings(), loadActivityLog()])
      .finally(() => {
        setDataReady(true);
        // Re-enqueue any pending edits saved locally from a prior session/refresh.
        recoverAutosaveSnapshots();
      });
  }, [loadReleases, loadWeeks, loadPautas, loadMaterials, loadSettings, loadActivityLog]);

  // Auto-recalc week statuses after pautas change
  useEffect(() => {
    if (weeks.length === 0 || pautas.length === 0) return;
    weeks.forEach(w => {
      const weekPautas = pautas.filter(p => p.week_id === w.id);
      if (weekPautas.length === 0) return;
      const allPublished = weekPautas.every(p => p.status === 'publicado' || p.status === 'agendado');
      const allReady = weekPautas.every(p => ['revisao', 'criando_materiais', 'pronto_gravar', 'pronto_agendar', 'agendado', 'publicado', 'finalized'].includes(p.status));
      const anyInProgress = weekPautas.some(p => p.status !== 'draft' && p.status !== 'pesquisa');
      let expected = 'draft';
      if (allPublished) expected = 'finalized';
      else if (allReady) expected = 'review';
      else if (anyInProgress) expected = 'in_progress';
      if (w.status !== expected) {
        setWeeks(prev => prev.map(x => x.id === w.id ? { ...x, status: expected as any } : x));
        supabase.from('editorial_weeks' as any).update({ status: expected, updated_at: now() } as any).eq('id', w.id).then();
      }
    });
  }, [pautas]);

  const logActivity = useCallback((action: string, details: string) => {
    const entry = { id: uid(), action, details, timestamp: now() };
    setActivityLog(prev => [entry, ...prev]);
    supabase.from('activity_logs' as any).insert({
      id: entry.id, action_type: action, entity_type: 'system', summary: details, created_at: entry.timestamp,
    } as any).then();
  }, []);

  const addRelease = useCallback((r: Omit<Release, 'id' | 'created_at' | 'updated_at'>) => {
    const release: Release = { ...r, id: uid(), created_at: now(), updated_at: now() };
    setReleases(prev => [release, ...prev]);

    void (async () => {
      try {
        const { error: releaseError } = await supabase.from('releases' as any).insert({
          id: release.id,
          artist: release.artist,
          album: release.album,
          release_date: release.release_date,
          rating: release.rating,
          comments: release.comments,
          youtube_url: release.youtube_url || null,
          spotify_url: release.spotify_url || null,
          deezer_url: release.deezer_url || null,
          apple_music_url: release.apple_music_url || null,
          bandcamp_url: release.bandcamp_url || null,
          metal_archives_url: release.metal_archives_url || null,
          created_at: release.created_at,
          updated_at: release.updated_at,
        } as any);
        if (releaseError) throw releaseError;

        await persistReleaseGenres(release.id, release.genres);
        await loadReleases();
        logActivity('Lançamento criado', `${r.artist} - ${r.album}`);
      } catch (error) {
        console.error('Erro ao salvar lançamento:', error);
        await loadReleases();
      }
    })();
  }, [loadReleases, logActivity, persistReleaseGenres]);

  const updateRelease = useCallback((id: string, r: Partial<Release>) => {
    setReleases(prev => prev.map(x => x.id === id ? { ...x, ...r } : x));

    void (async () => {
      try {
        const { genres, ...dbFields } = r as any;
        const { error: updateError } = await supabase.from('releases' as any).update({
          ...dbFields,
          updated_at: now(),
        } as any).eq('id', id);
        if (updateError) throw updateError;

        if (genres) {
          await persistReleaseGenres(id, genres);
        }

        await loadReleases();
      } catch (error) {
        console.error('Erro ao atualizar lançamento:', error);
        await loadReleases();
      }
    })();
  }, [loadReleases, persistReleaseGenres]);

  const deleteRelease = useCallback((id: string) => {
    setReleases(prev => prev.filter(x => x.id !== id));

    void (async () => {
      try {
        const { error: deleteGenresError } = await supabase.from('release_genres' as any).delete().eq('release_id', id);
        if (deleteGenresError) throw deleteGenresError;

        const { error: deleteReleaseError } = await supabase.from('releases' as any).delete().eq('id', id);
        if (deleteReleaseError) throw deleteReleaseError;

        logActivity('Lançamento removido', id);
      } catch (error) {
        console.error('Erro ao remover lançamento:', error);
        await loadReleases();
      }
    })();
  }, [loadReleases, logActivity]);

  const addWeek = useCallback((startDate: string) => {
    const week: EditorialWeek = { id: uid(), start_date: startDate, status: 'draft', created_at: now(), updated_at: now() };
    setWeeks(prev => [week, ...prev]);
    supabase.from('editorial_weeks' as any).insert(week as any).then();

    const newPautas: Pauta[] = DAY_SLOTS.map((slot, i) => {
      const pubDate = new Date(startDate);
      pubDate.setDate(pubDate.getDate() + i);
      const pautaType = slot.key === 'saturday' ? 'saturday' : slot.key === 'sunday' ? 'sunday' : 'weekday';
      return {
        id: uid(), week_id: week.id, publication_date: pubDate.toISOString().slice(0, 10),
        pauta_type: pautaType as any, status: 'draft', raw_inputs_json: {}, sections_json: { ...emptySections },
        rendered_markdown: null, rendered_text: null, warnings_json: [], discovered_links_json: [],
        created_at: now(), updated_at: now(), finalized_at: null,
      };
    });
    setPautas(prev => [...prev, ...newPautas]);
    supabase.from('pautas' as any).insert(newPautas as any).then();

    const newMaterials: EpisodeMaterial[] = DAY_SLOTS.map((slot, i) => {
      const epDate = new Date(startDate);
      epDate.setDate(epDate.getDate() + i);
      return {
        id: uid(), week_id: week.id, slot_key: slot.key, episode_date: epDate.toISOString().slice(0, 10),
        source_pauta_id: newPautas[i].id, title_options_json: [], selected_title_index: null,
        description_html: null, cover_url: null, cover_source_url: null, spotify_link: null, repository_url: null,
        repository_file_id: null, repository_provider: null, repository_uploaded_at: null, mentioned_in_episode: null,
        cover_saved_at: null, created_at: now(), updated_at: now(),
      };
    });
    setMaterials(prev => [...prev, ...newMaterials]);
    supabase.from('episode_materials' as any).insert(newMaterials as any).then();

    logActivity('Semana criada', `Início: ${startDate}`);
    return week;
  }, [logActivity]);

  const updateWeek = useCallback((id: string, w: Partial<EditorialWeek>) => {
    setWeeks(prev => prev.map(x => x.id === id ? { ...x, ...w } : x));
    supabase.from('editorial_weeks' as any).update({ ...w, updated_at: now() } as any).eq('id', id).then();
  }, []);

  const deleteWeek = useCallback((id: string) => {
    setWeeks(prev => prev.filter(x => x.id !== id));
    setPautas(prev => prev.filter(x => x.week_id !== id));
    setMaterials(prev => prev.filter(x => x.week_id !== id));
    // DB cascade: delete pautas and materials first, then week
    supabase.from('episode_materials' as any).delete().eq('week_id', id).then(() => {
      supabase.from('pautas' as any).delete().eq('week_id', id).then(() => {
        supabase.from('editorial_weeks' as any).delete().eq('id', id).then();
      });
    });
    logActivity('Semana removida', id);
  }, [logActivity]);

  const recalcWeekStatus = useCallback((weekId: string) => {
    setPautas(prev => {
      const weekPautas = prev.filter(p => p.week_id === weekId);
      if (weekPautas.length === 0) return prev;
      const allFinalized = weekPautas.every(p => p.status === 'finalized');
      const anyNeedsReview = weekPautas.some(p => p.status === 'needs_review');
      const anyGenerated = weekPautas.some(p => p.status !== 'draft');
      let status: string = 'draft';
      if (allFinalized) status = 'finalized';
      else if (anyNeedsReview) status = 'review';
      else if (anyGenerated) status = 'in_progress';
      setWeeks(w => w.map(x => x.id === weekId ? { ...x, status: status as any } : x));
      supabase.from('editorial_weeks' as any).update({ status, updated_at: now() } as any).eq('id', weekId).then();
      return prev;
    });
  }, []);

  const addPauta = useCallback((pauta: Pauta) => {
    setPautas(prev => [...prev, pauta]);
    supabase.from('pautas' as any).insert(pauta as any).then();
    logActivity('Pauta criada', `Data: ${pauta.publication_date}`);
  }, [logActivity]);

  const updatePauta = useCallback((id: string, p: Partial<Pauta>) => {
    setPautas(prev => prev.map(x => x.id === id ? { ...x, ...p } : x));
    // Route persistence through the autosave queue: debounced, ordered, retried,
    // snapshot to localStorage so nothing is lost on refresh or transient errors.
    enqueueUpdate('pautas', id, p as any);
  }, []);

  const deletePauta = useCallback((id: string) => {
    setPautas(prev => prev.filter(p => p.id !== id));
    setMaterials(prev => prev.filter(m => m.source_pauta_id !== id));
    void (async () => {
      try {
        await supabase.from('episode_materials' as any).delete().eq('source_pauta_id', id);
        await supabase.from('pautas' as any).delete().eq('id', id);
        logActivity('Pauta removida', id);
      } catch (e) {
        console.error('deletePauta failed', e);
      }
    })();
  }, [logActivity]);

  const getPautasForWeek = useCallback((weekId: string) => pautas.filter(p => p.week_id === weekId), [pautas]);

  const updateMaterial = useCallback((id: string, m: Partial<EpisodeMaterial>) => {
    setMaterials(prev => prev.map(x => x.id === id ? { ...x, ...m } : x));
    enqueueUpdate('episode_materials', id, m as any);
  }, []);

  const addMaterial = useCallback((material: EpisodeMaterial) => {
    setMaterials(prev => [...prev, material]);
    supabase.from('episode_materials' as any).insert(material as any).then();
  }, []);

  const getMaterialsForWeek = useCallback((weekId: string) => materials.filter(m => m.week_id === weekId), [materials]);

  const loadMaterialCover = useCallback(async (id: string): Promise<string | null> => {
    // Check local state first
    const local = materials.find(m => m.id === id);
    if (local?.cover_url) return local.cover_url;
    // Fetch from DB
    const { data } = await supabase
      .from('episode_materials' as any)
      .select('cover_url')
      .eq('id', id)
      .single();
    const coverUrl = (data as any)?.cover_url || null;
    if (coverUrl) {
      setMaterials(prev => prev.map(m => m.id === id ? { ...m, cover_url: coverUrl } : m));
    }
    return coverUrl;
  }, [materials]);

  const updateSettings = useCallback((s: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...s }));
    if (s.google_query_templates_json) {
      setQueryTemplateOverrides(s.google_query_templates_json);
    }
    supabase.from('app_settings' as any).update(s as any).eq('singleton_id', 1).then();
    logActivity('Configurações atualizadas', JSON.stringify(s));
  }, [logActivity]);

  const importReleases = useCallback((data: Release[]) => {
    const mapped = data.map(r => ({ ...r, id: r.id || uid(), created_at: r.created_at || now(), updated_at: r.updated_at || now() }));
    setReleases(prev => [...mapped, ...prev]);

    void (async () => {
      try {
        const releaseRows = mapped.map((release) => ({
          id: release.id,
          artist: release.artist,
          album: release.album,
          release_date: release.release_date,
          rating: release.rating,
          comments: release.comments,
          youtube_url: release.youtube_url || null,
          spotify_url: release.spotify_url || null,
          deezer_url: release.deezer_url || null,
          apple_music_url: release.apple_music_url || null,
          bandcamp_url: release.bandcamp_url || null,
          metal_archives_url: release.metal_archives_url || null,
          created_at: release.created_at,
          updated_at: release.updated_at,
        }));

        const { error: insertReleasesError } = await supabase.from('releases' as any).insert(releaseRows as any);
        if (insertReleasesError) throw insertReleasesError;

        const genreRows = mapped.flatMap((release) =>
          (release.genres || []).map((genre) => ({ release_id: release.id, genre: genre.trim() })).filter((row) => row.genre)
        );

        if (genreRows.length > 0) {
          const { error: insertGenresError } = await supabase.from('release_genres' as any).insert(genreRows as any);
          if (insertGenresError) throw insertGenresError;
        }

        await loadReleases();
        logActivity('Import de lançamentos', `${data.length} registros`);
      } catch (error) {
        console.error('Erro ao importar lançamentos:', error);
        await loadReleases();
      }
    })();
  }, [loadReleases, logActivity]);

  const savePromptSession = useCallback((session: { id: string; scope: string; prompt_text: string; target_json: any; status?: string }) => {
    supabase.from('prompt_sessions' as any).insert({
      id: session.id,
      scope: session.scope,
      prompt_text: session.prompt_text,
      target_json: session.target_json,
      status: session.status || 'prepared',
    } as any).then();
    logActivity('Prompt gerado', `Escopo: ${session.scope}`);
  }, [logActivity]);

  return (
    <AppContext.Provider value={{
      dataReady,
      releases, weeks, pautas, materials, settings, activityLog,
      addRelease, updateRelease, deleteRelease,
      addWeek, updateWeek, deleteWeek, recalcWeekStatus,
      addPauta, updatePauta, deletePauta, getPautasForWeek,
      addMaterial, updateMaterial, getMaterialsForWeek, loadMaterialCover,
      updateSettings, logActivity, importReleases, loadReleases,
      savePromptSession,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
