// @ts-nocheck
//
// Integration coverage for the pad-mode legato chain (epic-harmony-polish S1).
//
// Epic 10 S3 (g): the S1 critique (`harmony-pad-sustain.test.ts`) only asserts
// the harmony-engine layer — it calls `getHarmonyNotes` and checks `isLegato`
// flags. The two layers that actually CONSUME those flags shipped with zero
// coverage:
//   1. Scheduler — `scheduleHarmonies` (scheduler-core.ts): the `legatoMidis`
//      partition that keeps voices whose MIDI is in the incoming legato set
//      and kills only the rest, instead of the blanket pre-S1 kill.
//   2. Synth — `playHarmonyNote` (synth-harmonies.ts): the legato branch that
//      extends an existing voice in place (cancel release, restore gain,
//      re-schedule) rather than spawning a fresh voice.
//
// This test drives two real harmony emissions through `scheduleHarmonies`
// against a fake AudioContext and asserts that a common-tone voice is the
// SAME voice object across the chord boundary (retained, not re-attacked).
//
// Reverting either layer turns this red:
//   - scheduler partition reverted to blanket kill -> voice 67 is killed and
//     re-created, so the identity check fails.
//   - synth legato branch reverted -> playHarmonyNote spawns a new voice for
//     67, the survivor never gets `lastExtendedAt`, and activeVoices overflows.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { scheduleHarmonies } from '../../../public/engine/scheduler-core.js';

// --- Fake AudioContext ------------------------------------------------------
// Minimal Web Audio surface for playHarmonyNote / killActiveVoices.

function makeAudioParam() {
    return {
        value: 0,
        setValueAtTime: vi.fn(),
        setTargetAtTime: vi.fn(),
        cancelScheduledValues: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
    };
}

function makeFakeAudio() {
    return {
        currentTime: 0,
        createOscillator: vi.fn(() => ({
            type: 'sine',
            frequency: makeAudioParam(),
            detune: makeAudioParam(),
            connect: vi.fn(),
            disconnect: vi.fn(),
            start: vi.fn(),
            stop: vi.fn(),
            onended: null,
        })),
        createGain: vi.fn(() => ({
            gain: makeAudioParam(),
            connect: vi.fn(),
            disconnect: vi.fn(),
        })),
        createBiquadFilter: vi.fn(() => ({
            type: '',
            frequency: makeAudioParam(),
            Q: makeAudioParam(),
            connect: vi.fn(),
        })),
        createStereoPanner: vi.fn(() => ({
            pan: makeAudioParam(),
            connect: vi.fn(),
        })),
        createWaveShaper: vi.fn(() => ({ curve: null, connect: vi.fn() })),
    };
}

// A "pads" emission note. Production marks `isChordStart` on the FIRST note of
// a chord emission only — `scheduleHarmonies` does `notes.find(isChordStart)`,
// so build emissions with `padNote(lead, { isChordStart: true })` on note 0.
// `isLegato` marks a common-tone continuation.
//
// durationSteps 8 = half a 16-step bar. The fake AudioParam does not model
// time, so the mid-decay gain-restore in playHarmonyNote (the case where the
// prior voice's release has already begun) is not exercised — release-timing
// realism is out of scope for this identity test.
function padNote(midi, opts = {}) {
    return {
        freq: 440 * 2 ** ((midi - 69) / 12),
        midi,
        velocity: 0.5,
        durationSteps: 8,
        style: 'pads',
        timingOffset: 0,
        isChordStart: opts.isChordStart === true,
        isLegato: opts.isLegato === true,
    };
}

function makeState(audio) {
    return {
        playback: {
            audio,
            bpm: 120,
            bandIntensity: 0.5,
            conductorVelocity: 1.0,
            step: 0,
            harmoniesGain: { connect: vi.fn() },
        },
        harmony: { enabled: true, activeVoices: [], buffer: new Map() },
        vizState: { enabled: false },
        groove: { genreFeel: 'Rock' },
        // `midi` intentionally absent — dispatchMidiHarmonyNote early-returns.
    };
}

describe('Harmony legato chain — scheduler + synth integration (Epic 10 S3.g)', () => {
    let audio;
    let state;

    beforeEach(() => {
        vi.restoreAllMocks();
        audio = makeFakeAudio();
        state = makeState(audio);
    });

    it('retains a common-tone voice as the SAME object across a chord change', () => {
        // --- Emission 1: Cmaj7 pad voicing C/E/G (midis 60/64/67) on step 0.
        audio.currentTime = 10;
        state.harmony.buffer.set(0, [
            padNote(60, { isChordStart: true }),
            padNote(64),
            padNote(67),
        ]);
        scheduleHarmonies(state, {}, 0, 10);

        expect(state.harmony.activeVoices.map((v) => v.midi).sort((a, b) => a - b)).toEqual([
            60, 64, 67,
        ]);
        // Snapshot the voice object for the common tone G (67).
        const gVoiceBefore = state.harmony.activeVoices.find((v) => v.midi === 67);
        expect(gVoiceBefore).toBeDefined();
        expect(gVoiceBefore.lastExtendedAt).toBeUndefined();

        // --- Emission 2: chord change to Em (E/G/B = 64/67/71) on step 16.
        // G (67) is the common tone and is flagged isLegato; 60 drops, 71 is new.
        audio.currentTime = 10.5;
        state.harmony.buffer.set(16, [
            padNote(67, { isLegato: true, isChordStart: true }),
            padNote(64),
            padNote(71),
        ]);
        scheduleHarmonies(state, {}, 16, 10.5);

        const midisAfter = state.harmony.activeVoices.map((v) => v.midi).sort((a, b) => a - b);
        // Scheduler partition: 60 (not in legato set, not re-emitted) is gone;
        // 64 was killed by the partition then re-created by playHarmonyNote;
        // 67 survived; 71 is new. Final voicing is E/G/B.
        expect(midisAfter).toEqual([64, 67, 71]);

        // The synth legato branch must EXTEND the existing G voice, not spawn a
        // fresh one — so it is the very same object, now carrying lastExtendedAt.
        const gVoiceAfter = state.harmony.activeVoices.find((v) => v.midi === 67);
        expect(gVoiceAfter).toBe(gVoiceBefore);
        expect(gVoiceAfter.lastExtendedAt).toBe(10.5);
    });

    it('falls back to a blanket kill when no legato note is present', () => {
        // why: the partition only engages when `legatoMidis.size > 0`. A chord
        // change with no common-tone continuation must still kill every prior
        // voice (the pre-S1 behavior, preserved as the else-branch).
        audio.currentTime = 10;
        state.harmony.buffer.set(0, [
            padNote(60, { isChordStart: true }),
            padNote(64),
            padNote(67),
        ]);
        scheduleHarmonies(state, {}, 0, 10);
        expect(state.harmony.activeVoices).toHaveLength(3);

        // Chromatic move to C#/F/G# — no isLegato flags anywhere.
        audio.currentTime = 10.5;
        state.harmony.buffer.set(16, [
            padNote(61, { isChordStart: true }),
            padNote(65),
            padNote(68),
        ]);
        scheduleHarmonies(state, {}, 16, 10.5);

        // Every prior voice killed; only the three new ones remain.
        expect(state.harmony.activeVoices.map((v) => v.midi).sort((a, b) => a - b)).toEqual([
            61, 65, 68,
        ]);
    });

    it('B11 (#710) — schedules the prior-pad release at the scheduled onset, not currentTime', () => {
        // The scheduler runs ahead of playback. Killing at `currentTime` cut the
        // prior pad ~200-400ms early; it must fade at the new chord's scheduled
        // onset for a true crossfade (same clock chords use).
        audio.currentTime = 10;
        state.harmony.buffer.set(0, [
            padNote(60, { isChordStart: true }),
            padNote(64),
            padNote(67),
        ]);
        scheduleHarmonies(state, {}, 0, 10);
        const victim = state.harmony.activeVoices.find((v) => v.midi === 60);
        const gainParam = victim.gain?.gain || victim.gain;

        // Chord change with NO legato, scheduled 300 ms AHEAD of the audio clock.
        audio.currentTime = 10; // clock has NOT advanced
        const scheduledOnset = 10.3;
        state.harmony.buffer.set(16, [
            padNote(61, { isChordStart: true }),
            padNote(65),
            padNote(68),
        ]);
        scheduleHarmonies(state, {}, 16, scheduledOnset);

        // The release fade-to-zero must be scheduled at the future onset (10.3),
        // not at currentTime (10.0). Pre-#710 there was no call at 10.3.
        // #934 — the release is now click-free: a `linearRampToValueAtTime` to
        // EXACTLY 0 (the #601 retirement), anchored at the onset, reaching 0 at
        // onset+fade — replacing the shared `setTargetAtTime` blanket kill.
        const rampToZero = gainParam.linearRampToValueAtTime.mock.calls.filter((c) => c[0] === 0);
        expect(rampToZero.length).toBeGreaterThan(0);
        // Reaches 0 just past the future onset (≈10.35), never near currentTime.
        expect(rampToZero.some((c) => c[1] > scheduledOnset)).toBe(true);
        expect(rampToZero.every((c) => c[1] > audio.currentTime)).toBe(true);
    });
});
