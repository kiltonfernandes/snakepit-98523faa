# Migração para OpenRouter + DeepSeek V4 Flash

Substituir 100% das chamadas de IA do Lovable AI Gateway por OpenRouter, usando `deepseek/deepseek-v4-flash` fixo, com `openrouter:web_search` ativado por template/prompt.

## 1. Secret

Disparar `add_secret` para `OPENROUTER_API_KEY`. Bloqueia o restante da implementação até o usuário colar a chave.

## 2. Helper compartilhado (`supabase/functions/_shared/openrouter.ts`)

Novo módulo com:
- `callOpenRouter({ system, user, temperature, bannedTerms, webSearch, stream })`
- Endpoint fixo `https://openrouter.ai/api/v1/chat/completions`
- Headers `Authorization: Bearer ${OPENROUTER_API_KEY}`, `HTTP-Referer`, `X-Title: Snakepit`
- Modelo fixo `deepseek/deepseek-v4-flash`
- Injeta `tools: [{ type: "openrouter:web_search" }]` quando `webSearch === true`
- Monta `messages`: system prompt + (regra de banned terms anexada ao system) + user
- Aplica `temperature` (vinda de `app_settings.brand_tone_temperature / 100` por padrão)
- Tratamento de erros: 429 (rate limit), 402 (créditos), 401 (chave inválida) → mensagens claras

## 3. Edge functions a migrar

Todas perdem dependência de `LOVABLE_API_KEY` e `getActiveModel()`:

| Função | Web search | Notas |
|---|---|---|
| `generate-pauta` | `webSearch` vem do body (Pautas/Materials enviam flag por template) | Mantém SSE streaming (`stream: true` no OpenRouter) |
| `enrich-episode-description` | `false` (só formata HTML) | Mantém system prompt atual |
| `lookup-country` | `true` (pesquisa banda/álbum) | |
| `search-metal-news` | `true` (curadoria de notícias) | RSS fetch continua local; LLM passa a usar web_search para validar |

Cada função passa `brand_tone_temperature` e `banned_terms_text` lidos de `app_settings` para o helper (mantém o comportamento atual).

## 4. Flag de web_search por template

No `PromptTemplatesManager` cada template ganha um campo booleano `use_web_search` (default conforme tipo: pesquisa de release/notícia/aniversário = true; redação = false). Persistido no mesmo storage atual dos templates.

Callers (`Pautas.tsx`, `Materials.tsx`) leem o flag do template selecionado e enviam `webSearch` no body da chamada para `generate-pauta`.

## 5. Settings

- Remover seletor de modelo (`AI_MODELS`, `DEFAULT_AI_MODEL`, dropdown na aba IA).
- Substituir por bloco informativo "Modelo: DeepSeek V4 Flash via OpenRouter" + status da chave.
- Manter sliders de temperatura e lista de banned terms (já usados pelo helper).

## 6. Logs de uso

`ai_usage_logs`: gravar `provider='openrouter'`, `model='deepseek/deepseek-v4-flash'`, `web_search_used` (bool), prompt/completion tokens (vêm em `response.usage`). Migration adiciona colunas `provider text` e `web_search_used bool` se não existirem.

## 7. Cleanup

- Remover `src/lib/ai-models.ts` (ou reduzir a constante única).
- Tirar `LOVABLE_API_KEY` das funções migradas (a env continua existindo para outros usos).

## 8. Validação

Após cada função reescrita, testar via `supabase--curl_edge_functions`:
1. `enrich-episode-description` com payload mínimo
2. `lookup-country` com 2 bandas
3. `search-metal-news` para a semana atual
4. `generate-pauta` com `webSearch:true` e `webSearch:false`

Confirmar streaming intacto em `generate-pauta` e que banned terms + temperature são respeitados.
