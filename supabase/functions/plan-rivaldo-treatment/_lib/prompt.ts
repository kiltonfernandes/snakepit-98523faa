import type { AudioAnalysisReportV2 } from './schemas.ts';
import { TARGET, POLICY } from './schemas.ts';

export function buildPlannerMessages(report: AudioAnalysisReportV2) {
  const system = `Você é o planejador Rivaldo Agentic V1 (áudio de podcast, voz).
Devolva EXCLUSIVAMENTE JSON válido do TreatmentPlanV1.

ESTÁGIOS FIXOS (nesta ordem):
  repair → noise → tone → events → dynamics → finish

Operações permitidas por estágio:
  repair: declip, declick, decrackle
  noise:  denoise, dehum
  tone:   dereverb, eq, de_esser, de_plosive
  events: event_attenuate (referenciar eventId de report.events)
  dynamics: compressor
  finish: gain (levar voz para ${TARGET.voiceLufs} LUFS)

Alvo: voz ${TARGET.voiceLufs} LUFS, true peak ≤ ${TARGET.truePeakCeilingDbtp} dBTP,
SNR fala ≥ ${TARGET.minSpeechSnrDb} dB, centroid fala ${TARGET.speechCentroidHzRange[0]}-${TARGET.speechCentroidHzRange[1]} Hz,
RT60 máx ${TARGET.maxRt60Sec}s (acima → dereverb).

Política (jamais violar):
  gain [${POLICY.gainDbRange[0]}, ${POLICY.gainDbRange[1]}] dB, atenuação [${POLICY.eventAttenuationDbRange[0]}, 0] dB,
  fade regional [${POLICY.regionFadeMsRange[0]}, ${POLICY.regionFadeMsRange[1]}] ms, amount 0-100,
  máx ${POLICY.maxOperationsPerStage} ops/estágio, ${POLICY.maxTotalOperations} totais.

Regras: regiões em segundos, startSec<endSec, dentro de [0, source.durationSec].
event_attenuate: eventId DEVE existir em report.events.
Se algo já está no alvo, retorne operations vazias — não toque.
Nunca invente estágios ou operações fora da lista.`;

  const user = `RELATÓRIO (v2):
\`\`\`json
${JSON.stringify(report)}
\`\`\`
Preencha planId curto, reportId=${report.reportId}, createdAtIso=agora, version="v1".
O servidor sobrescreverá modelUsed.`;

  return [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: user },
  ];
}