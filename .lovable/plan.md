## Objetivo

Expor **todos** os prompts editáveis do fluxo avulso direto no "Gerenciar prompts", por tipo de pauta. Hoje só o prompt do tópico (conteúdo) é editável; Título, Descrição e Capa estão hardcoded em `src/lib/standalone-prompts.ts`. pode usar cores e outras manobras apr afacilitar a anvegacao e  estrutura da tela please   
  


&nbsp;

## Como vai ficar a tela

A lista lateral do `PromptTemplatesManager` passa a agrupar por **tipo de pauta** e, dentro de cada tipo, por **estágio**:

```text
🎂 ANIVERSÁRIO
   📝 Conteúdo
      • Aniversário (padrão)
      • [+ Novo]
   🏷️ Título
      • Aniversário · Título (padrão)
   📰 Descrição
      • Aniversário · Descrição (padrão)
   🎨 Capa
      • Aniversário · Capa (padrão)
💿 REVIEW
   📝 Conteúdo
      • Pauta Heavynauta (padrão) · Review Kilton · Álbum Clássico …
   🏷️ Título
      • Review · Título (padrão)
   📰 Descrição …
   🎨 Capa …
📰 NOTÍCIA …
🎙️ ENTREVISTA …
✨ OUTRO …
```

Cada estágio segue o mesmo padrão dos prompts atuais: built-in bloqueado, "Duplicar" para criar variação editável, default por estágio + tipo, reorder com setas, descrição curta, query do Google e query de imagens (apenas no estágio Conteúdo).

## Mudanças

### 1. Schema (`prompt_templates`)

- Adicionar coluna `stage text NOT NULL DEFAULT 'content'` com valores `content | title | description | cover`.
- Backfill: linhas existentes recebem `stage = 'content'`.
- Atualizar índice de ordenação para `(topic_type, stage, sort_order)`.

### 2. Built-ins (`src/lib/standalone-prompts.ts` + seed)

- Quebrar `PROMPT_TITLE` / `PROMPT_DESCRIPTION` / `PROMPT_COVER` em variantes por tipo (anniversary, review, news, interview, custom). Versão inicial: mesmo texto base com pequenas adaptações de instrução (ex.: review enfatiza nota/disco, notícia enfatiza fato/url).
- Inserir um registro built-in por (tipo × estágio) na `prompt_templates` (`is_builtin = true`, `is_default = true`, `template_text = '__BUILTIN__'`).
- `getStandaloneTitlePrompt / getStandaloneDescriptionPrompt / getStandaloneCoverPrompt` passam a aceitar `topicType` e resolver por tipo.

### 3. `PromptTemplatesManager`

- Estado `editing` ganha `stage`.
- Lista lateral: agrupar por tipo → estágio (sub-cabeçalhos) e mostrar setas de reorder dentro do estágio.
- Form: novo `Select` "Estágio" (Conteúdo / Título / Descrição / Capa). Para `stage !== 'content'`, esconder campos `google_query` / `google_images_query` e mostrar placeholders relevantes (`{{content}}`, `{{title}}`, `{{platform_block}}`).
- "Novo" pré-preenche stage com o estágio atualmente selecionado.

### 4. Resolução no wizard (`NovaPautaWizard.tsx`)

- Helper `resolveStandaloneStagePrompt(stage, episode)`:
  1. Determina **tipo dominante** = `episode.topics[0].type` (regra simples e previsível; se mudar tópico, recalcula).
  2. Busca `prompt_templates` com `stage` + `topic_type` + `is_default = true` (fallback para built-in se nenhum custom default).
  3. Se `template_text === '__BUILTIN__'`, usa `getBuiltinStageText(stage, type)`; senão renderiza o custom com `fill()`.
- `TitleStep`, `DescriptionStep`, `CoverStep` consomem esse helper em vez do prompt fixo. Na UI desses steps, mostrar um chip `Estágio · {tipo dominante}` ao lado do botão "Copiar prompt", com link "editar prompt" que abre o gerenciador na linha certa.

### 5. Persistência leve

- Manter `prompt_overrides_json` em `app_settings` intocado (legacy semanal).
- Nenhuma mudança em pautas já criadas.

## Detalhes técnicos

- `src/lib/prompt-templates.ts`: tipo `PromptTemplate.stage: 'content' | 'title' | 'description' | 'cover'`. `listPromptTemplates({ stage?, topicType? })`.
- Migration cria coluna + backfill + insere built-ins faltantes via `INSERT ... ON CONFLICT DO NOTHING`.
- `TOPIC_TYPE_OPTIONS` continua igual; novo `STAGE_OPTIONS` com label/icon por estágio.
- Nada quebra para pautas semanais legacy: o gerenciador filtra apenas `topic_type IN (anniversary, review, news, interview, custom)`.

## Out of scope

- Não migra os prompts semanais (Pautas Legacy) para esse modelo.
- Não muda a regra de "tipo dominante" para algo mais sofisticado (ex.: por título). Pode evoluir depois.