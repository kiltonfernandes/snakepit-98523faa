

# Plano de Ajustes — Materiais, Rivaldo e Configurações

## 1. Materiais — Busca sugerida usa título do episódio
**Arquivo:** `src/pages/Materials.tsx`

Alterar `buildCoverSearchQuery` para retornar o **título selecionado do episódio** + "band promo" (em vez de extrair banda/anniversary separadamente). Se não houver título, fallback para a lógica atual.

## 2. Materiais — Capa mostra APENAS o título do episódio
**Arquivo:** `src/pages/Materials.tsx`

Na função `drawOverlay`, remover a lógica que concatena `bandName` ao título. A variável `title` deve ser simplesmente `getTitle(mat)` (o título selecionado), sem acrescentar nome de banda.

## 3. Materiais — Títulos focados na notícia do episódio
**Arquivo:** `src/pages/Materials.tsx`

Ajustar `buildTitlePrompt` para incluir instrução explícita:
- **Seg-Sex**: "O título deve ser 100% focado no texto da notícia principal do episódio"
- **Sábado**: "O título deve focar nos destaques/lançamentos da semana"
- **Domingo**: Já está focado na retrospectiva (mantém)

## 4. Configurações — Botões Export CSV e Delete All nos Logs
**Arquivo:** `src/pages/Settings.tsx`

- Adicionar botão **"Exportar CSV"** que gera e baixa um CSV com colunas: data, ação, detalhes
- Adicionar botão **"Limpar Tudo"** com modal de confirmação (`AlertDialog`) que limpa todos os registros de `activity_logs` no banco
- Ambos ficam no header do card de Activity Log

## 5. Rivaldo — Dropdown agrupado por semana com formato [DD.MM - dia] - título
**Arquivo:** `src/pages/Rivaldo.tsx`

Refatorar `episodeOptions` para:
- Agrupar por `week_id` (usando `weeks` do AppContext)
- Ordenar por data dentro de cada grupo
- Formato: `[07.04 - Segunda] - Título do Episódio`
- Usar `SelectGroup` + `SelectLabel` para separar semanas visualmente

## 6. Rivaldo — Parâmetros de corte de silêncio no sidebar
**Arquivos:** `src/lib/audio/types.ts`, `src/components/rivaldo/ParametersSidebar.tsx`

Adicionar ao `AudioParams` (ou expor os existentes no sidebar):
- **Silence threshold** (max silence duration em segundos, ex: 1.1 a 2.0s) — já existe `maxPause`
- **Silence cut target** (duração alvo após corte, ex: 0.4 a 1.0s) — novo campo `silenceCutTarget`
- **Buffer before/after** (margem em ms antes e depois do corte, ex: 50-300ms) — novo `silenceCutBufferMs`

Expor no `ParametersSidebar` como sliders na seção principal (não apenas no modo avançado).

## 7. Rivaldo — Auto-download + purge de memória após export
**Arquivo:** `src/lib/audio/pipeline.ts`, `src/pages/Rivaldo.tsx`

- Após `encodeBufferToMp3Blob`, disparar download imediatamente via `downloadBlob`
- Revogar o object URL logo após o download iniciar
- Nullificar referências a `AudioBuffer` e `Float32Array` dos tracks processados
- Limpar `trackReports`, `masterReport` e `logs` após export bem-sucedido
- Chamar `close()` no `AudioContext` usado no pipeline

## 8. Rivaldo — Processamento continua em background ao mudar de aba
**Arquivo:** `src/pages/Rivaldo.tsx`, possivelmente novo `src/contexts/RivaldoContext.tsx`

Extrair o estado de processamento (progress, logs, isProcessing, files, params) para um **contexto React** (`RivaldoContext`) que vive acima do Router. Assim, ao navegar para outra aba, o processamento no Web Worker continua e o estado é preservado ao voltar.

## 9. Configurações — Dashboard de tokens/custo
**Arquivo:** `src/pages/Settings.tsx`, banco de dados

- Criar tabela `ai_usage_logs` com colunas: `id`, `created_at`, `scope` (pauta/material/título/descrição), `episode_id`, `week_id`, `tokens_input`, `tokens_output`, `model`, `estimated_cost`
- Instrumentar `runAIPrompt` (Materials) e `generate-pauta` edge function para registrar uso
- No Settings, criar um card "Uso de IA" com:
  - Total de tokens por semana/mês
  - Breakdown por tipo (títulos, descrições, pautas)
  - Custo estimado acumulado
  - Gráfico simples de barras (últimas 4 semanas)

## Ordem de Implementação
1. Ajustes simples: Materiais (#1, #2, #3)
2. Settings: Log export/delete (#4)
3. Rivaldo: Dropdown agrupado (#5)
4. Rivaldo: Sidebar params (#6)
5. Rivaldo: Memory purge (#7)
6. Rivaldo: Background context (#8)
7. Settings: Token dashboard (#9) — requer migration + instrumentação

## Detalhes Técnicos
- Items 1-6 são alterações de frontend puro
- Item 4 requer `DELETE` no banco (migration para permitir ou usar edge function)
- Item 8 requer refactor de estado para contexto global
- Item 9 requer nova tabela + migration + alteração na edge function

