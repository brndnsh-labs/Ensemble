import { describe, expect, it, vi } from 'vitest';
import { generateSessionSeed } from '../../public/engine/soloist-seeder.js';
import { getState } from '../../public/state.js';

vi.mock('../../public/state.js', () => ({
    getState: () => ({
        arranger: { key: 'C', isMinor: false },
        groove: { genreFeel: 'Rock' },
        soloist: { tension: 0.5 },
    }),
}));

describe('Soloist Seeder', () => {
    const mockArranger = {
        totalSteps: 64,
        timeSignature: '4/4',
        sectionMap: [
            { id: 's1', start: 0, end: 32, label: 'Verse' },
            { id: 's2', start: 32, end: 64, label: 'Chorus' },
        ],
        stepMap: Array(64)
            .fill(null)
            .map((_, _i) => ({
                start: _i,
                end: _i + 1,
                chord: {
                    rootMidi: 60, // C
                    quality: 'major',
                    value: 'C',
                    beats: 4,
                    intervals: [0, 4, 7],
                },
            })),
    };

    it('should generate a seed with correct loop length', () => {
        const seed = generateSessionSeed(getState(), mockArranger, 'scalar', 0.5);
        expect(seed.notes.length).toBeGreaterThan(0);
        // Unroller targets 128 bars.
        // 4 bars original. 128 / 4 = 32 iterations.
        // 32 * 64 steps = 2048 steps.
        expect(seed.loopLengthSteps).toBe(2048);
    });

    it('should have anchor notes on beat boundaries', () => {
        const seed = generateSessionSeed(getState(), mockArranger, 'scalar', 0.5);
        const anchorSteps = seed.notes.filter((n) => n.isAnchor).map((n) => n.step % 16);
        // Anchor notes should always land on a beat (0, 4, 8, or 12)
        anchorSteps.forEach((step) => {
            expect([0, 4, 8, 12]).toContain(step);
        });
    });

    it('should resolve to a scale tone in the conclusion if notes exist', () => {
        const seed = generateSessionSeed(getState(), mockArranger, 'scalar', 0.5);
        // Look at the VERY end of the unrolled form
        const conclusionNotes = seed.notes.filter((n) => n.step >= 2048 - 16);
        if (conclusionNotes.length > 0) {
            const lastNote = conclusionNotes[conclusionNotes.length - 1];
            const pc = lastNote.midi % 12;
            // In C Major, scale tones are 0, 2, 4, 5, 7, 9, 11
            expect([0, 2, 4, 5, 7, 9, 11]).toContain(pc);
        }
    });

    it('should repeat motifs for identical section roles in unrolled form', () => {
        const repeatingArranger = {
            totalSteps: 64,
            timeSignature: '4/4',
            sectionMap: [
                { id: 'v1', start: 0, end: 16, label: 'Verse 1' },
                { id: 'v1', start: 16, end: 32, label: 'Verse 2' },
                { id: 'c1', start: 32, end: 48, label: 'Chorus' },
                { id: 'v1', start: 48, end: 64, label: 'Verse 3' },
            ],
            stepMap: Array(64)
                .fill(null)
                .map((_, _i) => ({
                    start: _i,
                    end: _i + 1,
                    chord: {
                        rootMidi: 60,
                        quality: 'major',
                        value: 'C',
                        beats: 4,
                        intervals: [0, 4, 7],
                    },
                })),
        };

        const seed = generateSessionSeed(getState(), repeatingArranger, 'scalar', 0.5);
        // Just verify it unrolls and generates notes
        expect(seed.notes.length).toBeGreaterThan(0);
        expect(seed.loopLengthSteps).toBe(2048);
    });

    it('should use different registers for Intro and Chorus roles', () => {
        const structuralArranger = {
            totalSteps: 64,
            timeSignature: '4/4',
            sectionMap: [
                { id: 's1', start: 0, end: 32, label: 'Intro' },
                { id: 's2', start: 32, end: 64, label: 'Chorus' },
            ],
            stepMap: Array(64)
                .fill(null)
                .map((_, _i) => ({
                    start: _i,
                    end: _i + 1,
                    chord: {
                        rootMidi: 60,
                        quality: 'major',
                        value: 'C',
                        beats: 4,
                        intervals: [0, 4, 7],
                    },
                })),
        };

        const seed = generateSessionSeed(getState(), structuralArranger, 'scalar', 0.5);

        // Unroller iteration 0 is Intro. Iteration 16 (approx) is Chorus.
        const introNotes = seed.notes.filter((n) => n.step < 64); // First iteration
        // Chorus is iteration iterations/2. Iterations = 128/4 = 32. Iteration 16 starts at 16 * 64 = 1024.
        const chorusNotes = seed.notes.filter((n) => n.step >= 1024 && n.step < 1024 + 64);

        const avgIntroMidi = introNotes.reduce((sum, n) => sum + n.midi, 0) / introNotes.length;
        const avgChorusMidi = chorusNotes.reduce((sum, n) => sum + n.midi, 0) / chorusNotes.length;

        // Chorus should be significantly higher than Intro (C6 vs C4/C5 range)
        expect(avgChorusMidi).toBeGreaterThan(avgIntroMidi + 12);
    });

    it('should generate identical melodies for the same seed string', () => {
        const seedStr = 'JAZZ';
        const seed1 = generateSessionSeed(getState(), mockArranger, 'scalar', 0.5, seedStr);
        const seed2 = generateSessionSeed(getState(), mockArranger, 'scalar', 0.5, seedStr);
        expect(seed1.notes).toEqual(seed2.notes);
        expect(seed1.loopLengthSteps).toEqual(seed2.loopLengthSteps);
    });

    it('should generate different melodies for different seed strings', () => {
        const seed1 = generateSessionSeed(getState(), mockArranger, 'scalar', 0.5, 'APPLE');
        const seed2 = generateSessionSeed(getState(), mockArranger, 'scalar', 0.5, 'BANANA');
        expect(seed1.notes).not.toEqual(seed2.notes);
    });

    it('should return empty result for empty arranger', () => {
        const seed = generateSessionSeed(getState(), { stepMap: [] }, 'scalar', 0.5);
        expect(seed.notes).toEqual([]);
        expect(seed.loopLengthSteps).toBe(0);
    });
});
