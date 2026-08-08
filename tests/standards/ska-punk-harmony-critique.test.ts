// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { generateHarmonyCompingPattern, getHarmonyNotes } from '../../public/engine/harmonies.js';
import { getState } from '../../public/state.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

/**
 * Ska harmony critique (#562).
 *
 * Before #562, Ska harmony fell through to the Reggae/Ska backbeat skank —
 * stabs on beats 2 & 4 (steps 4, 12, 20, 28), which read as the OPPOSITE of the
 * ska skank — while the genuinely-ska offbeat pattern lived in a dead
 * `feel === 'Ska-Punk'` branch (production genreFeel is 'Ska', so it never ran).
 *
 * The chord channel (the `genre === 'Ska'` branch in `generateCompingPattern`,
 * accompaniment.ts) already chops every offbeat upstroke, so the horn-section
 * harmony layer punctuates SPARSELY above it:
 * stabs on the &-of-2 and &-of-4 (steps 6, 14 per bar) — locking with the chop
 * without doubling the full chop into mud. This test pins that placement.
 */
describe('Ska Harmony Critique', () => {
    let mockState;

    beforeEach(() => {
        vi.clearAllMocks();
        mockState = {
            playback: { bandIntensity: 0.6, complexity: 0.5 },
            groove: {
                genreFeel: 'Ska',
            },
            soloist: makeSoloistMock({ enabled: true, isResting: true, notesInPhrase: 0 }),
            harmony: { enabled: true, complexity: 0.5, lastMidis: [], rhythmicMask: 0 },
            arranger: { timeSignature: '4/4' },
        };
        getState.mockReturnValue(mockState);
    });

    // Sparse ska horn stabs: &-of-2 and &-of-4 of each bar (within a 2-bar period).
    const SKA_STAB_STEPS = [6, 14, 22, 30];
    // Beats 1–4 of each bar (the former backbeat lived at 4/12/20/28).
    const DOWNBEAT_STEPS = [0, 4, 8, 12, 16, 20, 24, 28];

    it('generateHarmonyCompingPattern: ska key places stabs on the offbeats of 2 & 4, not the beat', () => {
        const ts = TIME_SIGNATURES['4/4'];
        // Deterministic regardless of seed (no pseudoRandom branch in the ska key).
        for (let s = 0; s < 30; s++) {
            const pattern = generateHarmonyCompingPattern('ska', s * 7919 + 1, ts);
            expect(pattern.length).toBe(32);
            for (const step of SKA_STAB_STEPS) {
                expect(pattern[step]).toBeGreaterThan(0);
            }
            for (const step of DOWNBEAT_STEPS) {
                expect(pattern[step]).toBe(0);
            }
        }
    });

    it('should pass an authenticity critique for a 128-bar Ska harmony performance', () => {
        const chordC = { rootMidi: 60, quality: '', intervals: [0, 4, 7], sectionId: 'A' };
        const totalMeasures = 128;
        const totalSteps = totalMeasures * 16;

        let offbeatHits = 0;
        let downbeatHits = 0;
        let otherHits = 0;
        let totalStabs = 0;
        let maxDuration = 0;

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
                { soloistResting: true, soloistNotesInPhrase: 0 },
            );

            if (notes.length > 0) {
                totalStabs++;
                maxDuration = Math.max(maxDuration, ...notes.map((n) => n.durationSteps));
                if (SKA_STAB_STEPS.includes(stepInTwoBars)) {
                    offbeatHits++;
                } else if (DOWNBEAT_STEPS.includes(stepInTwoBars)) {
                    downbeatHits++;
                } else {
                    otherHits++;
                }
            }
        }

        const offbeatScore = offbeatHits / totalStabs;
        const offbeatDensity = offbeatHits / totalMeasures;

        console.log(
            '\n--- SKA HARMONY CRITIQUE REPORT ---\n' +
                `[Offbeat Hit Share]   ${(offbeatScore * 100).toFixed(1)}% (Target: 100%)\n` +
                `[Downbeat Bleed]      ${downbeatHits} hits (Target: 0)\n` +
                `[Offbeat Density]     ${offbeatDensity.toFixed(2)} hits/bar (Target: ~2)\n` +
                `[Max Stab Duration]   ${maxDuration} steps (Target: short stab)\n` +
                '------------------------------------\n',
        );

        // Every harmony attack lands on a ska offbeat — never the downbeat.
        expect(offbeatScore).toBe(1.0);
        expect(downbeatHits).toBe(0);
        expect(otherHits).toBe(0);
        // Two stabs per bar (&-of-2, &-of-4), minus coordination yields.
        expect(offbeatDensity).toBeGreaterThan(1.0);
        // Stabs, not pads — short durations (≤ one beat).
        expect(maxDuration).toBeLessThanOrEqual(4);
    });
});
