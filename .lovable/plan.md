## Resumo dos 6 ajustes

1. Normalizar prompts/saídas para nunca trazer markdown
2. Corrigir modal "Protocolo de Prompt" quebrado (sub-aba Insumos)
3. Reviews sem limite máximo (mínimo 400 palavras, sem teto)
4. Contexto orbital obrigatório em toda response
5. DirectionEditor com 2 campos: **Direção** + **Informação Mandatória** (esta NÃO conta no limite de palavras)
6. Rivaldo: log .txt granular, ordenado por timestamp de áudio, baixado automaticamente ao final (sucesso ou falha) em single e bulk

---

## 1. Normalização de markdown (saída sem `**`, `##`, `* `, etc.)

**Problema:** A imagem 1 mostra a pauta pública com `**Sábado**`, `### A Celebração`, `* **Internacionais:**` cru no texto — o LLM às vezes devolve markdown apesar do prompt pedir só conteúdo dentro das tags.

**Mudanças:**

- `src/lib/prompt-defaults.ts` — adicionar bloco rígido em `COMMON_INSTRUCTIONS` e em cada `PLAYBOOK_*`:
  ```
  PROIBIDO MARKDOWN: NÃO use **, *, #, ##, ###, ####, _, `, > nem listas com - ou *.
  Escreva em prosa contínua. Para destacar, use as próprias palavras.
  Subtítulos curtos podem aparecer como linha isolada em maiúsculas, sem #.
  Listas devem ser parágrafos com vírgula ou ponto-vírgula.
  ```
- `src/pages/PublicWeekView.tsx` — criar helper `stripMarkdown(text)` aplicado dentro de `cleanContent`:
  - Remove `**...**`, `*...*`, `__...__`, `_..._` (mantém o conteúdo interno)
  - Remove prefixos de linha: `^#{1,6}\s+`, `^\s*[\*\-]\s+`, `^\s*\d+\.\s+` (substitui por espaço/nada)
  - Remove backticks ``` e ` `
  - Colapsa múltiplas quebras (3+ → 2)
- Aplicar o mesmo `stripMarkdown` no preview interno (`Pautas.tsx` no bloco preview ~linha 2074+) e no export (Materials, ZIP).

**Resultado:** independente do que o LLM devolva, a pauta gravada vem limpa.

---

## 2. Modal de protocolo de prompt quebrado

**Problema (imagem 2):** o modal `Protocolo de Prompt` está cortado/saindo da tela quando aberto pelo botão de uma seção específica na sub-aba Insumos.

**Causa:** `DialogContent className="max-w-2xl"` + `<pre className="whitespace-pre-wrap">` — o `pre` não quebra palavras longas (URLs, IDs), forçando overflow horizontal e empurrando o dialog para fora.

**Mudanças em `src/pages/Pautas.tsx` (~linha 2004-2056):**
- `DialogContent`: `max-w-2xl` → `max-w-3xl w-[95vw]`
- `<pre>`: adicionar `break-words` e `overflow-x-hidden` (mantém `whitespace-pre-wrap`)
- `Textarea` da resposta: `rows={8}` mantém, garantir `w-full`

---

## 3. Reviews sem teto de palavras (mínimo 400)

**Mudanças em `src/lib/prompt-builder.ts`:**
- `SECTION_WORD_TARGETS`: remover `review_rafa` e `review_kilton` desse mapa (ou marcar como `min` apenas)
- Criar novo mapa:
  ```ts
  export const SECTION_WORD_MIN: Record<string, number> = {
    review_rafa: 400,
    review_kilton: 400,
  };
  ```
- `dayContractHtml` / `sectionContractHtml`: para seções em `SECTION_WORD_MIN`, gerar `(mínimo ${min} palavras, sem limite máximo)` no contrato em vez de `~${words} palavras`.

**Em `src/lib/prompt-defaults.ts`:**
- `PLAYBOOK_REVIEW_RAFA` e `PLAYBOOK_REVIEW_KILTON`: trocar "Aproximadamente 300 palavras" por "Mínimo 400 palavras. Sem limite máximo — escreva o que for necessário para entregar profundidade real."

---

## 4. Contexto orbital obrigatório

Adicionar em todos os `PLAYBOOK_*` (em `prompt-defaults.ts`) um parágrafo padrão:

```
CONTEXTO ORBITAL (OBRIGATÓRIO):
A response NÃO pode tratar apenas do tópico cru. Sempre inclua contexto ao redor:
- O que estava acontecendo na cena/banda/gênero na época
- Como o tópico se conecta com outros lançamentos, eventos ou tendências
- Por que isso importa hoje para o ouvinte heavynauta
- Pontes entre o fato central e o universo metal mais amplo
Sem contexto orbital, a seção é incompleta.
```

---

## 5. DirectionEditor com 2 campos (Direção + Informação Mandatória)

### 5.1 UI — `src/components/pautas/DirectionEditor.tsx`

Adicionar segundo `Textarea` no modal:
- Campo 1 (atual): **Direção editorial** — guia geral, ângulo, tom
- Campo 2 (novo): **Informação mandatória** — texto que DEVE aparecer literalmente/coerentemente na response, NÃO conta no word limit

Estado interno: `draft` vira `{ direction: string; mandatory: string }`.

Persistência:
- `value` prop vira `{ direction?: string; mandatory?: string }` (objeto) — mas para retrocompatibilidade com strings já salvas em `comment_*`, aceitar ambos: se string, tratar como `direction`.
- `onChange` recebe o objeto.
- Botão mostra ✓ se qualquer um dos dois tiver conteúdo; tooltip lista ambos.

### 5.2 Storage — `raw_inputs_json`

Manter chaves `comment_<section>` (direção) e adicionar chaves novas `mandatory_<section>`:
- `comment_anniversary` ↔ `mandatory_anniversary`
- `comment_news` ↔ `mandatory_news`
- `comment_review_rafa` ↔ `mandatory_review_rafa`
- `comment_review_kilton` ↔ `mandatory_review_kilton`
- `comment_next_week_releases` ↔ `mandatory_next_week_releases`

Em `Pautas.tsx`, cada `<DirectionEditor>` passa value `{ direction: inputs.comment_X, mandatory: inputs.mandatory_X }` e o onChange grava ambos via `updateRawInput`.

### 5.3 Prompt builder — `src/lib/prompt-builder.ts`

- Novo mapa `SECTION_MANDATORY_KEYS`:
  ```ts
  export const SECTION_MANDATORY_KEYS: Record<string, string> = {
    anniversary: 'mandatory_anniversary',
    news: 'mandatory_news',
    review_rafa: 'mandatory_review_rafa',
    review_kilton: 'mandatory_review_kilton',
    next_week_releases: 'mandatory_next_week_releases',
  };
  ```
- Em `renderContextXml(payload, focusSectionKey)`:
  - Continuar injetando `DIREÇÃO EDITORIAL ...` (já existe)
  - Adicionar bloco logo após:
    ```
    INFORMAÇÃO MANDATÓRIA (seção "X") — esta informação DEVE estar presente
    na response de forma coerente e coesa. NÃO conta no limite de palavras
    (acrescente o necessário além do alvo para incorporá-la):
    <texto>
    ```
- Quando o builder operar em escopo `day` ou `week` (sem `focusSectionKey`), iterar todas as seções preenchidas e emitir um bloco `INFORMAÇÃO MANDATÓRIA (seção "X")` para cada uma que tiver `mandatory_*` não-vazio.
- Atualizar `dayContractHtml`/`weekContractHtml`/`sectionContractHtml` para acrescentar nota global:
  ```
  NOTA: Texto declarado em INFORMAÇÃO MANDATÓRIA não conta no word target;
  trate como conteúdo extra obrigatório.
  ```

### 5.4 Edge function `generate-pauta`

Apenas usa o prompt construído pelo builder, então não precisa lógica nova — o texto mandatório já chega via prompt.

---

## 6. Rivaldo — Log granular .txt baixado automaticamente

### 6.1 Estrutura do log

Cada entrada com:
- `iso_time` (timestamp wall-clock)
- `audio_ts` (segundos dentro do áudio do episódio, quando aplicável — ex.: cortes de silêncio, ducking events)
- `stage` (decode, analysis, repair, denoise, dereverb, voice, loudness, mix, encode, upload)
- `severity` (info / step / success / warn / error)
- `message`
- `data` (objeto opcional: parâmetros, métricas, durations)

### 6.2 Tipo + coletor — `src/lib/audio/types.ts`

```ts
export interface DetailedLogEntry {
  isoTime: string;
  elapsedMs: number;       // since pipeline start
  audioTsSec?: number;     // position in the master audio when the event refers to it
  stage: string;
  severity: 'info' | 'step' | 'success' | 'warn' | 'error';
  message: string;
  data?: Record<string, unknown>;
}
```

### 6.3 Logger — novo `src/lib/audio/detailed-logger.ts`

```ts
export class DetailedLogger {
  private entries: DetailedLogEntry[] = [];
  private startedAt = Date.now();
  log(stage, severity, message, opts?: { audioTs?: number; data?: any }): void
  getEntries(): DetailedLogEntry[]
  toTxt(meta: { filename, mode: 'single'|'bulk', startedIso, finishedIso, status }): string
  download(filename: string): void   // triggers a.click on a Blob
}
```

Formato `.txt` (ordenado por `audioTsSec` quando presente, depois `elapsedMs`):
```
================================================================
RIVALDO PROCESSING LOG
Mode: single | Filename: episode_2026-04-27.mp3
Started: 2026-04-27T03:12:45.000Z
Finished: 2026-04-27T03:18:02.000Z
Status: SUCCESS | Duration: 5m17s
Pipeline version: 3.2
================================================================

[+00:00.123] [audio --:--] [decode]   ▶ Decodificando arquivos base
[+00:01.402] [audio 00:00] [analysis] ℹ VAD frame=20ms hangover=200ms
[+00:02.910] [audio 00:12.4] [repair]   ✓ declick events=14
[+00:14.220] [audio 00:42.1] [silence-cut] ℹ corte 1.8s → 0.6s @ pos 00:42.1
...
[+05:17.000] [audio --:--] [export] ✓ MP3 192kbps, -16.0 LUFS, -1.5 dBTP

DATA APPENDIX (json per stage):
- decode: {...}
- voice-track[0]: {...}
- master-report: {...}
```

### 6.4 Integração no pipeline — `src/lib/audio/pipeline.ts`

- `runPipeline` e `runBulkPipeline` aceitam `logger?: DetailedLogger` opcional. Se ausente, criam um interno.
- Substituir/complementar `onLog(message, type)` para também alimentar o logger com `stage` e `audioTs` quando pertinente.
- Pontos a instrumentar (granularidade real):
  - decode: tamanho, duração, sampleRate de cada arquivo (master/bgm/intro/outro)
  - analysis: parâmetros VAD, speechRatio, reverbScore antes/depois
  - repair/denoise/dereverb/voice: progresso por chunk com `audioTs` (já temos `progress` interno do worker)
  - silence-cut: cada corte com `audioTs` inicial, duração original, duração final
  - auto-duck: cada evento de duck com `audioTs`
  - mix/concat: duração de cada segmento (intro start, master start, outro start) com `audioTs`
  - loudness: LUFS antes/depois, true peak
  - encode: bitrate, tamanho final
  - upload: cada chunk de upload-session do OneDrive
- Cada track report (`TrackReport`) já tem `events` e `timings` — anexar como `data` no logger no final de cada trilha.

### 6.5 Disparo automático do download

Em `src/contexts/RivaldoContext.tsx` (single):
- Criar `const logger = new DetailedLogger()` no início de `startPipeline`.
- Passar pra `runPipeline({ ..., logger })`.
- Em `try` (sucesso) e em `catch` (erro), no `finally` chamar:
  ```
  logger.log('end', isError?'error':'success', summary);
  logger.download(`${input.filename}__${ts}__${status}.log.txt`);
  ```

Em `src/contexts/RivaldoBulkContext.tsx` (bulk):
- Mesmo padrão. Um único arquivo de log para a sessão bulk inteira, com cabeçalhos de seção por episódio (`-- Episodio 1/N --`).
- Nome: `rivaldo-bulk__${YYYYMMDD-HHmm}__${status}.log.txt`.

### 6.6 UI

- Sem mudança de UI obrigatória; opcionalmente, botão "Baixar log novamente" no painel pós-processamento (em `Rivaldo.tsx` / `BulkModal.tsx`) usando o logger preservado em ref.

---

## Arquivos a alterar

- `src/lib/prompt-defaults.ts` — proibição de markdown, contexto orbital, mínimo 400 palavras nas reviews
- `src/lib/prompt-builder.ts` — `SECTION_WORD_MIN`, `SECTION_MANDATORY_KEYS`, injeção de informação mandatória, contratos atualizados
- `src/pages/PublicWeekView.tsx` — `stripMarkdown` em `cleanContent`
- `src/pages/Pautas.tsx` — modal protocolo (largura + break-words), todos os 11 call-sites de `DirectionEditor` (passar `{direction, mandatory}` e gravar `comment_*` + `mandatory_*`), aplicar `stripMarkdown` no preview
- `src/components/pautas/DirectionEditor.tsx` — segundo campo "Informação mandatória", value/onChange em formato objeto com retrocompat string
- `src/lib/audio/types.ts` — `DetailedLogEntry`
- `src/lib/audio/detailed-logger.ts` (novo) — classe DetailedLogger
- `src/lib/audio/pipeline.ts` — instrumentação granular, parâmetro `logger`
- `src/contexts/RivaldoContext.tsx` — criar logger, baixar .txt sempre no final
- `src/contexts/RivaldoBulkContext.tsx` — mesmo, agregando todos os episódios do bulk

## Não-alterações

- Banco de dados: nenhum schema novo (chaves `mandatory_*` ficam no `raw_inputs_json` que é jsonb livre).
- Edge functions: nenhuma mudança (prompt builder já injeta tudo).
- Logs antigos `comment_*` continuam funcionando (retrocompat).