

# Plano: Modo "Compilar da Nuvem" no Bulk Rivaldo

## O que muda

Adicionar um **segundo modo de operação** no `BulkModal`, escolhível via toggle no topo:

1. **Processar do zero** (atual) — gera + sobe + opcional consolidar.
2. **Compilar da nuvem** (NOVO) — pega os MP3s já prontos no OneDrive da semana selecionada, monta o consolidado **Intro + Seg + Ter + Qua + Qui + Sex + Sáb + Outro**, baixa local. **Não sobe nada.**

## Recomendação de abordagem

**Usar os arquivos da nuvem automaticamente** (sem upload manual). Razão:
- Os episódios da semana já estão em `episode_materials` com `repository_file_id` preenchidos pelo bulk anterior.
- Zero fricção: usuário escolhe a semana → sistema lista os 6 dias → 1 clique → consolidado pronto.
- Reutiliza a edge function `upload-episode-to-onedrive` no modo `action: 'download'` (que já existe).

Fallback elegante: se algum dia não estiver na nuvem, mostra a lista do que falta e oferece **upload manual avulso** só dos faltantes (drag-drop por dia).

## Fluxo de UX

```text
┌──── BulkModal ────────────────────────────────┐
│ [● Processar do zero]  [○ Compilar da nuvem]  │  ← Toggle no topo
├───────────────────────────────────────────────┤
│ Semana: [Selecione ▾]                         │
│                                               │
│ ✓ Segunda  — "Título…"      ☁ pronto          │
│ ✓ Terça    — "Título…"      ☁ pronto          │
│ ⚠ Quarta   — "Título…"      sem upload        │
│              [arraste o mp3 aqui]             │
│ ✓ Quinta…                                     │
│ …                                             │
│                                               │
│ Nome do arquivo final: [Heavynauta_S##.mp3]   │
│                                               │
│ [⬇ Baixar consolidado]                        │
└───────────────────────────────────────────────┘
```

## Arquivos

### 1. `src/components/rivaldo/BulkModal.tsx`
- Novo `useState<'process' | 'compile'>('process')` para o modo (local ao modal — não persiste).
- Toggle `Tabs` no topo dentro do `DialogContent`.
- Quando modo = `'compile'`:
  - Esconde drop-zone bulk, slots de master/BGM, e seções de processamento.
  - Renderiza lista vertical dos 6 dias (Seg–Sáb) da semana selecionada com status:
    - `repository_file_id` presente → ✓ pronto, mostra título.
    - Faltando → ⚠ + dropzone individual aceitando 1 MP3 (vira override em memória `Map<dayIndex, File>`).
  - Botão único: `Baixar consolidado` (desabilitado se `prontos + overrides < 6`).
  - Mostra `GranularProgress` durante download/montagem.

### 2. `src/contexts/RivaldoBulkContext.tsx`
- Adicionar action `compileFromCloud(input: { weekId, finalFilename, materialsByDay, fileOverrides })`:
  1. Resolve URL de download para cada `repository_file_id` via `supabase.functions.invoke('upload-episode-to-onedrive', { body: { action: 'download', fileId } })`.
  2. `fetch` cada URL → `Blob` (com progresso por dia: 1/8, 2/8…).
  3. Para dias com override de arquivo local, usa o `File` direto.
  4. Decide o intro/outro: usa `INTRO_PRESET`/`OUTRO_PRESET` (já carregados via `loadPresetAsFile`).
  5. Concat: `new Blob([intro, ...dias, outro], { type: 'audio/mpeg' })` — mesma técnica já usada em `pipeline.ts` linha 429-433.
  6. `downloadBlob(finalBlob, finalFilename)` (de `@/lib/audio/encoder`).
  7. `uploadStatuses` não é tocado; **nenhuma chamada a `updateMaterial`** (não muda nada no banco).
- Estado novo no contexto: `compileProgress: number`, `compileLogs: LogEntry[]`, `isCompiling: boolean`.
- `clearBulkState` limpa também esses campos.

### 3. (sem mudança) `supabase/functions/upload-episode-to-onedrive/index.ts`
A action `download` já existe e retorna `downloadUrl` público — só consumir.

## Comportamento garantido

| Item | Modo Processar | Modo Compilar |
|---|---|---|
| Sobe na nuvem | sim (opcional) | **não** |
| Baixa local | opcional | **sempre** (é o objetivo) |
| Atualiza `episode_materials` | sim | **não** |
| Persiste entre rotas | sim (já implementado) | sim (mesmo contexto) |
| Aceita upload manual | obrigatório | só fallback p/ dia faltante |

## Edge cases tratados

- Semana sem nenhum episódio na nuvem → mostra mensagem "Nenhum episódio salvo nesta semana. Use o modo Processar ou faça upload manual abaixo."
- Domingo nunca entra no consolidado (não é um dia de pauta editorial — é justamente o consolidado).
- `repository_file_id` presente mas link expirado → tenta `download` action; se falhar, marca dia como `⚠` e pede override manual.
- Limpeza de `Blob` URLs após download (já feito em `encoder.ts`).

