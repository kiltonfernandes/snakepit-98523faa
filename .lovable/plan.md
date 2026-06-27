## Diagnóstico

- Confirmado: existem **1041 releases no banco**, mas o app só carrega 1000. Não é um limite do Postgres — é o **default do PostgREST (Data API)** que limita qualquer `select` sem range a 1000 linhas.
- Origem do gargalo: `AppContext.loadReleases()` faz um único `from('releases').select('*')` sem paginar. Idem para `release_genres` (705 linhas hoje, vai crescer). `PublicWeekView` tem dois selects de releases que também podem estourar.
- Índices: as colunas mais usadas (`release_date`, `artist`) já têm índice. Faltam alguns para joins/filtros frequentes.

## Plano

### 1. Remover o teto de 1000 (paginação automática)
- Criar helper `fetchAllRows(table, selectCols, orderBy)` em `src/lib/supabase-paginate.ts` que faz `.range(from, to)` em páginas de 1000 até esvaziar.
- Trocar em `AppContext`:
  - `loadReleases`: paginar `releases` e `release_genres`.
  - `loadPautas`, `loadMaterials`, `loadActivityLog` (que hoje tem `.limit(200)` — manter) — paginar pautas e materials também, por garantia futura.
- Trocar em `PublicWeekView.tsx` (linhas 388 e 425) pelo mesmo helper, restringindo colunas.

### 2. Performance de carga inicial
- `loadReleases` hoje puxa `select('*')` + todos `release_genres` e monta um map em JS. Isso é OK, mas:
  - Restringir colunas no select (sem `comments` longo na primeira carga; carregar sob demanda quando abrir o card). Manter compatível.
  - Carregar `releases` e `release_genres` em paralelo (já está dentro de `Promise.all` no boot, mas dentro de `loadReleases` é sequencial — paralelizar).
- `loadMaterials` já exclui `cover_url` (bom). Manter.

### 3. Índices adicionais (migration)
Adicionar índices que faltam para queries quentes:
- `releases(country)` — usado em analytics e filtros.
- `pauta_releases(release_id)` e `pauta_releases(pauta_id)` — joins do calendário/pauta avulsa.
- `pautas(publication_date)` — já unique, ok; adicionar `pautas(status)` para o recalc de status por semana.
- `episode_materials(episode_date)` — usado na visão de calendário.

### 4. Render/UX
- Sem mudança de UI. O modal/lista de releases continua igual, apenas passa a mostrar todos os registros.

## Arquivos afetados
- novo: `src/lib/supabase-paginate.ts`
- editar: `src/contexts/AppContext.tsx`, `src/pages/PublicWeekView.tsx`
- migration: criar índices listados acima

## Validação
- Após deploy, rodar no console: `releases.length` deve bater com `select count(*) from releases` (1041+).
- Medir tempo de boot antes/depois (DevTools Network → query de releases).
