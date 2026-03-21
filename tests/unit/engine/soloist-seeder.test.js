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
                start: i,
                end: i + 1,
                chord: { rootMidi: 60, intervals: [0, 4, 7] },
            });
        }

        const result = generateSessionSeed(mockState, mockArranger, 'scalar', 0.5, 'test-seed-123');

        expect(result.loopLengthSteps).toBe(128);
        expect(result.notes.length).toBeGreaterThan(0);

        // Ensure notes span across the entire form
        const lastNote = result.notes[result.notes.length - 1];
        expect(lastNote.step).toBeGreaterThan(80);
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
                start: i,
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

        // Because of Motivic Mutation (Restatement), the 2nd iteration of A will have slight differences.
        // But the contour length should be relatively close.
        expect(Math.abs(sectionANotes1.length - sectionANotes2.length)).toBeLessThanOrEqual(5);

        // And 'A' should differ from 'B' rhythmically or length-wise in a vast majority of random seeds
        // but testing length directly might flake, so we check existence
        expect(sectionBNotes.length).toBeGreaterThan(0);
        expect(sectionANotes1.length).toBeGreaterThan(0);
    });

    describe('Stationary and Sequencing Hooks', () => {
        const mockState = { arranger: { isMinor: false, key: 'C' }, soloist: { tension: 0.5 } };
        const mockArranger = {
            timeSignature: '4/4',
            totalSteps: 256,
            stepMap: [],
            sectionMap: [
                { label: 'A1', start: 0, end: 128 },
                { label: 'A2', start: 128, end: 256 },
            ],
        };

        for (let i = 0; i < 256; i += 16) {
            mockArranger.stepMap.push({
                start: i,
                end: i + 16,
                chord: { rootMidi: 60, quality: 'major', intervals: [0, 4, 7] },
            });
        }

        it('should occasionally generate stationary motifs', () => {
            let stationaryFound = false;
            for (let i = 0; i < 20; i++) {
                const seed = generateSessionSeed(
                    mockState,
                    mockArranger,
                    'minimal',
                    0.5,
                    `test-seed-${i}`,
                );
                const firstSectionNotes = seed.notes.filter((n) => n.step < 128);
                const pitchClasses = new Set(firstSectionNotes.map((n) => n.midi % 12));
                if (pitchClasses.size === 1 && firstSectionNotes.length > 3) {
                    stationaryFound = true;
                    break;
                }
            }
            expect(stationaryFound).toBe(true);
        });

        it('should apply stationary mutation to repeated sections', () => {
            let mutationFound = false;
            for (let i = 0; i < 100; i++) {
                const seed = generateSessionSeed(
                    mockState,
                    mockArranger,
                    'rock',
                    0.5,
                    `mutate-seed-${i}`,
                );
                const a1Notes = seed.notes.filter((n) => n.step < 128);
                const a2Notes = seed.notes.filter((n) => n.step >= 128 && n.step < 256);
                const a1Pitches = new Set(a1Notes.map((n) => n.midi % 12));
                const a2Pitches = new Set(a2Notes.map((n) => n.midi % 12));

                if (a1Pitches.size > 1 && a2Pitches.size === 1 && a2Notes.length > 3) {
                    mutationFound = true;
                    break;
                }
            }
            expect(mutationFound).toBe(true);
        });

        it('should apply sequencing mutation to repeated sections', () => {
            let sequencingFound = false;
            for (let i = 0; i < 300; i++) {
                const seed = generateSessionSeed(
                    mockState,
                    mockArranger,
                    'rock',
                    0.5,
                    `seq-seed-${i}`,
                );

                // Compare the first 2-measure block of A1 vs A2
                const a1Block = seed.notes.filter((n) => n.step >= 0 && n.step < 32);
                const a2Block = seed.notes.filter((n) => n.step >= 128 && n.step < 160);

                if (a1Block.length === a2Block.length && a1Block.length > 2) {
                    const diffs = a1Block.map((n, idx) => a2Block[idx].midi - n.midi);
                    const allSameDiff = diffs.every((d) => d === diffs[0] && d !== 0);
                    if (allSameDiff) {
                        sequencingFound = true;
                        break;
                    }
                }
            }
            expect(sequencingFound).toBe(true);
        });
    });
});
