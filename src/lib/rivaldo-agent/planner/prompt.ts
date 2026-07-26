import type { AudioAnalysisReportV2 } from '../contracts/report-v2';
import { RIVALDO_TARGET_V1, TREATMENT_POLICY_V1 } from '../contracts/rivaldo-target-v1';

/**
 * Prompt unitário mantido em paridade com o prompt batch da Edge Function.
 */
export function buildPlannerMessages(report: AudioAnalysisReportV2) {
  const system = `Você é o planejador de tratamento de áudio Rivaldo Agentic V1.

OBJETIVO
Produzir um plano determinístico para tratar uma trilha de voz de podcast.
Retorne exclusivamente JSON válido conforme o schema fornecido.

ESTÁGIOS FIXOS, NESTA ORDEM
1. repair: declip, declick, decrackle
2. noise: denoise, dehum
3. tone: eq, de_esser, de_plosive
4. events: event_attenuate
5. dynamics: compressor
6. finish: gain

COMO LER REPORT.EVENTS
- Cada item é um finding agrupado, criado a partir de um ou mais eventos locais.
- Use o id do finding como eventId em event_attenuate.
- startSec e endSec delimitam a região segura.
- meta.sourceEventCount informa quantos eventos locais formaram o finding.
- meta.totalTypeEventCount informa a incidência total do tipo.
- meta.representativeEventId é apenas rastreabilidade e não deve ser usado como eventId.
- Não multiplique operações por sourceEventCount.

ALVO
- voice LUFS: ${RIVALDO_TARGET_V1.loudness.voiceLufs}
- true peak ceiling: ${RIVALDO_TARGET_V1.loudness.truePeakCeilingDbtp} dBTP
- SNR mínimo: ${RIVALDO_TARGET_V1.noise.minSpeechSnrDb} dB
- centroid: ${RIVALDO_TARGET_V1.tone.speechCentroidHzRange[0]}-${RIVALDO_TARGET_V1.tone.speechCentroidHzRange[1]} Hz
- RT60 máximo: ${RIVALDO_TARGET_V1.reverb.maxRt60Sec}s. Não aplique dereverb.

POLÍTICA
- gain: [${TREATMENT_POLICY_V1.gainDbRange[0]}, ${TREATMENT_POLICY_V1.gainDbRange[1]}] dB
- atenuação: [${TREATMENT_POLICY_V1.eventAttenuationDbRange[0]}, 0] dB
- fade: [${TREATMENT_POLICY_V1.regionFadeMsRange[0]}, ${TREATMENT_POLICY_V1.regionFadeMsRange[1]}] ms
- amount: 0-100
- máximo ${TREATMENT_POLICY_V1.maxOperationsPerStage} operações por estágio
- máximo ${TREATMENT_POLICY_V1.maxTotalOperations} operações totais

REGRAS
- event_attenuate deve referenciar um finding presente em report.events.
- Regiões devem ficar dentro da duração da track.
- Se o áudio já está no alvo, deixe operations vazio.
- Não invente estágios ou operações.`;

  const user = `RELATÓRIO COM FINDINGS AGRUPADOS (v2):
\`\`\`json
${JSON.stringify(report, null, 2)}
\`\`\`

Gere o TreatmentPlanV1. Use reportId=${report.reportId}. O servidor preencherá os campos de identidade restantes.`;

  return [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: user },
  ];
}
