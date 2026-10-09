// @ts-nocheck
/**
 * Stop reaches every sampled lane (#1530). Each sampled voice joins its lane's set as it is
 * made (`sample-voice.ts`), and each lane's kill function releases that set. Before, the host
 * dropped the handles: a held organ chord, a sampled bass or lead note and a ringing sampled
 * cymbal all played on after Stop. Real `sample-voice`, a recording audio context.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ zones: [] as unknown[] }));
vi.mock('../../../public/engine/pack-runtime.js', () => ({
    getPackZones: () => mocks.zones,
}));

import {
    __resetPackCacheForTest,
    registerPackBuffer,
} from '../../../public/engine/instrument-registry.js';
import { killBassNote, playBassNote } from '../../../public/engine/synth-bass.js';
import { killAllPianoNotes, playNote } from '../../../public/engine/synth-chords.js';
import { killDrumNote, playDrumSound } from '../../../public/engine/synth-drums.js';
import { killSoloistNote, playSoloNote } from '../../../public/engine/synth-soloist.js';

const param = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
});

/** An audio context that hands back every gain and source it makes. */
function makeAudio() {
    const gains = [];
    const sources = [];
    const node = (extra = {}) => ({ connect: vi.fn(), disconnect: vi.fn(), ...extra });
    const audio = {
        currentTime: 4,
        sampleRate: 48000,
        createGain: vi.fn(() => {
            const gain = node({ gain: param() });
            gains.push(gain);
            return gain;
        }),
        createBufferSource: vi.fn(() => {
            const source = node({
                playbackRate: param(),
                detune: param(),
                start: vi.fn(),
                stop: vi.fn(),
                onended: null,
                buffer: null,
            });
            sources.push(source);
            return source;
        }),
        createStereoPanner: vi.fn(() => node({ pan: param() })),
        createBiquadFilter: vi.fn(() =>
            node({ type: '', frequency: param(), gain: param(), Q: param() }),
        ),
        createOscillator: vi.fn(() =>
            node({ frequency: param(), detune: param(), start: vi.fn(), stop: vi.fn() }),
        ),
    };
    return { audio, gains, sources };
}

const PACK = 'stop-test-pack';
const bus = () => ({ gain: { connect: vi.fn(), gain: param() } });

function makeState(audio) {
    return {
        playback: {
            audio,
            audioGraph: { chords: bus(), bass: bus(), soloist: bus(), drums: bus() },
            heldNotes: new Set(),
            sustainActive: false,
        },
        chords: { voice: `pack:${PACK}` },
        bass: { voice: `pack:${PACK}`, lastBassGain: null },
        soloist: {
            voice: `pack:${PACK}`,
            mode: 'monophonic',
            audio: { lastRenderedFreq: null, activeVoices: [] },
        },
        groove: {
            voice: `pack:${PACK}`,
            humanize: 0,
            audioBuffers: { noise: {} },
            lastHatGain: null,
            lastSampledHatVoice: null,
            lastRideGain: null,
            lastCrashGain: null,
        },
    };
}

/**
 * The fades a stop asked for at the context's current time (a drum hit is scheduled a couple of
 * milliseconds ahead, so its fade is from its own start).
 */
const fadedNow = (gains, audio) =>
    gains.filter((gain) =>
        gain.gain.setTargetAtTime.mock.calls.some(
            ([value, time]) =>
                value === 0 && time >= audio.currentTime && time < audio.currentTime + 0.01,
        ),
    );

describe('Stop silences every sampled lane (#1530)', () => {
    beforeEach(() => {
        __resetPackCacheForTest();
        const buffer = { duration: 4 };
        // One registration makes the pack "loaded"; the crash key is the kit's cymbal.
        registerPackBuffer(PACK, 'crash', buffer);
        mocks.zones = [{ rootMidi: 60, buffer }];
    });

    it.each([
        ['chords', (state) => playNote(state, 261.63, 3, 8, { vol: 0.5 }), killAllPianoNotes],
        ['bass', (state) => playBassNote(state, 110, 3, 8, 0.8, 0), killBassNote],
        [
            'soloist',
            (state) => playSoloNote(state, 440, 3, 8, 0.8, 0, 'scalar', false, false, 1),
            killSoloistNote,
        ],
        ['drums', (state) => playDrumSound(state, 'Crash', 3, 1), killDrumNote],
    ])('a %s sample sounding at Stop is faded there', (_lane, play, kill) => {
        const { audio, gains, sources } = makeAudio();
        const state = makeState(audio);
        play(state);
        expect(sources).toHaveLength(1);
        expect(fadedNow(gains, audio)).toHaveLength(0);

        kill(state);

        expect(fadedNow(gains, audio)).toHaveLength(1);
        // Stopped within a tenth of a second of the Stop, not at the end of its hold.
        expect(sources[0].stop.mock.calls.at(-1)[0]).toBeLessThan(audio.currentTime + 0.1);
    });

    it('a note that has ended is not touched again', () => {
        const { audio, gains, sources } = makeAudio();
        const state = makeState(audio);
        playNote(state, 261.63, 3, 0.5, { vol: 0.5 });
        sources[0].onended();
        killAllPianoNotes(state);
        expect(fadedNow(gains, audio)).toHaveLength(0);
    });
});
