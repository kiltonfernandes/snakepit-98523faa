# Project Memory

## Core
- Locale `pt-BR`, `date-fns`. Week MUST start on Monday in all views.
- Sort order is ALWAYS chronological (oldest to newest) by default.
- Supabase RLS is strictly enforced for logs, settings, and app data.
- Deletions MUST trigger an `AlertDialog` confirmation.
- `vite.config.ts`: `worker: { format: 'es' }` is mandatory for Rivaldo Web Workers.
- `src/index.css`: `@import` MUST precede `@tailwind`.

## Memories
- [Visual Branding](mem://style/visual-direction) — Modern dark-first aesthetics, Heavynauta colors, logo usage
- [Prompt Protocol](mem://features/pautas-prompt-protocol) — Looping URL Synthesizer, snakepit_response tags, Gemini streaming
- [Tone Laboratory](mem://features/tone-laboratory) — Writing styles (Surgical, Incendiary), Banned Terms safety rules
- [Cover Generator](mem://features/procedural-cover-generator) — 3000x3000 procedural covers, CORS proxy, source persistence
- [Export Flow](mem://features/episode-export-flow) — ZIP package exports, multi-week text exports
- [Data Persistence](mem://tech/architecture-migration) — Supabase SSOT, atomic genre updates, cover load optimization
- [Editorial Picker](mem://features/pautas-editorial-picker) — ISO Week grouping, Saturday window logic, strict deduplication
- [Flow Wizard](mem://features/pautas-flow-wizard) — Guided editorial input flow and batch generation tracking
- [Preview Mode](mem://features/pautas-preview-mode) — Tag clearing, H1-H4 structure, dynamic quick links
- [Bulk Parser](mem://features/releases-bulk-parser) — MetalStorm structured text parser, ignores numeric ratings
- [Dynamic Links](mem://features/releases-dynamic-links) — 3-layer resolution (Override -> Search -> Fallback)
- [Auto Repair](mem://features/materials-auto-repair) — Recreates missing episode_materials for sync consistency
- [Materials Generation](mem://features/materials-content-generation) — AI titles, description templates, Sunday compilation
- [Audio Workstation](mem://features/rivaldo-audio-workstation) — Rivaldo 3.2, RNNoise, sharedWorker bulk processing
- [Audio Params](mem://features/rivaldo-processing-logic) — Silence removal thresholds, ducking timings, MP3 bitrates
- [Dashboard](mem://style/dashboard-hierarchy) — Current Week, History, Releases tabs
- [Calendar](mem://features/calendar-visual-enhancements) — Episode visualization, quick actions
- [Releases UI](mem://style/releases-card-design) — Compact cards, SVG country flags, review badges, quick tag filters
- [Releases Enrichment](mem://features/releases-enrichment) — LLM country repatriation via Artist/Album/Genre
- [Pauta Templates](mem://features/pauta-template-system) — Dynamic inputs, multi-episode per day support
- [Public View](mem://features/public-week-view) — Shareable /week/:id, dynamic links, fallback logic
- [Analytics](mem://features/release-analytics-dashboard) — Drilldown support, Scene presets (Country + Genre)
- [Anniversary Automations](mem://features/anniversary-automation-system) — Wikipedia REST API extraction
- [News Automation](mem://features/news-automation-system) — RSS scraping and translation via Gemini
- [Saturday Structure](mem://constraints/saturday-content-structure-v2) — Highlights + 20 Others, specific AI description formatting
- [Data Maintenance](mem://tech/data-maintenance-cron) — pg_cron job for pruning >72h cover images
- [Editorial Workstation](mem://features/editorial-workstation) — Tabs structure, central Management tab for episode status
- [Status Workflow](mem://features/pauta-status-workflow) — Dynamic status progression (Pesquisa to Publicado)
- [UI Labels & Patterns](mem://style/ui-labels) — Week labels, custom calendar, workspace CSS Grid
- [AI Usage Monitoring](mem://features/ai-usage-monitoring) — Token/cost tracking via ai_usage_logs
- [OneDrive Upload](mem://features/onedrive-upload) — Rivaldo MP3 → Snakepit/YYYY-Www/ via Graph upload session, retry, materials sync, delete action
- [Mentioned in Episode](mem://features/episode-mentioned-section) — Field on materials + pautas, AI enrichment via enrich-episode-description, idempotent HTML injection before institutional block

- [Autosave Queue](mem://tech/autosave-queue) — Debounced/ordered/retried persistence for pauta+material inputs, with localStorage snapshot recovery
- [Singles flow](mem://features/singles-flow) — Round-up de singles via canais do YouTube (RSS), enriquecimento IA, pauta segmentada por vídeo
