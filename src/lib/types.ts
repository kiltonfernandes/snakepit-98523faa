export type ReleaseStatus = 'pending' | 'reviewed' | 'used' | 'archived';

export interface Release {
  id: string;
  artist: string;
  album: string;
  releaseDate: string;
  genres: string[];
  rating: number;
  comments: string;
  status: ReleaseStatus;
  createdAt: string;
}

export type WeekStatus = 'draft' | 'in_progress' | 'review' | 'finalized';
export type PautaStatus = 'draft' | 'generated' | 'needs_review' | 'finalized';
export type DaySlot = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday';

export interface PautaSections {
  intro: string;
  research: string;
  consolidation: string;
  content: string;
  description: string;
}

export interface Pauta {
  id: string;
  weekId: string;
  daySlot: DaySlot;
  sections: PautaSections;
  status: PautaStatus;
}

export interface TitleOption {
  text: string;
  style: 'clickbait' | 'curiosity' | 'impact';
}

export interface EpisodeMaterial {
  id: string;
  weekId: string;
  daySlot: DaySlot;
  titleOptions: TitleOption[];
  selectedTitle: string;
  descriptionHtml: string;
  coverUrl: string;
  coverData: string | null;
}

export type EpisodeStatus = 'draft' | 'processing' | 'ready' | 'published';

export interface Episode {
  id: string;
  weekId: string;
  daySlot: DaySlot;
  pautaId: string;
  materialId: string;
  audioUrl: string;
  status: EpisodeStatus;
  publishedAt: string | null;
}

export interface EditorialWeek {
  id: string;
  startDate: string;
  status: WeekStatus;
  createdAt: string;
}

export interface AppSettings {
  toneTemperature: number;
  bannedTerms: string[];
  exportDefaults: {
    format: 'mp3' | 'wav';
    bitrate: number;
  };
}
