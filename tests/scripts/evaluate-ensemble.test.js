import { beforeEach, describe, expect, it } from 'vitest';
import { dispatch } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';
import {
    bootstrapEnsembleAudit,
    buildEnsembleAuditReport,
    formatEnsembleAuditOutput,
    normalizeSeedList,
    runEnsembleSweep,
    simulateEnsembleLoops,
} from '../../scripts/ensemble-analysis-utils.js';

describe('Ensemble audit scripts', () => {
    beforeEach(() => {
        dispatch(ACTIONS.RESET_STATE);
    });

    it('normalizes multi-seed input without duplicates', () => {
        expect(normalizeSeedList('BASE', '')).toEqual(['BASE']);
        expect(normalizeSeedList('BASE', 'ALPHA,BETA,ALPHA')).toEqual(['ALPHA', 'BETA']);
    });

    it('builds a compact machine-readable report across multiple seeds', async () => {
        const captures = await runEnsembleSweep({
            genre: 'Jazz',
            bpm: 118,
            intensity: 0.64,
            complexity: 0.6,
            arrangementName: 'changes',
            timeSignature: '4/4',
            key: 'C',
            density: 'standard',
            seeds: ['ENSEMBLE_ONE', 'ENSEMBLE_TWO'],
            loops: 2,
        });

        const report = buildEnsembleAuditReport({
            captures,
            options: {
                genre: 'Jazz',
                bpm: 118,
                intensity: 0.64,
                complexity: 0.6,
                arrangementName: 'changes',
                timeSignature: '4/4',
                key: 'C',
                density: 'standard',
                loops: 2,
                seeds: ['ENSEMBLE_ONE', 'ENSEMBLE_TWO'],
            },
            full: false,
        });

        expect(report.reportType).toBe('ensemble-audit');
        expect(report.aggregate.seedCount).toBe(2);
        expect(report.seeds).toHaveLength(2);
        expect(report.profile.drumPreset).toBe('Jazz');
        expect(report.aggregate.drumHitsPerMeasure).toBeGreaterThan(0);
        expect(report.aggregate.bassStepsPerMeasure).toBeGreaterThan(0);
        expect(report.aggregate.chordStepsPerMeasure).toBeGreaterThan(0);
        expect(report.aggregate.soloistStepsPerMeasure).toBeGreaterThan(0);
        expect(report.seeds[0].timingOffsetMs).toHaveProperty('drums');
        expect(report.seeds[0].maxPitchedVoices).toBeGreaterThan(0);
        expect(report.measures).toHaveLength(0);
    });

    it('includes measure rows in full mode and formats NDJSON output', async () => {
        const bootstrap = await bootstrapEnsembleAudit({
            genre: 'Funk',
            bpm: 104,
            intensity: 0.74,
            complexity: 0.7,
            arrangementName: 'vamp',
            timeSignature: '4/4',
            key: 'E',
            seed: 'FULL_MODE',
        });

        const capture = simulateEnsembleLoops({
            state: bootstrap.state,
            arrangement: bootstrap.arrangement,
            profile: bootstrap.profile,
            seed: 'FULL_MODE',
            loops: 1,
        });
        const report = buildEnsembleAuditReport({
            captures: [capture],
            options: {
                genre: 'Funk',
                bpm: 104,
                intensity: 0.74,
                complexity: 0.7,
                arrangementName: 'vamp',
                timeSignature: '4/4',
                key: 'E',
                loops: 1,
                seeds: ['FULL_MODE'],
            },
            full: true,
        });

        expect(report.measures).toHaveLength(capture.arrangement.measuresPerLoop);

        const lines = formatEnsembleAuditOutput(report, { jsonl: true })
            .trim()
            .split('\n')
            .map((line) => JSON.parse(line));

        expect(lines[0].kind).toBe('aggregate');
        expect(lines.some((line) => line.kind === 'seed')).toBe(true);
        expect(lines.some((line) => line.kind === 'measure')).toBe(true);
    });
});
