## Objetivo

Adicionar o fluxo **Singles** ao wizard Nova Pauta em Pré-produção. O usuário cadastra canais do YouTube (RSS), o modal lista os vídeos mais recentes, permite enriquecer com IA (banda / single / one-liner), definir insumo por vídeo e seguir o fluxo padrão de pauta — porém a pauta final é **segmentada por vídeo**, cada bloco com link YouTube + Metal Archives.

---

## 1. Banco (migration)

`**youtube_channels**` — CRUD de canais

- `name` (text), `channel_url` (text), `feed_url` (text, RSS), `active` (bool default true)
- created_at / updated_at + trigger
- RLS liberado (padrão do projeto, sem auth)

`**singles_videos**` — cache dos itens do feed + enriquecimento

- `channel_id` (fk youtube_channels)
- `video_id` (text, unique), `video_url`, `title`, `description`, `published_at`
- `band` (text, nullable), `single` (text, nullable), `one_liner` (text, nullable) — preenchidos pela IA
- `enriched_at` (timestamptz, nullable)
- `insumo` (text, nullable) — insumo por vídeo, editável
- Índice em `channel_id`, `published_at desc`

Grants padrão (`authenticated` + `service_role`).

&nbsp;

---

## 2. Wizard Nova Pauta

`NovaPautaWizard.tsx` já tem `review` e `noticia`. Adicionar terceiro botão **Singles** (ícone 🎵). Ao clicar → abre `SinglesPickerModal`.

O `kind` novo `'singles'` entra em `src/lib/preprod-calendar.ts` (`pickKind`, `inferPreprodStep`) e no tipo de `preprod_pautas` (usa o mesmo `payload` JSON — sem migration extra).

---

## 3. `SinglesPickerModal` (novo componente)

Cabeçalho: botão **Cadastrar canal do YouTube** → sub-form (nome + URL do canal). Sistema resolve o `feed_url` automaticamente a partir da URL (padrão `youtube.com/feeds/videos.xml?channel_id=…` ou `?user=…`), com fallback pra colar o RSS manualmente.

&nbsp;

na tela dessa tablema aqui eu preciso ter um  campo de dias para monitorar, as por padrao pode deixar 5 dias, mas eu posso colocar o quanto eu quiser e co base nesses dias voce precisa scrapre o cnal e listar os videos aqui 

**Tabela** (colunas):


| ☑   | Banda | Single | Título do vídeo | One-liner | Insumo | Publicado |
| --- | ----- | ------ | --------------- | --------- | ------ | --------- |


- Coluna Insumo: botão **Insumo** → abre popover/drawer com **Busca manual** (link Google) e **Busca automática (IA :online)** — mesmo padrão do fluxo Notícia. Resposta preenche `singles_videos.insumo` daquela linha.
- Botão **Enriquecer com IA** (topo): roda em lote nos vídeos selecionados sem enrichment. Chama edge function que retorna `{band, single, one_liner}` por vídeo, salva no banco.
- Botão **Atualizar feeds**: rebusca RSS de todos canais ativos, faz upsert em `singles_videos`.
- Botão **Prosseguir** (habilitado com ≥1 selecionado): grava seleção no payload da pauta e segue o wizard (titles → description → cover → pauta).

---

## 4. Edge functions

`**fetch-youtube-channel-feed**` (novo)

- Input: `feed_url`
- Faz fetch do RSS (`youtube.com/feeds/videos.xml`), parseia (entry → id/title/link/published/media:description), retorna array.

`**enrich-singles-videos**` (novo)

- Input: `[{video_id, title, description}]`
- Chama OpenRouter (modelo padrão do projeto) com prompt: "extraia banda, single/álbum e one-liner (1 frase PT-BR) desse anúncio de lançamento". Retorna JSON estruturado por vídeo.

---

## 5. Prompts (`src/lib/preprod-prompts.ts`)

Novo `buildSinglesPautaPrompt({ videos, lengthWords }, settings)`:

- Instrui a IA a gerar **um bloco H1 por vídeo**, na ordem escolhida. Cada bloco contém:
  - `# 🎵 {Banda} — {Single}`
  - Linha com placeholders que o front converte em botões: `[▶️ Ver no YouTube]({video_url})` e `[📚 Metal Archives](https://www.metal-archives.com/search?searchString={banda+single}&type=band_name)`
  - `## Contexto` (baseado no title/description do vídeo)
  - `## Pauta de gravação` (fala do apresentador, ganchos, transições) — **peso 3x no `insumo` daquele vídeo**
- Fechamento único **PENSE NISSO:** no final agrupando os singles do episódio.

`buildTitlesPrompt` e `buildDescriptionPrompt` recebem `singles?: Array<{band, single}>` para contexto quando `kind==='singles'`. Contrato JSON e estrutura HTML permanecem iguais.

---

## 6. UI da pauta renderizada

No `MarkdownView` da pauta, os links já viram `<a>` normais. Não precisa componente novo — o prompt garante que cada vídeo tenha os dois links inline logo abaixo do header. Metal Archives usa search URL (`?searchString=…&type=band_name`) conforme decidido.

---

## Detalhes técnicos

- Reaproveita `AiCallProgressModal` para "Enriquecer com IA" e "Atualizar feeds".
- `payload` da pauta ganha `singles_selection: [{video_id, band, single, video_url, insumo, one_liner}]`.
- Fluxo pós-modal reusa `titles → description → cover → pauta` já existente; só troca o prompt builder quando `kind==='singles'`.
- Nada muda no drag-and-drop do calendário; item de singles aparece igual aos outros.

---

## Arquivos afetados

- **Novos**: `supabase/migrations/…_singles.sql`, `supabase/functions/fetch-youtube-channel-feed/index.ts`, `supabase/functions/enrich-singles-videos/index.ts`, `src/components/pautas/SinglesPickerModal.tsx`, `src/components/pautas/YoutubeChannelsManager.tsx`
- **Editados**: `src/lib/preprod-calendar.ts`, `src/lib/preprod-prompts.ts`, `src/components/pautas/NovaPautaWizard.tsx`, `src/pages/PreProducao.tsx`

---

## Entrega faseada (implementar nesta ordem)

1. Migration + CRUD de canais + refresh de feed (sem IA)
2. Enrichment em lote + coluna insumo por vídeo
3. Prompt novo + geração da pauta segmentada
4. Ajustes finos de UI (badges, ordenação, filtros)