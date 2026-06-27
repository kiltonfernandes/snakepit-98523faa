## 1) Hierarquia Ano > Trimestre > Mês > Semana na aba **Pautas**

Aplicar o mesmo padrão que já existe no Dashboard (`Dashboard.tsx` linhas 40-42, com `expandedYears` / `expandedQuarters` / `expandedMonths` + chevrons) na `StandaloneEpisodesTable`.

- Em `src/components/pautas/StandaloneEpisodesTable.tsx`:
  - Agrupar `filtered` por **Ano → Trimestre (Q1-Q4) → Mês → Semana ISO (segunda a domingo)** usando `date-fns` (`getYear`, `getQuarter`, `getMonth`, `startOfISOWeek`, `format`).
  - Renderizar quatro níveis colapsáveis com `ChevronDown` / `ChevronRight`, contagem de pautas e badge de status agregado em cada nível.
  - Estado inicial: ano corrente + trimestre corrente + mês corrente + semana corrente expandidos (igual ao Dashboard).
  - Manter a tabela atual (Data / Blocos / Status / Completude / Ações) **dentro** do nível "Semana", sem mudar colunas nem ações.
  - Manter filtros e busca atuais — eles continuam filtrando o conjunto antes de agrupar.

## 2) Botão **Shortlist** no header da aba Pautas

- Em `src/pages/PautasStandalone.tsx`, adicionar, antes do botão "Nova pauta", um `Button variant="outline"` com ícone `Star` e label "Shortlist".
- Ao clicar, abre um `Dialog` (`ShortlistDialog`) listando todos os `releases.filter(r => r.shortlist)` (campo já existe no schema).
  - Cada linha mostra capa, artista — álbum, gênero, país, estrelas, e ações: **abrir no Metal Archives** e **"Criar pauta deste lançamento"** (usa o fluxo de `NovaPautaWizard` já existente, pré-preenchendo `release_id` no tópico de review).
  - Busca por artista/álbum dentro do modal.
  - Toggle ⭐ inline para remover da shortlist sem sair do modal.

## 3) Investigação e correção do **Gerar tudo** travando

Cenário do bug (print 3 → print 4): com **Pesquisa + Formatar apenas + Títulos + Descrição** marcados, o modal fica em "Recebendo resposta… deepseek-v4-flash (web search)" e retorna para a wizard sem popular nada.

Causas encontradas em `NovaPautaWizard.tsx` `runGenerateAll` (linhas 801-968) + `web-research`:

a) A chamada `supabase.functions.invoke('web-research', …)` **não tem timeout no cliente**. Quando o edge function demora >60s (web search com tool-calling), o `invoke` espera indefinidamente — exatamente o que o usuário vê.

b) O `pushAttempt` da etapa pesquisa usa string hardcoded `'deepseek/deepseek-v4-flash (web search)'` e nunca recebe `selected`/`failed` quando o fluxo é interrompido; o modal de progresso fica "preso" visualmente.

c) Branch `formatarApenas`: quando `topic.response_text` está vazio, apenas dispara `toast.warning` e segue para títulos/descrição em silêncio. O usuário não vê o motivo da formatação ter sido pulada (esse é o caso do print 4, em que o textarea aparece vazio).

d) O `finally` zera `setGeneratingPauta(false)` mas o `aiProgressTopic.finish()` em sucesso fecha o modal em 900ms — quando `formatarApenas` é skipped silenciosamente o usuário acha que "voltou pro modal sem fazer nada".

### Correções

1. **Timeout/abort no cliente para `web-research`** (`NovaPautaWizard.tsx`):
   - Substituir `supabase.functions.invoke` por `fetch` direto com `AbortController` (60s).
   - Em timeout: `failAttempt('web-research', 'timeout 60s')`, log no progress, e segue para a próxima etapa.

2. **Progresso da pesquisa correto**:
   - Trocar o `pushAttempt` hardcoded por um label estável `'web-research (DeepSeek + online)'`.
   - Emitir `setStage('streaming')` ao iniciar, `pushAttempt(..., 'selected')` ao receber notas, `failAttempt` em qualquer erro/timeout — sempre fechando o ciclo do attempt.

3. **`formatarApenas` mais robusto**:
   - Se `topic.response_text` estiver vazio, abortar a pipeline com `toast.error` claro ("Cole o conteúdo bruto antes de usar Formatar apenas") e `aiProgressTopic.finish('Sem conteúdo para formatar')` — não seguir adiante em silêncio.
   - Se houver conteúdo, manter o fluxo atual (`getStandaloneFormatPrompt` + `streamGeneratePauta` + `wrapWithSegways`).

4. **Estágios nomeados no modal de progresso**:
   - Atualizar `aiProgressTopic.start(label)` no início de cada etapa (Pesquisa → Pauta/Formatar → Títulos → Descrição) em vez de um único `start` inicial. Reaproveita o `AiCallProgressContext` (suporta múltiplos `start` consecutivos — só limpa o timer e reseta os attempts) para o usuário ver claramente onde está.

5. **Tratamento de erro de stream**:
   - Em `streamGeneratePauta` (`openrouter-client.ts`), envolver o `while (reader.read())` com timeout de inatividade (45s sem nenhum byte) para evitar leitura travada caso a edge function tenha morrido no meio do stream.

### Verificação

- Rodar via Playwright o fluxo de Pautas → Nova pauta → preencher release → "Gerar tudo" com **somente Pesquisa + Formatar + Títulos + Descrição** marcados, com `response_text` vazio e com `response_text` populado. Confirmar:
  - Sem conteúdo cru → erro claro e modal fecha em ~4s.
  - Com conteúdo cru → formato Markdown + segways aplicados, títulos e descrição populados.
  - Web research que demora >60s → fallback, mensagem no modal, restante da pipeline continua.

## Fora de escopo (não mexer)

- Layout/colunas atuais da tabela de pautas avulsas.
- Lógica do `NovaPautaWizard` para os outros 3 botões (`Gerar pauta`, `Gerar títulos`, `Gerar com IA` da descrição) — só ajustar `runGenerateAll` + cliente de stream.
- Edge functions de OpenRouter (`_shared/openrouter.ts`, `generate-pauta`, `web-research`) continuam como estão.
