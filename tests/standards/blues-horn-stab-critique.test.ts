// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getHarmonyNotes } from '../../public/engine/harmonies.js';
import { getState } from '../../public/state.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

/**
 * Blues horn-section stab-voicing critique (#935).
 *
 * #716 gave the Blues horn section its RHYTHM — sparse call-and-response stabs
 * that answer in the gaps. This guards the VOICING added in #935: those stabs
 * must read as a tight, quality-honest 3-note brass punch, not the generic
 * running chord voicing. The horn stab (applyGenreVoicingOverride, hornSection
 * branch) is a compact shell led by the guide tones:
 *   - dominant  → root–3rd–♭7  ([0,4,10]) — the 3↔♭7 tritone is the snarl
 *   - minor     → root–♭3–♭7   ([0,3,10])
 *   - major     → root–3rd–5th ([0,4,7]) — a bright fanfare
 *
 * The three claims that make it a "stab" and not a pad:
 *   1. TIGHT   — at most 3 distinct pitch classes per hit.
 *   2. SHELL   — only chord-defining tones (root/3rd/5th/♭7/maj7), never a
 *                9th/11th/13th color extension that would fatten it into a pad.
 *   3. BITE    — over a dominant blues progression, the 3↔♭7 tritone is present
 *                in the strong majority of hits (the horn snarl).
 */
describe('Blues Horn-Stab Voicing Critique (#935)', () => {
    let mockState;

    // A dominant-7 blues I–IV–V (in A): every chord is a dominant seventh, so the
    // horn stab should snarl the 3↔♭7 tritone on essentially every hit.
    const A7 = { rootMidi: 57, quality: '7', intervals: [0, 4, 7, 10], sectionId: 'A', beats: 4 };
    const D7 = { rootMidi: 62, quality: '7', intervals: [0, 4, 7, 10], sectionId: 'A', beats: 4 };
    const E7 = { rootMidi: 64, quality: '7', intervals: [0, 4, 7, 10], sectionId: 'A', beats: 4 };
    const PROG = [A7, D7, E7];

    beforeEach(() => {
        vi.clearAllMocks();
        mockState = {
            playback: { bandIntensity: 0.6, complexity: 0.5 },
            groove: {
                genreFeel: 'Blues',
            },
            // Soloist resting so the call-and-response horns actually answer (#716).
            soloist: makeSoloistMock({ enabled: true, isResting: true, notesInPhrase: 0 }),
            harmony: {
                enabled: true,
                complexity: 0.5,
                volume: 0.6,
                lastMidis: [],
                rhythmicMask: 0,
            },
            arranger: { timeSignature: '4/4' },
        };
        getState.mockReturnValue(mockState);
    });

    // Distinct pitch classes relative to the chord root (octave-agnostic).
    const relPcs = (midis, rootMidi) => midis.map((m) => (((m - rootMidi) % 12) + 12) % 12);

    function runProgression(bars, intensity, prog = PROG) {
        mockState.playback.bandIntensity = intensity;
        const emissions = [];
        for (let bar = 0; bar < bars; bar++) {
            const chord = prog[bar % prog.length];
            for (let s = 0; s < 16; s++) {
                const step = bar * 16 + s;
                const notes = getHarmonyNotes(getState(), chord, null, step, 64, 'smart', s, null, {
                    soloistResting: true,
                    soloistNotesInPhrase: 0,
                });
                if (notes.length > 0) {
                    emissions.push({ midis: notes.map((n) => n.midi), rootMidi: chord.rootMidi });
                }
            }
        }
        return emissions;
    }

    const SHELL_TONES = new Set([0, 3, 4, 7, 10, 11]); // root, ♭3, 3, 5, ♭7, maj7

    for (const intensity of [0.5, 0.75]) {
        it(`voices a tight guide-tone shell stab (≤3 pcs, no color extensions) at intensity ${intensity}`, () => {
            const emissions = runProgression(48, intensity);
            expect(emissions.length).toBeGreaterThan(0);

            let tight = 0;
            let shell = 0;
            let tritone = 0;
            for (const { midis, rootMidi } of emissions) {
                const pcs = relPcs(midis, rootMidi);
                const distinct = new Set(pcs);
                if (distinct.size <= 3) {
                    tight++;
                }
                if ([...distinct].every((pc) => SHELL_TONES.has(pc))) {
                    shell++;
                }
                if (distinct.has(4) && distinct.has(10)) {
                    tritone++;
                }
            }

            const tightShare = tight / emissions.length;
            const shellShare = shell / emissions.length;
            const tritoneShare = tritone / emissions.length;

            console.log(
                `\n--- BLUES HORN-STAB CRITIQUE REPORT (intensity ${intensity}) ---\n` +
                    `[Emissions]     ${emissions.length}\n` +
                    `[Tight ≤3pc]    ${(tightShare * 100).toFixed(1)}% (Target: 100%)\n` +
                    `[Shell-only]    ${(shellShare * 100).toFixed(1)}% (Target: 100%)\n` +
                    `[3↔♭7 tritone]  ${(tritoneShare * 100).toFixed(1)}% (Target: ≥80%)\n` +
                    '-------------------------------------------------------\n',
            );

            // A stab, not a pad: at most a 3-note shell, chord-tones only.
            // (Prospective regression guards — the baseline horn voicing is
            // already tight+shell, so these catch a FUTURE fattening, e.g. a
            // 9th added or a 4-note pad. The tritone below is the #935
            // differentiator: it goes 100%→0% if the hornSection branch reverts.)
            expect(tightShare).toBe(1.0);
            expect(shellShare).toBe(1.0);
            // The dominant snarl: the 3↔♭7 tritone carries the vast majority of hits.
            expect(tritoneShare).toBeGreaterThanOrEqual(0.8);
        });
    }

    it('voices the ♭3 shell on a minor chord (guards the minor branch)', () => {
        // Coverage for the [3,10,0] / [3,7,0] branch — the dominant-only PROG above
        // never exercises it, so a regression flipping the minor stab to a major 3rd
        // would otherwise sail through. A minor-blues i–iv (Am7–Dm7) at a mid
        // intensity: every hit must carry the ♭3 (pc 3) and never a major 3rd (pc 4).
        const Am7 = {
            rootMidi: 57,
            quality: 'm7',
            intervals: [0, 3, 7, 10],
            sectionId: 'A',
            beats: 4,
        };
        const Dm7 = {
            rootMidi: 62,
            quality: 'm7',
            intervals: [0, 3, 7, 10],
            sectionId: 'A',
            beats: 4,
        };
        const emissions = runProgression(48, 0.6, [Am7, Dm7]);
        expect(emissions.length).toBeGreaterThan(0);

        let flatThird = 0;
        let majThird = 0;
        for (const { midis, rootMidi } of emissions) {
            const distinct = new Set(relPcs(midis, rootMidi));
            if (distinct.has(3)) {
                flatThird++;
            }
            if (distinct.has(4)) {
                majThird++;
            }
        }
        const flatThirdShare = flatThird / emissions.length;
        console.log(
            `\n--- BLUES HORN-STAB MINOR-BRANCH REPORT ---\n` +
                `[Emissions]     ${emissions.length}\n` +
                `[♭3 present]    ${(flatThirdShare * 100).toFixed(1)}% (Target: ≥80%)\n` +
                `[Major 3rd]     ${majThird} hits (Target: 0)\n` +
                '-------------------------------------------------------\n',
        );
        // The minor shell leads with the ♭3; a major 3rd must never appear.
        expect(flatThirdShare).toBeGreaterThanOrEqual(0.8);
        expect(majThird).toBe(0);
    });
});
