

# Plano: Database Lovable Cloud + Pipeline Semanal Correto

## Contexto

O usuario quer:
1. Criar o schema completo no banco Lovable Cloud baseado no Snakepit original
2. Importar os 667 releases + 937 genres do export SQL
3. Corrigir o Dashboard para mostrar um **pipeline de completude real** por episodio e por semana
4. Agendamento = campo `spotify_link` no episode_materials (quando preenchido = agendado)
5. Secoes corretas das pautas: `anniversary`, `review_rafa`, `news`, `review_kilton`, `next_week_releases` (sabado)
6. Domingo incluido no fluxo de materiais

## 1. Schema do Banco (Migration)

Tabelas a criar, baseadas no database-reference.md original:

```sql
-- releases (catalogo de lancamentos)
CREATE TABLE public.releases (
  id TEXT PRIMARY KEY,
  artist TEXT NOT NULL,
  album TEXT NOT NULL,
  release_date TEXT NOT NULL,
  rating REAL,
  comments TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(artist, album, release_date)
);
CREATE INDEX idx_releases_release_date ON public.releases(release_date);
CREATE INDEX idx_releases_artist ON public.releases(artist);

-- release_genres (many-to-one)
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
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
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
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
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
  spotify_link TEXT,           -- NOVO: quando preenchido = episodio agendado
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
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
  created_at TEXT NOT NULL
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
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  applied_at TEXT
);
```

RLS: todas as tabelas com RLS desabilitado inicialmente (app single-user sem auth nesta fase).

## 2. Import dos Releases

Executar o SQL de import via `psql` (split em releases + release_genres, usando `ON CONFLICT DO NOTHING`).

## 3. Atualizar Tipos TypeScript

Reescrever `src/lib/types.ts` para refletir o schema real:

- `DaySlot` inclui `'sunday'`
- `PautaSections` mapeado para as secoes reais: `anniversary`, `review_rafa`, `news`, `review_kilton`, `next_week_releases`
- `EpisodeMaterial` ganha campo `spotify_link`
- Remover tipos que nao existem no schema real (ex: `Episode` separado -- tudo vive em `episode_materials`)

## 4. Pipeline Semanal no Dashboard (logica correta)

O pipeline mostra **completude por episodio** com 5 indicadores:

```text
Episodio (dia)     Pauta  Titulo  Descricao  Capa  Agendamento
─────────────────  ─────  ──────  ─────────  ────  ───────────
Segunda            ●      ●       ○          ○     ○
Terca              ●      ●       ●          ○     ○
Quarta             ○      ○       ○          ○     ○
...
```

- **Pauta**: `pautas.status = 'finalized'`
- **Titulo**: `episode_materials.selected_title_index IS NOT NULL`
- **Descricao**: `episode_materials.description_html IS NOT NULL`
- **Capa**: `episode_materials.cover_url IS NOT NULL`
- **Agendamento**: `episode_materials.spotify_link IS NOT NULL`

Cada indicador e um circulo (verde/cinza). A barra de progresso da semana = % de indicadores verdes / total.

As semanas do ano mostram barras de progresso agregadas.

## 5. Campo Spotify Link no Calendario

No modal do episodio no Calendario, adicionar input "Link Spotify" que salva em `episode_materials.spotify_link`. Quando preenchido, o episodio e considerado agendado.

## 6. Secoes Corretas das Pautas

Dias da semana (seg-sex): `anniversary`, `review_rafa`, `news`, `review_kilton`
Sabado: `next_week_releases`

Atualizar `PAUTA_SECTIONS` em constants.ts e a UI de Pautas.

## 7. Refatorar AppContext

Trocar o state local por queries Supabase (`@tanstack/react-query` + supabase client). Manter a mesma interface publica do contexto para nao quebrar as paginas.

## Arquivos afetados

| Arquivo | Mudanca |
|---|---|
| Migration SQL | Schema completo (novo) |
| `src/lib/types.ts` | Tipos alinhados ao schema real |
| `src/lib/constants.ts` | Secoes corretas, domingo adicionado |
| `src/contexts/AppContext.tsx` | Queries Supabase em vez de useState |
| `src/pages/Dashboard.tsx` | Pipeline de completude real |
| `src/pages/Pautas.tsx` | Secoes corretas |
| `src/pages/CalendarView.tsx` | Campo spotify_link |
| `src/pages/Materials.tsx` | Domingo, spotify_link |

