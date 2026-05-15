// @ts-nocheck
import { beforeEach, describe, expect, it } from 'vitest';
import { dispatch } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';
import {
    bootstrapChordAudit,
    buildChordAuditReport,
    buildChordDeepDiveReport,
    buildCoordinationAudit,
    buildFocusMeasures,
    buildMeasureAudit,
    simulateChordLoops,
} from '../../scripts/chord-analysis-utils.js';

function average(values) {
    return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function runAudit({
    genre = 'Jazz',
    arrangementName = 'changes',
    loops = 1,
    seed = 'TEST_AUDIT',
    scenario = 'default',
    intensity = 0.6,
} = {}) {
    const { state, arrangement } = bootstrapChordAudit({
        genre,
        bpm: 112,
        intensity,
        complexity: intensity,
        arrangementName,
        style: 'smart',
        density: 'standard',
        key: 'C',
    });

    return {
        arrangement,
        capture: simulateChordLoops({
            state,
            arrangement,
            loops,
            seed,
            scenario,
        }),
    };
}

describe('Chord audit scripts', () => {
    beforeEach(() => {
        dispatch(ACTIONS.RESET_STATE);
    });

    it('captures one audit row per measure and ignores unavailable focus loops', () => {
        const { arrangement, capture } = runAudit({ loops: 1, seed: 'ROW_SHAPE' });
        const rows = buildMeasureAudit(capture, 0);
        const focusRows = buildFocusMeasures(capture, [0, 1], 20);

        expect(rows).toHaveLength(arrangement.measuresPerLoop);
        expect(rows[0].pattern.length).toBeGreaterThan(0);
        expect(rows[0].playedLine).not.toBe('');
        expect(focusRows.some((row) => row.Loop === 1)).toBe(false);
    });

    it('shows sticky groove retention in the funk vamp audit', () => {
        const { capture } = runAudit({
            genre: 'Funk',
            arrangementName: 'vamp',
            loops: 1,
            seed: 'FUNK_LOCK',
            intensity: 0.75,
        });
        const rows = buildMeasureAudit(capture, 0);

        expect(rows[1].grooveRetentionCount).toBeGreaterThan(1);
        expect(rows[1].patternKey).toBe(rows[0].patternKey);
    });

    it('reports lighter comping when the soloist is busy', () => {
        const defaultAudit = runAudit({
            genre: 'Jazz',
            arrangementName: 'changes',
            loops: 1,
            seed: 'CALL_RESPONSE',
            scenario: 'default',
        });
        const busyAudit = runAudit({
            genre: 'Jazz',
            arrangementName: 'changes',
            loops: 1,
            seed: 'CALL_RESPONSE',
            scenario: 'soloist-busy',
        });

        const defaultRows = buildMeasureAudit(defaultAudit.capture, 0);
        const busyRows = buildMeasureAudit(busyAudit.capture, 0);
        const busyCoordination = buildCoordinationAudit(busyAudit.capture, 0);

        expect(average(busyRows.map((row) => row.attackCount))).toBeLessThan(
            average(defaultRows.map((row) => row.attackCount)),
        );
        expect(busyCoordination).toHaveLength(busyAudit.arrangement.measuresPerLoop);
    });

    it('builds a machine-readable compact JSON report', () => {
        const { arrangement, capture } = runAudit({
            genre: 'Neo-Soul',
            arrangementName: 'neo-soul',
            loops: 2,
            seed: 'JSON_REPORT',
        });

        const report = buildChordAuditReport({
            capture,
            genre: 'Neo-Soul',
            bpm: 112,
            intensity: 0.6,
            complexity: 0.6,
            loops: 2,
            arrangementName: 'neo-soul',
            style: 'smart',
            density: 'standard',
            key: 'C',
            scenario: 'default',
            seed: 'JSON_REPORT',
            drillDown: false,
            full: false,
        });

        expect(report.reportType).toBe('chord-audit');
        expect(report.arrangement.measuresPerLoop).toBe(arrangement.measuresPerLoop);
        expect(report.summaries.loopComparison).toHaveLength(2);
        expect(report.loops).toHaveLength(2);
        expect(report.loops[0].measures).toHaveLength(arrangement.measuresPerLoop);
        expect(report.summaries.patternReplay[0]).toHaveProperty('patterns');
        expect(report.eventLog).toHaveLength(0);
    });

    it('includes structured event data in deep-dive JSON mode', () => {
        const { capture } = runAudit({
            genre: 'Jazz',
            arrangementName: 'changes',
            loops: 2,
            seed: 'JSON_DEEP',
            scenario: 'soloist-busy',
        });

        const report = buildChordDeepDiveReport({
            capture,
            genre: 'Jazz',
            bpm: 112,
            intensity: 0.6,
            complexity: 0.6,
            loops: 2,
            arrangementName: 'changes',
            style: 'smart',
            density: 'standard',
            key: 'C',
            scenario: 'soloist-busy',
            seed: 'JSON_DEEP',
            full: true,
        });

        expect(report.reportType).toBe('chord-deep-dive');
        expect(report.summaries.focusMeasures.length).toBeGreaterThan(0);
        expect(report.eventLog.length).toBeGreaterThan(0);
        expect(report.eventLog[0]).toHaveProperty('notes');
        expect(Array.isArray(report.eventLog[0].notes)).toBe(true);
        expect(report.eventLog[0]).toHaveProperty('soloistBusy');
    });

    it('keeps Neo-Soul voicing movement in a conversational pocket', () => {
        const { capture } = runAudit({
            genre: 'Neo-Soul',
            arrangementName: 'neo-soul',
            loops: 2,
            seed: 'NEO_POCKET',
            intensity: 0.6,
        });

        const rows = buildMeasureAudit(capture, 0);
        const voiceJumpMeasures = rows.filter((row) => row.flags.includes('voice-jump'));

        expect(voiceJumpMeasures).toHaveLength(0);
        expect(Math.max(...rows.map((row) => Math.abs(row.centerDrift)))).toBeLessThanOrEqual(7);
    });

    it('keeps Funk changes in a clav pocket without octave jumps', () => {
        const { capture } = runAudit({
            genre: 'Funk',
            arrangementName: 'changes',
            loops: 1,
            seed: 'FUNK_CHANGES',
            intensity: 0.75,
        });

        const rows = buildMeasureAudit(capture, 0);
        const voiceJumpMeasures = rows.filter((row) => row.flags.includes('voice-jump'));

        expect(voiceJumpMeasures).toHaveLength(0);
        expect(Math.max(...rows.map((row) => Math.abs(row.centerDrift)))).toBeLessThanOrEqual(7);
        expect(rows.every((row) => row.avgVoices <= 2.1)).toBe(true);
    });
});
