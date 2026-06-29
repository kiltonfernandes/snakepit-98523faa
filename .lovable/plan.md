## Objetivo

Após a pauta ser gerada na aba **Pré-produção**, encadear automaticamente: **(1) 3 títulos** → escolha do usuário → **(2) descrição HTML** → **(3) capa** → **(4) painel Pacote do Episódio** (igual ao print enviado). Tudo persistido em `preprod_pautas.data`.

---

## 1. Novos passos no wizard

Adicionar ao tipo `Step` em `src/pages/PreProducao.tsx`:

```
'kind' → 'release' → 'research' → 'insumo' → 'config' → 'result' (pauta)
     → 'titles' → 'description' → 'cover' → 'package'
```

Cada transição grava em `preprod_pautas.data` (mesmo padrão de `persistData` já existente).

---

## 2. Geração de títulos (3 opções)

**Novo prompt builder** em `src/lib/preprod-prompts.ts`:

`buildTitlesPrompt({ pautaMarkdown, artist, album, notes })` retorna prompt com:
- 3 opções: **clickbait** (gancho emocional), **curiosidade** (pergunta/fato), **impacto** (afirmação forte)
- Máx **60–70 caracteres** cada
- CAPS LOCK em no máximo 1–2 palavras
- Nome da banda quando fizer sentido
- Máx 2 emojis por título
- Proibido clickbait enganoso
- Contrato de resposta: **JSON estrito** `{"titles":[{"kind":"clickbait","text":"..."},{"kind":"curiosidade",...},{"kind":"impacto",...}]}`

**UI step `titles`**: 3 cards (um por opção) com badge do tipo, contagem de caracteres, botão "Escolher". Botão "Regenerar". Título escolhido salvo em `data.selectedTitle`.

Chamada via `streamGeneratePauta` (mesmo pipeline OpenRouter + fallback chain) com `temperature` levemente mais alta (0.85) para variedade. Parser tolerante a markdown encapsulado (já existe `markdown-sanitize.ts`).

---

## 3. Geração de descrição HTML

**Novo prompt builder** `buildDescriptionPrompt({ selectedTitle, pautaMarkdown, mentioned, notes })` colando integralmente as regras do usuário:

- HTML válido apenas: `<p>`, `<b>`, `<i>`, `<a>`, `<br>`, `<ul>`, `<li>`, `<h3>`
- Usar o **título selecionado como âncora** (não repetir como H1 — o template já faz isso)
- Priorizar "Notícias" como base factual
- Não inventar seções ausentes
- **NÃO incluir** bloco institucional Heavynauta nem CTAs de plataformas (YouTube, Spotify, Apple, Deezer, Pod.link, Discord, WhatsApp) — adicionados pelo template
- Regra **Mencionado neste episódio**: se houver conteúdo em `mentioned`, inserir `<h3>🎙️ Mencionado neste episódio</h3><ul>...</ul>` no TOPO, 1 emoji por item, embed `<a href target=_blank rel=noopener>` quando houver URL, parafrasear em 1-2 frases; se vazio, ignorar
- Saída **somente HTML**, sem markdown, sem code fences

**UI step `description`**:
- Campo **Mencionado no Episódio** (textarea) com botões Salvar/Limpar (espelhando print)
- Botão "Gerar descrição (IA)"
- Preview da descrição em HTML renderizado + textarea editável com `Copy to clipboard`
- Append automático do bloco institucional + CTAs no preview final (constante exportada em `preprod-prompts.ts` `HEAVYNAUTA_INSTITUTIONAL_HTML`)

Reutilizar lógica de `src/lib/episode/inject-mentioned.ts` se possível para idempotência.

---

## 4. Capa

**UI step `cover`**: usa o componente vigente de geração de capa (já existe `src/lib/cover-generator.ts` + uso em outras telas — investigar arquivo na build phase). Mostra preview 1:1, botões **Baixar capa** e **Gerar capa**. Capa salva como dataURL/asset em `data.coverUrl`.

---

## 5. Painel "Pacote do Episódio" (passo final)

Réplica fiel do print:

**Coluna esquerda**
- Header: badges `weekday` · `data` · `Spotify agendado` · `Capa pronta`
- **Título selecionado** + Copy to clipboard
- **Mencionado no Episódio** (textarea + Salvar/Limpar/Inserir na descrição IA)
- **Descrição em HTML** (textarea + Copy to clipboard)
- **Arquivo no OneDrive** (somente se houver upload — reusa lógica `onedrive-upload`; caso contrário esconder o bloco)

**Coluna direita**
- **Capa do episódio** (preview + Baixar/Gerar)
- **Ações rápidas**: Visualizar pauta · Copiar link compartilhável · Abrir workspace · Baixar pacote (MP3+capa+descrição) · Spotify for Creators (link externo)

Todos os dados vêm de `preprod_pautas.data`. Botão "Voltar" permite reabrir passos anteriores sem perder estado.

---

## 6. Persistência

Estender JSONB `data` em `preprod_pautas` com:

```ts
{
  titles?: { kind: 'clickbait'|'curiosidade'|'impacto'; text: string }[];
  selectedTitle?: string;
  mentioned?: string;
  descriptionHtml?: string;
  coverUrl?: string;
}
```

Sem migration (já é JSONB livre). Autosave a cada mudança via `persistData` existente.

---

## Arquivos afetados

- `src/lib/preprod-prompts.ts` — adiciona `buildTitlesPrompt`, `buildDescriptionPrompt`, `HEAVYNAUTA_INSTITUTIONAL_HTML`, parsers
- `src/pages/PreProducao.tsx` — novos steps `titles`, `description`, `cover`, `package` + UI
- Possivelmente extrair `EpisodePackagePanel.tsx` em `src/components/preprod/` para manter o arquivo enxuto
- Reutiliza: `streamGeneratePauta`, `MarkdownView`, `inject-mentioned.ts`, `cover-generator.ts`, `enrich-episode-description` (edge function já existente para "Inserir na descrição IA")

---

## Perguntas em aberto

1. **Capa**: usar o mesmo `cover-generator.ts` procedural já existente, ou o pipeline de IA de imagem? (vou assumir o procedural vigente — confirma?)
2. **Spotify for Creators**: link estático para `https://creators.spotify.com/` ou deep-link específico do show?
3. **Baixar pacote ZIP**: incluir MP3 só quando houver upload no OneDrive, senão só capa+descrição.txt — ok?
