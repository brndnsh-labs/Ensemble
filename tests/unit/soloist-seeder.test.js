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
        sectionMap: [
            { id: 's1', start: 0, end: 32, label: 'Verse' },
            { id: 's2', start: 32, end: 64, label: 'Chorus' },
        ],
        stepMap: Array(64)
            .fill(null)
            .map((_, _i) => ({
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
        expect(seed.loopLengthSteps).toBe(64); // 4 measures * 16 steps
    });

    it('should have anchor notes on beat boundaries', () => {
        const seed = generateSessionSeed(getState(), mockArranger, 'scalar', 0.5);
        const anchorSteps = seed.notes.filter((n) => n.isAnchor).map((n) => n.step % 16);
        // Anchor notes should always land on a beat (0, 4, 8, or 12)
        anchorSteps.forEach((step) => {
            expect([0, 4, 8, 12]).toContain(step);
        });
        // At least some should be on beat 1 (step 0)
        expect(anchorSteps).toContain(0);
    });

    it('should resolve to a scale tone in the conclusion if notes exist', () => {
        const seed = generateSessionSeed(getState(), mockArranger, 'scalar', 0.5);
        const conclusionNotes = seed.notes.filter((n) => n.step >= 48);
        if (conclusionNotes.length > 0) {
            const lastNote = conclusionNotes[conclusionNotes.length - 1];
            const pc = lastNote.midi % 12;
            // In C Major, scale tones are 0, 2, 4, 5, 7, 9, 11
            expect([0, 2, 4, 5, 7, 9, 11]).toContain(pc);
        }
    });

    it('should repeat the same motif for identical section IDs', () => {
        const repeatingArranger = {
            totalSteps: 64,
            sectionMap: [
                { id: 'v1', start: 0, end: 16, label: 'Verse 1' },
                { id: 'v1', start: 16, end: 32, label: 'Verse 2' },
                { id: 'c1', start: 32, end: 48, label: 'Chorus' },
                { id: 'v1', start: 48, end: 64, label: 'Verse 3' },
            ],
            stepMap: Array(64)
                .fill(null)
                .map((_, _i) => ({
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
        const v1Notes = seed.notes.filter((n) => n.step < 16);
        const v2Notes = seed.notes.filter((n) => n.step >= 16 && n.step < 32);
        const v3Notes = seed.notes.filter((n) => n.step >= 48);

        // Check relative MIDI values match
        expect(v1Notes.length).toBe(v2Notes.length);
        expect(v1Notes.length).toBe(v3Notes.length);

        for (let i = 0; i < v1Notes.length; i++) {
            expect(v1Notes[i].midi).toBe(v2Notes[i].midi);
            expect(v1Notes[i].midi).toBe(v3Notes[i].midi);
        }
    });

    it('should use different registers for Intro and Chorus labels', () => {
        const structuralArranger = {
            totalSteps: 64,
            sectionMap: [
                { id: 's1', start: 0, end: 32, label: 'Intro' },
                { id: 's2', start: 32, end: 64, label: 'Chorus' },
            ],
            stepMap: Array(64)
                .fill(null)
                .map((_, _i) => ({
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
        const introNotes = seed.notes.filter((n) => n.step < 32);
        const chorusNotes = seed.notes.filter((n) => n.step >= 32);

        const avgIntroMidi = introNotes.reduce((sum, n) => sum + n.midi, 0) / introNotes.length;
        const avgChorusMidi = chorusNotes.reduce((sum, n) => sum + n.midi, 0) / chorusNotes.length;

        // Chorus should be significantly higher than Intro (C6 vs C4/C5 range)
        // Intro is assigned base octave 4 (approx 60). Chorus is assigned base octave 6 (approx 84).
        expect(avgChorusMidi).toBeGreaterThan(avgIntroMidi);
    });

    it('should share motifs between sections with similar labels (e.g. Verse 1 and Verse 2)', () => {
        const labeledArranger = {
            totalSteps: 64,
            sectionMap: [
                { id: 'v1', start: 0, end: 16, label: 'Verse 1' },
                { id: 'v2', start: 16, end: 32, label: 'Verse 2' },
                { id: 'c1', start: 32, end: 48, label: 'Chorus' },
                { id: 'v3', start: 48, end: 64, label: 'Verse 3' },
            ],
            stepMap: Array(64)
                .fill(null)
                .map((_, _i) => ({
                    chord: {
                        rootMidi: 60,
                        quality: 'major',
                        value: 'C',
                        beats: 4,
                        intervals: [0, 4, 7],
                    },
                })),
        };

        const seed = generateSessionSeed(getState(), labeledArranger, 'scalar', 0.5);
        const v1Notes = seed.notes.filter((n) => n.step < 16);
        const v2Notes = seed.notes.filter((n) => n.step >= 16 && n.step < 32);
        const v3Notes = seed.notes.filter((n) => n.step >= 48);

        // Even though IDs are different (v1, v2, v3), labels all contain "Verse"
        // so they should share the same motif.
        expect(v1Notes.length).toBe(v2Notes.length);
        expect(v1Notes.length).toBe(v3Notes.length);

        for (let i = 0; i < v1Notes.length; i++) {
            expect(v1Notes[i].midi).toBe(v2Notes[i].midi);
            expect(v1Notes[i].midi).toBe(v3Notes[i].midi);
        }
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

    it('should mathematically snap cloned turnaround notes to new primary chord tones', () => {
        const turnaroundArranger = {
            totalSteps: 64,
            sectionMap: [
                { id: 'v1', start: 0, end: 32, label: 'Verse' },
                { id: 'v2', start: 32, end: 64, label: 'Verse' },
            ],
            stepMap: Array(64)
                .fill(null)
                .map((_, i) => {
                    if (i >= 32 && i >= 64 - 8) {
                        // Last measure of verse 2
                        return {
                            chord: {
                                rootMidi: 67,
                                quality: 'dominant',
                                value: 'G7',
                                beats: 4,
                                intervals: [0, 4, 7, 10],
                            },
                        };
                    } else if (i >= 32 - 8 && i < 32) {
                        // Last measure of verse 1
                        return {
                            chord: {
                                rootMidi: 60,
                                quality: 'major',
                                value: 'C',
                                beats: 4,
                                intervals: [0, 4, 7],
                            },
                        };
                    } else {
                        return {
                            chord: {
                                rootMidi: 60,
                                quality: 'major',
                                value: 'C',
                                beats: 4,
                                intervals: [0, 4, 7],
                            },
                        };
                    }
                }),
        };

        const seed = generateSessionSeed(getState(), turnaroundArranger, 'scalar', 0.5);

        // Find notes in the last measure of Verse 2
        const v2TurnaroundNotes = seed.notes.filter((n) => n.step >= 64 - 8 && n.step < 64);

        v2TurnaroundNotes.forEach((n) => {
            const pc = n.midi % 12;
            // The new chord is G7 (G=7, B=11, D=2, F=5)
            // It should snap to primary chord tones of G7: 7, 11, 2, 5
            expect([2, 5, 7, 11]).toContain(pc);
        });
    });
});
