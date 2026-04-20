---
name: Mentioned in Episode Section
description: "Mencionado no Episódio" field, AI enrichment, sync between pauta inputs and material description
type: feature
---
## "Mencionado neste episódio" flow

### Field locations
- **Pautas → tab Inputs**: `Textarea` per day, saved in `pauta.raw_inputs_json.mentioned_in_episode`. Free text + URLs (1 item per line/paragraph).
- **Calendar → episode modal**: `Textarea` above the description HTML, saved in `episode_materials.mentioned_in_episode` (DB column `text`, nullable).

### Sync rule (SSOT)
- When `generateDescriptionAI` runs, if material has no `mentioned_in_episode` yet, the pauta input is copied over.
- After that, the material column is the source of truth — editing in the calendar modal overrides.

### AI enrichment
- Edge function `enrich-episode-description` (Lovable AI gateway, `google/gemini-2.5-flash`).
- Input: `{ mentioned, currentDescriptionHtml }`. Output: `{ html }` containing `<h3>🎙️ Mencionado neste episódio</h3><ul>...</ul>`.
- One `<li>` per item, leading emoji, 1-2 PT-BR sentences, embedded `<a target="_blank" rel="noopener">` when URL present.
- Helper `src/lib/episode/inject-mentioned.ts` (`injectMentionedSection`, `stripMentionedSection`) inserts the block BEFORE the institutional Heavynauta marker (`<p><b>Heavynauta — Papo Sério...`) — idempotent (replaces existing block).
- Button "Inserir na descrição (IA)" disabled when textarea is empty.

### Prompt builder integration
- `prompt-builder.ts` `buildMaterialDescriptionsPrompt` adds `<mentioned>...</mentioned>` to each `<ep>` when present (material first, falls back to pauta input).
- New default block `material_mentioned_instructions` in `prompt-defaults.ts` tells the AI to render the same `<h3>🎙️ Mencionado neste episódio</h3>` section at the TOP of the description, before the institutional block. Empty → ignore.
- Result: same output whether the user fills the field BEFORE generating the description, or AFTER (using the IA button in the calendar).
