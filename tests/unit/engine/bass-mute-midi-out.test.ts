/**
 * @vitest-environment happy-dom
 *
 * The `muted` field means two different things depending on which lane wrote it
 * (`public/engine/mute-contract.ts`), and collapsing them with a bare truthiness
 * test is what dropped every palm-muted bass note from live MIDI out (#1288).
 *
 * These tests are directional on purpose: the interesting assertion is not "some
 * notes reach MIDI" but "a palm-muted note reaches it ATTENUATED, and a boolean
 * sentinel does not reach it at all." Reverting the gate to `if (!muted)` fails the
 * chuck cases; widening it to emit unconditionally fails the sentinel case.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeMidiVelocity } from '../../../public/engine/midi-utils.js';
import {
    isSilentSentinel,
    MUTE_ATTENUATION,
    muteGain,
    normalizeMuteAmount,
} from '../../../public/engine/mute-contract.js';
import { BASS_MACRO_FLOOR, BASS_MACRO_SPAN } from '../../../public/engine/velocity-shaping.js';

vi.mock('../../../public/engine/engine.js', () => ({
    initAudio: vi.fn(),
    killAllNotes: vi.fn(),
    playBassNote: vi.fn(),
    playDrumSound: vi.fn(),
    playHarmonyNote: vi.fn(),
    playNote: vi.fn(),
    playSoloNote: vi.fn(),
    releaseHarmonyVoicing: vi.fn(),
    restoreGains: vi.fn(),
    updateSustain: vi.fn(),
}));

vi.mock('../../../public/engine/midi-scheduler.js', () => ({
    dispatchMidiAutomation: vi.fn(),
    dispatchMidiBass: vi.fn(),
    dispatchMidiChordNote: vi.fn(),
    dispatchMidiChordSustain: vi.fn(),
    dispatchMidiDrum: vi.fn(),
    dispatchMidiHarmonyNote: vi.fn(),
    dispatchMidiSoloist: vi.fn(),
    startMidiTransport: vi.fn(),
    stopMidiTransport: vi.fn(),
}));

const { scheduleBass } = await import('../../../public/engine/scheduler-core.js');
const { dispatchMidiBass } = await import('../../../public/engine/midi-scheduler.js');
const { playBassNote } = await import('../../../public/engine/engine.js');

/** MIDI 40 (E2) — the funk root the #1288 measurement was taken on. */
const E2_FREQ = 82.4069;

/**
 * The `bandIntensity` at which the bass lane's macro law is exactly unity, so
 * the velocity assertions below measure the MUTE GAIN and nothing else.
 *
 * #941 made `bassMacroGain(playback.bandIntensity)` the bass lane's single
 * intensity term, replacing the band-wide `playback.conductorVelocity` this mock
 * used to pin to 1.0. Derived from the exported constants rather than
 * hard-coded, so a future retune of the curve keeps this at unity instead of
 * silently biasing every assertion in this file by a few percent (which is
 * exactly what happened when the field changed under a mock that didn't set it —
 * `bassMacroGain(undefined)` falls back to the 0.5-intensity gain, 0.95).
 */
const UNITY_MACRO_INTENSITY = (1 - BASS_MACRO_FLOOR) / BASS_MACRO_SPAN;

/**
 * Minimal state in the shape `scheduleBass` actually reads. Humanization is
 * pinned OFF (`groove.humanize = 0`) so velocity assertions measure the mute gain
 * and nothing else — with it on, the ±10% velocity spread would swamp the signal.
 */
function makeState(notes: Array<Record<string, unknown>>) {
    return {
        bass: { buffer: new Map([[0, notes]]) },
        playback: { bpm: 120, bandIntensity: UNITY_MACRO_INTENSITY },
        vizState: { enabled: false },
        groove: { humanize: 0 },
    } as never;
}

const CHORD_DATA = { chord: { freqs: [] } } as never;

function bassNote(overrides: Record<string, unknown> = {}) {
    return { freq: E2_FREQ, durationSteps: 1, velocity: 1.0, timingOffset: 0, ...overrides };
}

/** The velocity argument of the single `dispatchMidiBass` call. */
function dispatchedVelocity(): number {
    expect(dispatchMidiBass).toHaveBeenCalledTimes(1);
    return vi.mocked(dispatchMidiBass).mock.calls[0][2] as number;
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('mute-contract', () => {
    it('marks only boolean `true` as a non-note', () => {
        expect(isSilentSentinel(true)).toBe(true);
        // The whole point: a full palm mute is a NUMBER and a real note, so it must
        // not read as a non-note even though `1` and `true` are both truthy.
        expect(isSilentSentinel(1)).toBe(false);
        expect(isSilentSentinel(0)).toBe(false);
        expect(isSilentSentinel(undefined)).toBe(false);
    });

    it('does NOT mark boolean `false` as a non-note', () => {
        // `accompaniment.ts` / `comping-emit.ts` write `muted: false` on ordinary
        // audible notes. Keying the gate on the boolean *type* instead of on `true`
        // would drop every one of them — the mirror-image of the #1288 bug.
        expect(isSilentSentinel(false)).toBe(false);
    });

    it('normalizes both meanings onto 0..1 and clamps out-of-range numbers', () => {
        expect(normalizeMuteAmount(true)).toBe(1);
        expect(normalizeMuteAmount(false)).toBe(0);
        expect(normalizeMuteAmount(0.5)).toBe(0.5);
        // Above ~1.176 an unclamped amount drives `1 - m * 0.85` negative, which is
        // a silent dropped note by a different route.
        expect(normalizeMuteAmount(4)).toBe(1);
        expect(normalizeMuteAmount(-2)).toBe(0);
    });

    it('lets a non-finite amount through normalization so a caller guard still fires', () => {
        // `playBassNoteNew` relies on this: it guards `!Number.isFinite(mute)` and
        // drops the voice. Rounding NaN to 0 here would silently play it wide open.
        expect(Number.isFinite(normalizeMuteAmount(Number.NaN))).toBe(false);
    });

    it('resolves muteGain to a usable multiplier, never NaN', () => {
        expect(muteGain(0)).toBe(1);
        expect(muteGain(1)).toBeCloseTo(1 - MUTE_ATTENUATION, 10);
        expect(muteGain(1)).toBeCloseTo(0.15, 10);
        expect(muteGain(0.5)).toBeCloseTo(1 - 0.5 * MUTE_ATTENUATION, 10);
        // A MIDI velocity computed from this must not go NaN.
        expect(muteGain(Number.NaN)).toBe(1);
        expect(muteGain(undefined as never)).toBe(1);
    });

    it('orders the gains so a partial mute sits strictly between open and full', () => {
        expect(muteGain(1)).toBeLessThan(muteGain(0.5));
        expect(muteGain(0.5)).toBeLessThan(muteGain(0));
    });
});

describe('.mid export velocity scaling', () => {
    // `midi-worker-logic.ts` replaced a flat `finalVel *= 0.15` for bass with
    // `muteGain`, on the claim that today's producers (which only ever emit 0 or 1)
    // export byte-identically. That claim lived only in a comment; assert it against
    // the real `normalizeMidiVelocity`, whose `Math.floor` of a `** 0.8` curve is
    // where a float discrepancy would surface. Note `1 - 0.85` is
    // 0.15000000000000002, not 0.15 — this is exactly the case worth pinning.
    const OLD_BASS_MUTE_FACTOR = 0.15;

    it('is byte-identical to the flat factor it replaced, across the velocity range', () => {
        for (let noteVel = 0; noteVel <= 2; noteVel += 0.001) {
            const compressed = Math.sqrt(noteVel);
            expect(normalizeMidiVelocity(compressed * muteGain(1))).toBe(
                normalizeMidiVelocity(compressed * OLD_BASS_MUTE_FACTOR),
            );
        }
    });

    it('leaves an open bass note untouched, as the old `if (res.muted)` did', () => {
        for (const open of [0, undefined]) {
            expect(muteGain(open)).toBe(1);
        }
    });

    it('lands a full chuck on the DAW ghost-note floor, well under an open note', () => {
        // The musical outcome of #1288: the chuck arrives as a real but clearly
        // ghosted note rather than not arriving at all.
        const chuck = normalizeMidiVelocity(Math.sqrt(1.0) * muteGain(1));
        const open = normalizeMidiVelocity(Math.sqrt(1.0) * muteGain(0));

        expect(chuck).toBe(20);
        expect(open).toBeGreaterThan(80);
    });
});

describe('scheduleBass → live MIDI out', () => {
    it('sends a fully palm-muted note (the funk slap chuck) to MIDI, attenuated', () => {
        // This is the #1288 regression: `muted: 1` is a chuck, ~27% of a funk bass
        // lane. Under `if (!muted)` this call count was 0.
        scheduleBass(makeState([bassNote({ muted: 1 })]), CHORD_DATA, 0, 0);

        expect(dispatchMidiBass).toHaveBeenCalledTimes(1);
        expect(dispatchedVelocity()).toBeCloseTo(0.15, 10);
    });

    it('sends an open note at full velocity', () => {
        scheduleBass(makeState([bassNote({ muted: 0 })]), CHORD_DATA, 0, 0);

        expect(dispatchedVelocity()).toBeCloseTo(1.0, 10);
    });

    it('scales a partial mute proportionally rather than dropping it', () => {
        // No producer emits a partial today (all bass sites emit 0 or 1), so this
        // pins the contract rather than live behavior — acceptance #2 of #1288.
        scheduleBass(makeState([bassNote({ muted: 0.5 })]), CHORD_DATA, 0, 0);

        expect(dispatchMidiBass).toHaveBeenCalledTimes(1);
        expect(dispatchedVelocity()).toBeCloseTo(1 - 0.5 * MUTE_ATTENUATION, 10);
    });

    it('still withholds the chords lanes’ boolean CC-only sentinel', () => {
        // The gate the original `if (!muted)` was written for, and the one thing
        // that must NOT change: a boolean `true` is not a note.
        scheduleBass(makeState([bassNote({ muted: true })]), CHORD_DATA, 0, 0);

        expect(dispatchMidiBass).not.toHaveBeenCalled();
    });

    it('emits a note marked `muted: false` at full velocity', () => {
        // `false` is the "not muted" sentinel, not a non-note. `if (!muted)` emitted
        // these; a gate keyed on the boolean *type* would drop them, which would be
        // the #1288 bug in reverse. Pin the direction.
        scheduleBass(makeState([bassNote({ muted: false })]), CHORD_DATA, 0, 0);

        expect(dispatchMidiBass).toHaveBeenCalledTimes(1);
        expect(dispatchedVelocity()).toBeCloseTo(1.0, 10);
    });

    it('emits a note with no `muted` field at all', () => {
        scheduleBass(makeState([bassNote()]), CHORD_DATA, 0, 0);

        expect(dispatchMidiBass).toHaveBeenCalledTimes(1);
        expect(dispatchedVelocity()).toBeCloseTo(1.0, 10);
    });

    it('always sounds the note in audio regardless of the mute meaning', () => {
        // The audio path never had this bug — the chuck always sounded. Pin that the
        // MIDI gate change did not accidentally start gating audio too.
        scheduleBass(
            makeState([bassNote({ muted: 1 }), bassNote({ muted: true }), bassNote({ muted: 0 })]),
            CHORD_DATA,
            0,
            0,
        );

        expect(playBassNote).toHaveBeenCalledTimes(3);
    });

    it('passes the raw mute amount to the audio voice, not the MIDI-scaled gain', () => {
        // `playBassNoteNew` applies its own `1 - mute * MUTE_ATTENUATION` internally;
        // pre-scaling here would attenuate the chuck twice.
        scheduleBass(makeState([bassNote({ muted: 1 })]), CHORD_DATA, 0, 0);

        expect(vi.mocked(playBassNote).mock.calls[0][5]).toBe(1);
    });
});
