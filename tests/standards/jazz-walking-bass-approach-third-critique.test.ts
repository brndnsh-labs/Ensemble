// @ts-nocheck
/**
 * Jazz compound-meter walking-bass APPROACH-SLOT chord tone (#1333).
 *
 * The approach slot (mStep 2/8 in 6/8, and the same mid-group slots in 12/8) fires at
 * intensity > 0.7 and picks a chord tone — "the 3rd or the 5th" — to voice-lead into the
 * pickup. It decided the 3rd with a bare `quality.startsWith('m')`, missing the
 * `&& !startsWith('maj')` guard every other site in the codebase pairs with it, so
 * 'major', 'maj7', 'maj9', 'maj11', 'maj13' and 'maj7#11' all read as MINOR: the line
 * played an Eb under a Cmaj7 and an Ab under an F, in the one slot whose own comment
 * picks the 3rd *because* it carries the chord's major/minor identity. The same
 * expression assumed a 3rd exists at all — a suspension got the major 3rd it exists to
 * replace, and a power chord got one from nowhere.
 *
 * The slot now derives its tones from `chordTargetTones` (`soloist-pitch-engine.ts`), the
 * one table that knows what a written quality's functional tones are.
 *
 * Assertions, over `Cmaj7 | F | Dm7 | G7sus4` in 6/8 and 12/8 at intensity 0.9:
 *   (a) no approach-slot note is a minor 3rd over a major-family chord (never Eb on
 *       Cmaj7, never Ab on F);
 *   (b) no approach-slot note is a major 3rd over the suspension (never B on G7sus4);
 *   (c) the minor chord still gets its b3 (F over Dm7 is reachable);
 *   (d) every approach-slot note is a real tone of the written chord.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { getBassNote, isBassActive } from '../../public/engine/bass-engine.js';
import { getState } from '../../public/state.js';
import { getFrequency, getMidi, getStepInfo } from '../../public/utils.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

// Canonical parser qualities (`getChordDetails` emits 'minor', never 'm7'), so the fixture
// exercises the same strings production hands the bass.
const PROGRESSION = [
    { rootMidi: 60, quality: 'maj7', intervals: [0, 4, 7, 11], label: 'Cmaj7' },
    { rootMidi: 65, quality: 'major', intervals: [0, 4, 7], label: 'F' },
    { rootMidi: 62, quality: 'minor', intervals: [0, 3, 7, 10], label: 'Dm7' },
    { rootMidi: 67, quality: '7sus4', intervals: [0, 5, 7, 10], label: 'G7sus4' },
];

// The degrees each written chord actually contains, for the "is this even a chord tone"
// assertion. Root-relative pitch classes.
const CHORD_DEGREES = {
    Cmaj7: [0, 4, 7, 11],
    F: [0, 4, 7],
    Dm7: [0, 3, 7, 10],
    G7sus4: [0, 5, 7, 10],
};

function buildJazzState(meter, intensity, loopCount, stepsPerBar) {
    return {
        playback: {
            bandIntensity: intensity,
            bpm: 120,
            complexity: 0.5,
            currentLoopCount: loopCount,
            songMode: false,
        },
        groove: { genreFeel: 'Jazz', lastDrumPreset: 'Jazz', instruments: [], pocket: 0 },
        soloist: makeSoloistMock({ enabled: false, busySteps: 0, tension: 0 }),
        arranger: {
            timeSignature: meter,
            totalSteps: stepsPerBar * PROGRESSION.length,
            stepMap: [],
        },
    };
}

/** Every onset the walking engine emits over `numLoops` passes, tagged with its slot. */
function walk(meter, numLoops = 12, intensity = 0.9) {
    const ts = TIME_SIGNATURES[meter];
    const stepsPerBar = ts.beats * ts.stepsPerBeat;
    const groupSteps = ts.grouping[0] * ts.stepsPerBeat; // 6 in 6/8, 6 in 12/8
    const onsets = [];

    for (let loop = 0; loop < numLoops; loop++) {
        const state = buildJazzState(meter, intensity, loop, stepsPerBar);
        getState.mockReturnValue(state);
        state.arranger.stepMap = PROGRESSION.map((chord, bar) => ({
            start: bar * stepsPerBar,
            end: (bar + 1) * stepsPerBar,
            chord,
            ts: meter,
        }));

        let lastMidi = null;
        for (let step = 0; step < stepsPerBar * PROGRESSION.length; step++) {
            const mStep = step % stepsPerBar;
            const bar = Math.floor(step / stepsPerBar);
            const chord = PROGRESSION[bar];
            const nextChord = PROGRESSION[(bar + 1) % PROGRESSION.length];
            const info = getStepInfo(step, ts, state.arranger.stepMap, TIME_SIGNATURES);
            if (!isBassActive(getState(), 'quarter', step, mStep, info, {})) {
                continue;
            }
            const note = getBassNote(
                getState(),
                chord,
                nextChord,
                info.beatIndex,
                lastMidi ? getFrequency(lastMidi) : 0,
                36,
                'quarter',
                bar,
                step,
                mStep,
                {},
                info,
            );
            if (!note || note.muted) {
                continue;
            }
            const midi = note.midi ?? getMidi(note.frequency);
            onsets.push({
                chord,
                mStep,
                midi,
                degree: (((midi - chord.rootMidi) % 12) + 12) % 12,
                // The approach slot is the middle of each eighth-group: mStep 2 of 6.
                isApproach: mStep % groupSteps === 2,
            });
            lastMidi = midi;
        }
    }
    return onsets;
}

describe.each(['6/8', '12/8'])('Jazz walking bass in %s — approach-slot chord tone', (meter) => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('never plays a minor 3rd over a major-family chord, nor a 3rd over the suspension', () => {
        const approaches = walk(meter).filter((onset) => onset.isApproach);
        // Guard the guard: the slot has to actually fire, or every assertion below is vacuous.
        expect(approaches.length, 'approach slot never fired').toBeGreaterThan(0);

        for (const { chord, degree, midi } of approaches) {
            const where = `${meter} ${chord.label} approach note ${midi} (degree ${degree})`;
            expect(CHORD_DEGREES[chord.label], `${where} is not a tone of the chord`).toContain(
                degree,
            );
            if (chord.quality === 'maj7' || chord.quality === 'major') {
                expect(degree, `${where}: minor 3rd over a major chord`).not.toBe(3);
            }
            if (chord.quality === '7sus4') {
                expect(degree, `${where}: major 3rd cancels the suspension`).not.toBe(4);
            }
        }
    });

    it('still reaches the b3 on the minor chord', () => {
        const minorApproaches = walk(meter)
            .filter((onset) => onset.isApproach && onset.chord.quality === 'minor')
            .map((onset) => onset.degree);
        expect(minorApproaches.length, 'no approach note on the minor chord').toBeGreaterThan(0);
        expect(minorApproaches, 'the minor 3rd is still a target').toContain(3);
    });
});
