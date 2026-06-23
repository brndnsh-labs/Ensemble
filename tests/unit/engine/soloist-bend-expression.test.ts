// @ts-nocheck
// #744 Slice 2 — blues bend-and-release gesture source. Verifies the soloist
// pitch engine stamps `expression.bend` on sustained BLUES notes (deterministic,
// genre-gated) and never on other styles. Renderer behavior is covered in
// sample-voice.test.ts; this guards the *generation* side.
import { describe, expect, it, vi } from 'vitest';
import { getSoloistNote } from '../../../public/engine/soloist.js';
import { getState } from '../../../public/state.js';

const { makeSoloistMock } = await vi.hoisted(
    async () => await import('../../utils/mock-soloist.js'),
);

vi.mock('../../../public/state.js', () => ({ getState: vi.fn() }));
vi.mock('../../../public/config.js', () => ({
    TIME_SIGNATURES: { '4/4': { beats: 4, stepsPerBeat: 4 } },
    KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
}));

const C7 = { rootMidi: 60, quality: '7', intervals: [0, 4, 7, 10], beats: 4 };

function makeState(mode = 'guitar', intensity = 0.8) {
    return {
        playback: {
            bandIntensity: intensity,
            bpm: 100,
            sessionTimer: 0,
            intent: {},
            complexity: 0.5,
            currentLoopCount: 2,
        },
        groove: { genreFeel: 'Blues', pocket: 0 },
        soloist: makeSoloistMock({
            mode,
            srdcState: 'Statement',
            qaState: 'Question',
            isResting: false,
            isPhraseActive: true,
            lastAttackStep: -100,
            currentPhraseSteps: 0,
            notesInPhrase: 0,
            deviceBuffer: [],
            motifBuffer: [],
            busySteps: 0,
            pitchHistory: [],
        }),
        harmony: { enabled: false },
        arranger: { timeSignature: '4/4' },
    };
}

// Sweep many steps, returning every emitted note.
function sweep(state, style, steps = 600) {
    getState.mockReturnValue(state);
    const out = [];
    for (let s = 0; s < steps; s++) {
        state.soloist.session.rhythm.deviceBuffer = [];
        state.soloist.session.phrasing.busySteps = 0;
        state.soloist.session.phrasing.isResting = false;
        const r = getSoloistNote(state, C7, null, s, 60, 4, style, 0, { bypassRhythm: true });
        const notes = Array.isArray(r) ? r : r ? [r] : [];
        out.push(...notes);
    }
    return out;
}

// Bend fraction (bent / sustained) and whole-step share for a sweep.
function bendStats(mode, intensity) {
    const notes = sweep(makeState(mode, intensity), 'blues');
    const long = notes.filter((n) => (n.durationSteps || 0) >= 4);
    const bends = notes.filter((n) => n.expression?.bend).map((n) => n.expression.bend);
    const wholes = bends.filter((b) => b.peakSemitones === 2).length;
    return { long: long.length, bent: bends.length, wholes, bends };
}

describe('soloist bend-and-release gesture (#744 Slice 2)', () => {
    it('guitar leads bend often and wide (whole-step staple)', () => {
        const { long, bent, wholes } = bendStats('guitar', 0.8);
        expect(long).toBeGreaterThan(30);
        expect(bent).toBeGreaterThan(10); // string bends are central to blues guitar
        expect(bent).toBeLessThan(long); // still a flourish, not every note
        expect(wholes).toBeGreaterThan(bent / 2); // whole-step is the staple
    });

    it('horn/mono leads bend sparingly and gentler (half-step lean)', () => {
        // Idiom: a horn inflects with scoops + vibrato, not constant string bends.
        const guitar = bendStats('guitar', 0.8);
        const mono = bendStats('mono', 0.8);
        // Far sparser than guitar at the same intensity (rate, not raw count).
        expect(mono.bent / mono.long).toBeLessThan(guitar.bent / guitar.long);
        expect(mono.bent).toBeGreaterThan(0); // still cries occasionally
        // And when it does bend, it leans to the gentle half-step.
        expect(mono.wholes).toBeLessThan(mono.bent / 2);
    });

    it('only ever bends sustained notes', () => {
        // Gated to durationSteps >= 4 at the picker. (A small quarter-tone scoop
        // from a buffered turnaround embellishment can rarely co-occur on the same
        // note; the renderer composes scoop-in + bend-and-release coherently, so we
        // don't forbid it — we just guard the bend lands on sustained notes.)
        for (const mode of ['guitar', 'mono']) {
            const notes = sweep(makeState(mode, 0.8), 'blues');
            for (const n of notes.filter((x) => x.expression?.bend)) {
                expect(n.durationSteps).toBeGreaterThanOrEqual(4);
            }
        }
    });

    it('produces a musically-shaped gesture (up-bend, ordered fractions)', () => {
        const bends = [...bendStats('guitar', 0.8).bends, ...bendStats('mono', 1.0).bends];
        expect(bends.length).toBeGreaterThan(0);
        for (const b of bends) {
            expect([1, 2]).toContain(b.peakSemitones); // ½ or whole step up
            expect(b.onsetFrac).toBeGreaterThan(0);
            expect(b.peakFrac).toBeGreaterThan(b.onsetFrac); // peak after onset
            expect(b.releaseFrac).toBeGreaterThan(b.peakFrac); // release after peak
            expect(b.releaseFrac).toBeLessThanOrEqual(0.85);
        }
    });

    it('never bends non-blues styles (genre gating)', () => {
        for (const style of ['jazz', 'rock', 'scalar']) {
            const bent = sweep(makeState('guitar', 0.8), style).filter((n) => n.expression?.bend);
            expect(bent.length).toBe(0);
        }
    });

    it('is deterministic — identical sweeps yield identical bends', () => {
        const a = sweep(makeState('guitar'), 'blues').map((n) =>
            JSON.stringify(n.expression ?? null),
        );
        const b = sweep(makeState('guitar'), 'blues').map((n) =>
            JSON.stringify(n.expression ?? null),
        );
        expect(a).toEqual(b);
    });

    it('bends more often at higher band intensity (intensity coupling)', () => {
        // Compare the bent/long fraction so a swing in long-note count can't confound it.
        const cool = bendStats('guitar', 0.1);
        const hot = bendStats('guitar', 1.0);
        expect(hot.bent / hot.long).toBeGreaterThan(cool.bent / cool.long);
    });
});
