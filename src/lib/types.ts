export type WeekStatus = 'draft' | 'in_progress' | 'review' | 'finalized';
export type PautaStatus = 'draft' | 'generated' | 'needs_review' | 'finalized' | 'pesquisa' | 'revisao' | 'criando_materiais' | 'pronto_gravar' | 'pronto_agendar' | 'agendado' | 'publicado';
export type PautaType = 'weekday' | 'saturday' | 'sunday';

export type DaySlot = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export interface Release {
  id: string;
  artist: string;
  album: string;
  release_date: string;
  rating: number | null;
  comments: string | null;
  created_at: string;
  updated_at: string;
  genres?: string[];
  country?: string | null;
  youtube_url?: string | null;
  spotify_url?: string | null;
  deezer_url?: string | null;
  apple_music_url?: string | null;
  bandcamp_url?: string | null;
  metal_archives_url?: string | null;
}

export interface EditorialWeek {
  id: string;
  start_date: string;
  status: WeekStatus;
  created_at: string;
  updated_at: string;
}

export interface PautaSections {
  anniversary: string;
  review_rafa: string;
  news: string;
  review_kilton: string;
  next_week_releases: string;
}

export interface Pauta {
  id: string;
  week_id: string;
  publication_date: string;
  pauta_type: PautaType;
  status: PautaStatus;
  raw_inputs_json: Record<string, unknown>;
  sections_json: Partial<PautaSections>;
  rendered_markdown: string | null;
  rendered_text: string | null;
  warnings_json: unknown[];
  discovered_links_json: unknown[];
  created_at: string;
  updated_at: string;
  finalized_at: string | null;
}

export interface TitleOption {
  text: string;
  style: 'clickbait' | 'curiosidade' | 'impacto';
}

export interface EpisodeMaterial {
  id: string;
  week_id: string;
  slot_key: DaySlot;
  episode_date: string;
  source_pauta_id: string | null;
  title_options_json: TitleOption[];
  selected_title_index: number | null;
  description_html: string | null;
  cover_url: string | null;
  spotify_link: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppSettings {
  singleton_id: number;
  brand_tone_temperature: number;
  banned_terms_text: string;
  default_export_layout: string;
  default_export_container: string;
  theme_name: string;
  prompt_overrides_json: Record<string, string>;
  description_template_html: string;
}

export interface ActivityLog {
  id: string;
  action_type: string;
  entity_type: string;
  entity_id: string | null;
  summary: string;
  details_json: Record<string, unknown>;
  created_at: string;
}

export interface SectionDataSource {
  type: 'free_text' | 'url' | 'releases_lookup' | 'releases_review';
  label: string;
  input_key: string; // maps to raw_inputs_json key
}

export interface PautaTemplateSectionConfig {
  key: string;
  label: string;
  enabled: boolean;
  core_prompt: string;
  data_sources?: SectionDataSource[];
}

export interface PautaTemplate {
  id: string;
  name: string;
  description: string;
  sections_config: PautaTemplateSectionConfig[];
  segway_intro: string;
  segway_outro: string;
  created_at: string;
  updated_at: string;
}

export interface EpisodeCompletionIndicators {
  pauta: boolean;
  title: boolean;
  description: boolean;
  cover: boolean;
  scheduling: boolean;
}
