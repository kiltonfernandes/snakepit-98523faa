

# Plano Revisado: Indicador "Salvo" + Auto-Duck + Capa Pronta

## 1. Dashboard — 6º indicador "Salvo" (OneDrive)

Adicionar etapa **"Salvo"** ao lado dos 5 indicadores atuais (Pauta, Título, Desc., Capa, Agend.) → barra passa de `X/5` para `X/6`.

**Arquivos:**
- `src/lib/types.ts` → adicionar `saved: boolean` em `EpisodeCompletionIndicators`.
- `src/pages/Dashboard.tsx`:
  - `getWeekIndicators`: `saved: !!material?.repository_url`.
  - `weekProgress`: dividir por 6.
  - `INDICATOR_LABELS`: incluir `'Salvo'` com ícone `Cloud`.
  - Ajustar grid do tree de `repeat(5,1fr)` para `repeat(6,1fr)`.
- `src/pages/Pautas.tsx` (aba Management) → mesma sincronização para 6/6.

## 2. Capa Pronta — Critério corrigido

**Hoje:** `cover: !!material?.cover_url` — fica verde só quando há blob carregado em memória.

**Correção:** o indicador deve refletir que **existe uma capa salva no banco** (link persistido), independente de já ter sido carregada na sessão. Assim o usuário pode regerar quando quiser sem perder o "verde".

**Mudança em `src/pages/Dashboard.tsx`:**
- `cover: !!(material?.cover_url || material?.cover_source_url || material?.cover_saved_at)` — qualquer evidência de capa salva no DB conta.
- Aplicar o mesmo critério em `src/pages/Pautas.tsx` (Management) e em `src/pages/Materials.tsx` se houver checagem equivalente.

## 3. Auto-Duck — Eliminar subida da BGM em pausas curtas

**Diagnóstico:** `detectVoiceRegionsForDuck` em `src/lib/audio/auto-duck.ts` mescla janelas com `params.maxPause = 1.2s`. Pausas naturais entre frases (1.5–3s) quebram a região, e `getDuckGainAtSample` aplica `fadeUp` (0.3s) + `fadeDown` (1.23s) na brecha → BGM sobe no meio da fala.

**Mudanças:**

- **`src/lib/audio/types.ts`**:
  - `DEFAULT_PARAMS.maxPause`: `1.2` → `4.0` (alinhar com o print de referência).
  - Novo campo `duckHoldDuration: 0.5` (segura BGM por 500ms após última fala antes do fade-up).

- **`src/lib/audio/auto-duck.ts`**:
  - **Pós-mesclagem**: após detectar regiões, fundir adjacentes se `gap < fadeDownSamples + fadeUpSamples + holdSamples`. Garante duck contínuo em buracos curtos.
  - **Hold após fala**: `getDuckGainAtSample` só inicia `fadeUp` em `region.end + holdSamples`.

- **`src/components/rivaldo/ParametersSidebar.tsx`**:
  - Novo slider "Hold após fala (s)" na seção Auto-Duck (modo avançado), 0–2s, default 0.5s.

## Resumo visual

```text
Antes:  fala ─╮      ╭─ fala ─╮      ╭─ fala
              └duck up┘ down  └ up   └ down
                  BGM SOBE ❌

Depois: fala ─┬──────┬─ fala ─┬──────┬─ fala
              └─ duck contínuo + hold ✅
```

## Arquivos tocados

- `src/lib/types.ts` — campo `saved`
- `src/pages/Dashboard.tsx` — 6º indicador + critério novo de capa
- `src/pages/Pautas.tsx` — sincronizar Management
- `src/pages/Materials.tsx` — alinhar critério de capa (se aplicável)
- `src/lib/audio/types.ts` — `maxPause: 4`, `duckHoldDuration`
- `src/lib/audio/auto-duck.ts` — merge agressivo + hold
- `src/components/rivaldo/ParametersSidebar.tsx` — slider hold

