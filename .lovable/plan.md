# Objetivo

Fazer o cadastro de canais do YouTube funcionar de verdade quando o usuário cola URLs com `@handle` (padrão atual do YouTube). Hoje o `fetch-youtube-channel-feed` tenta um único fetch da página do canal e faz regex por `channelId`, mas o YouTube frequentemente devolve consent wall / HTML minificado diferente / bloqueia por user-agent, então a resolução falha silenciosamente.

# Estratégia (RSS oficial + fallback scrape HTML)

Manter RSS como fonte primária (rápido, gratuito, sem quota), mas trocar a resolução do `feed_url` por uma cadeia robusta de tentativas. Se ainda assim vier vazio, fallback pra scrape do HTML de `/videos`.

## Cadeia de resolução do channel_id (edge function `fetch-youtube-channel-feed`)

Ordem de tentativas — a primeira que devolver um `UC…` válido vence:

1. **Match direto na URL** — se já é `/channel/UC…` ou já é `feeds/videos.xml`, usa direto.
2. **Fetch da página do canal com headers de browser real** — `User-Agent` de Chrome desktop, `Accept-Language: en-US,en;q=0.9`, `Cookie: CONSENT=YES+1` (bypassa o consent wall europeu que retorna HTML sem os metadados). Extrai `channelId` procurando, em ordem:
  - `"channelId":"UC..."` (JSON embutido no ytInitialData)
  - `<meta itemprop="identifier" content="UC..."`  / `itemprop="channelId"`
  - `<link rel="canonical" href=".../channel/UC..."`
  - `"externalId":"UC..."` (ytcfg)
  - `browseId":"UC..."`
3. **Fallback via `/@handle/about**` — se a URL raiz falhar, tenta `youtube.com/@handle/about` (página mais leve, menos JS, canonical costuma estar limpo).
4. **Fallback via endpoint público de resolução** — `youtube.com/youtubei/v1/navigation/resolve_url` com body mínimo (`context.client = { clientName: "WEB", clientVersion: "2.20240101" }`, `url: <handle_url>`) usando a API key pública embutida no ytcfg (`AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8` — chave pública do WEB client, não é secret). Retorna `endpoint.browseEndpoint.browseId` = channel_id.
5. **Erro estruturado** — se todas falharem, devolve `{ error: "channel_id_not_resolved", tried: [...], html_preview: "..." }` pro front mostrar mensagem clara e permitir colar o RSS manualmente.

Cachear o `feed_url` resolvido na tabela `youtube_channels` (já tem coluna) pra não re-resolver todo refresh.  
  
entoa eu consigo encontrar o channel id tbm entao coloca esse campo no form de cadastro por qu eeu ai eu coloco o id do channel  e iss deve a jusdar a o scrape 

## Fallback quando o RSS vem vazio (poucos vídeos)

RSS oficial só devolve os ~15 últimos e às vezes está atrasado. Quando `items.length === 0` **e** foi pedido `since_days`, tentar scrape da página `/@handle/videos`:

- Fetch com mesmos headers de browser (UA + CONSENT cookie).
- Extrair o bloco `var ytInitialData = {...};` via regex delimitando `};</script>`.
- `JSON.parse` e navegar até `contents.twoColumnBrowseResultsRenderer.tabs[?].tabRenderer.content.richGridRenderer.contents[].richItemRenderer.content.videoRenderer`.
- De cada `videoRenderer` extrair: `videoId`, `title.runs[0].text`, `publishedTimeText.simpleText` (ex.: "há 2 dias" — converter em data aproximada), `descriptionSnippet` se houver.
- Merge com os itens do RSS (dedupe por `video_id`).

Se `ytInitialData` não parsear, retornar só o que o RSS deu + warning no payload.

## Ajustes no front (`SinglesPickerModal.tsx`)

- Ao cadastrar canal, chamar `fetch-youtube-channel-feed` uma vez pra resolver e **persistir o `feed_url**` resolvido em `youtube_channels.feed_url`. Se falhar, mostrar toast com a mensagem estruturada e um campo "colar RSS manualmente" (`https://www.youtube.com/feeds/videos.xml?channel_id=UC…`).
- Botão "Testar canal" ao lado do form de cadastro pra validar antes de salvar.
- No refresh (botão "Atualizar feeds"), sempre passar o `feed_url` já salvo; só cair na resolução via `channel_url` se `feed_url` estiver null.

## Detalhes técnicos

- Nenhuma dependência nova, nenhuma secret nova.
- Headers do fetch (todas as requisições a `youtube.com`):
  ```
  User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36
  Accept-Language: en-US,en;q=0.9
  Cookie: CONSENT=YES+cb.20210328-17-p0.en+FX+000
  ```
- Timeout de 10s por tentativa com `AbortController` pra não travar o modal.
- Logar (console.log no edge) qual estratégia venceu — facilita debug futuro.
- Sem alteração de schema.

## Arquivos afetados

- **Editado**: `supabase/functions/fetch-youtube-channel-feed/index.ts` (cadeia de resolução + fallback HTML scrape + headers)
- **Editado**: `src/components/pautas/SinglesPickerModal.tsx` (persistir feed_url resolvido, botão "Testar canal", mensagem de erro estruturada, campo RSS manual)

## Entrega

1. Reescrita do edge function com as 4 estratégias + logs.
2. Front persistindo `feed_url` e mostrando erro acionável.
3. Fallback HTML scrape (`ytInitialData`) só quando RSS vem vazio.