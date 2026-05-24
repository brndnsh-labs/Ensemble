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
        // Default thresholds are genre-agnostic (subPlusLow > 85%, air < 1%,
        // sideRatio < 2%) — see DEFAULT_FINDING_THRESHOLDS in mix-report-utils.ts.
        // Calibrated 2026-05-24 so they don't false-positive on pro reference
        // mixes (Miles, Chic, STP, BB King). Tighter genre-specific thresholds
        // live on each scene in DEFAULT_MIX_REPORT_SCENES. The stereo gate
        // switched from correlation to side ratio in Epic 7 S1 — see memory
        // note `stereo-side-ratio-over-correlation`.

        it('flags bottom-heavy mixes by sub+low share', () => {
            const findings = summarizeRenderedFindings({
                full: createStemMetrics({
                    probes: {
                        sub: 0.55,
                        low: 0.35,
                        lowMid: 0.05,
                        mid: 0.03,
                        presence: 0.01,
                        air: 0.01,
                    },
                }),
            });
            expect(findings.some((n) => n.includes('bottom-heavy'))).toBe(true);
        });

        it('does not flag a typical non-jazz pro mix as bottom-heavy by default', () => {
            // Calibrated against B.B. King "The Thrill Is Gone": sub 69%, low 10%
            // — 79% combined. Above the old 55% threshold but below the new 85%.
            const findings = summarizeRenderedFindings({
                full: createStemMetrics({
                    probes: {
                        sub: 0.69,
                        low: 0.1,
                        lowMid: 0.1,
                        mid: 0.05,
                        presence: 0.02,
                        air: 0.04,
                    },
                }),
            });
            expect(findings.some((n) => n.includes('bottom-heavy'))).toBe(false);
        });

        it('flags bottom-heavy under a scene-specific (jazz) threshold', () => {
            // Same 79% sub+low mix, but with jazz-tight thresholds — should flag.
            const findings = summarizeRenderedFindings(
                {
                    full: createStemMetrics({
                        probes: {
                            sub: 0.69,
                            low: 0.1,
                            lowMid: 0.1,
                            mid: 0.05,
                            presence: 0.02,
                            air: 0.04,
                        },
                    }),
                },
                { subPlusLowMax: 0.55 },
            );
            expect(findings.some((n) => n.includes('bottom-heavy'))).toBe(true);
        });

        it('flags missing air across all stems', () => {
            const lowAir = (a) =>
                createStemMetrics({
                    probes: { sub: 0.3, low: 0.3, lowMid: 0.2, mid: 0.15, presence: 0.04, air: a },
                });
            const findings = summarizeRenderedFindings({
                full: lowAir(0.005),
                drums: lowAir(0.002),
                bass: lowAir(0.0),
                chords: lowAir(0.003),
                harmony: lowAir(0.008),
                soloist: lowAir(0.001),
            });
            expect(findings.some((n) => n.includes('no stem owns the air band'))).toBe(true);
        });

        it('does not flag a pro mix as missing air under the default threshold', () => {
            // Calibrated against Miles Davis "So What": full air 4.5% — clears
            // both default (1%) and jazz-tight (3.5%) thresholds.
            const findings = summarizeRenderedFindings({
                full: createStemMetrics({
                    probes: {
                        sub: 0.31,
                        low: 0.16,
                        lowMid: 0.26,
                        mid: 0.18,
                        presence: 0.04,
                        air: 0.045,
                    },
                }),
            });
            expect(findings.some((n) => n.includes('no stem owns the air band'))).toBe(false);
        });

        it('flags missing air under a scene-specific (jazz) threshold', () => {
            // Air 2.5% — clears the default 1% but trips the jazz target of 3.5%.
            const findings = summarizeRenderedFindings(
                {
                    full: createStemMetrics({
                        probes: {
                            sub: 0.5,
                            low: 0.24,
                            lowMid: 0.1,
                            mid: 0.1,
                            presence: 0.03,
                            air: 0.025,
                        },
                    }),
                },
                { airMin: 0.035 },
            );
            expect(findings.some((n) => n.includes('no stem owns the air band'))).toBe(true);
        });

        it('flags a functionally mono mix by side energy ratio', () => {
            // Pre-S1 engine baseline: correlation 0.985 / side 0.8% — fires
            // under the 2% genre-agnostic floor.
            const findings = summarizeRenderedFindings({
                full: createStemMetrics({
                    stereo: { correlation: 0.985, sideRatio: 0.008 },
                }),
            });
            expect(findings.some((n) => n.includes('functionally mono'))).toBe(true);
        });

        it('does not flag a high-correlation pro mix with real side content', () => {
            // Daft Punk "Get Lucky": correlation 0.940 (would have failed the
            // old correlation gate) but side energy 3% sounds genuinely stereo
            // — the case the memory note flags as why side ratio is the right
            // discriminator, not correlation.
            const findings = summarizeRenderedFindings({
                full: createStemMetrics({
                    stereo: { correlation: 0.94, sideRatio: 0.03 },
                }),
            });
            expect(findings.some((n) => n.includes('functionally mono'))).toBe(false);
        });

        it('flags functional-mono under a tighter scene-specific floor', () => {
            // Side ratio 12% would pass the default 2% floor, but a stricter
            // scene threshold (e.g. a jazz scene calibrated toward Miles at
            // 21% side) still flags it.
            const findings = summarizeRenderedFindings(
                {
                    full: createStemMetrics({
                        stereo: { correlation: 0.75, sideRatio: 0.12 },
                    }),
                },
                { sideRatioMin: 0.15 },
            );
            expect(findings.some((n) => n.includes('functionally mono'))).toBe(true);
        });

        it('flags when only the bed (full) is mono even if full+solo passes', () => {
            // Realistic post-S1 case: soloist bus pans +0.25 so adding the
            // soloist lifts the +solo stem above the floor while the bed
            // stem (drums + bass + chords + harmony only) stays narrow.
            // Owner asked for both numbers in the finding line.
            const findings = summarizeRenderedFindings({
                full: createStemMetrics({
                    stereo: { correlation: 0.98, sideRatio: 0.015 },
                }),
                'full+solo': createStemMetrics({
                    stereo: { correlation: 0.9, sideRatio: 0.04 },
                }),
            });
            const finding = findings.find((n) => n.includes('functionally mono'));
            expect(finding).toBeDefined();
            // Surfaces the failing bed stem with its number
            expect(finding).toContain('full 1.5%');
            // Does not name the +solo stem (it passed)
            expect(finding).not.toContain('full+solo');
        });

        it('flags both stems when both fall below the floor', () => {
            const findings = summarizeRenderedFindings({
                full: createStemMetrics({
                    stereo: { correlation: 0.99, sideRatio: 0.009 },
                }),
                'full+solo': createStemMetrics({
                    stereo: { correlation: 0.97, sideRatio: 0.018 },
                }),
            });
            const finding = findings.find((n) => n.includes('functionally mono'));
            expect(finding).toBeDefined();
            expect(finding).toContain('full 0.9%');
            expect(finding).toContain('full+solo 1.8%');
        });

        it('flags an over-panned mix above the side-energy ceiling', () => {
            // Bill Evans-era hard-pan territory: 45% side. The default ceiling
            // is 30%; the S1 engine cap is 20%. The "over-panned" finding
            // gives a counterweight to the mono finding so tuning won't
            // accidentally chase Bill Evans 1961 width.
            const findings = summarizeRenderedFindings({
                full: createStemMetrics({
                    stereo: { correlation: 0.1, sideRatio: 0.45 },
                }),
            });
            expect(findings.some((n) => n.includes('over-panned'))).toBe(true);
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
