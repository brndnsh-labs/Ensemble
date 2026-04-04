import { describe, expect, it } from 'vitest';
import {
    buildRenderedMixReport,
    DEFAULT_MIX_REPORT_SCENES,
    formatRenderedMixReport,
    parseEnsembleAuditInput,
    resolveMixReportCliOptions,
    selectMixReportScenes,
} from '../../scripts/mix-report-utils.js';

function createStemMetrics(overrides = {}) {
    return {
        peakDb: -6.2,
        rmsDb: -15.4,
        crestDb: 9.2,
        transients: {
            maxDelta: 0.041,
            spikeRate: 3.6,
        },
        probes: {
            sub: 0.28,
            lowMid: 0.19,
            presence: 0.15,
            air: 0.08,
            centroid: 1450,
        },
        schedule: {
            eventCount: 24,
            maxNotesPerStep: 3,
            overLimitSteps: 0,
            maxSimultaneousVoices: 3,
            sameMidiOverlapCount: 0,
            voiceLimitPressureCount: 0,
            minOnsetGapMs: 94,
        },
        ...overrides,
    };
}

describe('mix report utilities', () => {
    it('parses CLI flags and scene filters', () => {
        const options = resolveMixReportCliOptions([
            '--seed=BASE',
            '--seeds=ALPHA,BETA,ALPHA',
            '--scene=jazz-ride,funk-pocket',
            '--jsonl',
            '--focus-from=report.json',
            '--focus-limit=4',
        ]);

        expect(options.seeds).toEqual(['ALPHA', 'BETA']);
        expect(options.seedsExplicit).toBe(true);
        expect(options.sceneIds).toEqual(['jazz-ride', 'funk-pocket']);
        expect(options.jsonl).toBe(true);
        expect(options.focusFrom).toBe('report.json');
        expect(options.focusLimit).toBe(4);

        const selected = selectMixReportScenes(DEFAULT_MIX_REPORT_SCENES, ['jazz-ride']);
        expect(selected).toHaveLength(1);
        expect(selected[0].id).toBe('jazz-ride');
        expect(() => selectMixReportScenes(DEFAULT_MIX_REPORT_SCENES, ['missing-scene'])).toThrow(
            'Unknown mix report scene: missing-scene',
        );
    });

    it('parses symbolic focus input from JSON and JSONL payloads', () => {
        const jsonPayload = JSON.stringify({
            reportType: 'ensemble-audit',
            renderScene: {
                id: 'ensemble-jazz-changes',
                genreFeel: 'Jazz',
                sections: [{ id: 'a', label: 'A', value: 'Dm7 | G7 | Cmaj7 | Cmaj7' }],
            },
            focusSeeds: [
                { seed: 'FOCUS_B', issueScore: 7, flags: ['crowding-lead'] },
                { seed: 'FOCUS_A', issueScore: 3, flags: ['thin-rhythm'] },
            ],
        });
        const jsonResult = parseEnsembleAuditInput(jsonPayload, { focusLimit: 1 });

        expect(jsonResult.seeds).toEqual(['FOCUS_B']);
        expect(jsonResult.renderScene.id).toBe('ensemble-jazz-changes');

        const jsonlPayload = [
            JSON.stringify({
                kind: 'aggregate',
                reportType: 'ensemble-audit',
                renderScene: {
                    id: 'ensemble-funk-vamp',
                    genreFeel: 'Funk',
                    sections: [{ id: 'vamp', label: 'Vamp', value: 'Em7 | Em7 | A7 | A7' }],
                },
            }),
            JSON.stringify({
                kind: 'focus',
                reportType: 'ensemble-audit',
                seed: 'JSONL_B',
                issueScore: 6,
            }),
            JSON.stringify({
                kind: 'focus',
                reportType: 'ensemble-audit',
                seed: 'JSONL_A',
                issueScore: 2,
            }),
        ].join('\n');
        const jsonlResult = parseEnsembleAuditInput(jsonlPayload, { focusLimit: 2 });

        expect(jsonlResult.seeds).toEqual(['JSONL_B', 'JSONL_A']);
        expect(jsonlResult.renderScene.id).toBe('ensemble-funk-vamp');
    });

    it('builds a machine-readable rendered report and formats JSONL rows', () => {
        const report = buildRenderedMixReport({
            sceneRuns: [
                {
                    id: 'jazz-ride',
                    label: 'Jazz Ride',
                    genreFeel: 'Jazz',
                    bpm: 138,
                    intensity: 0.64,
                    source: 'ensemble-audit',
                    seeds: [
                        {
                            seed: 'FOCUS_B',
                            stems: {
                                full: createStemMetrics({
                                    rmsDb: -14.5,
                                    probes: {
                                        sub: 0.22,
                                        lowMid: 0.2,
                                        presence: 0.16,
                                        air: 0.1,
                                        centroid: 1680,
                                    },
                                }),
                                drums: createStemMetrics({
                                    rmsDb: -21.8,
                                    schedule: null,
                                    probes: {
                                        sub: 0.04,
                                        lowMid: 0.11,
                                        presence: 0.33,
                                        air: 0.07,
                                        centroid: 2500,
                                    },
                                }),
                                bass: createStemMetrics({
                                    rmsDb: -19.2,
                                    probes: {
                                        sub: 0.42,
                                        lowMid: 0.14,
                                        presence: 0.05,
                                        air: 0.01,
                                        centroid: 320,
                                    },
                                }),
                                chords: createStemMetrics({
                                    rmsDb: -18.1,
                                    probes: {
                                        sub: 0.08,
                                        lowMid: 0.25,
                                        presence: 0.18,
                                        air: 0.06,
                                        centroid: 1180,
                                    },
                                }),
                                harmony: createStemMetrics({
                                    rmsDb: -27.5,
                                    schedule: {
                                        eventCount: 12,
                                        maxNotesPerStep: 4,
                                        overLimitSteps: 1,
                                        maxSimultaneousVoices: 4,
                                        sameMidiOverlapCount: 2,
                                        voiceLimitPressureCount: 1,
                                        minOnsetGapMs: 82,
                                    },
                                    transients: {
                                        maxDelta: 0.091,
                                        spikeRate: 6.7,
                                    },
                                    probes: {
                                        sub: 0.03,
                                        lowMid: 0.1,
                                        presence: 0.11,
                                        air: 0.09,
                                        centroid: 1860,
                                    },
                                }),
                            },
                        },
                    ],
                },
            ],
            options: {
                seeds: ['FOCUS_B'],
                sceneIds: ['jazz-ride'],
            },
            source: {
                kind: 'ensemble-focus',
                reportType: 'ensemble-audit',
                focusSeeds: [
                    {
                        seed: 'FOCUS_B',
                        issueScore: 7,
                        flags: ['crowding-lead'],
                    },
                ],
            },
        });

        expect(report.reportType).toBe('rendered-audio-audit');
        expect(report.aggregate.sceneCount).toBe(1);
        expect(report.scenes[0].seeds[0].focus).toMatchObject({
            seed: 'FOCUS_B',
            issueScore: 7,
        });
        expect(report.scenes[0].seeds[0].findings).toContain(
            'harmony stem shows sharp waveform edges worth auditing',
        );

        const lines = formatRenderedMixReport(report, { jsonl: true })
            .trim()
            .split('\n')
            .map((line) => JSON.parse(line));

        expect(lines[0].kind).toBe('aggregate');
        expect(lines.some((line) => line.kind === 'scene')).toBe(true);
        expect(lines.some((line) => line.kind === 'seed')).toBe(true);
        expect(lines.some((line) => line.kind === 'stem')).toBe(true);
    });
});
