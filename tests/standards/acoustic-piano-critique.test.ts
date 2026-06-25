// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAccompanimentNotes } from '../../public/engine/accompaniment.js';
import { getIntervals } from '../../public/engine/chords-styles.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

// Real 4/4 step metadata so the engine sees isGroupStart/isStructural on the
// One (a bare `{ isBeatStart }` left isStructural false on every step, hiding
// the structural-downbeat voicing the arp emits).
const TS_4_4 = { beats: 4, stepsPerBeat: 4, grouping: [4], backbeat: [1, 3] };

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

// Mock state
vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Acoustic Piano Critique', () => {
    let mockState;

    beforeEach(() => {
        vi.clearAllMocks();
        mockState = {
            playback: { bandIntensity: 0.3, complexity: 0.5, step: 0, intent: {} },
            groove: { genreFeel: 'Acoustic', pocket: 0, instruments: [] },
            soloist: makeSoloistMock({ enabled: true, busySteps: 0, lastFreq: 0 }),
            bass: { enabled: true, lastFreq: 110 },
            harmony: { enabled: false },
            chords: { enabled: true, style: 'arp', density: 'balanced' },
            arranger: { timeSignature: '4/4', totalSteps: 1000, progression: [] },
        };
        getState.mockReturnValue(mockState);
    });

    it('should pass an authenticity critique for a 128-bar Acoustic performance (Low Intensity)', () => {
        const chordC = {
            rootMidi: 60,
            quality: 'major',
            intervals: [0, 4, 7],
            freqs: [261.63, 329.63, 392.0],
            sectionId: 'A',
            beats: 4, // a full-bar chord — the arp rings toward this boundary
        };
        mockState.arranger.progression = [chordC];
        const totalMeasures = 128;
        const totalSteps = totalMeasures * 16;

        let singleNoteHits = 0;
        let totalActiveSteps = 0;
        let downbeatRing = 0; // durationSteps of the first pluck in a bar
        let downbeatNotes = []; // the "One" pluck shape (doubled-root foundation)

        for (let i = 0; i < totalSteps; i++) {
            mockState.playback.step = i;
            const stepInMeasure = i % 16;
            const notes = getAccompanimentNotes(
                getState(),
                chordC,
                i,
                stepInMeasure,
                stepInMeasure,
                getStepInfo(i, TS_4_4),
                {},
            );

            if (notes.length > 0 && notes[0].midi > 0) {
                totalActiveSteps++;
                if (notes.length <= 2) {
                    singleNoteHits++;
                }
                if (stepInMeasure === 0) {
                    downbeatRing = notes[0].durationSteps;
                    downbeatNotes = notes;
                }
            }
        }

        const fingerpickScore = singleNoteHits / totalActiveSteps;

        console.log(
            '\n--- ACOUSTIC PIANO CRITIQUE REPORT ---\n' +
                `[Fingerpicking Accuracy] ${(fingerpickScore * 100).toFixed(1)}%\n` +
                `[Rhythmic Density]       ${(totalActiveSteps / totalMeasures).toFixed(2)} hits/bar\n` +
                `[Downbeat Pluck Ring]    ${downbeatRing.toFixed(1)} steps (>4 = sustains past 1 beat)\n` +
                `[Downbeat Pluck]         ${downbeatNotes.length} notes @ pc {${downbeatNotes
                    .map((n) => ((n.midi % 12) + 12) % 12)
                    .join(', ')}} (doubled root)\n` +
                '------------------------------------\n',
        );

        expect(fingerpickScore).toBeGreaterThan(0.9);
        expect(totalActiveSteps / totalMeasures).toBeGreaterThanOrEqual(4.0);
        // Sustain-pedal ring: the downbeat pluck must hold well past its own beat
        // (toward the chord boundary), not the old dry 1-beat (4-step) cutoff.
        expect(downbeatRing).toBeGreaterThan(4);
        // The "One" foundation: the arp doubles the root on the downbeat (pattern
        // note + pushed root), so the One is a 2-note pluck, both the chord root.
        expect(downbeatNotes.length).toBe(2);
        expect(downbeatNotes.every((n) => ((n.midi % 12) + 12) % 12 === 0)).toBe(true);
    });

    describe('Color tones at moderate intensity (chords.md P1 #11 / S6c)', () => {
        // why: a plain major triad at mid intensity in Acoustic must carry an
        //      add9 color — the genre's sound lives in the color tones, and a
        //      comper reaches for them without needing the part to be loud.
        //      Color extension happens in `getIntervals` at parse time.
        const intervalsAt = (intensity, genre = 'Acoustic') =>
            getIntervals(
                { playback: { bandIntensity: intensity } },
                'major',
                false,
                'balanced',
                genre,
            );

        it('adds the 9 to an Acoustic major triad at moderate intensity (0.5)', () => {
            const ints = intervalsAt(0.5);
            console.log(`\n[Acoustic major @0.5] intervals=${JSON.stringify(ints)}\n`);
            // why: the add9 color (interval 14) must be present; the bare
            //      [0,4,7] triad is the bug being fixed.
            expect(ints).toContain(14);
        });

        it('keeps a low-dynamic Acoustic major triad bare (0.2)', () => {
            // why: below the 0.35 reach floor the part is soft enough that a
            //      plain triad is the intended sound — color must NOT appear.
            const ints = intervalsAt(0.2);
            expect(ints).not.toContain(14);
        });

        it('does not add the moderate-intensity color to Rock major triads', () => {
            // why: Rock wants power-triad clarity; the moderate-color reach is
            //      gated to color-friendly genres only.
            const ints = intervalsAt(0.5, 'Rock');
            // Rock at 0.5 uses the spread-10th voicing [0,7,16,19] — no 9 (14).
            expect(ints).not.toContain(14);
        });
    });
});
