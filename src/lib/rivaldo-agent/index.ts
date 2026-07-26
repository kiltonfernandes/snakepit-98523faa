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

export { loadAgenticFlag, saveAgenticFlag, RIVALDO_AGENTIC_SETTINGS_KEY };
export * from './contracts/rivaldo-target-v1';
export * from './contracts/report-v2';
export * from './contracts/treatment-plan-v1';
export { AnalyzerClient } from './analysis/analyzer-client';
export { analyzeAudio } from './analysis/analyze';
export { requestTreatmentPlan } from './planner/client';
export { validatePlan } from './planner/validate';
export type { ValidationIssue, ValidationResult } from './planner/validate';

export interface AgenticVoiceProcessor {
  (context: VoiceProcessContext): Promise<{ buffer: AudioBuffer; report: TrackReport }>;
}

/**
 * Sinaliza ao pipeline se deve rotear pelo motor agentic.
 * Wave 1: sempre `false` até o executor estar pronto (Onda 4).
 */
export function isAgenticReady(): boolean {
  return false;
}

/**
 * Placeholder de execução agentic. Nunca chamado enquanto `isAgenticReady()`
 * retorna false — existe para deixar o ponto de integração explícito.
 */
export async function runAgenticVoiceProcessing(
  _context: VoiceProcessContext,
): Promise<{ buffer: AudioBuffer; report: TrackReport }> {
  throw new Error('Rivaldo Agentic V1: executor ainda não disponível (Onda 4).');
}