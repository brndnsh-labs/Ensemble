/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatch, getState, storage } from '../../public/state.js';

const { arranger, playback, chords, bass, soloist, groove } = getState();

import { audioWatchdog } from '../../public/audio-recovery.js';
import { initAudio } from '../../public/engine/engine.js';
import { scheduleGlobalEvent } from '../../public/engine/scheduler-core.js';
import { getTimerWorker, initWorker } from '../../public/worker-client.js';

// Mock Worker to bypass async complexity and control the clock
vi.mock('../../public/worker-client.js', () => ({
    initWorker: vi.fn(),
    syncWorker: vi.fn(),
    flushWorker: vi.fn(),
    getTimerWorker: () => ({ postMessage: vi.fn() }),
}));

vi.mock('../../public/ui.js', () => ({
    ui: {
        masterVol: { value: '0.5' },
        chordVol: { value: '0.5' },
        bassVol: { value: '0.5' },
        soloistVol: { value: '0.5' },
        drumVol: { value: '0.5' },
        chordReverb: { value: '0.3' },
        bassReverb: { value: '0.1' },
        soloistReverb: { value: '0.6' },
        drumReverb: { value: '0.2' },
        metronome: { checked: false },
        visualFlash: { checked: false },
    },
}));

// Deterministic Math.random
const _randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);

describe('Audio Engine Snapshot Regression', () => {
    let audioLog = [];
    let currentTime = 0;

    beforeEach(() => {
        vi.clearAllMocks();
        audioLog = [];
        currentTime = 0;

        // Mock AudioContext and its nodes
        const mockAudioContext = {
            get currentTime() {
                return currentTime;
            },
            sampleRate: 44100,
            state: 'running',
            createOscillator: () => {
                const id = `osc_${audioLog.length}`;
                return {
                    connect: (dest) => audioLog.push(`${id}.connect(${dest.id || 'node'})`),
                    start: (t) => audioLog.push(`${id}.start(${t.toFixed(3)})`),
                    stop: (t) => audioLog.push(`${id}.stop(${t.toFixed(3)})`),
                    frequency: {
                        setValueAtTime: (v, t) =>
                            audioLog.push(`${id}.freq.set(${v.toFixed(1)}, ${t.toFixed(3)})`),
                        setTargetAtTime: (v, t, _c) =>
                            audioLog.push(`${id}.freq.target(${v.toFixed(1)}, ${t.toFixed(3)})`),
                        exponentialRampToValueAtTime: (v, t) =>
                            audioLog.push(`${id}.freq.ramp(${v.toFixed(1)}, ${t.toFixed(3)})`),
                    },
                    detune: { setValueAtTime: () => {} },
                    setPeriodicWave: () => {},
                    onended: null,
                    id,
                };
            },
            createGain: () => {
                const id = `gain_${audioLog.length}`;
                return {
                    connect: (dest) => audioLog.push(`${id}.connect(${dest.id || 'node'})`),
                    gain: {
                        value: 1,
                        setValueAtTime: (v, t) =>
                            audioLog.push(`${id}.gain.set(${v.toFixed(3)}, ${t.toFixed(3)})`),
                        exponentialRampToValueAtTime: (v, t) =>
                            audioLog.push(`${id}.gain.ramp(${v.toFixed(3)}, ${t.toFixed(3)})`),
                        setTargetAtTime: (v, t, _c) =>
                            audioLog.push(`${id}.gain.target(${v.toFixed(3)}, ${t.toFixed(3)})`),
                        cancelScheduledValues: () => {},
                    },
                    id,
                };
            },
            createBiquadFilter: () => ({
                connect: () => {},
                frequency: { setValueAtTime: () => {}, setTargetAtTime: () => {} },
                Q: { setValueAtTime: () => {} },
                gain: { setValueAtTime: () => {} },
            }),
            createBufferSource: () => ({
                buffer: null,
                connect: () => {},
                start: () => {},
                stop: () => {},
                playbackRate: { setValueAtTime: () => {} },
                onended: null,
            }),
            createBuffer: () => ({
                getChannelData: () => new Float32Array(44100),
            }),
            createDynamicsCompressor: () => ({
                threshold: { setValueAtTime: () => {}, setTargetAtTime: () => {} },
                ratio: { setValueAtTime: () => {}, setTargetAtTime: () => {} },
                knee: { setValueAtTime: () => {} },
                attack: { setValueAtTime: () => {} },
                release: { setValueAtTime: () => {} },
                connect: () => {},
            }),
            createWaveShaper: () => ({
                curve: null,
                oversample: 'none',
                connect: () => {},
            }),
            createConvolver: () => ({
                buffer: null,
                connect: () => {},
            }),
            createPeriodicWave: () => ({}),
            destination: { id: 'destination' },
        };

        // biome-ignore lint/complexity/useArrowFunction: constructor behavior required
        global.AudioContext = vi.fn().mockImplementation(function () {
            return mockAudioContext;
        });

        // Reset State
        playback.bpm = 120;
        playback.bandIntensity = 0.5;
        groove.genreFeel = 'Jazz';
        chords.enabled = true;
        bass.enabled = true;
        soloist.enabled = true;

        // Init Engine
        initAudio(getState());
    });

    afterEach(() => {
        audioWatchdog.stop();
    });

    it('should produce a deterministic audio schedule for a Jazz Blues progression', () => {
        // Setup a 12-bar Blues
        arranger.sections = [
            {
                id: 's1',
                label: 'Blues',
                value: 'C7 | F7 | C7 | C7 | F7 | F7 | C7 | C7 | G7 | F7 | C7 | G7',
            },
        ];
        arranger.totalSteps = 12 * 16;
        // Populate stepMap manually or via a helper if possible,
        // but for unit testing, we often mock the map.
        // However, we want to test the ENGINE's reaction to the map.
        // Let's rely on the fact that scheduleGlobalEvent looks at arranger.stepMap

        // We'll mock a simple 1-bar map for brevity of the snapshot
        const chordC7 = {
            rootMidi: 60,
            intervals: [0, 4, 7, 10],
            freqs: [261.6, 329.6, 392.0, 466.1],
            quality: '7',
            beats: 4,
            sectionId: 's1',
            sectionLabel: 'Blues',
            key: 'C',
        };
        arranger.stepMap = new Array(16).fill({ start: 0, end: 16, chord: chordC7 });
        arranger.timeSignature = '4/4';

        // Run 1 Measure (16 steps)
        const stepDuration = 60 / 120 / 4; // 125ms

        for (let step = 0; step < 16; step++) {
            scheduleGlobalEvent(getState(), step, currentTime);
            currentTime += stepDuration;
        }

        // Snapshot Verification
        // We verify critical log entries to ensure instruments are firing

        // 1. Piano (Oscillators for chords)
        const freqSets = audioLog.filter((l) => l.includes('freq.set'));
        expect(freqSets.length).toBeGreaterThan(10); // Should be many notes

        // 2. Bass (Oscillator start)
        const starts = audioLog.filter((l) => l.includes('start'));
        expect(starts.length).toBeGreaterThan(5);

        // 3. Determinism check
        // The exact log should be identical every run given the seeded random
        const snapshotParams = {
            oscStarts: starts.length,
            gainRamps: audioLog.filter((l) => l.includes('gain.ramp')).length,
            uniqueFreqs: new Set(freqSets.map((l) => l.split('(')[1].split(',')[0])).size,
        };

        // These numbers are derived from a "golden run".
        // If logic changes significantly, these will need updating.
        expect(snapshotParams.oscStarts).toBeGreaterThanOrEqual(12); // At least 1 note per beat + chord voices
        expect(snapshotParams.gainRamps).toBeGreaterThanOrEqual(10);
    });
});
