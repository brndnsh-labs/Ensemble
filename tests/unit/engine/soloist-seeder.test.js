import { describe, expect, it } from 'vitest';
import { generateSessionSeed } from '../../../public/engine/soloist-seeder.js';

describe('Soloist Seeder Module', () => {
    const mockArranger = {
        totalSteps: 128,
        timeSignature: '4/4',
        stepMap: [
            {
                start: 0,
                end: 16,
                chord: { rootMidi: 60, intervals: [0, 4, 7], sectionLabel: 'Verse' },
            },
            {
                start: 16,
                end: 32,
                chord: { rootMidi: 65, intervals: [0, 4, 7], sectionLabel: 'Verse' },
            },
            {
                start: 32,
                end: 48,
                chord: { rootMidi: 67, intervals: [0, 4, 7], sectionLabel: 'Verse' },
            },
            {
                start: 48,
                end: 64,
                chord: { rootMidi: 60, intervals: [0, 4, 7], sectionLabel: 'Verse' },
            },
            {
                start: 64,
                end: 80,
                chord: { rootMidi: 60, intervals: [0, 4, 7], sectionLabel: 'Chorus' },
            },
            {
                start: 80,
                end: 96,
                chord: { rootMidi: 65, intervals: [0, 4, 7], sectionLabel: 'Chorus' },
            },
            {
                start: 96,
                end: 112,
                chord: { rootMidi: 67, intervals: [0, 4, 7], sectionLabel: 'Chorus' },
            },
            {
                start: 112,
                end: 128,
                chord: { rootMidi: 60, intervals: [0, 4, 7], sectionLabel: 'Chorus' },
            },
        ],
        sectionMap: [
            { id: 's1', start: 0, end: 64, label: 'Verse' },
            { id: 's2', start: 64, end: 128, label: 'Chorus' },
        ],
    };

    const mockState = {
        arranger: { key: 'C', isMinor: false },
    };

    it('should generate notes that span the entire arrangement', () => {
        const result = generateSessionSeed(mockState, mockArranger, 'scalar', 0.5, 'test-seed-123');

        // Unroller targets 128 bars.
        // Original is 8 bars (128 steps).
        // 128 / 8 = 16 iterations.
        // 16 * 128 = 2048 steps.
        expect(result.loopLengthSteps).toBe(2048);
        expect(result.notes.length).toBeGreaterThan(0);

        // Ensure notes are within the unrolled range
        const maxStep = Math.max(...result.notes.map((n) => n.step));
        expect(maxStep).toBeLessThan(2048);
    });

    it('should be deterministic with the same seed', () => {
        const seed = 'deterministic-test';
        const res1 = generateSessionSeed(mockState, mockArranger, 'scalar', 0.5, seed);
        const res2 = generateSessionSeed(mockState, mockArranger, 'scalar', 0.5, seed);

        expect(res1).toEqual(res2);
    });
});
