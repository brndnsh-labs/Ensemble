import { describe, expect, it } from 'vitest';
import { encodeWav } from '../../public/engine/wav-encoder.js';
import type { RenderMeta, ScheduledEvent } from '../../scripts/audio-verify.js';
import {
    decodeWav,
    type IntentEvent,
    parseMixVerifyArgs,
    verifyIntentParity,
} from '../../scripts/mix-verify.js';

describe('mix-verify — CLI parsing', () => {
    it('reads every flag, and defaults the rest', () => {
        const options = parseMixVerifyArgs([
            '--scene=funk-pocket',
            '--stems=bass,drums',
            '--loops=3',
            '--seed=ALPHA',
            '--keep=tmp/ears',
            '--no-build',
            '--json',
            '--scenes-from=tmp/scenes.json',
        ]);
        expect(options).toEqual({
            scene: 'funk-pocket',
            stems: ['bass', 'drums'],
            loops: 3,
            seed: 'ALPHA',
            keep: 'tmp/ears',
            noBuild: true,
            json: true,
            scenesFrom: 'tmp/scenes.json',
        });

        const defaults = parseMixVerifyArgs([]);
        expect(defaults.scene).toBeNull();
        expect(defaults.stems).toEqual([]);
        expect(defaults.loops).toBe(1);
        expect(defaults.noBuild).toBe(false);
        expect(defaults.json).toBe(false);
        expect(defaults.scenesFrom).toBeNull();
    });

    it('rejects an unknown flag rather than ignoring it', () => {
        // A silently-dropped flag would produce a render nobody asked for, reported
        // as though it were the requested one.
        expect(() => parseMixVerifyArgs(['--wat=1'])).toThrow(/Unknown flag/);
    });

    it('falls back to one loop on a nonsense --loops value', () => {
        expect(parseMixVerifyArgs(['--loops=0']).loops).toBe(1);
        expect(parseMixVerifyArgs(['--loops=abc']).loops).toBe(1);
    });
});

describe('mix-verify — WAV decoding', () => {
    const SAMPLE_RATE = 44100;

    function ramp(length: number, scale: number): Float32Array {
        const out = new Float32Array(length);
        for (let i = 0; i < length; i++) {
            out[i] = Math.sin((2 * Math.PI * i) / 64) * scale;
        }
        return out;
    }

    it('round-trips what encodeWav writes, on both channel counts', () => {
        // The decoder's whole job is reading files this repo's own encoder produced;
        // a shifted read would move every sample and fake a timing defect.
        for (const channelCount of [1, 2]) {
            const channels = Array.from({ length: channelCount }, (_, index) =>
                ramp(2048, 0.8 - index * 0.3),
            );
            const decoded = decodeWav(Buffer.from(encodeWav(channels, SAMPLE_RATE)));

            expect(decoded.sampleRate).toBe(SAMPLE_RATE);
            expect(decoded.channels).toHaveLength(channelCount);
            expect(decoded.channels[0]).toHaveLength(2048);
            for (let c = 0; c < channelCount; c++) {
                for (const i of [0, 17, 1023, 2047]) {
                    // 16-bit quantization: within one LSB of the original float.
                    expect(decoded.channels[c][i]).toBeCloseTo(channels[c][i], 3);
                }
            }
        }
    });

    it('keeps the channels distinct rather than interleaving them wrongly', () => {
        const left = ramp(512, 0.9);
        const right = new Float32Array(512); // silent
        const decoded = decodeWav(Buffer.from(encodeWav([left, right], SAMPLE_RATE)));
        expect(Math.max(...decoded.channels[0])).toBeGreaterThan(0.5);
        expect(Math.max(...decoded.channels[1])).toBeCloseTo(0, 3);
    });

    it('rejects a non-RIFF payload instead of decoding garbage', () => {
        expect(() => decodeWav(Buffer.from('not audio at all, really'))).toThrow(/RIFF/);
    });
});

describe('mix-verify — intent → dispatch existence parity (#1351)', () => {
    const META: RenderMeta = {
        sampleRate: 44100,
        leadInSeconds: 0.25,
        stepSeconds: 0.125,
        stepsPerLoop: 16,
        loopCount: 1,
        bpm: 120,
    };

    function intent(overrides: Partial<IntentEvent> = {}): IntentEvent {
        const step = overrides.step ?? 4;
        const absoluteStep = overrides.absoluteStep ?? step;
        return {
            track: 'bass',
            step,
            absoluteStep,
            time: META.leadInSeconds + absoluteStep * META.stepSeconds,
            midi: 45,
            velocity: 0.8,
            ...overrides,
        };
    }

    function dispatchFor(source: IntentEvent, offsetMs = 0): ScheduledEvent {
        return {
            track: source.track,
            time: source.time + offsetMs / 1000,
            midi: source.midi,
            renderVelocity: 0.7,
        };
    }

    it('exact parity: every intent matched, nothing missing, nothing extra', () => {
        const intents = [intent({ step: 0 }), intent({ step: 4 }), intent({ step: 8, midi: 52 })];
        const parity = verifyIntentParity(
            intents,
            intents.map((entry) => dispatchFor(entry)),
            META,
            ['bass'],
        );
        expect(parity.verifiable).toBe(true);
        expect(parity.intentCount).toBe(3);
        expect(parity.matchedCount).toBe(3);
        expect(parity.missing).toHaveLength(0);
        expect(parity.extraDispatches).toBe(0);
    });

    it('a scheduler-side dropped note fails parity even when audio and viz both omit it', () => {
        // Acceptance 1 / mutation 6a: the dispatch stream IS the post-gate
        // audio+viz stream, so dropping the event there models the class where
        // both sinks lose the note together and no other oracle can see it.
        const intents = [intent({ step: 0 }), intent({ step: 4 }), intent({ step: 8 })];
        const dispatches = intents.slice(0, 2).map((entry) => dispatchFor(entry));
        const broken = verifyIntentParity(intents, dispatches, META, ['bass']);
        expect(broken.missing).toHaveLength(1);
        expect(broken.missing[0].absoluteStep).toBe(8);

        // Restore the dropped dispatch → parity heals (the not-vacuous direction).
        const healed = verifyIntentParity(
            intents,
            intents.map((entry) => dispatchFor(entry)),
            META,
            ['bass'],
        );
        expect(healed.missing).toHaveLength(0);
    });

    it('a pitched boolean sentinel is explicitly excluded as a non-note', () => {
        const sentinel = intent({ track: 'chords', step: 6, midi: 64, muted: true });
        const audible = intent({ track: 'chords', step: 2, midi: 60 });
        const parity = verifyIntentParity([audible, sentinel], [dispatchFor(audible)], META, [
            'chords',
        ]);
        expect(parity.intentCount).toBe(1);
        expect(parity.missing).toHaveLength(0);
        expect(parity.excludedSilentSentinels).toBe(1);
    });

    it('a CC-only midi-0 carrier is not counted as a pitched-note drop', () => {
        const carrier = intent({ track: 'chords', step: 0, midi: 0 });
        const parity = verifyIntentParity([carrier], [], META, ['chords']);
        expect(parity.intentCount).toBe(0);
        expect(parity.missing).toHaveLength(0);
    });

    it('humanization/swing within a step bin (±1) still matches; a full two-step slip does not', () => {
        // Bass humanize is ±14 ms and swing tops out near a third of a step —
        // both land inside the ±1-bin window at any plausible tempo. Bracket it.
        const one = intent({ step: 4 });
        const nudged = verifyIntentParity([one], [dispatchFor(one, 120)], META, ['bass']);
        expect(nudged.missing).toHaveLength(0);

        const slipped = verifyIntentParity([one], [dispatchFor(one, 260)], META, ['bass']);
        expect(slipped.missing).toHaveLength(1);
        expect(slipped.extraDispatches).toBe(1);
    });

    it("a dropped audible ghost in a neighboring bin cannot steal that bin's dispatch", () => {
        // The two-pass regression (measured on funk-pocket/chords as 54 false
        // pairs): a ghost at step 1 exact-misses, and a greedy single
        // pass let its ±1 fallback consume step 2's dispatch before step 2's own
        // intent claimed it — reporting the audible chord missing and the ghost
        // matched. Exact-bin claims must settle first.
        const ghost = intent({ track: 'chords', step: 1, midi: 66, muted: false, velocity: 0.18 });
        const audible = intent({ track: 'chords', step: 2, midi: 66 });
        const parity = verifyIntentParity([ghost, audible], [dispatchFor(audible)], META, [
            'chords',
        ]);
        expect(parity.matchedCount).toBe(1);
        expect(parity.missing).toHaveLength(1);
        expect(parity.missing[0]).toMatchObject({ muted: false, velocity: 0.18 });
        expect(parity.excludedSilentSentinels).toBe(0);
    });

    it('drums report NOT VERIFIABLE rather than fabricated intent', () => {
        const parity = verifyIntentParity([], [], META, ['drums']);
        expect(parity.verifiable).toBe(false);
        expect(parity.reason).toMatch(/drums/);
    });

    it('an unexpected dispatch is reported as extra, not silently absorbed', () => {
        const one = intent({ step: 4 });
        const stray: ScheduledEvent = {
            track: 'bass',
            time: META.leadInSeconds + 12 * META.stepSeconds,
            midi: 33,
        };
        const parity = verifyIntentParity([one], [dispatchFor(one), stray], META, ['bass']);
        expect(parity.matchedCount).toBe(1);
        expect(parity.extraDispatches).toBe(1);
    });
});
