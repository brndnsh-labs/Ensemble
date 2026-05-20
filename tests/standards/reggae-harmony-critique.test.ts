// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getHarmonyNotes } from '../../public/engine/harmonies.js';
import { getState } from '../../public/state.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

// Mock state
vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

/**
 * Reggae Harmony Critique
 *
 * Updated 2026-05-19 (epic-coordination-consistency S1.b): the harmony
 * channel no longer plays skank on Reggae — the chord channel handles
 * the keyboardist's skank (beats 2 & 4), and the harmony channel plays
 * the organist's bubble (eighth-note offbeats) when `activeStyle` lands
 * on `'organ'` (the smart-style default for Reggae). Double-stacking
 * skank on both channels is the Epic 6 S5 bug; this critique guards
 * against its reintroduction at the harmony channel.
 *
 * For deeper coverage (varied seeds, dyad-accent reliability) see
 * `reggae-harmony-organ-critique.test.ts`.
 */
describe('Reggae Harmony Critique', () => {
    let mockState;

    beforeEach(() => {
        vi.clearAllMocks();
        mockState = {
            playback: { bandIntensity: 0.6, complexity: 0.5 },
            groove: {
                genreFeel: 'Reggae',
                pocket: {
                    globalDrive: 0,
                    tightness: 1,
                    bassGravity: 1,
                    chordGravity: 1,
                    soloistGravity: 1,
                },
            },
            soloist: makeSoloistMock({ enabled: true, isResting: true, notesInPhrase: 0 }),
            harmony: { enabled: true, complexity: 0.5, lastMidis: [], rhythmicMask: 0 },
            arranger: { timeSignature: '4/4' },
        };
        getState.mockReturnValue(mockState);
    });

    it('should pass an organ-bubble authenticity critique for a 128-bar Reggae performance', () => {
        const chordC = { rootMidi: 60, quality: 'm', intervals: [0, 3, 7], sectionId: 'A' };
        const totalMeasures = 128;
        const totalSteps = totalMeasures * 16;

        // Bubble offbeats — eighth-note positions between skank backbeats.
        // NOTE: BUBBLE_STEPS/SKANK_STEPS are intentionally duplicated in
        // reggae-harmony-organ-critique.test.ts. That sibling exercises a
        // different engine entry point (generateCompingPattern unit) vs this
        // file's getHarmonyNotes integration path; the only overlap is these
        // two constant arrays. Hoisting them to a shared util would couple two
        // otherwise-independent critique files for ~2 lines — not worth it.
        const BUBBLE_STEPS = [2, 6, 10, 14, 18, 22, 26, 30];
        // Skank backbeats — owned by the chord channel post-S5.
        const SKANK_STEPS = [4, 12, 20, 28];

        let bubbleHits = 0;
        let skankHits = 0;
        let totalStabs = 0;

        for (let i = 0; i < totalSteps; i++) {
            const stepInMeasure = i % 16;
            const stepInTwoBars = i % 32;
            const notes = getHarmonyNotes(
                getState(),
                chordC,
                null,
                i,
                64,
                'smart',
                stepInMeasure,
                null,
                // soloistResting/soloistNotesInPhrase now read from coordination (S4).
                { soloistResting: true, soloistNotesInPhrase: 0 },
            );

            if (notes.length > 0) {
                totalStabs++;
                if (BUBBLE_STEPS.includes(stepInTwoBars)) {
                    bubbleHits++;
                } else if (SKANK_STEPS.includes(stepInTwoBars)) {
                    skankHits++;
                }
            }
        }

        const bubbleScore = bubbleHits / totalStabs;
        const skankScore = skankHits / (totalMeasures * 2); // 2 skank backbeats per bar
        // why: bubbleScore alone is a precision metric (of-fires-where) — a
        // regression that drops 7 of 8 offbeats still scores 1.0 because the
        // remaining hit is still ON a bubble step. Pair with absolute density
        // (hits/bar) so a near-empty pattern can't pass. Observed steady-state
        // is ~4.0 hits/bar; 3.5 floor leaves headroom for coordination yields.
        const bubbleDensity = bubbleHits / totalMeasures;

        console.log(
            '\n--- REGGAE HARMONY CRITIQUE REPORT ---\n' +
                `[Bubble Hit Share]      ${(bubbleScore * 100).toFixed(1)}% (Target: 100%)\n` +
                `[Skank Bleed]           ${(skankScore * 100).toFixed(1)}% (Target: 0%)\n` +
                `[Bubble Density]        ${bubbleDensity.toFixed(2)} hits/bar (Target: > 3.5)\n` +
                '------------------------------------\n',
        );

        // The bubble is the dominant harmony-channel lane.
        expect(bubbleScore).toBe(1.0);
        // Zero skank bleed — the chord channel owns those beats.
        expect(skankScore).toBe(0);
        // Density guard — protects against a regression that keeps precision
        // but loses lane coverage (e.g. dropping all but 1 bubble step).
        expect(bubbleDensity).toBeGreaterThan(3.5);
    });
});
