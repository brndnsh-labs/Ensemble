// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getHarmonyNotes } from '../../public/engine/harmonies.js';
import { getState } from '../../public/state.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

/**
 * Country harmony critique (#560).
 *
 * The audit premise ("Country plays 1&3 stabs, missing pedal-steel pads") was
 * stale: Country harmony already routes to strings → pads → Sea mode, so it
 * plays a SUSTAINED pad, not stabs. The real gap was pedal-steel CHARACTER —
 * the steel's signature added major 6th (an add6 / 6-9 color). Major chords now
 * voice root–3rd–6th. This test pins both: (1) the pad is sustained (premise
 * correction), and (2) the major-6th color is present. The slow volume-pedal
 * swell envelope is a synth-track follow-up, not asserted here.
 */
describe('Country Harmony Critique', () => {
    let mockState;

    // I–IV–V major progression (all major triads → all get the 6th color).
    const PROG = [
        { rootMidi: 60, quality: '', intervals: [0, 4, 7], sectionId: 'A', beats: 4 },
        { rootMidi: 65, quality: '', intervals: [0, 4, 7], sectionId: 'A', beats: 4 },
        { rootMidi: 67, quality: '', intervals: [0, 4, 7], sectionId: 'A', beats: 4 },
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        mockState = {
            playback: { bandIntensity: 0.5, complexity: 0.5 },
            groove: {
                genreFeel: 'Country',
            },
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

    function runProgression(bars) {
        const emissions = [];
        for (let bar = 0; bar < bars; bar++) {
            const chord = PROG[bar % PROG.length];
            for (let s = 0; s < 16; s++) {
                const step = bar * 16 + s;
                const notes = getHarmonyNotes(getState(), chord, null, step, 64, 'smart', s, null, {
                    soloistResting: true,
                    soloistNotesInPhrase: 0,
                });
                if (notes.length > 0) {
                    emissions.push({
                        step,
                        s,
                        midis: notes.map((n) => n.midi),
                        dur: notes[0].durationSteps,
                        rootPc: chord.rootMidi % 12,
                    });
                }
            }
        }
        return emissions;
    }

    it('plays sustained pads, not 1&3 stabs (premise correction)', () => {
        const emissions = runProgression(64);
        // Sea-mode pads emit at bar downbeats with a long (multi-beat) duration —
        // never the short on-beat stabs the audit text claimed.
        expect(emissions.length).toBeGreaterThan(0);
        for (const e of emissions) {
            expect(e.s).toBe(0); // downbeat only (pad), not 1&3 comping
            expect(e.dur).toBeGreaterThanOrEqual(8); // half-bar+ sustain, a pad
        }
    });

    it('voices the pedal-steel major-6th color on major chords', () => {
        const emissions = runProgression(96);

        let withSixth = 0;
        for (const e of emissions) {
            const pcs = new Set(e.midis.map((m) => ((m % 12) + 12) % 12));
            const sixthPc = (e.rootPc + 9) % 12; // major 6th above the root
            if (pcs.has(sixthPc)) {
                withSixth++;
            }
        }
        const sixthShare = withSixth / emissions.length;

        console.log(
            '\n--- COUNTRY HARMONY CRITIQUE REPORT ---\n' +
                `[Emissions]          ${emissions.length}\n` +
                `[Major-6th Color]    ${(sixthShare * 100).toFixed(1)}% (Target: ~100%)\n` +
                '---------------------------------------\n',
        );

        // Every major-chord pad carries the pedal-steel 6th.
        expect(sixthShare).toBeGreaterThan(0.95);
    });
});
