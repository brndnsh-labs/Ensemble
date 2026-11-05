// @ts-nocheck
/**
 * Stop reaches the notes sent ahead of the clock, on every lane (#1999). The band host sends
 * each note up to a lookahead before it sounds, so at Stop a bass note, a kick or a lead note
 * due in the next 150 ms is already in the audio graph. #1569 kept a synth chord scheduled
 * ahead from sounding; the other lanes still played theirs after Stop. Each voice now registers
 * its outputs with its lane (`lane-voices.ts`), and a Stop before its start cuts them.
 */
import { describe, expect, it, vi } from 'vitest';
import { releaseLaneVoices } from '../../../core/engine/lane-voices.js';
import { playSampledStrike } from '../../../core/engine/sample-voice.js';
import { killBassNote, playBassNote } from '../../../core/engine/synth-bass.js';
import { killAllPianoNotes, playNote } from '../../../core/engine/synth-chords.js';
import { killDrumNote, playDrumSound } from '../../../core/engine/synth-drums.js';
import { killSoloistNote, playSoloNote } from '../../../core/engine/synth-soloist.js';

const param = () => ({
    value: 0,
    defaultValue: 1,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
    setValueCurveAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
    cancelAndHoldAtTime: vi.fn(),
});

const PARAMS = ['gain', 'frequency', 'detune', 'Q', 'pan', 'playbackRate', 'offset', 'delayTime'];

/**
 * An audio context whose nodes remember what they were connected to, so a test can ask which
 * nodes still reach a lane's bus after Stop.
 */
function makeAudio({ offline = false } = {}) {
    const nodes = [];
    const node = () => {
        const n = {
            targets: new Set(),
            connect: vi.fn((target) => {
                n.targets.add(target);
                return target;
            }),
            disconnect: vi.fn((target) => {
                if (target) {
                    n.targets.delete(target);
                } else {
                    n.targets.clear();
                }
            }),
            start: vi.fn(),
            stop: vi.fn(),
            onended: null,
            buffer: null,
            type: '',
            curve: null,
            oversample: 'none',
            setPeriodicWave: vi.fn(),
        };
        for (const p of PARAMS) {
            n[p] = param();
        }
        nodes.push(n);
        return n;
    };
    const audio = {
        currentTime: 4,
        sampleRate: 48000,
        createGain: vi.fn(node),
        createOscillator: vi.fn(node),
        createBufferSource: vi.fn(node),
        createBiquadFilter: vi.fn(node),
        createStereoPanner: vi.fn(node),
        createWaveShaper: vi.fn(node),
        createConstantSource: vi.fn(node),
        createDelay: vi.fn(node),
        createPeriodicWave: vi.fn(() => ({})),
        createBuffer: vi.fn((channels, length) => ({
            length,
            duration: length / 48000,
            numberOfChannels: channels,
            getChannelData: () => new Float32Array(length),
        })),
    };
    if (offline) {
        audio.startRendering = vi.fn();
    }
    return { audio, nodes };
}

const bus = () => ({ gain: { connect: vi.fn(), gain: param() } });

function makeState(audio) {
    return {
        playback: {
            audio,
            audioGraph: { chords: bus(), bass: bus(), soloist: bus(), drums: bus() },
            bandIntensity: 0.6,
            bpm: 120,
        },
        chords: { voice: 'synth', style: 'piano', reverb: 0 },
        bass: { voice: 'synth', style: 'rock', lastBassGain: null },
        soloist: {
            voice: 'synth',
            mode: 'monophonic',
            audio: { lastRenderedFreq: null, activeVoices: [] },
        },
        groove: {
            voice: 'synth',
            humanize: 0,
            genreFeel: 'Rock',
            audioBuffers: { noise: { duration: 2, length: 96000 } },
            lastHatGain: null,
            lastSampledHatVoice: null,
            lastRideGain: null,
            lastCrashGain: null,
        },
    };
}

/** The nodes still connected to `lane`'s bus. */
const reaching = (nodes, state, lane) =>
    nodes.filter((n) => n.targets.has(state.playback.audioGraph[lane].gain));

const AHEAD = 0.12; // inside the host's 150 ms lookahead

describe('Stop cuts every lane’s notes scheduled ahead of the clock (#1999)', () => {
    it.each([
        ['bass', 'bass', (state, t) => playBassNote(state, 110, t, 0.5, 0.8, 0), killBassNote],
        [
            'lead',
            'soloist',
            (state, t) => playSoloNote(state, 440, t, 0.8, 0.8, 0, false, true, 7),
            killSoloistNote,
        ],
        ['kick', 'drums', (state, t) => playDrumSound(state, 'Kick', t, 1), killDrumNote],
        ['snare', 'drums', (state, t) => playDrumSound(state, 'Snare', t, 1), killDrumNote],
        ['hi-hat', 'drums', (state, t) => playDrumSound(state, 'HiHat', t, 1), killDrumNote],
    ])('a synth %s note due after Stop no longer reaches the %s bus', (_name, lane, play, kill) => {
        const { audio, nodes } = makeAudio();
        const state = makeState(audio);
        play(state, audio.currentTime + AHEAD);
        expect(reaching(nodes, state, lane).length).toBeGreaterThan(0);

        kill(state);

        expect(reaching(nodes, state, lane)).toEqual([]);
    });

    it('a synth chord’s onset transients due after Stop no longer reach the bus', () => {
        // The chord body and bloom were #1569's (gain pinned, stopped at their start); its two
        // onset transients, a noise chiff and a pitched click, went straight to the bus.
        const { audio, nodes } = makeAudio();
        const state = makeState(audio);
        playNote(state, 261.63, audio.currentTime + AHEAD, 2, { vol: 0.5 });
        const before = reaching(nodes, state, 'chords');

        killAllPianoNotes(state);

        // The chiff and the click leave the bus; what stays is the body and the bloom, each
        // already pinned to silence at its start by #1569's handle.
        const cut = before.filter((n) => !n.targets.has(state.playback.audioGraph.chords.gain));
        expect(cut).toHaveLength(2);
        cut.forEach((n) => {
            expect(n.gain.setTargetAtTime).toHaveBeenCalled(); // a transient's own envelope
        });
    });

    it('a note already sounding at Stop is left to its lane’s fade, not cut', () => {
        const { audio, nodes } = makeAudio();
        const state = makeState(audio);
        playDrumSound(state, 'Kick', audio.currentTime, 1);
        audio.currentTime += 0.05; // the kick is ringing
        const before = reaching(nodes, state, 'drums');

        killDrumNote(state);

        expect(reaching(nodes, state, 'drums')).toEqual(before);
    });

    it('the synth bass note sounding at Stop fades there, and the next one sent ahead never sounds', () => {
        // The monophonic bass remembers only its latest note (`lastBassGain`), and Stop used to
        // fade just that. Once note 2 is sent ahead it is the latest, so note 1, still sounding,
        // rang on until note 2's start, up to a lookahead after Stop.
        const { audio, nodes } = makeAudio();
        const state = makeState(audio);
        playBassNote(state, 110, audio.currentTime, 2, 0.8, 0);
        const first = state.bass.lastBassGain;
        audio.currentTime += 0.5; // note 1 is sounding
        const fromSecond = nodes.length;
        playBassNote(state, 98, audio.currentTime + AHEAD, 2, 0.8, 0);
        const second = nodes.slice(fromSecond);
        expect(state.bass.lastBassGain).not.toBe(first);
        expect(reaching(second, state, 'bass').length).toBeGreaterThan(0);
        const fadesAtStop = () =>
            first.gain.setTargetAtTime.mock.calls.filter(
                ([value, at]) => value === 0 && at === audio.currentTime,
            ).length;
        expect(fadesAtStop()).toBe(0);

        killBassNote(state);

        // Note 1 fades from the moment of Stop (5 ms), still connected so the fade is heard.
        expect(fadesAtStop()).toBe(1);
        expect(first.gain.cancelScheduledValues).toHaveBeenCalledWith(audio.currentTime);
        expect(first.targets.has(state.playback.audioGraph.bass.gain)).toBe(true);
        // Note 2 never reaches the bus.
        expect(reaching(second, state, 'bass')).toEqual([]);
    });

    it('a synth bass note that has ended is out of Stop’s reach', () => {
        const { audio, nodes } = makeAudio();
        const state = makeState(audio);
        playBassNote(state, 110, audio.currentTime, 0.5, 0.8, 0);
        const amp = state.bass.lastBassGain;
        audio.currentTime += 3;
        // The sub oscillator's end takes the note out of the registry.
        nodes.find((n) => n.onended)?.onended();
        const before = amp.gain.setTargetAtTime.mock.calls.length;
        killBassNote(state);
        expect(amp.gain.setTargetAtTime.mock.calls.length).toBe(before);
    });

    it('a stopped lane forgets what it cut: the next play is not cut by an old Stop', () => {
        const { audio, nodes } = makeAudio();
        const state = makeState(audio);
        playDrumSound(state, 'Kick', audio.currentTime + AHEAD, 1);
        killDrumNote(state);
        playDrumSound(state, 'Snare', audio.currentTime + AHEAD, 1);
        const fresh = reaching(nodes, state, 'drums');
        expect(fresh.length).toBeGreaterThan(0);
        // Another lane's Stop leaves it alone.
        killBassNote(state);
        expect(reaching(nodes, state, 'drums')).toEqual(fresh);
    });

    it('an offline render keeps nothing for a Stop that never comes', () => {
        const { audio, nodes } = makeAudio({ offline: true });
        const state = makeState(audio);
        playDrumSound(state, 'Kick', audio.currentTime + AHEAD, 1);
        const before = reaching(nodes, state, 'drums');
        releaseLaneVoices(audio, 'drums', audio.currentTime);
        expect(reaching(nodes, state, 'drums')).toEqual(before);
    });

    it('a sampled strike due after Stop never sounds: gain pinned to 0, stopped at its start', () => {
        // Its choke used to cancel the envelope from the hit's start, dropping the 0 there and
        // leaving the gain's default of 1 under the fade: a full-level tick.
        const { audio, nodes } = makeAudio();
        const destination = bus().gain;
        const start = audio.currentTime + AHEAD;
        playSampledStrike(audio, { duration: 1 }, destination, start, { lane: 'drums' });
        const [source, gain] = nodes;

        releaseLaneVoices(audio, 'drums', audio.currentTime);

        expect(gain.gain.setValueAtTime).toHaveBeenLastCalledWith(0, 0);
        expect(gain.gain.setTargetAtTime).not.toHaveBeenCalled();
        expect(source.stop.mock.calls.at(-1)[0]).toBeLessThanOrEqual(start);
    });
});
