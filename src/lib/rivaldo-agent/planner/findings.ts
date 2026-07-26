import type {
  AudioAnalysisReportV2,
  AudioEvent,
  AudioEventType,
} from '../contracts/report-v2';

export const PLANNER_DIGEST_BUDGET_BYTES = 384_000;
export const PLANNER_REQUEST_HARD_LIMIT_BYTES = 450_000;
const MAX_FINDINGS_PER_EPISODE = 240;
const MIN_FINDINGS_PER_REPORT = 12;

const TYPE_ORDER: AudioEventType[] = [
  'clipping',
  'dropout',
  'level_jump',
  'plosive',
  'sibilance',
  'breath',
  'click',
  'crackle',
  'mouth_noise',
  'hum',
];

const TYPE_PRIORITY: Record<AudioEventType, number> = {
  clipping: 1,
  dropout: 0.98,
  level_jump: 0.94,
  plosive: 0.9,
  sibilance: 0.84,
  breath: 0.72,
  click: 0.8,
  crackle: 0.76,
  mouth_noise: 0.7,
  hum: 0.88,
};

const GROUPING_RULES: Record<AudioEventType, { maxGapSec: number; maxSpanSec: number }> = {
  clipping: { maxGapSec: 0.03, maxSpanSec: 0.4 },
  click: { maxGapSec: 0.08, maxSpanSec: 0.8 },
  crackle: { maxGapSec: 0.12, maxSpanSec: 1.2 },
  breath: { maxGapSec: 0.35, maxSpanSec: 2.5 },
  sibilance: { maxGapSec: 0.2, maxSpanSec: 1.5 },
  plosive: { maxGapSec: 0.15, maxSpanSec: 1 },
  hum: { maxGapSec: 2, maxSpanSec: 30 },
  level_jump: { maxGapSec: 0.5, maxSpanSec: 3 },
  dropout: { maxGapSec: 0.5, maxSpanSec: 3 },
  mouth_noise: { maxGapSec: 0.15, maxSpanSec: 1 },
};

interface EventCluster {
  type: AudioEventType;
  startSec: number;
  endSec: number;
  events: AudioEvent[];
}

export interface PlannerDigestTrackStats {
  reportId: string;
  sourceEvents: number;
  groupedFindings: number;
  sourceEventsByType: Partial<Record<AudioEventType, number>>;
  findingsByType: Partial<Record<AudioEventType, number>>;
}

export interface PlannerDigestStats {
  sourceEvents: number;
  groupedFindings: number;
  payloadBytes: number;
  budgetBytes: number;
  truncated: boolean;
  tracks: PlannerDigestTrackStats[];
}

export interface PlannerDigestResult {
  reports: AudioAnalysisReportV2[];
  stats: PlannerDigestStats;
}

export class PlannerDigestBudgetError extends Error {
  constructor(
    readonly payloadBytes: number,
    readonly budgetBytes: number,
  ) {
    super(`planner_digest_too_large:${payloadBytes}>${budgetBytes}`);
    this.name = 'PlannerDigestBudgetError';
  }
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q));
  return sorted[index];
}

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function utf8Bytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function scoreFinding(event: AudioEvent): number {
  const count = Number(event.meta?.sourceEventCount ?? 1);
  return (
    event.severity * 0.45 +
    event.confidence * 0.25 +
    TYPE_PRIORITY[event.type] * 0.2 +
    Math.min(1, Math.log10(count + 1) / 4) * 0.1
  );
}

function groupTypeEvents(type: AudioEventType, events: AudioEvent[]): EventCluster[] {
  if (events.length === 0) return [];
  const rules = GROUPING_RULES[type];
  const sorted = [...events].sort((a, b) => a.startSec - b.startSec || a.endSec - b.endSec);
  const clusters: EventCluster[] = [];
  let current: EventCluster = {
    type,
    startSec: sorted[0].startSec,
    endSec: sorted[0].endSec,
    events: [sorted[0]],
  };

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    const mergedEnd = Math.max(current.endSec, next.endSec);
    const closeEnough = next.startSec <= current.endSec + rules.maxGapSec;
    const spanAllowed = mergedEnd - current.startSec <= rules.maxSpanSec;
    if (closeEnough && spanAllowed) {
      current.endSec = mergedEnd;
      current.events.push(next);
      continue;
    }
    clusters.push(current);
    current = {
      type,
      startSec: next.startSec,
      endSec: next.endSec,
      events: [next],
    };
  }
  clusters.push(current);
  return clusters;
}

function clusterToFinding(
  cluster: EventCluster,
  index: number,
  totalTypeEventCount: number,
  totalTypeFindingCount: number,
): AudioEvent {
  const severity = cluster.events.map((event) => event.severity);
  const confidence = cluster.events.map((event) => event.confidence);
  const representative = [...cluster.events].sort((a, b) =>
    (b.severity * b.confidence) - (a.severity * a.confidence),
  )[0];

  return {
    id: `finding-${cluster.type}-${Math.round(cluster.startSec * 1000)}-${index}`,
    type: cluster.type,
    startSec: round(cluster.startSec),
    endSec: round(Math.max(cluster.endSec, cluster.startSec + 0.001)),
    severity: round(quantile(severity, 0.9)),
    confidence: round(quantile(confidence, 0.5)),
    meta: {
      groupedFinding: true,
      sourceEventCount: cluster.events.length,
      totalTypeEventCount,
      totalTypeFindingCount,
      severityP50: round(quantile(severity, 0.5)),
      severityP90: round(quantile(severity, 0.9)),
      severityMax: round(Math.max(...severity)),
      confidenceP50: round(quantile(confidence, 0.5)),
      confidenceMin: round(Math.min(...confidence)),
      representativeEventId: representative.id,
    },
  };
}

function selectWithTimelineCoverage(findings: AudioEvent[], limit: number): AudioEvent[] {
  if (limit <= 0) return [];
  if (findings.length <= limit) return findings;
  const ranked = [...findings].sort((a, b) => scoreFinding(b) - scoreFinding(a));
  const priorityCount = Math.max(1, Math.ceil(limit * 0.65));
  const selected = new Map(ranked.slice(0, priorityCount).map((finding) => [finding.id, finding]));
  const remaining = findings
    .filter((finding) => !selected.has(finding.id))
    .sort((a, b) => a.startSec - b.startSec);
  const slots = limit - selected.size;
  for (let i = 0; i < slots && remaining.length > 0; i++) {
    const index = Math.min(
      remaining.length - 1,
      Math.floor(((i + 0.5) / slots) * remaining.length),
    );
    selected.set(remaining[index].id, remaining[index]);
  }
  return [...selected.values()];
}

export function buildGroupedFindings(
  report: AudioAnalysisReportV2,
  maxFindings: number,
): { findings: AudioEvent[]; stats: PlannerDigestTrackStats } {
  const eventsByType = new Map<AudioEventType, AudioEvent[]>();
  for (const event of report.events) {
    const events = eventsByType.get(event.type) ?? [];
    events.push(event);
    eventsByType.set(event.type, events);
  }

  const candidates: AudioEvent[] = [];
  const sourceEventsByType: Partial<Record<AudioEventType, number>> = {};
  for (const type of TYPE_ORDER) {
    const source = eventsByType.get(type) ?? [];
    if (source.length === 0) continue;
    sourceEventsByType[type] = source.length;
    const clusters = groupTypeEvents(type, source);
    const findings = clusters.map((cluster, index) =>
      clusterToFinding(cluster, index, source.length, clusters.length),
    );
    candidates.push(...findings);
  }

  const representedTypes = TYPE_ORDER.filter((type) =>
    candidates.some((finding) => finding.type === type),
  );
  const selected = new Map<string, AudioEvent>();
  for (const type of representedTypes) {
    const best = candidates
      .filter((finding) => finding.type === type)
      .sort((a, b) => scoreFinding(b) - scoreFinding(a))[0];
    if (best) selected.set(best.id, best);
  }

  const remainingSlots = Math.max(0, maxFindings - selected.size);
  const remaining = candidates.filter((finding) => !selected.has(finding.id));
  for (const finding of selectWithTimelineCoverage(remaining, remainingSlots)) {
    if (selected.size >= maxFindings) break;
    selected.set(finding.id, finding);
  }

  const findings = [...selected.values()].sort((a, b) =>
    a.startSec - b.startSec || TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type),
  );
  const findingsByType: Partial<Record<AudioEventType, number>> = {};
  for (const finding of findings) {
    findingsByType[finding.type] = (findingsByType[finding.type] ?? 0) + 1;
  }
  for (const finding of findings) {
    if (finding.meta) {
      finding.meta.typeFindingsIncluded = findingsByType[finding.type] ?? 0;
    }
  }

  return {
    findings,
    stats: {
      reportId: report.reportId,
      sourceEvents: report.events.length,
      groupedFindings: findings.length,
      sourceEventsByType,
      findingsByType,
    },
  };
}

export function buildPlannerDigest(
  episodeId: string,
  reports: AudioAnalysisReportV2[],
  budgetBytes = PLANNER_DIGEST_BUDGET_BYTES,
): PlannerDigestResult {
  if (reports.length === 0) {
    return {
      reports: [],
      stats: {
        sourceEvents: 0,
        groupedFindings: 0,
        payloadBytes: utf8Bytes({ episodeId, reports: [] }),
        budgetBytes,
        truncated: false,
        tracks: [],
      },
    };
  }

  let perReportLimit = Math.max(
    MIN_FINDINGS_PER_REPORT,
    Math.floor(MAX_FINDINGS_PER_EPISODE / reports.length),
  );
  let digestReports: AudioAnalysisReportV2[] = [];
  let trackStats: PlannerDigestTrackStats[] = [];
  let payloadBytes = 0;

  while (true) {
    trackStats = [];
    digestReports = reports.map((report) => {
      const grouped = buildGroupedFindings(report, perReportLimit);
      trackStats.push(grouped.stats);
      return { ...report, events: grouped.findings };
    });
    payloadBytes = utf8Bytes({ episodeId, reports: digestReports });
    if (payloadBytes <= budgetBytes || perReportLimit <= 4) break;
    perReportLimit = Math.max(4, Math.floor(perReportLimit * 0.75));
  }

  if (payloadBytes > budgetBytes) {
    throw new PlannerDigestBudgetError(payloadBytes, budgetBytes);
  }

  const sourceEvents = trackStats.reduce((sum, track) => sum + track.sourceEvents, 0);
  const groupedFindings = trackStats.reduce((sum, track) => sum + track.groupedFindings, 0);
  return {
    reports: digestReports,
    stats: {
      sourceEvents,
      groupedFindings,
      payloadBytes,
      budgetBytes,
      truncated: groupedFindings < sourceEvents,
      tracks: trackStats,
    },
  };
}
