import { describe, expect, it } from 'vitest';
import type {
  AudioAnalysisReportV2,
  AudioEvent,
} from '../contracts/report-v2';
import {
  buildPlannerDigest,
  PLANNER_DIGEST_BUDGET_BYTES,
} from './findings';

function reportWith(events: AudioEvent[]): AudioAnalysisReportV2 {
  return {
    version: 'v2',
    reportId: 'report-test',
    createdAtIso: '2026-07-26T00:00:00.000Z',
    source: {
      filename: 'voice.mp3',
      sampleRate: 48000,
      durationSec: 960,
      channels: 1,
    },
    loudness: {
      integratedLufs: -19,
      momentaryMaxLufs: -13,
      shortTermMaxLufs: -15,
      loudnessRangeLu: 6,
      truePeakDbtp: -1.5,
    },
    noise: {
      floorDbfs: -53,
      speechSnrDb: 28,
      hum50HzDb: -70,
      hum60HzDb: -72,
      broadbandDbfs: -31,
    },
    spectrum: {
      centroidHz: 2100,
      rolloff85Hz: 7100,
      tiltDbPerOctave: -3,
      ltasBandsDb: [-45, -40, -35, -30, -28, -32, -38, -42, -48, -55],
    },
    acoustics: {
      rt60EstSec: 0.3,
      rt60Confidence: 0.7,
      directToReverbRatioDb: 11,
    },
    speech: {
      ratio: 0.73,
      averageSegmentSec: 4.2,
      totalSegments: 120,
      energyPercentilesDbfs: { p10: -30, p50: -22, p90: -15 },
    },
    events,
    clippedRatio: 0,
  };
}

function denseEvents(count: number): AudioEvent[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `click-${index}`,
    type: index % 7 === 0 ? 'sibilance' : 'click',
    startSec: (index % 192000) * 0.005,
    endSec: (index % 192000) * 0.005 + 0.003,
    severity: (index % 100) / 100,
    confidence: 0.75,
    meta: { detectorValue: index % 17 },
  }));
}

describe('buildPlannerDigest', () => {
  it('reduces a report with 136,938 events to a bounded planner payload', () => {
    const source = reportWith(denseEvents(136_938));
    const result = buildPlannerDigest('episode-test', [source]);

    expect(source.events).toHaveLength(136_938);
    expect(result.stats.sourceEvents).toBe(136_938);
    expect(result.stats.groupedFindings).toBeLessThanOrEqual(240);
    expect(result.stats.payloadBytes).toBeLessThanOrEqual(PLANNER_DIGEST_BUDGET_BYTES);
    expect(result.reports[0].events.every((event) => event.meta?.groupedFinding === true)).toBe(true);
  });

  it('is deterministic and keeps source totals in finding metadata', () => {
    const source = reportWith(denseEvents(10_000));
    const first = buildPlannerDigest('episode-test', [source]);
    const second = buildPlannerDigest('episode-test', [source]);

    expect(first.reports).toEqual(second.reports);
    const clickFinding = first.reports[0].events.find((event) => event.type === 'click');
    expect(clickFinding?.meta?.totalTypeEventCount).toBeGreaterThan(0);
    expect(clickFinding?.meta?.representativeEventId).toEqual(expect.any(String));
  });

  it('shares the episode budget across multiple reports', () => {
    const reports = Array.from({ length: 8 }, (_, index) => {
      const report = reportWith(denseEvents(20_000));
      return { ...report, reportId: `report-${index}` };
    });
    const result = buildPlannerDigest('episode-multi', reports);

    expect(result.reports).toHaveLength(8);
    expect(result.stats.payloadBytes).toBeLessThanOrEqual(PLANNER_DIGEST_BUDGET_BYTES);
    expect(result.stats.tracks.every((track) => track.groupedFindings <= 30)).toBe(true);
  });
});
