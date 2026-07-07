import { describe, expect, it } from 'vitest';
import { compingState, resetCompingState } from '../../../public/engine/accompaniment.js';
import {
    type CoordinationCarryover,
    macroArcLadder,
    resetCoordinationCarryover,
} from '../../../public/engine/coordination-engine.js';

/**
 * Parity guard for the shared "reset ritual" helpers (#1013). The live worker
 * (logic-worker.ts / worker-orchestrator.ts) and the offline export
 * (midi-worker-logic.ts) used to maintain parallel copies of the same reset logic;
 * they drifted. These tests lock the ONE home for each ritual so a new field has a
 * single reset site.
 */
describe('reset-ritual parity (#1013)', () => {
    describe('resetCompingState', () => {
        it('resets exactly the 6 per-song comp keys to their defaults', () => {
            // Dirty every one of the 6 target keys to a non-default value.
            compingState.lastChordIndex = 7;
            compingState.lockedUntil = 42;
            compingState.grooveRetentionCount = 3;
            compingState.lastVoicingMidis = [60, 64, 67];
            compingState.statementChordKey = 'Cmaj7';
            compingState.statementVoicingMidis = [60, 64, 67, 71];

            resetCompingState(compingState);

            expect(compingState.lastChordIndex).toBe(-1);
            expect(compingState.lockedUntil).toBe(0);
            expect(compingState.grooveRetentionCount).toBe(0);
            expect(compingState.lastVoicingMidis).toEqual([]);
            expect(compingState.statementChordKey).toBeNull();
            expect(compingState.statementVoicingMidis).toEqual([]);
        });

        it('does not touch a non-target sentinel field', () => {
            // currentVibe is NOT part of the ritual — neither host clears it.
            compingState.currentVibe = 'dirty';
            resetCompingState(compingState);
            expect(compingState.currentVibe).toBe('dirty');
        });
    });

    describe('resetCoordinationCarryover', () => {
        it('zeroes EVERY field on the CoordinationCarryover shape', () => {
            // "One home" gate: build an object with every key of the interface set
            // non-zero, reset, and assert all are 0. A new field added to
            // CoordinationCarryover but left out of the reset makes this fail.
            const carryover: CoordinationCarryover = {
                lastActiveSoloistMidi: 64,
                lastActiveSoloistStep: 128,
            };

            resetCoordinationCarryover(carryover);

            expect(Object.values(carryover).every((v) => v === 0)).toBe(true);
        });
    });

    describe('macroArcLadder', () => {
        it('returns the documented pair for each of the 5 progress bands', () => {
            expect(macroArcLadder(0.0)).toEqual({ macroFloor: 0.2, macroCeiling: 0.45 });
            expect(macroArcLadder(0.3)).toEqual({ macroFloor: 0.4, macroCeiling: 0.7 });
            expect(macroArcLadder(0.5)).toEqual({ macroFloor: 0.5, macroCeiling: 0.8 });
            expect(macroArcLadder(0.75)).toEqual({ macroFloor: 0.7, macroCeiling: 1.0 });
            expect(macroArcLadder(0.95)).toEqual({ macroFloor: 0.2, macroCeiling: 0.5 });
        });

        it('places band boundaries on the upper band (half-open [lo, hi))', () => {
            // progress === 0.15 is NOT < 0.15, so it falls into the second band.
            expect(macroArcLadder(0.15)).toEqual({ macroFloor: 0.4, macroCeiling: 0.7 });
            expect(macroArcLadder(0.4)).toEqual({ macroFloor: 0.5, macroCeiling: 0.8 });
            expect(macroArcLadder(0.65)).toEqual({ macroFloor: 0.7, macroCeiling: 1.0 });
            expect(macroArcLadder(0.85)).toEqual({ macroFloor: 0.2, macroCeiling: 0.5 });
            // progress === 1.0 lands in the final (wind-down) band.
            expect(macroArcLadder(1.0)).toEqual({ macroFloor: 0.2, macroCeiling: 0.5 });
        });
    });
});
