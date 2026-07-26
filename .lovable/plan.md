## Rivaldo Agentic V1

Motor de tratamento agentic para o Rivaldo: análise local V2 → um plano via OpenRouter → validação rígida → executor DSP local. Feature flag mantém o motor atual como fallback e permite alternar no UI.

## Entrega em 4 ondas

Fazer os 14 passos num único push produziria ~3.5k linhas de DSP não testado que quebrariam o Rivaldo atual. Vou entregar em 4 ondas curtas, cada uma verificável, cada uma sem regressão para o motor atual.

### Onda 1 — Fundação (esta rodada)
1. Estrutura de pastas `src/lib/rivaldo-agent/`.
2. Schemas Zod: `AudioAnalysisReportV2`, `TreatmentPlanV1`, `AudioEvent`.
3. `RIVALDO_TARGET_V1` (global, versionado) e `TreatmentPolicyV1` com faixas permitidas.
4. Feature flag no Settings + toggle no header do Rivaldo (`RIVALDO_AGENTIC_V1`, persistido em `app_settings`).
5. Ponto de integração no `pipeline.ts`: `runAgenticVoiceProcessing` chamável, hoje delega ao processador atual.
6. Edge Function `plan-rivaldo-treatment` stub com Structured Outputs + `RIVALDO_AUDIO_PLANNER_MODEL` (default `deepseek/deepseek-v4-pro`).

### Onda 2 — Análise V2
7. `analysis.worker.ts` processando em blocos de 10s.
8. BS.1770-5 via Essentia.js (LUFS integrado, momentary, short-term, LRA, true peak).
9. VAD melhorado, ruído (piso, SNR, hum 50/60), espectro (LTAS, centroid, rolloff), acústica (RT60 estimado com confidence).
10. Detectores de eventos: clipping, click, crackle, breath, sibilance, plosive, hum, level_jump, dropout.
11. Relatório compacto (percentis + eventos, sem curvas gigantes).

### Onda 3 — Planner + Validação
12. Edge Function completa: prompt, contratos, chamada com temperature 0.15 e `response_format: json_schema` derivado do Zod.
13. Camadas de validação: estrutural, identidade, temporal, evidências, parâmetros, cumulativa, conflitos. Clamp + descarte + fallback logs.

### Onda 4 — Executor + integração final
14. Executor por estágios (repair→noise→tone→events→dynamics→finish), operações regionais com envelopes fade 5-20ms, safety limiter no fim.
15. Correção do bug atual do `preserveSpeechSections` (não copiar fala original por cima).
16. Export log com 4 seções novas (LOCAL ANALYSIS / OPENROUTER PLANNING / VALIDATION / LOCAL EXECUTION).
17. Remover flag depois de estabilizar (opcional, controlado por você).

## Escopo desta rodada (Onda 1)

Vou criar:

- `src/lib/rivaldo-agent/contracts/report-v2.ts` — Zod schemas do relatório de análise.
- `src/lib/rivaldo-agent/contracts/treatment-plan-v1.ts` — Zod schemas do plano + operações permitidas + limites.
- `src/lib/rivaldo-agent/contracts/rivaldo-target-v1.ts` — target global + policy.
- `src/lib/rivaldo-agent/contracts/zod-to-json-schema.ts` — helper para gerar JSON Schema do OpenRouter a partir do Zod (fonte única).
- `src/lib/rivaldo-agent/index.ts` — API pública: `isAgenticEnabled()`, `runAgenticVoiceProcessing()` (delega ao atual por enquanto).
- `src/lib/rivaldo-agent/feature-flag.ts` — leitura/escrita da flag em `app_settings`.
- `supabase/functions/plan-rivaldo-treatment/index.ts` + `_shared` do OpenRouter (reuso do client existente).
- `src/components/rivaldo/AgenticToggle.tsx` — toggle no header do Rivaldo (visível só quando flag estiver disponível).
- Integração em `src/pages/Rivaldo.tsx` (adição do toggle) e `src/lib/audio/pipeline.ts` (delegação condicional no ponto único do tratamento da voz).

Nada do motor atual muda semanticamente. O flag desligado = comportamento idêntico ao de hoje.

## Detalhes técnicos

- Feature flag persiste em `app_settings.rivaldo_agentic_v1_enabled` (boolean). Sem migration nova — coluna JSONB `data` já existe (uso chave dedicada).
- OpenRouter: `deepseek/deepseek-v4-pro`, `temperature: 0.15`, `response_format.json_schema` derivado do Zod via `zod-to-json-schema` (nova dep, ~15KB).
- Essentia.js entra na Onda 2 (`bun add essentia.js`) para não inflar bundle antes de ser usado.
- Executor da Onda 4 usa `Web Worker` novo (`executor.worker.ts`) para não travar UI.

## Compromisso

Cada onda é entregue com o motor atual 100% preservado quando a flag está OFF. Você aprova cada onda antes da próxima. Se qualquer ponto do plano estiver errado, ajustamos antes da Onda 2.
