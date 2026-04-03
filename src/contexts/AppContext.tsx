import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Release, EditorialWeek, Pauta, EpisodeMaterial, AppSettings, DaySlot, PautaSections } from '@/lib/types';
import { DAY_SLOTS } from '@/lib/constants';
import { supabase } from '@/integrations/supabase/client';

interface ActivityEntry {
  id: string;
  action: string;
  details: string;
  timestamp: string;
}

interface AppContextType {
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
  updatePauta: (id: string, p: Partial<Pauta>) => void;
  getPautasForWeek: (weekId: string) => Pauta[];
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

  const loadReleases = useCallback(async () => {
    const { data: relData } = await supabase.from('releases' as any).select('*').order('release_date', { ascending: false });
    if (relData) {
      const { data: genreData } = await supabase.from('release_genres' as any).select('*');
      const genreMap: Record<string, string[]> = {};
      if (genreData) {
        (genreData as any[]).forEach((g: any) => {
          if (!genreMap[g.release_id]) genreMap[g.release_id] = [];
          genreMap[g.release_id].push(g.genre);
        });
      }
      setReleases((relData as any[]).map((r: any) => ({ ...r, genres: genreMap[r.id] || [] })));
    }
  }, []);

  const loadWeeks = useCallback(async () => {
    const { data } = await supabase.from('editorial_weeks' as any).select('*').order('start_date', { ascending: false });
    if (data) setWeeks(data as any[]);
  }, []);

  const loadPautas = useCallback(async () => {
    const { data } = await supabase.from('pautas' as any).select('*');
    if (data) setPautas(data as any[]);
  }, []);

  const loadMaterials = useCallback(async () => {
    const { data } = await supabase.from('episode_materials' as any).select('*');
    if (data) setMaterials(data as any[]);
  }, []);

  const loadSettings = useCallback(async () => {
    const { data } = await supabase.from('app_settings' as any).select('*').eq('singleton_id', 1).single();
    if (data) setSettings(data as any);
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
    loadReleases();
    loadWeeks();
    loadPautas();
    loadMaterials();
    loadSettings();
    loadActivityLog();
  }, [loadReleases, loadWeeks, loadPautas, loadMaterials, loadSettings, loadActivityLog]);

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
    supabase.from('releases' as any).insert({
      id: release.id, artist: release.artist, album: release.album, release_date: release.release_date,
      rating: release.rating, comments: release.comments, created_at: release.created_at, updated_at: release.updated_at,
    } as any).then();
    if (release.genres?.length) {
      const genreRows = release.genres.map(g => ({ release_id: release.id, genre: g }));
      supabase.from('release_genres' as any).insert(genreRows as any).then();
    }
    logActivity('Lançamento criado', `${r.artist} - ${r.album}`);
  }, [logActivity]);

  const updateRelease = useCallback((id: string, r: Partial<Release>) => {
    setReleases(prev => prev.map(x => x.id === id ? { ...x, ...r } : x));
    const { genres, ...dbFields } = r as any;
    supabase.from('releases' as any).update({ ...dbFields, updated_at: now() } as any).eq('id', id).then();
  }, []);

  const deleteRelease = useCallback((id: string) => {
    setReleases(prev => prev.filter(x => x.id !== id));
    supabase.from('releases' as any).delete().eq('id', id).then();
    logActivity('Lançamento removido', id);
  }, [logActivity]);

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
        description_html: null, cover_url: null, spotify_link: null, created_at: now(), updated_at: now(),
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

  const updatePauta = useCallback((id: string, p: Partial<Pauta>) => {
    setPautas(prev => prev.map(x => x.id === id ? { ...x, ...p } : x));
    supabase.from('pautas' as any).update({ ...p, updated_at: now() } as any).eq('id', id).then();
  }, []);

  const getPautasForWeek = useCallback((weekId: string) => pautas.filter(p => p.week_id === weekId), [pautas]);

  const updateMaterial = useCallback((id: string, m: Partial<EpisodeMaterial>) => {
    setMaterials(prev => prev.map(x => x.id === id ? { ...x, ...m } : x));
    supabase.from('episode_materials' as any).update({ ...m, updated_at: now() } as any).eq('id', id).then();
  }, []);

  const getMaterialsForWeek = useCallback((weekId: string) => materials.filter(m => m.week_id === weekId), [materials]);

  const updateSettings = useCallback((s: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...s }));
    supabase.from('app_settings' as any).update(s as any).eq('singleton_id', 1).then();
    logActivity('Configurações atualizadas', JSON.stringify(s));
  }, [logActivity]);

  const importReleases = useCallback((data: Release[]) => {
    const mapped = data.map(r => ({ ...r, id: r.id || uid(), created_at: r.created_at || now(), updated_at: r.updated_at || now() }));
    setReleases(prev => [...mapped, ...prev]);
    logActivity('Import de lançamentos', `${data.length} registros`);
  }, [logActivity]);

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
      releases, weeks, pautas, materials, settings, activityLog,
      addRelease, updateRelease, deleteRelease,
      addWeek, updateWeek, deleteWeek, recalcWeekStatus,
      updatePauta, getPautasForWeek,
      updateMaterial, getMaterialsForWeek,
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
