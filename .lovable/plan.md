## Diagnóstico

Verifiquei o banco: **nenhuma pauta de pré-produção tem `episode_materials` espelhado** (`em_id` NULL para todas as 8 preprod pautas atuais, mesmo as que já têm títulos). Por isso o Rivaldo não encontra nada.

Duas causas:

1. **Colisão de chave única**: `episode_materials` tem `UNIQUE(week_id, slot_key)`. O sync atual usa `week_id = standalone-YYYY-MM` e `slot_key = <dia_da_semana>`. Duas pautas avulsas no mesmo mês/dia-da-semana (ex.: dois preprods em segundas de julho) colidem — o upsert por `preprod_pauta_id` faz INSERT e falha na outra constraint. O erro é engolido no `catch` silencioso.
2. **Sync só roda ao salvar**: pautas criadas antes do sync existir (ou abertas sem edição) nunca disparam o espelho.

## O que fazer

### 1. Chaves únicas por pauta (frontend)
Em `src/pages/PreProducao.tsx`, refatorar `syncPreprodToEpisodeMaterial`:

- `week_id = 'preprod-' + pautaId`
- `slot_key = 'preprod-' + pautaId.slice(0, 8)`
- Upsert de `editorial_weeks` com esse mesmo `week_id` (mantém FK/consistência).
- `onConflict: 'preprod_pauta_id'` (já existe índice único parcial).
- Trocar `catch` silencioso por `console.error` + `toast.error` para não esconder falhas futuras.

Isso elimina 100% das colisões — cada preprod pauta vira uma "semana" própria com um slot único.

### 2. Backfill automático (frontend)
Após `loadPreprodPautas`, disparar sync para todo preprod que já tenha `selected_title` ou `titles`. Roda em paralelo, sem bloquear UI. Garante que **abrir a página Pré-produção uma vez** repara tudo.

### 3. Backfill único no banco (migration)
Migration one-shot que faz `INSERT ... ON CONFLICT (preprod_pauta_id) DO UPDATE` para toda preprod_pauta com título, usando as novas chaves únicas. Assim o Rivaldo já enxerga tudo **sem depender do usuário abrir Pré-produção**.

### 4. Rivaldo agrupador (verificação)
`src/pages/Rivaldo.tsx` já agrupa qualquer `is_standalone=true` no bucket "Episódios Avulsos" independente do `week_id`. Nada a mudar lá.

## Arquivos afetados

- `src/pages/PreProducao.tsx` — refactor do sync + backfill on mount.
- Nova migration Supabase — backfill de `episode_materials` a partir de `preprod_pautas` existentes.

## Resultado esperado

Após aplicar: o modal "Selecionar episódio" do Rivaldo, aba **Avulso**, lista todas as pautas de pré-produção com título gerado (incluindo Slipknot, Tarja, Moonspell, In Malice's Wake, TodoMal, etc. que estão hoje no banco).
