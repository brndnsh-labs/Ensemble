/**
 * @vitest-environment happy-dom
 *
 * #1322: the live-vs-export PARITY gate for the interpretation dimensions the
 * issue named. Drum-name→GM-pitch parity is already covered by
 * `tests/unit/app/midi-controller.test.ts` (added in #1321, which shipped
 * first) — not duplicated here. This file covers the other two:
 *
 * - Bend-direction sign: now a single shared formula (`entryBendToPitchWheel`
 *   in `midi-utils.ts`), consumed by live MIDI-out and both exporter
 *   emission sites — a future divergence like #963 is now structurally
 *   impossible rather than merely alarmed-on.
 * - Note existence: does a generated note actually sound, on the live path?
 *   Bass (mute-contract-routed on both live and export) is expected to
 *   AGREE. Chords ghost notes are a KNOWN, DELIBERATE divergence pending
 *   #1299's decision — pinned here as an exclusion, not silently normalized.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { entryBendToPitchWheel } from '../../../public/engine/midi-utils.js';
import { isSilentSentinel } from '../../../public/engine/mute-contract.js';

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

const { scheduleBass, scheduleChords } = await import('../../../public/engine/scheduler-core.js');
const { dispatchMidiBass, dispatchMidiChordNote } = await import(
    '../../../public/engine/midi-scheduler.js'
);
const { playNote } = await import('../../../public/engine/engine.js');

beforeEach(() => {
    vi.clearAllMocks();
});

describe('#1322 — bend-direction-sign parity (entryBendToPitchWheel)', () => {
    it('is the single formula now shared by live MIDI-out and both exporter emission sites', () => {
        expect(entryBendToPitchWheel(0)).toBe(0);
        expect(entryBendToPitchWheel(1)).toBe(4096); // +1 semitone above target → wheel UP
        expect(entryBendToPitchWheel(-1)).toBe(-4096); // -1 semitone below target → wheel DOWN
        expect(entryBendToPitchWheel(0.5)).toBe(2048);
    });

    it('sign always matches the documented convention: positive interval → positive wheel value (#963)', () => {
        for (const interval of [0.1, 0.5, 1, 1.5]) {
            expect(entryBendToPitchWheel(interval)).toBeGreaterThan(0);
            expect(entryBendToPitchWheel(-interval)).toBeLessThan(0);
        }
    });
});

describe('#1322 — note-existence parity: bass mute', () => {
    const CHORD_DATA = { chord: { freqs: [] } };

    function makeBassState(notes: Array<Record<string, unknown>>) {
        return {
            bass: { buffer: new Map([[0, notes]]) },
            playback: { bpm: 120, conductorVelocity: 1.0 },
            vizState: { enabled: false },
            groove: { humanize: 0 },
        } as never;
    }

    function bassNote(overrides: Record<string, unknown> = {}) {
        return { freq: 82.4069, durationSteps: 1, velocity: 1.0, timingOffset: 0, ...overrides };
    }

    it('a numeric palm-mute amount SOUNDS on live MIDI-out (attenuated, not dropped) — matching the export side', () => {
        // #1288 pins the live path's exact attenuated velocity already
        // (tests/unit/engine/bass-mute-midi-out.test.ts); this test's job is the
        // EXISTENCE half: mute-contract.ts's isSilentSentinel only excludes a
        // boolean `true`, so both live and export agree a numeric amount is a
        // real, sounding note.
        scheduleBass(makeBassState([bassNote({ muted: 1 })]), CHORD_DATA, 0, 0);
        expect(dispatchMidiBass).toHaveBeenCalledTimes(1);
        expect(isSilentSentinel(1)).toBe(false);
    });

    it('the boolean CC-only sentinel is dropped on live MIDI-out — matching mute-contract, the sole authority both paths read', () => {
        scheduleBass(makeBassState([bassNote({ muted: true })]), CHORD_DATA, 0, 0);
        expect(dispatchMidiBass).not.toHaveBeenCalled();
        expect(isSilentSentinel(true)).toBe(true);
    });
});

describe('#1322 — note-existence parity: chords ghost notes (KNOWN divergence, pinned to #1299)', () => {
    const CHORD_DATA = { chord: { absName: 'C' } };

    function makeChordsState(notes: Array<Record<string, unknown>>, voice = 'Piano') {
        return {
            chords: { buffer: new Map([[0, notes]]), voice },
            playback: {
                bpm: 120,
                sustainActive: false,
                activeChordVoices: [],
                lastChordKey: null,
            },
            vizState: { enabled: false },
        } as never;
    }

    function chordNote(overrides: Record<string, unknown> = {}) {
        return {
            freq: 261.63,
            durationSteps: 2,
            velocity: 0.5,
            timingOffset: 0,
            muted: false,
            ...overrides,
        };
    }

    it('an ordinary audible note (muted: false) sounds on the live path', () => {
        scheduleChords(makeChordsState([chordNote()]), CHORD_DATA, 0, 0);
        expect(playNote).toHaveBeenCalledTimes(1);
        expect(dispatchMidiChordNote).toHaveBeenCalledTimes(1);
    });

    it("#1299 KNOWN EXCLUSION — a ghost note (muted: true) is silent live. Do NOT 'fix' this here: #1299 owns the sound-or-not decision; #1322 only routes the read through mute-contract.ts, it doesn't decide the question", () => {
        scheduleChords(makeChordsState([chordNote({ muted: true })]), CHORD_DATA, 0, 0);
        expect(playNote).not.toHaveBeenCalled();
        expect(dispatchMidiChordNote).not.toHaveBeenCalled();
    });

    it('numVoices/strum-rank stay in sync with the dispatch gate (#1299 paired-site trap) — a mixed ghost+real step counts only the real note', () => {
        scheduleChords(
            makeChordsState([
                chordNote({ muted: true, freq: 300 }),
                chordNote({ muted: false, freq: 261.63 }),
            ]),
            CHORD_DATA,
            0,
            0,
        );
        expect(playNote).toHaveBeenCalledTimes(1);
        // playNote(state, freq, playTime, duration, { vol, index, instrument, numVoices })
        const opts = vi.mocked(playNote).mock.calls[0][4] as { numVoices: number };
        expect(opts.numVoices).toBe(1);
    });

    it('the strum-rank loop excludes the ghost too and ranks by pitch, not array position (only engages for a guitar voice — isStrummedChordVoice, chords-styles.ts)', () => {
        // Array order deliberately puts the HIGHER-freq real note first, so a
        // rank computed from array position (wrong) would disagree with a rank
        // computed from sorted pitch (right, and what the code actually does).
        scheduleChords(
            makeChordsState(
                [
                    chordNote({ muted: true, freq: 300 }), // ghost — excluded from strum ranking
                    chordNote({ freq: 400 }), // higher pitch — should rank LAST (1)
                    chordNote({ freq: 200 }), // lower pitch — should rank FIRST (0)
                ],
                'Acoustic Guitar',
            ),
            CHORD_DATA,
            0,
            0,
        );

        expect(playNote).toHaveBeenCalledTimes(2);
        const calls = vi.mocked(playNote).mock.calls;
        // First call is the 400Hz note (array position 1) — expect strum rank 1.
        expect((calls[0][4] as { index: number }).index).toBe(1);
        // Second call is the 200Hz note (array position 2) — expect strum rank 0.
        expect((calls[1][4] as { index: number }).index).toBe(0);
    });
});
