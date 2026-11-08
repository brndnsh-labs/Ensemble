// @ts-nocheck
/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { makeSoloistMock } = await vi.hoisted(
    async () => await import('../../utils/mock-soloist.js'),
);

// Mock state and global modules
vi.mock('../../../core/state.js', () => {
    const mockPlayback = {
        audio: null,
        audioGraph: null,
        masterVolume: 0.5,
        isPlaying: false,
    };
    const mockChords = { volume: 1.0, enabled: true, reverb: 0.2 };
    const mockBass = { volume: 1.0, enabled: true, reverb: 0.05 };
    const mockSoloist = makeSoloistMock({ volume: 1.0, enabled: true, reverb: 0.6 });
    const mockGroove = {
        volume: 1.0,
        enabled: true,
        reverb: 0.2,
        audioBuffers: { noise: {} },
        lastSmartGenre: 'Metal',
    };
    const mockArranger = {};

    const mockStateMap = {
        playback: mockPlayback,
        chords: mockChords,
        bass: mockBass,
        soloist: mockSoloist,
        groove: mockGroove,
        arranger: mockArranger,
    };

    return {
        ...mockStateMap,
        stateMap: mockStateMap,
        getState: () => mockStateMap,
        dispatch: vi.fn(),
    };
});

// Mock Config
vi.mock('../../../core/config.js', () => ({
    MIXER_GAIN_MULTIPLIERS: {
        master: 0.85,
        chords: 0.13,
        bass: 0.1575,
        soloist: 0.15,
        drums: 0.26,
    },
    MASTER_MAKEUP_DB: Object.assign(Object.create(null), { Metal: -6, Jazz: 3 }),
    TIME_SIGNATURES: {},
}));

// Mock the audio-graph helpers (they moved to engine/audio-graph-utils.js in #1176)
vi.mock('../../../core/engine/audio-graph-utils.js', async (importOriginal) => ({
    ...(await importOriginal<any>()),
    safeDisconnect: vi.fn(),
    createSoftClipCurve: vi.fn(() => new Float32Array(1024)),
}));

import {
    initAudio,
    restoreGains,
    syncBusEq,
    syncMasterMakeup,
    syncMasterVolume,
} from '../../../core/engine/engine.js';
import { MASTER_LIMITER, masterChainReady } from '../../../core/engine/master-limiter.js';
import { getState } from '../../../core/state.js';

const { playback } = getState();

describe('Mix & Signal Integrity Audit', () => {
    function createMockNode() {
        return {
            connect: vi.fn(),
            disconnect: vi.fn(),
            gain: {
                value: 1,
                setValueAtTime: vi.fn(),
                setTargetAtTime: vi.fn(),
                exponentialRampToValueAtTime: vi.fn(),
                cancelScheduledValues: vi.fn(),
            },
            threshold: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
            knee: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
            ratio: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
            attack: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
            release: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
            frequency: {
                value: 0,
                setValueAtTime: vi.fn(),
                setTargetAtTime: vi.fn(),
                cancelScheduledValues: vi.fn(),
            },
            delayTime: { value: 0, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
            Q: { value: 0, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
            type: '',
            reduction: { value: 0 },
            start: vi.fn(),
            stop: vi.fn(),
        };
    }

    beforeEach(() => {
        vi.clearAllMocks();

        // Setup Global Audio Mock as a proper constructor function
        const MockAudioContext = vi.fn().mockImplementation(function () {
            this.state = 'running';
            this.onstatechange = null;
            this.currentTime = 0;
            this.sampleRate = 44100;
            this.createGain = vi.fn().mockImplementation(createMockNode);
            this.createStereoPanner = vi.fn().mockImplementation(() => ({
                connect: vi.fn(),
                pan: { value: 0, setTargetAtTime: vi.fn(), setValueAtTime: vi.fn() },
            }));
            this.createWaveShaper = vi.fn().mockImplementation(createMockNode);
            this.createDynamicsCompressor = vi.fn().mockImplementation(createMockNode);
            this.createConvolver = vi.fn().mockImplementation(createMockNode);
            this.createDelay = vi.fn().mockImplementation(createMockNode);
            this.createOscillator = vi.fn().mockImplementation(createMockNode);
            this.createBiquadFilter = vi.fn().mockImplementation(createMockNode);
            this.createChannelMerger = vi.fn().mockImplementation(createMockNode);
            this.createChannelSplitter = vi.fn().mockImplementation(createMockNode);
            this.createBuffer = vi.fn(() => ({
                getChannelData: vi.fn(() => new Float32Array(1024)),
            }));
            this.resume = vi.fn().mockResolvedValue();
            this.destination = {};
        });

        global.window.AudioContext = MockAudioContext;
        global.window.webkitAudioContext = MockAudioContext;
        playback.audio = null;

        // Mock DOM element for master volume
        const masterVolInput = document.createElement('input');
        masterVolInput.id = 'masterVolume';
        masterVolInput.value = '0.5';
        document.body.appendChild(masterVolInput);
    });

    it('assembles the master chain: gain -> glue -> make-up, volume -> destination (#2002)', () => {
        initAudio(getState());

        const { master } = playback.audioGraph;
        expect(master.gain.connect).toHaveBeenCalledWith(master.glue);
        expect(master.glue.connect).toHaveBeenCalledWith(master.makeup);
        expect(master.volume.connect).toHaveBeenCalledWith(playback.audio.destination);
        // The waveshaper and the brick-wall compressor that used to end the chain are gone.
        expect(playback.audio.createWaveShaper).not.toHaveBeenCalled();
        // Just the glue until the limiter is wired (a fallback would add the safety compressor).
        expect(playback.audio.createDynamicsCompressor).toHaveBeenCalledTimes(1);
    });

    it('passes nothing from make-up to volume until the limiter is wired, then a safety limiter without worklet support', async () => {
        initAudio(getState());
        const { master } = playback.audioGraph;
        // The gap is closed asynchronously: nothing is connected across it yet.
        expect(master.makeup.connect).not.toHaveBeenCalled();
        await masterChainReady(playback.audio);
        // happy-dom has no AudioWorkletNode: a compressor safety limiter takes the worklet's
        // place, never silence and never the make-up gain straight into the destination.
        const safety = playback.audio.createDynamicsCompressor.mock.results[1].value;
        expect(master.makeup.connect).toHaveBeenCalledWith(safety);
        expect(master.makeup.connect).not.toHaveBeenCalledWith(master.volume);
        expect(safety.connect).toHaveBeenCalledWith(master.volume);
        expect(safety.ratio.setValueAtTime).toHaveBeenCalledWith(20, 0);
    });

    it('puts the look-ahead limiter between make-up and volume when worklets run', async () => {
        const built = [];
        const addModule = vi.fn().mockResolvedValue(undefined);
        global.AudioWorkletNode = vi.fn().mockImplementation(function (_ctx, name, options) {
            this.name = name;
            this.options = options;
            this.connect = vi.fn();
            built.push(this);
        });
        const BaseContext = global.window.AudioContext;
        const WorkletContext = vi.fn().mockImplementation(function () {
            BaseContext.call(this);
            this.audioWorklet = { addModule };
        });
        global.window.AudioContext = WorkletContext;
        try {
            initAudio(getState());
            const { master } = playback.audioGraph;
            await masterChainReady(playback.audio);
            expect(addModule).toHaveBeenCalledTimes(1);
            expect(String(addModule.mock.calls[0][0])).toMatch(/master-limiter\.worklet\.js$/);
            expect(built).toHaveLength(1);
            const [limiter] = built;
            expect(limiter.name).toBe('ensemble-master-limiter');
            expect(limiter.options.processorOptions).toEqual({ ...MASTER_LIMITER });
            expect(limiter.options.outputChannelCount).toEqual([2]);
            expect(master.makeup.connect).toHaveBeenCalledWith(limiter);
            expect(master.makeup.connect).not.toHaveBeenCalledWith(master.volume);
            expect(limiter.connect).toHaveBeenCalledWith(master.volume);
        } finally {
            delete global.AudioWorkletNode;
            global.window.AudioContext = BaseContext;
        }
    });

    it('falls back to the safety limiter (never silence) when the worklet module fails to load', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        global.AudioWorkletNode = vi.fn();
        const BaseContext = global.window.AudioContext;
        global.window.AudioContext = vi.fn().mockImplementation(function () {
            BaseContext.call(this);
            this.audioWorklet = { addModule: vi.fn().mockRejectedValue(new Error('blocked')) };
        });
        try {
            initAudio(getState());
            const { master } = playback.audioGraph;
            await masterChainReady(playback.audio);
            expect(global.AudioWorkletNode).not.toHaveBeenCalled();
            const safety = playback.audio.createDynamicsCompressor.mock.results[1].value;
            expect(master.makeup.connect).toHaveBeenCalledWith(safety);
            expect(safety.connect).toHaveBeenCalledWith(master.volume);
            expect(warn).toHaveBeenCalled();
        } finally {
            delete global.AudioWorkletNode;
            global.window.AudioContext = BaseContext;
            warn.mockRestore();
        }
    });

    it('falls back to the safety limiter when the module load stalls, so Play never waits forever', async () => {
        vi.useFakeTimers();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        global.AudioWorkletNode = vi.fn();
        const BaseContext = global.window.AudioContext;
        global.window.AudioContext = vi.fn().mockImplementation(function () {
            BaseContext.call(this);
            this.audioWorklet = { addModule: vi.fn(() => new Promise(() => {})) };
        });
        try {
            initAudio(getState());
            const { master } = playback.audioGraph;
            const ready = masterChainReady(playback.audio);
            await vi.advanceTimersByTimeAsync(3000);
            await ready;
            const safety = playback.audio.createDynamicsCompressor.mock.results[1].value;
            expect(master.makeup.connect).toHaveBeenCalledWith(safety);
            expect(global.AudioWorkletNode).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
            delete global.AudioWorkletNode;
            global.window.AudioContext = BaseContext;
            warn.mockRestore();
        }
    });

    it('restores the make-up gain for the style now set on every restoreGains', () => {
        const groove = getState().groove;
        groove.lastSmartGenre = 'Metal';
        initAudio(getState());
        const { makeup } = playback.audioGraph.master;
        // A chart opens on another style with no genre effect running (the runtime's
        // subscriber is off while it loads); its rebuild's restoreGains brings the make-up along.
        groove.lastSmartGenre = 'Jazz';
        restoreGains(getState());
        expect(makeup.gain.setTargetAtTime.mock.calls.at(-1)[0]).toBeCloseTo(10 ** (3 / 20), 6);
        groove.lastSmartGenre = 'Metal';
    });

    it('falls back to the safety limiter when addModule throws synchronously', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        global.AudioWorkletNode = vi.fn();
        const BaseContext = global.window.AudioContext;
        global.window.AudioContext = vi.fn().mockImplementation(function () {
            BaseContext.call(this);
            this.audioWorklet = {
                addModule: vi.fn(() => {
                    throw new Error('InvalidStateError');
                }),
            };
        });
        try {
            initAudio(getState());
            const { master } = playback.audioGraph;
            await expect(masterChainReady(playback.audio)).resolves.toBeUndefined();
            const safety = playback.audio.createDynamicsCompressor.mock.results[1].value;
            expect(master.makeup.connect).toHaveBeenCalledWith(safety);
        } finally {
            delete global.AudioWorkletNode;
            global.window.AudioContext = BaseContext;
            warn.mockRestore();
        }
    });

    it("sets the style's make-up gain from MASTER_MAKEUP_DB and glides it on a genre change", () => {
        const groove = getState().groove;
        groove.lastSmartGenre = 'Metal';
        initAudio(getState());
        const { makeup } = playback.audioGraph.master;
        expect(makeup.gain.setValueAtTime.mock.calls[0][0]).toBeCloseTo(10 ** (-6 / 20), 6);

        groove.lastSmartGenre = 'Jazz';
        syncMasterMakeup(getState());
        expect(makeup.gain.setTargetAtTime.mock.calls.at(-1)[0]).toBeCloseTo(10 ** (3 / 20), 6);

        // An unknown or prototype-key genre plays at 0 dB, never reads Object's prototype.
        groove.lastSmartGenre = 'constructor';
        syncMasterMakeup(getState());
        expect(makeup.gain.setTargetAtTime.mock.calls.at(-1)[0]).toBe(1);
        groove.lastSmartGenre = 'Metal';
    });

    it('retunes the style-dependent bus EQ on a genre change to what a fresh initAudio sets (#2106)', () => {
        const groove = getState().groove;
        /** The four params the playing feel decides, read off a graph. */
        const eqOf = (graph) => ({
            chordsShelf: graph.chords.shelf.gain,
            bassHighpass: graph.bass.eq.frequency,
            bassWeight: graph.bass.shelf.gain,
            drumsHighpass: graph.drums.eq.frequency,
        });
        /** What initAudio wrote: the last setValueAtTime value on each param. */
        const freshWith = (feel) => {
            groove.genreFeel = feel;
            playback.audio = null;
            initAudio(getState());
            const out = {};
            for (const [k, p] of Object.entries(eqOf(playback.audioGraph))) {
                out[k] = p.setValueAtTime.mock.calls.at(-1)[0];
            }
            return out;
        };
        const rock = freshWith('Rock');
        const jazz = freshWith('Jazz');
        expect(jazz).toEqual({
            chordsShelf: -5,
            bassHighpass: 55,
            bassWeight: -1,
            drumsHighpass: 95,
        });
        expect(rock).toEqual({
            chordsShelf: -2,
            bassHighpass: 20,
            bassWeight: 2,
            drumsHighpass: 40,
        });

        // A session that starts on Rock and moves to Jazz, then back.
        groove.genreFeel = 'Rock';
        playback.audio = null;
        initAudio(getState());
        const params = eqOf(playback.audioGraph);
        const targets = () =>
            Object.fromEntries(
                Object.entries(params).map(([k, p]) => [
                    k,
                    p.setTargetAtTime.mock.calls.at(-1)?.[0],
                ]),
            );
        groove.genreFeel = 'Jazz';
        syncBusEq(getState());
        expect(targets()).toEqual(jazz);
        groove.genreFeel = 'Rock';
        syncBusEq(getState());
        expect(targets()).toEqual(rock);

        // restoreGains (every chart open) restores it too, with no genre effect having run.
        groove.genreFeel = 'Jazz';
        restoreGains(getState());
        expect(targets()).toEqual(jazz);
        groove.genreFeel = undefined;
    });

    it('makes the master volume a plain level after the limiter, guarded against NaN', () => {
        initAudio(getState());
        const { volume } = playback.audioGraph.master;
        // masterVolume 0.5 in the mock state.
        expect(volume.gain.setValueAtTime.mock.calls[0][0]).toBeCloseTo(0.5, 6);

        playback.masterVolume = Number.NaN;
        syncMasterVolume(getState());
        expect(volume.gain.exponentialRampToValueAtTime.mock.calls.at(-1)[0]).toBe(1);

        playback.masterVolume = 0;
        syncMasterVolume(getState());
        // The floor keeps the exponential ramp off zero.
        expect(volume.gain.exponentialRampToValueAtTime.mock.calls.at(-1)[0]).toBe(0.0001);
        playback.masterVolume = 0.5;
    });
});
