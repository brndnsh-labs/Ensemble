// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getHarmonyNotes } from '../../public/engine/harmonies.js';
import { getState } from '../../public/state.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Harmony / Bass register-seam critique', () => {
    let mockState;

    beforeEach(() => {
        vi.clearAllMocks();
        mockState = {
            playback: { bandIntensity: 0.7, complexity: 0.6 },
            groove: {
                genreFeel: 'Jazz',
                pocket: {
                    globalDrive: 0,
                    tightness: 1,
                    bassGravity: 1,
                    chordGravity: 1,
                    soloistGravity: 1,
                },
            },
            soloist: makeSoloistMock({ enabled: false, isResting: true, notesInPhrase: 0 }),
            harmony: { enabled: true, complexity: 0.5, lastMidis: [], rhythmicMask: 0 },
            arranger: { timeSignature: '4/4' },
        };
        getState.mockReturnValue(mockState);
    });

    // why: harmonies.ts S2. Harmony slot starts at MIDI 52 (E3). When bass walks
    // high (e.g. MIDI 55 = G3), a harmony bottom voice at 52 produces an E3-G3
    // minor-third cluster sitting on top of the bass. The seam needs >= P5 (7
    // semitones) of separation. Test confirms the new floor enforces that.
    it('keeps every harmony bottom-voice at least a P5 above a high bass note', () => {
        const chord = { rootMidi: 60, quality: 'maj7', intervals: [0, 4, 7, 11], sectionId: 'A' };
        const totalSteps = 16 * 30; // 30 bars, > the 30-run reliability target
        let totalEvents = 0;
        let violations = 0;
        const bassMidiSweep = [50, 51, 52, 53, 54, 55, 56, 57]; // walking-high bass

        for (let i = 0; i < totalSteps; i++) {
            const stepInMeasure = i % 16;
            const bassMidi = bassMidiSweep[i % bassMidiSweep.length];
            const notes = getHarmonyNotes(
                getState(),
                chord,
                null,
                i,
                64,
                'smart',
                stepInMeasure,
                null,
                { bassMidi, soloistResting: true, soloistNotesInPhrase: 0 },
            );
            if (notes.length > 0) {
                totalEvents++;
                const lowest = notes.reduce(
                    (m, n) => (n.midi !== undefined && n.midi < m ? n.midi : m),
                    Number.POSITIVE_INFINITY,
                );
                if (lowest < bassMidi + 7) {
                    violations++;
                }
            }
        }

        console.log(
            '\n--- HARMONY / BASS SEAM CRITIQUE REPORT ---\n' +
                `[Events sampled]        ${totalEvents}\n` +
                `[Seam violations]       ${violations} (target: 0)\n` +
                `[Bass MIDI sweep]       ${bassMidiSweep[0]}-${bassMidiSweep[bassMidiSweep.length - 1]}\n` +
                '-------------------------------------------\n',
        );

        expect(totalEvents).toBeGreaterThan(0);
        expect(violations).toBe(0);
    });

    // why: regression — when bassMidi is 0 or undefined (bass silent, or producer
    // order has not yet fired) the legacy floor of 52 must still apply. Otherwise
    // bass-less playback regresses into sub-E3 territory.
    it('preserves the legacy MIDI-52 floor when bassMidi is absent', () => {
        const chord = { rootMidi: 60, quality: 'maj7', intervals: [0, 4, 7, 11], sectionId: 'A' };
        let belowFloor = 0;

        for (let i = 0; i < 16 * 16; i++) {
            const notes = getHarmonyNotes(
                getState(),
                chord,
                null,
                i,
                64,
                'smart',
                i % 16,
                null,
                { soloistResting: true, soloistNotesInPhrase: 0 }, // no bassMidi
            );
            for (const n of notes) {
                if (n.midi !== undefined && n.midi < 52) {
                    belowFloor++;
                }
            }
        }

        expect(belowFloor).toBe(0);
    });
});
