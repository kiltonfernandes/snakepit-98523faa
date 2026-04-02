import React, { createContext, useContext, useState, useCallback } from 'react';
import { Release, EditorialWeek, Pauta, EpisodeMaterial, Episode, AppSettings, DaySlot, PautaSections, TitleOption } from '@/lib/types';

interface ActivityEntry {
  id: string;
  action: string;
  details: string;
  timestamp: string;
}

interface AppState {
  releases: Release[];
  weeks: EditorialWeek[];
  pautas: Pauta[];
  materials: EpisodeMaterial[];
  episodes: Episode[];
  settings: AppSettings;
  activityLog: ActivityEntry[];
}

interface AppContextType extends AppState {
  // Releases
  addRelease: (r: Omit<Release, 'id' | 'createdAt'>) => void;
  updateRelease: (id: string, r: Partial<Release>) => void;
  deleteRelease: (id: string) => void;
  // Weeks
  addWeek: (startDate: string) => EditorialWeek;
  updateWeek: (id: string, w: Partial<EditorialWeek>) => void;
  // Pautas
  updatePauta: (id: string, p: Partial<Pauta>) => void;
  getPautasForWeek: (weekId: string) => Pauta[];
  // Materials
  updateMaterial: (id: string, m: Partial<EpisodeMaterial>) => void;
  getMaterialsForWeek: (weekId: string) => EpisodeMaterial[];
  // Episodes
  updateEpisode: (id: string, e: Partial<Episode>) => void;
  getEpisodesForWeek: (weekId: string) => Episode[];
  // Settings
  updateSettings: (s: Partial<AppSettings>) => void;
  // Activity
  logActivity: (action: string, details: string) => void;
  // Import/Export
  importReleases: (data: Release[]) => void;
}

const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

const DAY_SLOTS: DaySlot[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const defaultSettings: AppSettings = {
  toneTemperature: 0.7,
  bannedTerms: [],
  exportDefaults: { format: 'mp3', bitrate: 192 },
};

const emptySections: PautaSections = { intro: '', research: '', consolidation: '', content: '', description: '' };

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [releases, setReleases] = useState<Release[]>([]);
  const [weeks, setWeeks] = useState<EditorialWeek[]>([]);
  const [pautas, setPautas] = useState<Pauta[]>([]);
  const [materials, setMaterials] = useState<EpisodeMaterial[]>([]);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([]);

  const logActivity = useCallback((action: string, details: string) => {
    setActivityLog(prev => [{ id: uid(), action, details, timestamp: now() }, ...prev]);
  }, []);

  const addRelease = useCallback((r: Omit<Release, 'id' | 'createdAt'>) => {
    const release: Release = { ...r, id: uid(), createdAt: now() };
    setReleases(prev => [release, ...prev]);
    logActivity('Lançamento criado', `${r.artist} - ${r.album}`);
  }, [logActivity]);

  const updateRelease = useCallback((id: string, r: Partial<Release>) => {
    setReleases(prev => prev.map(x => x.id === id ? { ...x, ...r } : x));
  }, []);

  const deleteRelease = useCallback((id: string) => {
    setReleases(prev => prev.filter(x => x.id !== id));
    logActivity('Lançamento removido', id);
  }, [logActivity]);

  const addWeek = useCallback((startDate: string) => {
    const week: EditorialWeek = { id: uid(), startDate, status: 'draft', createdAt: now() };
    setWeeks(prev => [week, ...prev]);

    const newPautas: Pauta[] = DAY_SLOTS.map(slot => ({
      id: uid(), weekId: week.id, daySlot: slot, sections: { ...emptySections }, status: 'draft',
    }));
    setPautas(prev => [...prev, ...newPautas]);

    const newMaterials: EpisodeMaterial[] = DAY_SLOTS.map(slot => ({
      id: uid(), weekId: week.id, daySlot: slot, titleOptions: [], selectedTitle: '', descriptionHtml: '', coverUrl: '', coverData: null,
    }));
    setMaterials(prev => [...prev, ...newMaterials]);

    const newEpisodes: Episode[] = DAY_SLOTS.map((slot, i) => ({
      id: uid(), weekId: week.id, daySlot: slot, pautaId: newPautas[i].id, materialId: newMaterials[i].id, audioUrl: '', status: 'draft', publishedAt: null,
    }));
    setEpisodes(prev => [...prev, ...newEpisodes]);

    logActivity('Semana criada', `Início: ${startDate}`);
    return week;
  }, [logActivity]);

  const updateWeek = useCallback((id: string, w: Partial<EditorialWeek>) => {
    setWeeks(prev => prev.map(x => x.id === id ? { ...x, ...w } : x));
  }, []);

  const updatePauta = useCallback((id: string, p: Partial<Pauta>) => {
    setPautas(prev => prev.map(x => x.id === id ? { ...x, ...p } : x));
  }, []);

  const getPautasForWeek = useCallback((weekId: string) => pautas.filter(p => p.weekId === weekId), [pautas]);

  const updateMaterial = useCallback((id: string, m: Partial<EpisodeMaterial>) => {
    setMaterials(prev => prev.map(x => x.id === id ? { ...x, ...m } : x));
  }, []);

  const getMaterialsForWeek = useCallback((weekId: string) => materials.filter(m => m.weekId === weekId), [materials]);

  const updateEpisode = useCallback((id: string, e: Partial<Episode>) => {
    setEpisodes(prev => prev.map(x => x.id === id ? { ...x, ...e } : x));
  }, []);

  const getEpisodesForWeek = useCallback((weekId: string) => episodes.filter(e => e.weekId === weekId), [episodes]);

  const updateSettings = useCallback((s: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...s }));
    logActivity('Configurações atualizadas', JSON.stringify(s));
  }, [logActivity]);

  const importReleases = useCallback((data: Release[]) => {
    setReleases(prev => [...data.map(r => ({ ...r, id: r.id || uid(), createdAt: r.createdAt || now() })), ...prev]);
    logActivity('Import de lançamentos', `${data.length} registros`);
  }, [logActivity]);

  return (
    <AppContext.Provider value={{
      releases, weeks, pautas, materials, episodes, settings, activityLog,
      addRelease, updateRelease, deleteRelease,
      addWeek, updateWeek,
      updatePauta, getPautasForWeek,
      updateMaterial, getMaterialsForWeek,
      updateEpisode, getEpisodesForWeek,
      updateSettings, logActivity, importReleases,
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
