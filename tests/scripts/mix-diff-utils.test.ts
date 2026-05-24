import { describe, expect, it } from 'vitest';
import {
    DEFAULT_DIFF_THRESHOLDS,
    diffMixReports,
    formatMixDiffHuman,
    loadMixReport,
} from '../../scripts/mix-diff-utils.js';

function stem(overrides: Record<string, unknown> = {}) {
    return {
        peakDb: -6,
        rmsDb: -18,
        crestDb: 12,
        transients: { maxDelta: 0.04, spikeRate: 3 },
        probes: {
            sub: 0.2,
            low: 0.15,
            lowMid: 0.18,
            mid: 0.16,
            presence: 0.15,
            air: 0.08,
            centroid: 1500,
        },
        ...overrides,
    };
}

function report(stems: Record<string, ReturnType<typeof stem>>) {
    return {
        reportType: 'rendered-audio-audit',
        scenes: [
            {
                id: 'jazz-ride',
                label: 'Jazz Ride',
                seeds: [
                    {
                        seed: 'ALPHA',
                        stems,
                    },
                ],
            },
        ],
    };
}

describe('mix diff utilities', () => {
    it('flags an RMS delta beyond the dB threshold as significant', () => {
        const before = report({ chords: stem() });
        const after = report({ chords: stem({ rmsDb: -25 }) }); // -7 dB

        const diff = diffMixReports(before, after);

        expect(diff.summary.compared).toBe(1);
        expect(diff.summary.significant).toBe(1);
        const chords = diff.stems[0];
        expect(chords.status).toBe('significant');
        const rms = chords.metrics.find((m) => m.name === 'rmsDb');
        expect(rms?.delta).toBeCloseTo(-7, 5);
        expect(rms?.significant).toBe(true);
    });

    it('treats sub-threshold deltas as no-change', () => {
        const before = report({ chords: stem() });
        const after = report({ chords: stem({ rmsDb: -18.5 }) }); // -0.5 dB

        const diff = diffMixReports(before, after);

        expect(diff.summary.significant).toBe(0);
        expect(diff.stems[0].status).toBe('no-change');
    });

    it('flags a spectral-band swing beyond the relative threshold', () => {
        const before = report({ bass: stem() });
        // sub goes from 0.20 to 0.30 — +50% relative, well above the 5% floor.
        const after = report({
            bass: stem({
                probes: {
                    sub: 0.3,
                    low: 0.15,
                    lowMid: 0.18,
                    mid: 0.16,
                    presence: 0.15,
                    air: 0.08,
                    centroid: 1500,
                },
            }),
        });

        const diff = diffMixReports(before, after);

        const subProbe = diff.stems[0].metrics.find((m) => m.name === 'probe.sub');
        expect(subProbe?.significant).toBe(true);
        expect(subProbe?.relative).toBeGreaterThan(0.3);
    });

    it('marks new stems as missing-baseline without counting them as significant', () => {
        const before = report({ chords: stem() });
        const after = report({
            chords: stem(),
            soloist: stem({ rmsDb: -10 }),
        });

        const diff = diffMixReports(before, after);

        expect(diff.summary.missing).toBe(1);
        expect(diff.summary.significant).toBe(0);
        const newSoloist = diff.stems.find((s) => s.stem === 'soloist');
        expect(newSoloist?.status).toBe('missing');
    });

    it('respects overridden thresholds', () => {
        const before = report({ chords: stem() });
        const after = report({ chords: stem({ rmsDb: -19 }) }); // -1 dB

        const tight = diffMixReports(before, after, { ...DEFAULT_DIFF_THRESHOLDS, db: 0.5 });
        expect(tight.summary.significant).toBe(1);

        const loose = diffMixReports(before, after, { ...DEFAULT_DIFF_THRESHOLDS, db: 2 });
        expect(loose.summary.significant).toBe(0);
    });

    it('loadMixReport rejects non-report JSON', () => {
        expect(() => loadMixReport('{"foo": 1}')).toThrow(/missing scenes/);
    });

    it('formatMixDiffHuman shows nothing-changed message when no stems are significant', () => {
        const diff = diffMixReports(report({ chords: stem() }), report({ chords: stem() }));
        const text = formatMixDiffHuman(diff);
        expect(text).toContain('No stems exceeded the diff threshold.');
    });

    it('formatMixDiffHuman highlights only significant metrics on significant stems', () => {
        const before = report({ chords: stem() });
        const after = report({ chords: stem({ rmsDb: -25 }) });
        const text = formatMixDiffHuman(diffMixReports(before, after));
        expect(text).toContain('chords');
        expect(text).toContain('rmsDb');
        expect(text).toMatch(/-7\.00 dB/);
    });
});
