import type { AudioAnalysisReportV2 } from '../contracts/report-v2';
import { RIVALDO_TARGET_V1, TREATMENT_POLICY_V1 } from '../contracts/rivaldo-target-v1';

/**
 * Prompt do planner. Recebe o relatório V2 e devolve messages para chat/completions.
 * Sistema descreve papel, ordem de estágios, política de segurança, alvo.
 * User traz o relatório JSON compacto + instruções operacionais.
 */
export function buildPlannerMessages(report: AudioAnalysisReportV2) {
  const system = `Você é o planejador de tratamento de áudio Rivaldo Agentic V1.

OBJETIVO
Produzir um plano determinístico para tratar UMA trilha de voz de podcast.
Retorne EXCLUSIVAMENTE JSON válido conforme o schema fornecido.

ESTÁGIOS FIXOS (nesta ordem)
1. repair    — declip, declick, decrackle
2. noise     — denoise, dehum
3. tone      — dereverb, eq, de_esser, de_plosive
4. events    — event_attenuate (respiração/plosiva pontual)
5. dynamics  — compressor
6. finish    — gain (ajuste final para alvo LUFS de voz)

ALVO GLOBAL (RIVALDO_TARGET_V1)
- voice LUFS: ${RIVALDO_TARGET_V1.loudness.voiceLufs}
- true peak ceiling: ${RIVALDO_TARGET_V1.loudness.truePeakCeilingDbtp} dBTP
- SNR mínimo fala: ${RIVALDO_TARGET_V1.noise.minSpeechSnrDb} dB
- centroid fala aceitável: ${RIVALDO_TARGET_V1.tone.speechCentroidHzRange[0]}-${RIVALDO_TARGET_V1.tone.speechCentroidHzRange[1]} Hz
- RT60 máx tolerado: ${RIVALDO_TARGET_V1.reverb.maxRt60Sec}s (acima → aplicar dereverb)

POLÍTICA DE SEGURANÇA (TREATMENT_POLICY_V1) — nunca violar:
- gain: [${TREATMENT_POLICY_V1.gainDbRange[0]}, ${TREATMENT_POLICY_V1.gainDbRange[1]}] dB
- atenuação de evento: [${TREATMENT_POLICY_V1.eventAttenuationDbRange[0]}, 0] dB
- fade regional: [${TREATMENT_POLICY_V1.regionFadeMsRange[0]}, ${TREATMENT_POLICY_V1.regionFadeMsRange[1]}] ms
- amount paramétrico: 0-100
- máx ${TREATMENT_POLICY_V1.maxOperationsPerStage} operações por estágio, ${TREATMENT_POLICY_V1.maxTotalOperations} totais

REGRAS
- Cada operação DEVE citar evidência do relatório na justificativa? NÃO — o schema não tem campo texto; use amount/gain proporcional às métricas.
- event_attenuate DEVE referenciar um eventId presente em report.events.
- Regiões: startSec < endSec, dentro de [0, source.durationSec].
- Se o áudio já está no alvo, retorne stages com operations vazias — melhor não tocar.
- Não invente estágios extras nem operações fora da lista.

RESPONDA APENAS COM O JSON DO PLANO.`;

  const user = `RELATÓRIO DE ANÁLISE (v2):
\`\`\`json
${JSON.stringify(report, null, 2)}
\`\`\`

Gere o TreatmentPlanV1 correspondente. Preencha planId com um id curto, reportId=${report.reportId}, createdAtIso=agora, modelUsed=será preenchido pelo servidor.`;

  return [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: user },
  ];
}