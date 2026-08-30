// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateHarmonyCompingPattern, getHarmonyNotes } from '../../public/engine/harmonies.js';
import { getState } from '../../public/state.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

// Mock state
vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

/**
 * Reggae organ-bubble harmony critique
 * (epic-coordination-consistency.md S1.b).
 *
 * The Reggae chord channel (`accompaniment.ts`) plays the keyboardist's
 * **skank** on beats 2 and 4 (steps 4, 12, 20, 28). The harmony channel,
 * when routed to organ (the smart-style default for Reggae), plays the
 * **organ bubble** — eighth-note offbeats on chord tones (steps 2, 6, 10,
 * 14, 18, 22, 26, 30). This test asserts the bubble dominates and that
 * the harmony channel does NOT re-create the skank double-stack that
 * Epic 6 S5 deleted from the chord channel.
 *
 * Statistical reliability is exercised by varying section IDs (which
 * change the `pseudoRandom` seed driving the occasional-dyad accents) so
 * a flaky seed can't pass with a degenerate pattern.
 */
describe('Reggae Harmony Organ-Bubble Critique', () => {
    let mockState;

    beforeEach(() => {
        vi.clearAllMocks();
        mockState = {
            playback: { bandIntensity: 0.6, complexity: 0.5 },
            groove: {
                genreFeel: 'Reggae',
            },
            soloist: makeSoloistMock({ enabled: true, isResting: true, notesInPhrase: 0 }),
            harmony: { enabled: true, complexity: 0.5, lastMidis: [], rhythmicMask: 0 },
            arranger: { timeSignature: '4/4' },
        };
        getState.mockReturnValue(mockState);
    });

    // Bubble offbeats (eighth-note positions between skank backbeats).
    const BUBBLE_STEPS = [2, 6, 10, 14, 18, 22, 26, 30];
    // Skank backbeats (beats 2 and 4 of each bar across the 2-bar period).
    const SKANK_STEPS = [4, 12, 20, 28];

    it('generateHarmonyCompingPattern: organ activeStyle produces bubble offbeats, no skank', () => {
        // why: 30-section reliability sweep — each section_id seeds a
        // different pseudoRandom() draw for the optional-dyad accents, so
        // a degenerate seed (e.g. one where the accent always fires) can't
        // mask a missing bubble step.
        const ts = { beats: 4, stepsPerBeat: 4 };
        for (let s = 0; s < 30; s++) {
            const pattern = generateHarmonyCompingPattern('reggae', s * 7919 + 1, ts, 'organ');
            expect(pattern.length).toBe(32);
            // Every bubble step should fire (tag 1 base, occasionally upgraded
            // to tag 2 dyad — either way the slot is non-zero).
            for (const step of BUBBLE_STEPS) {
                expect(pattern[step]).toBeGreaterThan(0);
            }
            // No skank backbeats on the harmony channel — that's the chord
            // channel's job; double-stacking is the bug S1.b prevents.
            for (const step of SKANK_STEPS) {
                expect(pattern[step]).toBe(0);
            }
        }
    });

    it('generateHarmonyCompingPattern: non-organ activeStyle (or undefined) keeps backbeat skank', () => {
        // why: harmony route to non-organ (e.g. user forces strings/horns
        // on Reggae) means the harmony channel is acting as a horn-stab
        // layer, not an organ-bubble layer. The original backbeat pattern
        // is the right idiom there — this guard prevents the bubble from
        // accidentally taking over every Reggae harmony route.
        const ts = { beats: 4, stepsPerBeat: 4 };
        const pattern = generateHarmonyCompingPattern('reggae', 12345, ts);
        // Falls into the else branch — backbeats present.
        expect(pattern[4]).toBe(1);
        expect(pattern[12]).toBe(1);
        // Bubble slots should be 0 (or 4 for the optional ghost on step 6).
        expect(pattern[2]).toBe(0);
        expect(pattern[10]).toBe(0);
        expect(pattern[14]).toBe(0);
    });

    it('should pass an authenticity critique for a 128-bar Reggae organ-bubble performance', () => {
        const chordC = { rootMidi: 60, quality: 'm', intervals: [0, 3, 7], sectionId: 'A' };
        const totalMeasures = 128;
        const totalSteps = totalMeasures * 16;

        let bubbleHits = 0;
        let skankHits = 0;
        let otherHits = 0;
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
                // soloistResting/soloistNotesInPhrase from coordination (S4).
                { soloistResting: true, soloistNotesInPhrase: 0 },
            );

            if (notes.length > 0) {
                totalStabs++;
                if (BUBBLE_STEPS.includes(stepInTwoBars)) {
                    bubbleHits++;
                } else if (SKANK_STEPS.includes(stepInTwoBars)) {
                    skankHits++;
                } else {
                    otherHits++;
                }
            }
        }

        const bubbleScore = bubbleHits / totalStabs;
        const skankRate = skankHits / (totalMeasures * 2); // 2 skank backbeats per bar
        const bubbleDensity = bubbleHits / totalMeasures;

        console.log(
            '\n--- REGGAE HARMONY ORGAN-BUBBLE CRITIQUE REPORT ---\n' +
                `[Bubble Hit Share]      ${(bubbleScore * 100).toFixed(1)}% (Target: 100%)\n` +
                `[Skank Bleed]           ${(skankRate * 100).toFixed(1)}% (Target: 0%)\n` +
                `[Bubble Density]        ${bubbleDensity.toFixed(2)} hits/bar (Target: > 3.5 hits/bar)\n` +
                '----------------------------------------------------\n',
        );

        // The bubble is the DOMINANT lane — every harmony attack should
        // be a bubble offbeat.
        expect(bubbleScore).toBe(1.0);
        // Zero skank bleed — the chord channel handles those beats.
        expect(skankRate).toBe(0);
        expect(otherHits).toBe(0);
        // Bubble density guards against a near-empty pattern retaining perfect
        // positional precision. Steady state is ~4 hits/bar; 3.5 leaves room for
        // coordination yields while retaining the stricter former integration guard.
        expect(bubbleDensity).toBeGreaterThan(3.5);
    });
});
