
-- releases (catalogo de lancamentos)
CREATE TABLE public.releases (
  id TEXT PRIMARY KEY,
  artist TEXT NOT NULL,
  album TEXT NOT NULL,
  release_date TEXT NOT NULL,
  rating REAL,
  comments TEXT,
  created_at TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  updated_at TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  UNIQUE(artist, album, release_date)
);
CREATE INDEX idx_releases_release_date ON public.releases(release_date);
CREATE INDEX idx_releases_artist ON public.releases(artist);

-- release_genres (many-to-many)
CREATE TABLE public.release_genres (
  release_id TEXT NOT NULL REFERENCES public.releases(id) ON DELETE CASCADE,
  genre TEXT NOT NULL,
  PRIMARY KEY (release_id, genre)
);
CREATE INDEX idx_release_genres_genre ON public.release_genres(genre);

-- editorial_weeks
CREATE TABLE public.editorial_weeks (
  id TEXT PRIMARY KEY,
  start_date TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  updated_at TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
);

-- pautas (diarias, ligadas a semana)
CREATE TABLE public.pautas (
  id TEXT PRIMARY KEY,
  week_id TEXT NOT NULL REFERENCES public.editorial_weeks(id) ON DELETE CASCADE,
  publication_date TEXT NOT NULL UNIQUE,
  pauta_type TEXT NOT NULL DEFAULT 'weekday',
  status TEXT NOT NULL DEFAULT 'draft',
  raw_inputs_json JSONB NOT NULL DEFAULT '{}',
  sections_json JSONB NOT NULL DEFAULT '{}',
  rendered_markdown TEXT,
  rendered_text TEXT,
  warnings_json JSONB NOT NULL DEFAULT '[]',
  discovered_links_json JSONB NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  updated_at TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  finalized_at TEXT
);
CREATE INDEX idx_pautas_week_id ON public.pautas(week_id);

-- pauta_news_links
CREATE TABLE public.pauta_news_links (
  pauta_id TEXT NOT NULL REFERENCES public.pautas(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  url TEXT NOT NULL,
  PRIMARY KEY (pauta_id, position)
);

-- pauta_releases (join table)
CREATE TABLE public.pauta_releases (
  pauta_id TEXT NOT NULL REFERENCES public.pautas(id) ON DELETE CASCADE,
  release_id TEXT NOT NULL REFERENCES public.releases(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (pauta_id, release_id)
);

-- episode_materials (com spotify_link para agendamento)
CREATE TABLE public.episode_materials (
  id TEXT PRIMARY KEY,
  week_id TEXT NOT NULL REFERENCES public.editorial_weeks(id) ON DELETE CASCADE,
  slot_key TEXT NOT NULL,
  episode_date TEXT NOT NULL,
  source_pauta_id TEXT REFERENCES public.pautas(id) ON DELETE SET NULL,
  title_options_json JSONB NOT NULL DEFAULT '[]',
  selected_title_index INTEGER,
  description_html TEXT,
  cover_url TEXT,
  spotify_link TEXT,
  created_at TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  updated_at TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  UNIQUE(week_id, slot_key)
);
CREATE INDEX idx_episode_materials_week_id ON public.episode_materials(week_id);

-- app_settings (singleton)
CREATE TABLE public.app_settings (
  singleton_id INTEGER PRIMARY KEY DEFAULT 1 CHECK (singleton_id = 1),
  brand_tone_temperature INTEGER NOT NULL DEFAULT 55,
  banned_terms_text TEXT NOT NULL DEFAULT '',
  default_export_layout TEXT NOT NULL DEFAULT 'split',
  default_export_container TEXT NOT NULL DEFAULT 'zip',
  theme_name TEXT NOT NULL DEFAULT 'heavynauta'
);

-- activity_logs
CREATE TABLE public.activity_logs (
  id TEXT PRIMARY KEY,
  action_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  summary TEXT NOT NULL,
  details_json JSONB NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
);
CREATE INDEX idx_activity_logs_created_at ON public.activity_logs(created_at DESC);

-- prompt_sessions
CREATE TABLE public.prompt_sessions (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  target_json JSONB NOT NULL,
  prompt_text TEXT NOT NULL,
  response_text TEXT,
  parsed_payload_json JSONB,
  status TEXT NOT NULL DEFAULT 'prepared',
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  updated_at TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  applied_at TEXT
);

-- Insert default app_settings row
INSERT INTO public.app_settings (singleton_id) VALUES (1);
