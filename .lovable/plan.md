

# Plano de Ajustes — Rodada de Polimento #2

## 1. Fix: Emoji de bandeira não aparecendo nos cards
**Arquivo:** `src/lib/country-utils.ts`

O LLM retorna nomes completos de países (ex: "Poland", "United States") mas o `countryFlag` faz lookup case-sensitive. Adicionar normalização case-insensitive no lookup — criar um mapa auxiliar lowercased. Também expandir a lista com variações comuns (ex: "The Netherlands", "Türkiye", etc.).

## 2. Repatriar com mais dados + botão "Repatriar Todos"
**Arquivos:** `supabase/functions/lookup-country/index.ts`, `src/pages/Releases.tsx`

**Edge function**: Aceitar payload enriquecido `{ releases: [{ artist, album, release_date, genres }] }` em vez de apenas `{ artists }`. Ajustar o prompt do LLM para incluir álbum, data e gênero como contexto de busca.

**Frontend**:
- Ajustar `enrichCountries` para enviar dados completos do release
- Adicionar botão "Repatriar Todos" com modal de confirmação (`AlertDialog`). Se confirmado, reprocessa TODOS os releases (com e sem país), sobrescrevendo.
- O botão existente "Repatriar (N)" continua processando apenas os sem país.

## 3. Fix: Ratings aparecendo como gêneros
**Arquivo:** `src/pages/Releases.tsx`

No `parseStructuredReleases`, linha ~123, adicionar filtro para ignorar valores puramente numéricos na parsing de gêneros:
```
if (trimmed && !/^\d+(\.\d+)?$/.test(trimmed)) genres.push(trimmed);
```

Também rodar uma limpeza one-time via `allGenres` para filtrar gêneros que parecem números.

## 4. Fix: Modal de progresso não refletindo progresso granular
**Arquivos:** `src/pages/Pautas.tsx`, `src/pages/Materials.tsx`

O modal de progresso em Pautas já está integrado mas precisa refletir melhor o progresso do flow. No `handleFlowAutoGenerateInner`, cada dia deve atualizar o status individualmente no `progressItems` ao iniciar e ao concluir. Verificar que o state update é feito com a função de callback correta (`setProgressItems`).

Em Materials, garantir que geração individual (não bulk) também abre o modal com 1 item.

## 5. Confirmação em TODOS os deletes
**Arquivos:** `src/pages/Releases.tsx`, `src/pages/Pautas.tsx`, `src/pages/Settings.tsx`, `src/pages/Dashboard.tsx`

Criar componente reutilizável `ConfirmDeleteDialog` ou usar `AlertDialog` inline em cada ponto de delete:
- Releases: delete individual (linha 665), bulk delete (linha 604)
- Pautas: delete semana (já tem `deleteConfirmOpen`)
- Dashboard: qualquer delete de semana
- Settings: "Delete all" no activity log

## 6. Escolher template ao criar pauta
**Arquivo:** `src/pages/Pautas.tsx`

No `handleCreateWeek` e na criação de pautas individuais, adicionar step para selecionar template. Ao criar as pautas da semana, associar `template_id` a cada pauta baseado no dia da semana e template escolhido.

## 7. Calendário: botão "+" para criar pauta com flow completo
**Arquivo:** `src/pages/CalendarView.tsx`

Adicionar botão "+" no card de cada dia que:
1. Abre modal de seleção de template
2. Cria a pauta com template escolhido
3. Inicia flow inline: gerar pauta → gerar título → gerar descrição → gerar capa
4. Cada step usa o `GenerationProgressModal`

Requer: carregar templates do Supabase no CalendarView e integrar lógica de geração (streamAI do Pautas + geração de títulos/descrições do Materials + cover do cover-generator).

---

## Ordem de Implementação
1. Fix bandeira emoji (#1) — rápido
2. Fix ratings como gêneros (#3) — rápido
3. Confirmação em deletes (#5) — médio
4. Repatriar com dados enriquecidos + "Repatriar Todos" (#2) — médio
5. Fix modal progresso (#4) — médio
6. Escolher template ao criar pauta (#6) — médio
7. Botão "+" no calendário com flow (#7) — complexo

## Detalhes Técnicos
- Item #2 requer redeploy da edge function `lookup-country` com novo schema de input
- Item #7 é o mais complexo — requer importar lógica de streamAI, geração de títulos e cover no CalendarView ou extrair para hooks compartilhados
- Item #3 é um fix no parser que resolve o bug visível no filtro de gêneros

