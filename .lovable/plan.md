# Plano: Alinhar Rivaldo às suas instruções de edição

Comparei suas instruções com o pipeline atual (`src/lib/audio/pipeline.ts`, `auto-duck.ts`, `assembler.ts`, `voice-processor.ts`, `types.ts`). A montagem geral (master + duck + intro/outro + export MP3) já segue o seu modelo, mas há **3 diferenças críticas** e **2 ajustes finos** a fazer.

---

## Diferenças encontradas

### 1. CRÍTICO — Corte de silêncio na master NÃO está implementado

**Você pediu:**

- Threshold: −20 dB
- Detectar silêncio só se durar ≥ **0,9 s contínuos**
- Recortar o miolo para deixar **0,6 s** finais
- Exemplo: 3 s de silêncio → vira 0,6 s

**Hoje:**

- Os parâmetros `silenceCutTarget` (0.4 s) e `silenceCutBufferMs` (418 ms) **existem na UI e nos defaults**, mas nenhum código os usa. Não há recorte temporal de silêncios na master em lugar nenhum.
- O que existe é o "Smart Mute" do voice-processor, que apenas **atenua** os trechos não-falados (mantém a duração). Não é corte.

**Resultado:** suas pausas de respiração permanecem do tamanho original.

---

### 2. CRÍTICO — Threshold de silêncio incorreto

**Você pediu:** −20 dB para definir silêncio.

**Hoje:** `silenceThresholdDb = −26 dB` (em `DEFAULT_PARAMS`). Esse valor é usado pelo auto-duck para detectar onde está a voz, mas estaria reaproveitado para o silence-cut. Precisa ir para −20 dB.

---

### 3. Pré-silêncio dos 7 s — OK, mas com ressalva

**Você pediu:** 7 s de silêncio no começo da master (BGM toca sozinho antes da voz).

**Hoje:** `bgmPreMasterSilence = 7` ✅ — já está certo. Apenas confirmar que continua 7 s após a mudança. >>>> confirmado 

---

### 4. Auto-Duck — parâmetros conferem, com 1 desvio


| Parâmetro           | Você pediu                     | Hoje                     | Status    |
| ------------------- | ------------------------------ | ------------------------ | --------- |
| Redução do BGM      | −24 dB                         | `duckReductionDb: -24`   | ✅         |
| Fade down (descida) | 1,23 s                         | `fadeDownDuration: 1.23` | ✅         |
| Fade up (subida)    | 0,3 s                          | `fadeUpDuration: 0.3`    | ✅         |
| Pausa máxima        | 4 s                            | `maxPause: 4.0`          | ✅         |
| Hold após voz       | (você não citou — implícito 0) | `duckHoldDuration: 0.5`  | ⚠️ desvio |


**Desvio:** existe um `duckHoldDuration` de 0,5 s que segura o duck por meio segundo extra após a voz parar, antes do fade-up de 0,3 s começar. Suas instruções não mencionam esse hold. **Sugiro zerar para 0 s** para bater 100% com o spec.

---

### 5. Corte do BGM 12 s após o fim da master — OK

**Você pediu:** localizar fim da master, marcar [corte] em +12 s no BGM, deletar tudo depois.
**Hoje:** `bgmTailAfterMaster: 12` em `assembler.ts → mixAndTrim`. ✅

---

### 6. Intro antes / Outro depois → V2 → MP3 — OK

`assembler.ts → concatenate` faz exatamente Intro + V1 + Outro. ✅
Existe um crossfade de 40 ms (`crossfadeDuration: 0.04`) entre as junções — você não pediu isso, mas é uma transição suave que evita "pop". **Sugiro manter**, mas se preferir corte seco posso zerar.

---

## Plano de implementação

### Arquivo novo: `src/lib/audio/silence-cut.ts`

Função `cutSilencesInMaster(buffer, params, log)`:

1. Varrer a master em janelas de ~10 ms calculando RMS.
2. Marcar como "silêncio" janelas com nível < −20 dB.
3. Agrupar janelas contíguas em **blocos de silêncio**.
4. Para cada bloco com **duração ≥ 0,9 s**: cortar o miolo deixando apenas **0,6 s** centrados (preserva 0,3 s de cada lado, do início e fim do bloco — mantém naturalidade nas bordas das frases).
5. Retornar novo `AudioBuffer` mais curto + log de quantos cortes foram feitos e quanto tempo foi removido.

### `src/lib/audio/types.ts`

- `silenceThresholdDb: -26` → **−20**
- `silenceCutTarget: 0.4` → **0.6**
- `silenceCutBufferMs: 418` → **300** (significa o "buffer" preservado nas bordas; 300 ms × 2 lados = 600 ms = alvo)
- `duckHoldDuration: 0.5` → **0** (para bater com sua spec)
- Adicionar `silenceMinDuration: 0.9` (novo campo — duração mínima para considerar bloco recortável)

### `src/lib/audio/pipeline.ts`

Inserir o passo de corte **logo após `mixVoiceTracks` e ANTES de adicionar o pré-silêncio de 7 s**:

```ts
const processedMaster = mixVoiceTracks(voiceBuffers, onLog);
applyGainToBuffer(processedMaster, params.masterGainDb);
// NOVO:
const trimmedMaster = cutSilencesInMaster(processedMaster, params, onLog);
// depois segue: pré-silêncio de 7s, decode bgm/intro/outro, duck, mix, concat...
```

Importante: o corte **acontece antes** do pré-silêncio de 7 s, então os 7 s de abertura ficam intactos.

### `src/components/rivaldo/ParametersSidebar.tsx`

- Atualizar labels/ranges dos sliders para refletir os novos defaults.
- Adicionar slider para `silenceMinDuration` (faixa 0.5–3 s).
- Slider de `duckHoldDuration` mantido (caso queira voltar a usar manualmente), mas default 0.

### Compatibilidade com o Bulk

A pipeline é a mesma para single e bulk (`runBulkPipeline` chama `runPipeline`), então o corte de silêncio será aplicado automaticamente em ambos os modos. Modo "Compilar da nuvem" não toca em master, então não é afetado.

---

## Tabela final de parâmetros (pós-mudança)


| Parâmetro                   | Valor                                            |
| --------------------------- | ------------------------------------------------ |
| `silenceThresholdDb`        | **−20 dB**                                       |
| `silenceMinDuration` (novo) | **0,9 s**                                        |
| `silenceCutTarget`          | **0,6 s**                                        |
| `bgmPreMasterSilence`       | 7 s                                              |
| `duckReductionDb`           | −24 dB                                           |
| `fadeDownDuration`          | 1,23 s                                           |
| `fadeUpDuration`            | 0,3 s                                            |
| `maxPause`                  | 4 s                                              |
| `duckHoldDuration`          | **0 s**                                          |
| `bgmTailAfterMaster`        | 12 s                                             |
| `crossfadeDuration`         | 0,04 s (manter, ou zerar se preferir corte seco) |


---

## Perguntas antes de implementar

1. **duckHoldDuration**: zero (como sua spec sugere) ou mantém os 0,5 s atuais que ajudam a evitar o BGM "pulando" entre frases curtas?
2. **crossfade intro/outro**: mantém os 40 ms atuais ou prefere corte seco (0 ms)?
3. **smartMute** (que apenas atenua, não corta tempo): mantém ligado em paralelo ao novo corte real, ou desligo por padrão? Sua spec só fala em recorte temporal.