/**
 * Rivaldo Agentic V1 — API pública.
 *
 * Na Onda 1 a integração é passthrough: quando a flag está ON, ainda
 * chamamos o processador atual (voice-worker). Nas ondas seguintes trocamos
 * este delegate pelo pipeline "analyze → plan → validate → execute".
 */
import type { VoiceProcessContext } from '@/lib/audio/pipeline';
import type { TrackReport } from '@/lib/audio/types';
import { loadAgenticFlag, saveAgenticFlag, RIVALDO_AGENTIC_SETTINGS_KEY } from './feature-flag';
import { agenticVoiceProcessor } from './agentic-processor';

export { loadAgenticFlag, saveAgenticFlag, RIVALDO_AGENTIC_SETTINGS_KEY };
export * from './contracts/rivaldo-target-v1';
export * from './contracts/report-v2';
export * from './contracts/treatment-plan-v1';
export { AnalyzerClient } from './analysis/analyzer-client';
export { analyzeAudio } from './analysis/analyze';
export { requestTreatmentPlan } from './planner/client';
export { validatePlan } from './planner/validate';
export type { ValidationIssue, ValidationResult } from './planner/validate';
export { executePlan } from './executor/execute';
export { verifyExecution } from './executor/verify';
export { agenticVoiceProcessor };

export interface AgenticVoiceProcessor {
  (context: VoiceProcessContext): Promise<{ buffer: AudioBuffer; report: TrackReport }>;
}

/**
 * Executor local pronto na Onda 4. O gating operacional segue no
 * feature flag `rivaldo_agentic_v1_enabled` — o pipeline só roteia por
 * aqui quando o flag estiver ON.
 */
export function isAgenticReady(): boolean {
  return true;
}

/** Entry-point público mantido por compatibilidade histórica. */
export async function runAgenticVoiceProcessing(
  context: VoiceProcessContext,
): Promise<{ buffer: AudioBuffer; report: TrackReport }> {
  return agenticVoiceProcessor(context);
}