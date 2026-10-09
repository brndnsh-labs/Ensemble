import { beforeEach, describe, expect, it, vi } from 'vitest';
import { playback, playbackReducer } from '../../../public/state/playback.js';
import { ACTIONS } from '../../../public/types.js';
import { resetAllStateForTest } from '../../utils/reset-state.js';

describe('Playback Reducer', () => {
    beforeEach(() => {
        resetAllStateForTest();
        vi.useFakeTimers();
    });

    it('should set BPM with clamping', () => {
        playbackReducer({ type: ACTIONS.SET_BPM, payload: 300 });
        expect(playback.bpm).toBe(240);
        playbackReducer({ type: ACTIONS.SET_BPM, payload: 20 });
        expect(playback.bpm).toBe(40);
    });

    it('should set various playback flags and params', () => {
        playbackReducer({ type: ACTIONS.SET_BAND_INTENSITY, payload: 0.9 });
        expect(playback.bandIntensity).toBe(0.9);

        playbackReducer({ type: ACTIONS.SET_AUTO_INTENSITY, payload: false });
        expect(playback.autoIntensity).toBe(false);

        playbackReducer({ type: ACTIONS.SET_METRONOME, payload: true });
        expect(playback.metronome).toBe(true);
    });

    describe('section practice (#1016)', () => {
        it('seeds and clamps the start step', () => {
            playbackReducer({ type: ACTIONS.SET_START_STEP, payload: 48 });
            expect(playback.startStep).toBe(48);
            // Negative / non-finite payloads floor to 0 rather than poison `step`.
            playbackReducer({ type: ACTIONS.SET_START_STEP, payload: -5 });
            expect(playback.startStep).toBe(0);
            playbackReducer({ type: ACTIONS.SET_START_STEP, payload: Number.NaN });
            expect(playback.startStep).toBe(0);
        });
    });

    it('should handle generic SET_PARAM action and break for other modules (line 174)', () => {
        playbackReducer({
            type: ACTIONS.SET_PARAM,
            payload: { module: 'playback', param: 'masterVolume', value: 0.6 },
        });
        expect(playback.masterVolume).toBe(0.6);

        // Other module (hits line 174)
        const result = playbackReducer({
            type: ACTIONS.SET_PARAM,
            payload: { module: 'not_playback', param: 'masterVolume', value: 0.9 },
        });
        expect(result).toBe(false);
    });

    it('should show toasts and auto-remove them', () => {
        playbackReducer({
            type: ACTIONS.SHOW_TOAST,
            payload: { id: 'test-id', message: 'Hello World' },
        });
        expect(playback.toasts.length).toBe(1);
        expect(playback.toasts[0].message).toBe('Hello World');

        playbackReducer({ type: ACTIONS.TOAST_EXPIRED, payload: 'test-id' });
        expect(playback.toasts.length).toBe(0);
    });

    it('should trigger flash and auto-reset', () => {
        playbackReducer({ type: ACTIONS.TRIGGER_FLASH, payload: 0.5 });
        expect(playback.flashIntensity).toBe(0.5);

        playbackReducer({ type: ACTIONS.FLASH_EXPIRED, payload: undefined });
        expect(playback.flashIntensity).toBe(0);
    });

    describe('setPlaybackParam via reducer', () => {
        it('should update ALL supported parameters', () => {
            const allParams = {
                audio: { ctx: true },
                masterGain: { gain: true },
                saturator: { sat: true },
                reverbNode: { rev: true },
                chordsGain: { g: 1 },
                chordsReverb: { r: 1 },
                chordsEQ: { e: 1 },
                drumsReverb: { dr: 1 },
                drumsGain: { dg: 1 },
                bassReverb: { br: 1 },
                bassGain: { bg: 1 },
                bassEQ: { be: 1 },
                soloistReverb: { sr: 1 },
                soloistGain: { sg: 1 },
                harmoniesReverb: { hr: 1 },
                isPlaying: true,
                bpm: 120,
                nextNoteTime: 1.0,
                unswungNextNoteTime: 1.0,
                scheduleAheadTime: 0.3,
                step: 16,
                drawQueue: [{ event: 'test' }],
                isDrawing: true,
                theme: 'light',
                wakeLock: { lock: true },
                bandIntensity: 0.8,
                autoIntensity: false,
                metronome: true,
                applyPresetSettings: true,
                sustainActive: true,
                songMode: false,
                sessionTimer: 15,
                debugSoloist: true,
                loopLimit: 10,
                currentLoopCount: 5,
                sessionStartTime: 1000,
                isEndingPending: true,
                intent: { density: 0.9 },
                lastActiveDrumElements: [],
                lastPlayingStep: 8,
                workerLogging: true,
                viz: { v: 1 },
                suspendTimeout: 123,
                lyricalBias: 0.2,
                masterLimiter: { l: 1 },
                masterVolume: 0.7,
                countIn: false,
                visualFlash: true,
                toasts: [],
                flashIntensity: 0.1,
                resolutionTriggered: true,
                isScheduling: true,
                soloistEQ: { eq: 1 },
                harmoniesGain: { g: 1 },
                harmoniesEQ: { eq: 1 },
            };

            for (const [param, value] of Object.entries(allParams)) {
                playbackReducer({
                    type: ACTIONS.SET_PARAM,
                    payload: { module: 'playback', param, value },
                });
                expect((playback as any)[param]).toEqual(value);
            }
        });
    });
});
