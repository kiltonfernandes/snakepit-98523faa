import type { AudioAnalysisReportV2 } from './schemas.ts';
import { TARGET, POLICY } from './schemas.ts';

/** Episode-batch prompt: N reports → N trackPlans em UMA resposta. */
export function buildEpisodePlannerMessages(episodeId: string, reports: AudioAnalysisReportV2[]) {
  const system = `Você é o planejador Rivaldo Agentic V1 (áudio de podcast, voz).
Devolva EXCLUSIVAMENTE JSON válido do EpisodePlanV1 (um trackPlan por report enviado).

ESTÁGIOS FIXOS (nesta ordem):
  repair → noise → tone → events → dynamics → finish

Operações permitidas por estágio:
  repair: declip, declick, decrackle
  noise:  denoise, dehum
  tone:   eq, de_esser, de_plosive
  events: event_attenuate (referenciar eventId de report.events do MESMO track)
  dynamics: compressor
  finish: gain (levar voz para ${TARGET.voiceLufs} LUFS)

Alvo: voz ${TARGET.voiceLufs} LUFS, true peak ≤ ${TARGET.truePeakCeilingDbtp} dBTP,
SNR fala ≥ ${TARGET.minSpeechSnrDb} dB, centroid fala ${TARGET.speechCentroidHzRange[0]}-${TARGET.speechCentroidHzRange[1]} Hz,
RT60 máx ${TARGET.maxRt60Sec}s (não aplicar dereverb nesta versão; se acima, apenas registre).

Política (jamais violar):
  gain [${POLICY.gainDbRange[0]}, ${POLICY.gainDbRange[1]}] dB, atenuação [${POLICY.eventAttenuationDbRange[0]}, 0] dB,
  fade regional [${POLICY.regionFadeMsRange[0]}, ${POLICY.regionFadeMsRange[1]}] ms, amount 0-100,
  máx ${POLICY.maxOperationsPerStage} ops/estágio, ${POLICY.maxTotalOperations} totais.

Regras: regiões em segundos, startSec<endSec, dentro de [0, source.durationSec] do track correspondente.
Se algo já está no alvo, retorne operations vazias para aquele track — não toque.
Nunca invente estágios ou operações fora da lista.`;

  const user = `EPISÓDIO: ${episodeId}
RELATÓRIOS (v2, ${reports.length} track${reports.length > 1 ? 's' : ''}):
\`\`\`json
${JSON.stringify(reports)}
\`\`\`
Emita EpisodePlanV1 com trackPlans[i].reportId = reports[i].reportId (mesma ordem).
O servidor sobrescreverá modelUsed, planId, episodeId e createdAtIso.`;

  return [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: user },
  ];
}