// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearHarmonyMemory, getHarmonyNotes } from '../../public/engine/harmonies.js';
import { getState } from '../../public/state.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

/**
 * S5 critique: the harmony layer's band-intensity policy must be:
 *   < 0.15            : silent (band is below ballad whisper).
 *   0.15..0.40 (excl) : sparse pad-mode swells only — one held tone per chord
 *                       change via playSeaMode, for ALL feels including Jazz.
 *   >= 0.40           : comp/sea split driven by configured rhythmic style.
 *
 * Acceptance criterion (docs/audit/epic-harmony-polish.md S5):
 * "ballad-intensity (0.18-0.22) jazz/blues plays sparse organ swells, or
 *  the silence is documented."
 *
 * We assert both halves: the documented mute floor (< 0.15) really is
 * silent, and the pad band (0.15..0.40) emits sparse output for Jazz and
 * Blues alike. The previous undocumented 0.22 floor would have killed all
 * three of 0.18/0.20/0.22 in Jazz and Blues; the previous `feel !== 'Jazz'`
 * pad-mode carve-out had Jazz comping (not swelling) at low intensity.
 */

function buildState(feel: string, bandIntensity: number) {
    return {
        playback: { bandIntensity, complexity: 0.5 },
        groove: {
            genreFeel: feel,
        },
        soloist: makeSoloistMock({ enabled: false, isResting: true, notesInPhrase: 0 }),
        harmony: { enabled: true, complexity: 0.5, lastMidis: [], rhythmicMask: 0, volume: 0.6 },
        arranger: { timeSignature: '4/4' },
    };
}

function runProgression(chordsList, barsPerChord = 1, style = 'smart') {
    const allNotes = [];
    const stepsPerBar = 16;
    let step = 0;
    for (let ci = 0; ci < chordsList.length; ci++) {
        const chord = chordsList[ci];
        for (let bar = 0; bar < barsPerChord; bar++) {
            for (let s = 0; s < stepsPerBar; s++) {
                const stepInChord = bar * stepsPerBar + s;
                const notes = getHarmonyNotes(
                    getState(),
                    chord,
                    chordsList[ci + 1] || null,
                    step,
                    64,
                    style,
                    stepInChord,
                    null,
                    { soloistResting: true, soloistNotesInPhrase: 0, step },
                );
                if (notes.length > 0) {
                    allNotes.push({ step, count: notes.length, notes });
                }
                step++;
            }
        }
    }
    return allNotes;
}

// Standard 4-chord ii-V-I-vi-ish progression that exercises Jazz comping
// behavior (would normally produce 4+ stabs/bar at higher intensity).
function fourChordProgression(sectionId: string) {
    return [
        { rootMidi: 62, quality: 'm7', intervals: [0, 3, 7, 10], sectionId },
        { rootMidi: 67, quality: '7', intervals: [0, 4, 7, 10], sectionId },
        { rootMidi: 60, quality: 'maj7', intervals: [0, 4, 7, 11], sectionId },
        { rootMidi: 57, quality: 'm7', intervals: [0, 3, 7, 10], sectionId },
    ];
}

describe('Harmony / low-intensity band policy (S5)', () => {
    let mockState;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('mutes below the documented floor of 0.15 (Jazz)', () => {
        mockState = buildState('Jazz', 0.1);
        clearHarmonyMemory(mockState);
        getState.mockReturnValue(mockState);

        const events = runProgression(fourChordProgression('mute-jazz'), 1, 'smart');

        // why: 0.10 < HARMONY_MUTE_FLOOR (0.15) — entire harmony layer is
        // silent. This is the documented behavior, NOT a regression.
        expect(events.length).toBe(0);
    });

    it('mutes below the documented floor of 0.15 (Blues)', () => {
        mockState = buildState('Blues', 0.1);
        clearHarmonyMemory(mockState);
        getState.mockReturnValue(mockState);

        const events = runProgression(fourChordProgression('mute-blues'), 1, 'smart');

        expect(events.length).toBe(0);
    });

    // Sweep the ballad-intensity band literally cited in the audit doc.
    for (const intensity of [0.18, 0.2, 0.22]) {
        for (const feel of ['Jazz', 'Blues']) {
            it(`plays sparse swells at ballad intensity ${intensity} (${feel})`, () => {
                mockState = buildState(feel, intensity);
                clearHarmonyMemory(mockState);
                getState.mockReturnValue(mockState);

                // Repeat the 4-chord progression twice = 8 bars of one-chord-
                // per-bar comping territory.
                const chords = [];
                for (let r = 0; r < 2; r++) {
                    chords.push(...fourChordProgression(`pad-${feel}-${intensity}`));
                }
                const events = runProgression(chords, 1, 'smart');
                const totalBars = chords.length;
                const attackEvents = events.length;
                const attacksPerBar = attackEvents / totalBars;

                // eslint-disable-next-line no-console
                console.log(
                    `\n--- HARMONY / LOW-INTENSITY (${feel} @ ${intensity}) ---\n` +
                        `[Attack events]    ${attackEvents} over ${totalBars} bars\n` +
                        `[Attacks/bar]      ${attacksPerBar.toFixed(2)} (Target: > 0, <= 1.5)\n` +
                        '-----------------------------------------------------\n',
                );

                // Acceptance, half 1: harmony is audible (not muted).
                expect(attackEvents).toBeGreaterThan(0);

                // Acceptance, half 2: output is sparse. playSeaMode emits at
                // most one event per chord-start (stepInChord === 0 or
                // measureStep === 0 — when chord-per-bar these coincide), so
                // a chord-per-bar progression yields ~1 attack/bar. Generous
                // ceiling of 1.5 leaves headroom for any future pad-mode
                // tweak that double-fires on a section boundary, while still
                // failing if Jazz reverts to per-step comping (which would
                // produce 4-8 attacks/bar).
                expect(attacksPerBar).toBeLessThanOrEqual(1.5);
            });
        }
    }

    it('Jazz emits more attacks at high intensity (0.9) than at ballad intensity (0.2)', () => {
        // Contrast guard: if a future change accidentally clamps Jazz to pad
        // mode at ALL intensities, this test catches it. At high intensity
        // the Jazz comp pattern fills multiple syncopation slots per bar,
        // producing markedly busier output than the sparse pad band.
        // Soloist is disabled in buildState() so both runs isolate the
        // dispatcher path — no shadow-mode reinforcements mixed in.
        mockState = buildState('Jazz', 0.9);
        clearHarmonyMemory(mockState);
        getState.mockReturnValue(mockState);
        const compChords = fourChordProgression('contrast-comp');
        const compRepeated = [];
        for (let r = 0; r < 2; r++) {
            compRepeated.push(...compChords);
        }
        const compEvents = runProgression(compRepeated, 1, 'smart').length;

        mockState = buildState('Jazz', 0.2);
        clearHarmonyMemory(mockState);
        getState.mockReturnValue(mockState);
        const padChords = fourChordProgression('contrast-pad');
        const padRepeated = [];
        for (let r = 0; r < 2; r++) {
            padRepeated.push(...padChords);
        }
        const padEvents = runProgression(padRepeated, 1, 'smart').length;

        // eslint-disable-next-line no-console
        console.log(
            '\n--- HARMONY / S5 INTENSITY CONTRAST (Jazz) ---\n' +
                `[Comp events @ 0.9]   ${compEvents}\n` +
                `[Pad events  @ 0.2]   ${padEvents}\n` +
                '----------------------------------------------\n',
        );

        // Strictly greater: comping at 0.9 hits many more pattern slots than
        // the sparse one-per-chord pad emissions at 0.2.
        expect(compEvents).toBeGreaterThan(padEvents);
    });
});
