// @ts-nocheck
/**
 * Stop reaches a synth chord that was never pedal-held (#1569). `playNote` used to register a
 * note in `heldNotes` only under the sustain pedal, so a no-pedal chord — every band chord —
 * scheduled its own release at its written end and `killAllPianoNotes` had nothing to release:
 * measured live, a whole-note piano chord rang to its written end after Stop in 3 of 6 runs.
 * Each voice now joins a per-context registry as it is made (the synth sibling of #1530's), and
 * Stop releases the registry.
 */
import { describe, expect, it, vi } from 'vitest';
import { killAllPianoNotes, playNote } from '../../../public/engine/synth-chords.js';

const param = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
});

/** An audio context that hands back every gain and oscillator it makes. */
function makeAudio(currentTime = 4) {
    const gains = [];
    const oscillators = [];
    const node = (extra = {}) => ({ connect: vi.fn(), disconnect: vi.fn(), ...extra });
    const audio = {
        currentTime,
        sampleRate: 48000,
        createGain: vi.fn(() => {
            const gain = node({ gain: param() });
            gains.push(gain);
            return gain;
        }),
        createOscillator: vi.fn(() => {
            const osc = node({
                type: 'sine',
                frequency: param(),
                detune: param(),
                start: vi.fn(),
                stop: vi.fn(),
                setPeriodicWave: vi.fn(),
                onended: null,
            });
            oscillators.push(osc);
            return osc;
        }),
        createBufferSource: vi.fn(() =>
            node({
                playbackRate: param(),
                detune: param(),
                start: vi.fn(),
                stop: vi.fn(),
                buffer: null,
            }),
        ),
        createBiquadFilter: vi.fn(() =>
            node({ type: '', frequency: param(), gain: param(), Q: param() }),
        ),
        createStereoPanner: vi.fn(() => node({ pan: param() })),
        createPeriodicWave: vi.fn(() => ({})),
    };
    return { audio, gains, oscillators };
}

function makeState(audio) {
    return {
        playback: {
            audio,
            audioGraph: { chords: { gain: { connect: vi.fn(), gain: param() } } },
            heldNotes: new Set(),
            sustainActive: false,
            bandIntensity: 0.7,
        },
        chords: { voice: 'synth', style: 'piano', reverb: 0 },
        groove: { audioBuffers: { noise: {} }, genreFeel: 'Rock' },
    };
}

/** How many fades to 0 were asked for at (or within 10 ms after) `time`, across every gain. */
const fadesAt = (gains, time) =>
    gains.reduce(
        (count, gain) =>
            count +
            gain.gain.setTargetAtTime.mock.calls.filter(
                ([value, at]) => value === 0 && at >= time && at < time + 0.01,
            ).length,
        0,
    );

describe('Stop silences a sounding synth chord (#1569)', () => {
    it('a no-pedal chord sounding at Stop fades there, and its oscillators stop within a tenth', () => {
        const { audio, gains, oscillators } = makeAudio(4);
        const state = makeState(audio);
        // Struck now, written to ring for eight seconds; the clock then moves a second on, so
        // the chord is sounding when Stop arrives — the held-chord case. (A start in the past
        // is clamped to the clock, so "struck a second ago" has to be staged this way.)
        playNote(state, 261.63, audio.currentTime, 8, { vol: 0.5 });
        expect(oscillators.length).toBeGreaterThan(0);
        expect(state.playback.heldNotes.size).toBe(0); // no pedal: `heldNotes` never saw it
        audio.currentTime = 5;
        const fadesBefore = fadesAt(gains, audio.currentTime);
        const stopsBefore = oscillators.map((osc) => osc.stop.mock.calls.length);

        killAllPianoNotes(state);

        // The body falls to 0 at Stop (the pedal path's panic stop), and every oscillator still
        // sounding is given a new stop no later than half a second after it — not its written
        // end. The 45 ms percussive strike had already ended on its own and is left alone.
        expect(fadesAt(gains, audio.currentTime)).toBeGreaterThan(fadesBefore);
        const sounding = oscillators.filter((osc) => osc.stop.mock.calls[0][0] > audio.currentTime);
        expect(sounding.length).toBeGreaterThan(2);
        sounding.forEach((osc) => {
            expect(osc.stop.mock.calls.length).toBeGreaterThan(
                stopsBefore[oscillators.indexOf(osc)],
            );
            expect(osc.stop.mock.calls.at(-1)[0]).toBeLessThanOrEqual(audio.currentTime + 0.5);
        });
    });

    it('a chord scheduled ahead of Stop never sounds: stopped at its own start, gain pinned to 0', () => {
        const { audio, gains, oscillators } = makeAudio(4);
        const state = makeState(audio);
        const startTime = audio.currentTime + 0.12; // inside the host's 150 ms lookahead
        playNote(state, 261.63, startTime, 2, { vol: 0.5 });

        killAllPianoNotes(state);

        // Every pitched oscillator — the body's partials and the attack bloom — is stopped no
        // later than it starts, so it renders no sample. The one exception is the 45 ms
        // percussive strike (`playPercussiveStrike`), a noise burst with its own envelope.
        const stoppedAtStart = oscillators.filter((osc) =>
            osc.stop.mock.calls.some(([at]) => at <= osc.start.mock.calls[0][0]),
        );
        expect(stoppedAtStart.length).toBeGreaterThanOrEqual(oscillators.length - 1);
        // Pinned now, not cancelled from its start (which would leave the default gain of 1).
        expect(
            gains.some((gain) =>
                gain.gain.setValueAtTime.mock.calls.some(([value, at]) => value === 0 && at === 0),
            ),
        ).toBe(true);
    });

    it("a chord that ended on its own is out of Stop's reach — no second release, no growth", () => {
        const { audio, gains, oscillators } = makeAudio(4);
        const state = makeState(audio);
        playNote(state, 261.63, 3, 0.5, { vol: 0.5 });
        // The fundamental's end takes the voice out of the registry.
        oscillators[0].onended?.();
        const before = gains.flatMap((g) => g.gain.setTargetAtTime.mock.calls.length);

        killAllPianoNotes(state);

        const after = gains.flatMap((g) => g.gain.setTargetAtTime.mock.calls.length);
        expect(after).toEqual(before);
    });

    it('a pedal-held chord is still released through heldNotes', () => {
        const { audio, gains } = makeAudio(4);
        const state = makeState(audio);
        state.playback.sustainActive = true;
        playNote(state, 261.63, 3, 8, { vol: 0.5 });
        expect(state.playback.heldNotes.size).toBe(1);

        killAllPianoNotes(state);

        expect(state.playback.heldNotes.size).toBe(0);
        expect(fadesAt(gains, audio.currentTime)).toBeGreaterThan(0);
    });
});
