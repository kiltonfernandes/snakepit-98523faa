

# Plano de Correções — Filtros, Gêneros, Bandeiras e Link Público

## 1. Fix: Filtro de país não funciona corretamente
**Arquivo:** `src/pages/Releases.tsx` (linha 207)

O filtro faz `r.country === countryFilter` (match exato). Se o LLM salvou "Germany" para um release e "germany" para outro, o filtro falha. Além disso, `allCountries` coleta valores brutos sem normalizar, gerando entradas duplicadas.

**Fix**: Normalizar via `normalizeCountryCode` tanto no `allCountries` quanto no `matchCountry`:
- `allCountries`: agrupar por código normalizado, exibir código + nome
- `matchCountry`: comparar `normalizeCountryCode(r.country) === normalizeCountryCode(countryFilter)`

## 2. Gêneros normalizados como sub-filtros no modal
**Arquivo:** `src/pages/Releases.tsx` (linhas 854-872)

Adicionar os 11 gêneros normalizados (já definidos em `Pautas.tsx` como `NORMALIZED_GENRES`) no topo do modal de gêneros como "tags principais". Ao clicar, filtram todos os sub-gêneros que contenham o termo (ex: "Death Metal" filtra "Death metal", "Melodic death metal", "Brutal death metal", "Blackened death metal").

Mover `NORMALIZED_GENRES` para `src/lib/constants.ts` para reutilização.

## 3. Bandeiras faltando para alguns países
**Arquivo:** `src/lib/country-utils.ts`

Expandir `COUNTRY_CODE_ALIASES` com variantes adicionais que o LLM pode retornar: "Brasil" → BR, "Deutschland" → DE, "España" → ES, "Sverige" → SE, "Suomi" → FI, "Norge" → NO, "Danmark" → DK, "Österreich" → AT, "Schweiz" → CH, "Belgique" → BE, "Polska" → PL, "Magyarország" → HU, "Česko" → CZ, "Ísland" → IS, "Hrvatska" → HR, "Srbija" → RS, "România" → RO, "България" → BG, "Slovensko" → SK, "Slovenija" → SI.

## 4. Fix: Link público mostra "Nenhum episódio"
**Arquivo:** `src/pages/PublicWeekView.tsx`

O PublicWeekView só mostra `episode_materials`. Se a semana foi criada antes do código que auto-cria materials, ou se houve um bug de sync, a página fica vazia mesmo com pautas finalizadas.

**Fix**: Fazer fallback para exibir pautas diretamente quando não existem materials. Se `sortedMats.length === 0` mas `pautas.length > 0`, renderizar tabs baseadas nos pautas (por `publication_date` / dia da semana), exibindo as seções da pauta.

## Ordem de Implementação
1. Fix filtro de país (mais impactante)
2. Gêneros normalizados no modal
3. Expand country aliases
4. Fix public week view fallback

## Detalhes Técnicos
- Item #2 requer mover `NORMALIZED_GENRES` para constants.ts e usar matching parcial (`.toLowerCase().includes()`) para sub-gêneros
- Item #4 requer mapear `publication_date` → dia da semana para mostrar tabs corretas no fallback

