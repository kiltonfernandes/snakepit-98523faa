# Revamp do Gerenciador de Prompts

## Modelo novo

Cada **template = 1 tipo de pauta** (Aniversário, Review, Notícia, Entrevista, Custom).
Dentro dele, vivem **sub-prompts por componente** — cada componente tem o seu próprio bloco editável.

**Componentes fixos por template:**
- `capa` — direção visual da capa 3000×3000
- `titulo` — geração de opções de título
- `descricao` — HTML/texto da descrição do episódio
- `pauta_completa` — estrutura editorial completa (texto principal)
- `segway` — segways de intro/outro
- `custom` — bloco livre para variações próprias do usuário

## UI (Configurações → Pautas Legacy → Gerenciar prompts)

```text
┌─ Lista (esquerda) ──────────┬─ Editor (direita) ──────────────────┐
│ ANIVERSÁRIO                 │ Nome:        [Aniversário (padrão)]  │
│   • Aniversário (padrão) 🔒 │ Tipo pauta:  [Aniversário ▾]         │
│ REVIEW                      │ Descrição:   [____________________]  │
│   • Review (padrão) 🔒      │ Google query:        [_____________] │
│   • Álbum Clássico          │ Google Imagens query:[_____________] │
│ NOTÍCIA                     │                                       │
│   • Notícia (padrão) 🔒     │ ─ Componentes ──────────────────────  │
│ ENTREVISTA                  │ ▸ Capa            [textarea]          │
│   • Entrevista (padrão) 🔒  │ ▸ Título          [textarea]          │
│ CUSTOM                      │ ▸ Descrição       [textarea]          │
│   + Novo                    │ ▸ Pauta completa  [textarea]          │
│                             │ ▸ Segway          [textarea]          │
│                             │ ▸ Custom          [textarea]          │
│                             │ [Salvar] [Excluir]                    │
└─────────────────────────────┴───────────────────────────────────────┘
```

- Esquerda agrupada por tipo de pauta, **um item por template** (não por componente).
- Reordenação ↑/↓ permanece, mas agora reordena templates dentro do tipo de pauta.
- Builtins continuam read-only; "Duplicar" cria cópia editável.
- Cada bloco de componente é um Accordion colapsável com placeholder próprio (`{{artist}}`, `{{album}}`, `{{input}}`, etc.).

## Detalhes técnicos

### Migration (schema)
- `prompt_templates`: adicionar coluna `components_json jsonb NOT NULL DEFAULT '{}'::jsonb`.
  Formato: `{ capa: string, titulo: string, descricao: string, pauta_completa: string, segway: string, custom: string }`.
- Backfill: para cada template existente, mover `template_text` para o slot de componente correspondente (mapeando o `topic_type` antigo `capa`/`titulo`/`descricao` quando aplicável; templates de pauta inteira vão para `pauta_completa`).
- Consolidar duplicatas: agrupar pelos templates atuais "Aniversário · Capa", "Aniversário · Título", "Aniversário · Descrição", "Aniversário (padrão)" em **1 só** template "Aniversário (padrão)" com os 4 slots preenchidos. Mesmo para Review/Notícia/Entrevista.
- Remover linhas antigas redundantes após o merge.
- `template_text` permanece (legado), mas deixa de ser editado pela UI nova; código novo lê de `components_json`.

### TOPIC_TYPE_OPTIONS
Reduz para apenas tipos de pauta: `anniversary | review | news | interview | custom`.
A noção de "componente" sai do `topic_type` e vira chave dentro de `components_json`.

### `src/lib/prompt-templates.ts`
- Adicionar `components: Record<ComponentKey, string>` na interface `PromptTemplate`.
- Helpers: `getComponentPrompt(template, key)`, `setComponentPrompt(...)`.
- `COMPONENT_KEYS = ['capa','titulo','descricao','pauta_completa','segway','custom']` com labels.

### `src/components/pautas/PromptTemplatesManager.tsx`
- Reescrever editor: campos top-level (nome/tipo/descrição/google_query/google_images_query) + Accordion com 6 textareas de componente.
- Lista da esquerda: agrupar por `topic_type` (tipo de pauta), exibir 1 item por template.
- Reorder ↑/↓ continua dentro do grupo.

### `src/components/pautas/NovaPautaWizard.tsx`
- `usePromptTemplates(topicType)` retorna templates do tipo de pauta selecionado.
- Ao montar o prompt de cada componente (capa/título/descrição/pauta), ler `template.components[<key>]` em vez de `template_text`.
- `imageQuery` continua usando `google_images_query` do template selecionado.

### Standalone prompts builtin (`src/lib/standalone-prompts.ts`)
- Refatorar `getBuiltinTemplateText` para `getBuiltinComponents(topicType)` retornando o objeto de 6 chaves.
- Manter compatibilidade com o que já existe; valores ausentes ficam como string vazia (UI mostra "— vazio —").

## Fora de escopo
- "Query de título" / "query de descrição" como prompts AI separados — usuário pediu para ignorar agora.
- Mudanças no fluxo de geração além de ler do novo formato.

## Ordem de execução
1. Migration: adiciona `components_json`, backfill consolidando templates duplicados, remove os redundantes.
2. Atualizar `prompt-templates.ts` (tipos + helpers).
3. Atualizar `standalone-prompts.ts` (builtin por componente).
4. Reescrever `PromptTemplatesManager.tsx` (lista 1-por-template + editor com accordion).
5. Ajustar `NovaPautaWizard.tsx` para ler `components[<key>]`.
6. Verificar build e fluxo de criação de pauta avulsa.
