import type { AudioAnalysisReportV2 } from './schemas.ts';
import { TARGET, POLICY } from './schemas.ts';

/** Episode-batch prompt: N reports -> N trackPlans em uma resposta. */
export function buildEpisodePlannerMessages(
  episodeId: string,
  reports: AudioAnalysisReportV2[],
  extraInstructions = '',
) {
  const system = `Você é o planejador Rivaldo Agentic V1 para voz de podcast.
Devolva EXCLUSIVAMENTE JSON válido do EpisodePlanV1, com um trackPlan por report enviado.

ESTÁGIOS FIXOS, NESTA ORDEM:
  repair -> noise -> tone -> events -> dynamics -> finish

Operações permitidas por estágio:
  repair: declip, declick, decrackle
  noise: denoise, dehum
  tone: eq, de_esser, de_plosive
  events: event_attenuate
  dynamics: compressor
  finish: gain

COMO LER REPORT.EVENTS:
- Cada item de report.events é um finding agrupado. Ele resume um ou mais eventos brutos detectados localmente.
- Use o id do finding como eventId em event_attenuate.
- startSec e endSec são os limites regionais seguros do finding.
- meta.sourceEventCount informa quantos eventos locais formaram aquele finding.
- meta.totalTypeEventCount informa a incidência total daquele tipo na track.
- meta.typeFindingsIncluded informa quantos findings daquele tipo chegaram ao planner.
- meta.representativeEventId serve apenas para rastreabilidade local. Não o use como eventId.
- Não crie uma operação por evento contado em sourceEventCount. Trate o finding como uma única evidência regional.
- Uma incidência alta pode influenciar a estratégia e o amount, sempre dentro da política conservadora.

Alvo: voz ${TARGET.voiceLufs} LUFS, true peak <= ${TARGET.truePeakCeilingDbtp} dBTP,
SNR fala >= ${TARGET.minSpeechSnrDb} dB, centroid fala ${TARGET.speechCentroidHzRange[0]}-${TARGET.speechCentroidHzRange[1]} Hz,
RT60 máximo ${TARGET.maxRt60Sec}s. Não aplique dereverb nesta versão.

Política:
  gain [${POLICY.gainDbRange[0]}, ${POLICY.gainDbRange[1]}] dB,
  atenuação [${POLICY.eventAttenuationDbRange[0]}, 0] dB,
  fade regional [${POLICY.regionFadeMsRange[0]}, ${POLICY.regionFadeMsRange[1]}] ms,
  amount 0-100,
  máximo ${POLICY.maxOperationsPerStage} operações por estágio e
  ${POLICY.maxTotalOperations} operações totais.

Regras:
- Regiões em segundos, startSec < endSec, dentro de [0, source.durationSec].
- event_attenuate deve referenciar um finding do mesmo report.
- Se a track já está no alvo, retorne operations vazias para ela.
- Nunca invente estágios ou operações fora da lista.
${extraInstructions ? `\nDIRETRIZES EDITÁVEIS DA EQUIPE:\n${extraInstructions}` : ''}`;

  const user = `EPISÓDIO: ${episodeId}
RELATÓRIOS COM FINDINGS AGRUPADOS (v2, ${reports.length} track${reports.length > 1 ? 's' : ''}):
\`\`\`json
${JSON.stringify(reports)}
\`\`\`
Emita EpisodePlanV1 com trackPlans[i].reportId = reports[i].reportId, na mesma ordem.
O servidor sobrescreverá modelUsed, planId, episodeId e createdAtIso.`;

  return [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: user },
  ];
}
