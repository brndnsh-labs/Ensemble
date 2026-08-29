import { describe, expect, it } from 'vitest';
import { compingState, resetCompingState } from '../../../public/engine/accompaniment.js';
import {
    type CoordinationCarryover,
    macroArcLadder,
    resetCoordinationCarryover,
} from '../../../public/engine/coordination-engine.js';
import { resetHiddenGenerationMemory } from '../../../public/engine/generation-run.js';

/**
 * Parity guard for the shared "reset ritual" helpers (#1013). The live worker
 * (logic-worker.ts / worker-orchestrator.ts) and the offline export
 * (midi-worker-logic.ts) used to maintain parallel copies of the same reset logic;
 * they drifted. These tests lock the ONE home for each ritual so a new field has a
 * single reset site.
 */
describe('reset-ritual parity (#1013)', () => {
    describe('resetHiddenGenerationMemory (#1043)', () => {
        it('clears harmony and comping memory through one fresh-run boundary', () => {
            const state = {
                harmony: { lastMidis: [60, 64, 67] },
            } as any;
            compingState.lastChordIndex = 7;
            compingState.lockedUntil = 42;
            compingState.grooveRetentionCount = 3;
            compingState.lastVoicingMidis = [60, 64, 67];
            compingState.statementChordKey = 'Cmaj7';
            compingState.statementVoicingMidis = [60, 64, 67, 71];

            resetHiddenGenerationMemory(state);

            expect(state.harmony.lastMidis).toEqual([]);
            expect(compingState.lastChordIndex).toBe(-1);
            expect(compingState.lockedUntil).toBe(0);
            expect(compingState.grooveRetentionCount).toBe(0);
            expect(compingState.lastVoicingMidis).toEqual([]);
            expect(compingState.statementChordKey).toBeNull();
            expect(compingState.statementVoicingMidis).toEqual([]);
        });
    });

    describe('resetCompingState', () => {
        it('resets every comp-memory field to its fresh-run default', () => {
            compingState.currentVibe = 'dirty';
            compingState.currentCell = new Array(16).fill(1);
            compingState.soloistActivity = 1;
            compingState.lastChordIndex = 7;
            compingState.lastChordQuality = '7alt';
            compingState.lockedUntil = 42;
            compingState.grooveRetentionCount = 3;
            compingState.maxGrooveLength = 8;
            compingState.lastSectionId = 'dirty-section';
            compingState.lastVoicingMidis = [60, 64, 67];
            compingState.statementChordKey = 'Cmaj7';
            compingState.statementVoicingMidis = [60, 64, 67, 71];
            compingState.ringSuppressStep = 14;
            compingState.ringSuppressChordKey = '60:maj7';
            compingState.funkRotationIndex = 5;
            compingState.bossaRotationIndex = 6;

            resetCompingState(compingState);

            expect(compingState).toEqual({
                currentVibe: 'balanced',
                currentCell: new Array(16).fill(0),
                lockedUntil: 0,
                soloistActivity: 0,
                lastChordIndex: -1,
                lastChordQuality: null,
                grooveRetentionCount: 0,
                maxGrooveLength: 4,
                lastSectionId: null,
                lastVoicingMidis: [],
                statementVoicingMidis: [],
                statementChordKey: null,
                ringSuppressStep: -1,
                ringSuppressChordKey: null,
                funkRotationIndex: 0,
                bossaRotationIndex: 0,
            });
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
