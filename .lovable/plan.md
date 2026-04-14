

## Problema

O bulk pipeline diz que gerou todos os episódios, mas o browser só baixa o primeiro. Há **3 bugs** no código:

1. **`downloadBlob` do episódio final não tem `await`** (pipeline.ts linha 426) — o download é disparado mas não aguardado.
2. **Browsers bloqueiam downloads programáticos rápidos em sequência** — o delay de 800ms entre downloads não é suficiente; a maioria dos browsers (Chrome/Edge) silenciosamente ignora o 2º+ `a.click()` se vierem muito rápido.
3. **O BulkModal não passa `downloadIndividualItems: true`** explicitamente nas options quando `generateFinalEpisode` é true (linha 374-381) — ele confia no default, mas não há feedback visual por item.

## Plano

### 1. Refatorar `downloadBlob` com retry e delay maior (`src/lib/audio/encoder.ts`)
- Aumentar o delay de revoke para **3000ms**
- Adicionar log para rastrear cada download disparado

### 2. Corrigir `runBulkPipeline` (`src/lib/audio/pipeline.ts`)
- **`await`** no `downloadBlob` do episódio final (linha 426)
- Aumentar delay entre downloads individuais de 800ms para **2500ms**
- Adicionar `onLog` para cada download individual confirmando que foi disparado

### 3. Passar `downloadIndividualItems: true` explicitamente no BulkModal (`src/components/rivaldo/BulkModal.tsx`)
- Na chamada `runBulkPipeline` quando `generateFinalEpisode` é true, passar `downloadIndividualItems: true` e `onItemEncoded` com feedback visual

### Detalhes técnicos

**pipeline.ts** — mudanças na função `runBulkPipeline`:
- Linha 403: `await downloadBlob(...)` — já tem await, OK
- Linha 406: delay `800ms` → `2500ms`  
- Linha 426: adicionar `await` antes de `downloadBlob(...)`

**encoder.ts** — `downloadBlob`:
- Delay de revoke `1500ms` → `3000ms`

**BulkModal.tsx** — options do `runBulkPipeline`:
- Adicionar `downloadIndividualItems: true` nas options
- Adicionar `onItemEncoded` callback para ambos os modos (com e sem `generateFinalEpisode`)

