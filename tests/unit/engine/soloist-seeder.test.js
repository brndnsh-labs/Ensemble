import { describe, expect, it } from 'vitest';
import { generateSessionSeed } from '../../../public/engine/soloist-seeder.js';

describe('Soloist Seeder Module', () => {
    it('should generate notes that span the entire arrangement', () => {
        const mockState = { arranger: { isMinor: false, key: 'C' } };
        const mockArranger = {
            timeSignature: '4/4',
            totalSteps: 128,
            stepMap: [],
            sectionMap: [
                { label: 'Intro', start: 0, end: 32 },
                { label: 'A', start: 32, end: 64 },
                { label: 'B', start: 64, end: 96 },
                { label: 'A', start: 96, end: 128 },
            ],
        };

        // Mock a simple step map with 1 chord per measure (16 steps)
        for (let i = 0; i < 128; i++) {
            mockArranger.stepMap.push({
                step: i,
                end: i + 1,
                chord: { rootMidi: 60, intervals: [0, 4, 7] },
            });
        }

        const result = generateSessionSeed(mockState, mockArranger, 'scalar', 0.5, 'test-seed-123');

        expect(result.loopLengthSteps).toBe(128);
        expect(result.notes.length).toBeGreaterThan(0);

        // Ensure notes span across the entire form
        const lastNote = result.notes[result.notes.length - 1];
        expect(lastNote.step).toBeGreaterThan(100);
    });

    it('should respect exact section repetitions using motifs', () => {
        const mockState = { arranger: { isMinor: false, key: 'C' } };
        const mockArranger = {
            timeSignature: '4/4',
            totalSteps: 128,
            stepMap: [],
            sectionMap: [
                { label: 'A', start: 0, end: 32 },
                { label: 'B', start: 32, end: 64 },
                { label: 'A', start: 64, end: 96 },
                { label: 'C', start: 96, end: 128 },
            ],
        };

        // Mock a simple step map
        for (let i = 0; i < 128; i++) {
            mockArranger.stepMap.push({
                step: i,
                end: i + 1,
                chord: { rootMidi: 60, intervals: [0, 4, 7] },
            });
        }

        const result = generateSessionSeed(
            mockState,
            mockArranger,
            'scalar',
            0.5,
            'motif-seed-999',
        );

        const sectionANotes1 = result.notes.filter((n) => n.step >= 0 && n.step < 32);
        const sectionBNotes = result.notes.filter((n) => n.step >= 32 && n.step < 64);
        const sectionANotes2 = result.notes.filter((n) => n.step >= 64 && n.step < 96);

        // Motif counts should be identical for the same label 'A'
        expect(sectionANotes1.length).toBe(sectionANotes2.length);

        // And 'A' should differ from 'B' rhythmically or length-wise in a vast majority of random seeds
        // but testing length directly might flake, so we check existence
        expect(sectionBNotes.length).toBeGreaterThan(0);
        expect(sectionANotes1.length).toBeGreaterThan(0);
    });
});
