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
// Rootless dominant voicing (3/5/♭7, no root) — what blues actually comps when a bass
// is present. The bend must IGNORE this voicing and target functional pillars, so the
// ♭7→root cry stays reachable even though pc 0 is absent here. (#747 Slice 3b.)
const C7_ROOTLESS = { rootMidi: 60, quality: '7', intervals: [4, 7, 10], beats: 4 };

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
function sweep(state, style, steps = 600, chord = C7) {
    getState.mockReturnValue(state);
    const out = [];
    for (let s = 0; s < steps; s++) {
        state.soloist.session.rhythm.deviceBuffer = [];
        state.soloist.session.phrasing.busySteps = 0;
        state.soloist.session.phrasing.isResting = false;
        const r = getSoloistNote(state, chord, null, s, 60, 4, style, 0, { bypassRhythm: true });
        const notes = Array.isArray(r) ? r : r ? [r] : [];
        out.push(...notes);
    }
    return out;
}

// Functional dominant pillars (1/3/5/♭7), root MIDI 60 — what the bend targets for a
// '7' chord regardless of how the chord is voiced. The bend must land its peak here.
const DOM_PILLARS = [0, 4, 7, 10];
const isPillar = (deg) => DOM_PILLARS.includes(((deg % 12) + 12) % 12);

// Bend-rate stats + the bent notes (with .midi) so callers can check targeting.
function bendStats(mode, intensity) {
    const notes = sweep(makeState(mode, intensity), 'blues');
    const long = notes.filter((n) => (n.durationSteps || 0) >= 4);
    const bentNotes = notes.filter((n) => n.expression?.bend);
    const bends = bentNotes.map((n) => n.expression.bend);
    return { long: long.length, bent: bends.length, bends, notes: bentNotes };
}

// #747 Slice 3b contract: a bend ALWAYS resolves UP to a functional pillar (1/3/5/♭7
// on a dominant). There is no gentle-curl fallback — a note with no pillar within a
// whole step above simply doesn't bend. So every emitted bend peaks on a pillar.
function peaksOnPillar(note) {
    return isPillar(note.midi - 60 + note.expression.bend.peakSemitones);
}

describe('soloist bend-and-release gesture (#744 Slice 2/3b)', () => {
    it('guitar leads bend often, and every bend resolves onto a functional pillar', () => {
        const { long, bent, notes } = bendStats('guitar', 0.8);
        expect(long).toBeGreaterThan(30);
        expect(bent).toBeGreaterThan(5); // string bends are central to blues guitar
        expect(bent).toBeLessThan(long); // still a flourish, not every note
        // Every bend lands on a pillar (♭3→3, 4→5, ♭7→root) — no off-pillar peaks.
        for (const n of notes) {
            expect(
                peaksOnPillar(n),
                `bend peak off-pillar: midi ${n.midi} +${n.expression.bend.peakSemitones}`,
            ).toBe(true);
        }
    });

    it('horn/mono leads bend more sparingly than guitar (rate is the mode idiom)', () => {
        // Idiom: a horn inflects with scoops + vibrato, not constant string bends, so it
        // fires far less often. Targeting (the interval) is harmonic and identical across
        // modes — the difference now lives purely in the fire RATE.
        const guitar = bendStats('guitar', 0.8);
        const mono = bendStats('mono', 0.8);
        expect(mono.bent / mono.long).toBeLessThan(guitar.bent / guitar.long);
        expect(mono.bent).toBeGreaterThan(0); // still cries occasionally
        for (const n of mono.notes) {
            expect(peaksOnPillar(n)).toBe(true);
        }
    });

    it('targets functional pillars even when the chord is voiced ROOTLESS (#747 fix)', () => {
        // The regression guard for the bug Slice 3b fixed: blues comps rootless when a
        // bass is present, so the soloist's chord carries a voicing WITHOUT the root.
        // The bend must ignore that voicing and target the functional pillars, keeping
        // the canonical ♭7→root cry reachable. If the bend read the voicing mask
        // (intervals [4,7,10], no pc 0), the root could never be a target.
        const notes = sweep(makeState('guitar', 0.9), 'blues', 600, C7_ROOTLESS);
        const bent = notes.filter((n) => n.expression?.bend);
        expect(bent.length).toBeGreaterThan(5);
        // Every peak is a functional pillar despite the rootless voicing...
        for (const n of bent) {
            expect(peaksOnPillar(n), `off-pillar peak under rootless voicing: midi ${n.midi}`).toBe(
                true,
            );
        }
        // ...and crucially, the ROOT (deg 0) is reached as a target — impossible if the
        // bend had read the rootless voicing mask.
        const rootPeaks = bent.filter(
            (n) => (((n.midi - 60 + n.expression.bend.peakSemitones) % 12) + 12) % 12 === 0,
        );
        expect(
            rootPeaks.length,
            'expected at least one ♭7→root bend under rootless voicing',
        ).toBeGreaterThan(0);
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

    // #747 Slice 3a — bend diagnostics. The log is the measuring instrument for the
    // harmonic-targeting work; if its degree/chord-tone math is wrong we'd misread the
    // by-ear pass, so guard it here (not just "it doesn't crash").
    it('debug log fires once per bend with correct harmonic readout (debugSoloist)', () => {
        const state = makeState('guitar', 1.0);
        state.playback.debugSoloist = true;
        const lines = [];
        const spy = vi.spyOn(console, 'log').mockImplementation((m) => lines.push(String(m)));
        try {
            const notes = sweep(state, 'blues');
            const bent = notes.filter((n) => n.expression?.bend);
            const bendLines = lines.filter((l) => l.includes('[Bend Debug]'));
            expect(bent.length).toBeGreaterThan(0);
            // Exactly one log line per bend — no spurious fires, none dropped.
            expect(bendLines.length).toBe(bent.length);
            // Recompute the expected peak degree from each note and assert the line
            // reports it as the resolved pillar. The peak token `(deg <N> pillar...)` is
            // unambiguous — a bare `deg N` also appears for the written pitch, so we
            // match the whole token to pin the degree math and the pillar classification.
            for (const n of bent) {
                const peakDeg = (((n.midi + n.expression.bend.peakSemitones - 60) % 12) + 12) % 12;
                const peakToken = `(deg ${peakDeg} pillar`;
                const match = bendLines.find((l) => l.includes(peakToken));
                expect(match, `expected a bend line with peak token "${peakToken}"`).toBeTruthy();
            }
        } finally {
            spy.mockRestore();
        }
    });

    it('debug log stays silent when debugSoloist is off', () => {
        const lines = [];
        const spy = vi.spyOn(console, 'log').mockImplementation((m) => lines.push(String(m)));
        try {
            sweep(makeState('guitar', 1.0), 'blues');
            expect(lines.filter((l) => l.includes('[Bend Debug]')).length).toBe(0);
        } finally {
            spy.mockRestore();
        }
    });
});
