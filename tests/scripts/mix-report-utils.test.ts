// @ts-nocheck
import { describe, expect, it } from 'vitest';
import {
    buildRenderedMixReport,
    DEFAULT_MIX_REPORT_SCENES,
    formatRenderedMixReport,
    parseEnsembleAuditInput,
    resolveMixReportCliOptions,
    selectMixReportScenes,
    summarizeRenderedFindings,
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
            '--write-wav=tmp/audio',
        ]);

        expect(options.seeds).toEqual(['ALPHA', 'BETA']);
        expect(options.seedsExplicit).toBe(true);
        expect(options.sceneIds).toEqual(['jazz-ride', 'funk-pocket']);
        expect(options.jsonl).toBe(true);
        expect(options.focusFrom).toBe('report.json');
        expect(options.focusLimit).toBe(4);
        expect(options.writeWav).toBe('tmp/audio');

        const defaults = resolveMixReportCliOptions([]);
        expect(defaults.writeWav).toBeNull();
        expect(defaults.loops).toBe(1);

        const looped = resolveMixReportCliOptions(['--loops=4']);
        expect(looped.loops).toBe(4);

        const negative = resolveMixReportCliOptions(['--loops=-2']);
        expect(negative.loops).toBe(1);

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

    describe('architectural-bias findings', () => {
        it('flags bottom-heavy mixes by sub+low share', () => {
            const findings = summarizeRenderedFindings({
                full: createStemMetrics({
                    probes: {
                        sub: 0.45,
                        low: 0.25,
                        lowMid: 0.1,
                        mid: 0.1,
                        presence: 0.05,
                        air: 0.05,
                    },
                }),
            });
            expect(findings.some((n) => n.includes('bottom-heavy'))).toBe(true);
        });

        it('does not flag a balanced mix as bottom-heavy', () => {
            const findings = summarizeRenderedFindings({
                full: createStemMetrics({
                    probes: {
                        sub: 0.15,
                        low: 0.15,
                        lowMid: 0.2,
                        mid: 0.2,
                        presence: 0.15,
                        air: 0.15,
                    },
                }),
            });
            expect(findings.some((n) => n.includes('bottom-heavy'))).toBe(false);
        });

        it('flags missing air across all stems', () => {
            const lowAir = (a) =>
                createStemMetrics({
                    probes: { sub: 0.3, low: 0.3, lowMid: 0.2, mid: 0.15, presence: 0.04, air: a },
                });
            const findings = summarizeRenderedFindings({
                full: lowAir(0.01),
                drums: lowAir(0.02),
                bass: lowAir(0.0),
                chords: lowAir(0.03),
                harmony: lowAir(0.04),
                soloist: lowAir(0.01),
            });
            expect(findings.some((n) => n.includes('no stem owns the air band'))).toBe(true);
        });

        it('does not flag missing air when at least one stem carries it', () => {
            const findings = summarizeRenderedFindings({
                full: createStemMetrics({
                    probes: {
                        sub: 0.2,
                        low: 0.2,
                        lowMid: 0.2,
                        mid: 0.15,
                        presence: 0.1,
                        air: 0.15,
                    },
                }),
                harmony: createStemMetrics({
                    probes: {
                        sub: 0.05,
                        low: 0.05,
                        lowMid: 0.1,
                        mid: 0.1,
                        presence: 0.2,
                        air: 0.5,
                    },
                }),
            });
            expect(findings.some((n) => n.includes('no stem owns the air band'))).toBe(false);
        });

        it('flags a functionally mono mix by L/R correlation', () => {
            const findings = summarizeRenderedFindings({
                full: createStemMetrics({
                    stereo: { correlation: 0.985, sideRatio: 0.008 },
                }),
            });
            expect(findings.some((n) => n.includes('functionally mono'))).toBe(true);
        });

        it('does not flag a wide mix as mono', () => {
            const findings = summarizeRenderedFindings({
                full: createStemMetrics({
                    stereo: { correlation: 0.6, sideRatio: 0.25 },
                }),
            });
            expect(findings.some((n) => n.includes('functionally mono'))).toBe(false);
        });

        it('flags a front-loaded arc when the full mix is classified that way', () => {
            const findings = summarizeRenderedFindings({
                full: createStemMetrics({
                    arc: 'front-loaded',
                    loopRmsDb: [-18, -24, -25],
                }),
            });
            expect(findings.some((n) => n.includes('front-loaded'))).toBe(true);
        });

        it('flags flat dynamics only when multiple loops were rendered', () => {
            const singleLoop = summarizeRenderedFindings({
                full: createStemMetrics({ arc: null, loopRmsDb: null }),
            });
            expect(singleLoop.some((n) => n.includes('flat across loops'))).toBe(false);

            const multiLoop = summarizeRenderedFindings({
                full: createStemMetrics({
                    arc: 'flat',
                    loopRmsDb: [-22, -22.5, -22.4],
                }),
            });
            expect(multiLoop.some((n) => n.includes('flat across loops'))).toBe(true);
        });
    });
});
