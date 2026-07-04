---
name: Singles flow (Pré-produção)
description: Round-up de novos singles via canais do YouTube com pauta segmentada por vídeo
type: feature
---

Fluxo "Singles" no wizard Nova Pauta (`PreProducao.tsx`).

- Tabelas: `youtube_channels` (nome, channel_url, feed_url, monitor_days, active) e `singles_videos` (cache de vídeos + band/single/one_liner/insumo por vídeo).
- Edge functions: `fetch-youtube-channel-feed` (parse RSS `feeds/videos.xml`, resolve handle→channel_id) e `enrich-singles-videos` (OpenRouter, extrai banda/single/one-liner).
- Componente: `src/components/pautas/SinglesPickerModal.tsx` — CRUD de canais, tabela de vídeos com checkbox, botão "Atualizar feeds", "Enriquecer com IA", campo `monitor_days` (default 5), insumo por vídeo via popover com busca manual (Google) e IA (web-research).
- Prompt: `buildSinglesPautaPrompt` — 1 bloco H1 por vídeo com header `# 🎵 {Banda} — {Single}` + linha `[▶️ Ver no YouTube](url) · [📚 Metal Archives](search url)`. Insumo do vídeo tem peso 3x dentro do bloco correspondente. Metal Archives usa `search?searchString=…&type=band_name`.
- Step novo `singles_pick` (após kind, antes de config). Payload da pauta guarda `singles_selection: SinglesVideoInput[]`. Titles/description prompts recebem `singles` para contexto.
- Não usa release_id. runGenerateAll bypassa `insumo` global quando `kind==='singles'`; validação exige ≥1 vídeo selecionado.