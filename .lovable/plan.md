

# Plano: Bulk do Rivaldo persistente entre páginas

## Problema

- **Edição unitária** (já consistente): roda dentro de `RivaldoProvider` (montado em `App.tsx` → vive no app inteiro). Sair de `/rivaldo` não interrompe.
- **Edição bulk** (inconsistente): toda lógica (`runBulkPipeline`, `setIsProcessing`, `uploadStatuses`, `logs`, `progress`) vive em `useState` dentro de `BulkModal.tsx`. Quando o usuário navega para outra rota, `Rivaldo.tsx` desmonta → `BulkModal` desmonta → estados perdidos. A `Promise` do pipeline continua executando em background mas não tem mais para onde reportar e os uploads/atualizações de DB seguem cegos. Pior: o modal volta zerado quando o usuário retorna.

## Solução

Criar um **`RivaldoBulkContext`** análogo ao `RivaldoContext`, montado em `App.tsx`. Toda execução do bulk (pipeline + uploads OneDrive + updates de `episode_materials`) vive nesse provider. O `BulkModal` vira uma camada de UI puramente apresentacional que lê/escreve no contexto.

## Arquivos

### 1. `src/contexts/RivaldoBulkContext.tsx` (NOVO)

Provider com:

**Estado persistente:**
- `isProcessing`, `progress`, `progressLabel`
- `logs: LogEntry[]`
- `rows: QueueRow[]` (preservar configuração entre navegações)
- `uploadStatuses: Record<string, UploadStatus>`
- `selectedWeekId`, `finalEpisodeFilename`, `generateFinalEpisode`, `uploadToCloud`
- `currentBatchName: string | null` (nome da semana sendo processada)

**Ações:**
- `startBulk(input: { rows, intro, outro, audioParams, processingProfile, generateFinalEpisode, finalFilename, uploadToCloud })` — encapsula todo o `handleStart` atual.
- `retryUpload(rowId)` — mantém retry funcional mesmo fora de `/rivaldo`.
- `setRows`, `updateRow`, `setSelectedWeekId`, `setFinalEpisodeFilename`, `setGenerateFinalEpisode`, `setUploadToCloud`
- `clearBulkState()` — reset manual após conclusão.
- `addLog(message, type)`

**Sincronização com AppContext:** usar `useApp().updateMaterial` (em vez do `supabase.from().update()` direto que está em `BulkModal` linhas 304-309 e 466-471) → garante que Dashboard/Calendar reflitam o "Salvo" imediatamente para cada episódio do bulk, igual o flow unitário.

**Concorrência:** `processingRef = useRef(false)` para impedir bulks paralelos (mesmo padrão do `RivaldoContext`).

### 2. `src/App.tsx`

Envolver com o novo provider, dentro do `RivaldoProvider`:

```tsx
<RivaldoProvider>
  <RivaldoBulkProvider>
    {/* ... */}
  </RivaldoBulkProvider>
</RivaldoProvider>
```

### 3. `src/components/rivaldo/BulkModal.tsx` (REFATOR)

- Remover **todos** os `useState` de execução (`isProcessing`, `progress`, `logs`, `rows`, `uploadStatuses`, `finalEpisodeFilename`, `selectedWeekId`, `generateFinalEpisode`, `uploadToCloud`).
- Substituir por `const bulk = useRivaldoBulk()`.
- Manter apenas estados puramente locais ao modal (drag-over visual, episódios carregados do banco para os selects).
- `handleStart` → `bulk.startBulk(...)`.
- Quando o modal abre e já existe `bulk.isProcessing === true`, **mostrar o estado em andamento em vez de resetar** (UX: usuário pode reabrir o modal e ver o progresso).
- Manter o `desktopMode` path inalterado (já delega ao `desktopApi`).

### 4. `src/pages/Rivaldo.tsx`

- Adicionar pequeno **indicador de bulk em andamento** no header (ao lado do botão "Bulk 3.2"): badge com nome da semana + spinner + progresso, lendo de `useRivaldoBulk()`. Clicar no badge reabre o modal.
- Isso deixa visível, ao voltar para `/rivaldo`, que existe um bulk rodando.

### 5. `src/layouts/AppLayout.tsx` (pequeno ajuste)

- Adicionar mini-indicador global (canto inferior, discreto) quando `bulk.isProcessing === true` mostrando "Bulk Rivaldo: X%". Clique leva para `/rivaldo` e abre o modal. Garante que o usuário sabe que algo está rodando mesmo em outra página.

## Comportamento resultante

| Cenário | Antes | Depois |
|---|---|---|
| Sai de `/rivaldo` durante bulk | Pipeline continua mas UI/uploads perdem callbacks | Pipeline continua, uploads completam, DB sincroniza |
| Volta para `/rivaldo` | Modal zerado | Modal mostra estado real (rows, progresso, uploads concluídos) |
| Dashboard durante bulk | Não atualiza "Salvo" até refresh | "Salvo" aparece imediato a cada upload concluído |
| Outra página durante bulk | Sem feedback | Mini-indicador global com progresso |

## Diagrama

```text
App.tsx
└── AppProvider
    └── RivaldoProvider          (unitário — já OK)
        └── RivaldoBulkProvider  (NOVO — bulk vive aqui)
            └── Routes
                ├── /rivaldo → BulkModal (UI plug-in)
                └── /dashboard, /calendar... (mini-indicator)
```

