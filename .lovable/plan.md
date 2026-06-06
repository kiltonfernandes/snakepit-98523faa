## 1. Botões de link do release no topo do tópico

Em `TopicStep` (src/components/pautas/NovaPautaWizard.tsx), quando `selectedRelease` existir, renderizar uma linha de botões compactos logo abaixo do cabeçalho (acima do bloco "Prompt do componente"):

- **Metal Archives** → `selectedRelease.metal_archives_url`
- **YouTube** → `selectedRelease.youtube_url`
- **Spotify** → `selectedRelease.spotify_url`
- (bônus, mesmos campos já existem) Deezer / Apple Music / Bandcamp aparecem só se o release tiver a URL preenchida — mantém compacto.

Cada botão abre o link em nova aba (`target="_blank" rel="noopener noreferrer"`). Botões só aparecem se a URL existir; se nenhuma existir, a barra inteira fica oculta. Ícone `ExternalLink` + label curto, variante `outline` `size="sm"`.

## 2. Toggle "Gerar tudo" + pipeline automatizado

Ao lado do botão **Gerar pauta** (em `TopicStep`), adicionar um `Switch` com label "Gerar tudo". O estado fica em `localStorage` (`pauta_wizard_gerar_tudo`) para persistir entre sessões.

Quando o toggle está **ON** e o usuário clica em **Gerar pauta**, em vez de só gerar a pauta, dispara a pipeline completa neste tópico, usando o `AiCallProgressModal` global com estágios nomeados:

```
1. Pesquisa web (DeepSeek + web search)
   → invoca `web-research` com a googleQuery do template
   → merge no `topic.notes`
2. Atualizar prompt
   → re-aplica `regeneratePrompt` (anexa as notas ao prompt_text)
3. Gerar pauta
   → streamGeneratePauta com o prompt atualizado → `topic.response_text`
4. Gerar títulos
   → usa `getStandaloneTitlePrompt` (mesmo prompt do TitleStep, honra `template_id`)
   → grava `state.titleResponse` + `titleOptions` + auto-seleciona índice 0
5. Gerar descrição
   → usa `getStandaloneDescriptionPrompt` com o título selecionado
   → grava `state.descriptionResponse` + `descriptionHtml`
```

A capa **não** entra no "Gerar tudo" (requer fetch externo de imagem + escolha humana); fica como passo manual no `CoverStep`.

### Detalhes técnicos

- Extrair os builders de prompt de título/descrição que hoje vivem inline em `TitleStep`/`DescriptionStep` para funções puras reutilizáveis (`buildTitlePrompt(state, topics, releases, settings, allTemplates)` e `buildDescriptionPrompt(...)`) em um helper local no mesmo arquivo, para que o pipeline do `TopicStep` consiga gerar título/descrição sem montar os componentes.
- Cada etapa atualiza o `aiProgressTopic` com `label` próprio e `pushAttempt`/`setStage` — o modal já mostra a cadeia de modelos free → DeepSeek (lógica existente em `streamGeneratePauta` + `openrouter.ts`).
- Falha em qualquer etapa interrompe a pipeline, faz `toast.error` e marca o modal como erro. O que já foi gerado fica salvo (não rollback).
- O botão "Gerar pauta" muda o label para **"Gerar tudo"** dinamicamente quando o toggle está ON; tooltip explica que vai rodar pesquisa → pauta → títulos → descrição.
- Para wizards com **vários tópicos**, o "Gerar tudo" roda apenas o tópico atual (pesquisa + pauta dele), e depois gera títulos/descrição do episódio inteiro (que já agregam todos os tópicos via `aggregatedContent`). Mantém o escopo controlável.

### Sem mudanças em

- Schema do banco (nenhuma migração).
- Edge functions (`generate-pauta`, `web-research` já existem e suportam o fluxo).
- `CoverStep` (continua manual).
- Demais telas.

### Arquivos a editar

- `src/components/pautas/NovaPautaWizard.tsx` — barra de links no topo do `TopicStep`, toggle persistido, função `runGenerateAll`, extração dos builders de prompt de título/descrição.
