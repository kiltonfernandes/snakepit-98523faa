/**
 * Rivaldo Agentic V1 — API pública.
 *
 * Na Onda 1 a integração é passthrough: quando a flag está ON, ainda
 * chamamos o processador atual (voice-worker). Nas ondas seguintes trocamos
 * este delegate pelo pipeline "analyze → plan → validate → execute".
 */
import { loadAgenticFlag, saveAgenticFlag, RIVALDO_AGENTIC_SETTINGS_KEY } from './feature-flag';

export { loadAgenticFlag, saveAgenticFlag, RIVALDO_AGENTIC_SETTINGS_KEY };
export * from './contracts/rivaldo-target-v1';
export * from './contracts/report-v2';
export * from './contracts/treatment-plan-v1';
export * from './contracts/episode-plan-v1';
export { AnalyzerClient } from './analysis/analyzer-client';
export { analyzeAudio } from './analysis/analyze';
export { requestEpisodeTreatmentPlan } from './planner/client';
export { validatePlan } from './planner/validate';
export type { ValidationIssue, ValidationResult } from './planner/validate';
export { executePlan } from './executor/execute';
export { verifyExecution } from './executor/verify';
export { buildAgenticVoiceProcessorFromSession } from './agentic-processor';
export { runAgenticEpisode } from './session';
export type {
  AgenticOutcome, AgenticStatus, AgenticStatusEvent, AgenticFailedStage,
  AgenticTrackInput, AgenticTreatedTrack,
} from './session';

export function isAgenticReady(): boolean {
  return true;
}