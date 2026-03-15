import { beforeEach, describe, expect, it, vi } from 'vitest';
import { playback, playbackReducer, setPlaybackParam } from '../../../public/state/playback.js';
import { ACTIONS } from '../../../public/types.js';

describe('Playback Reducer', () => {
    beforeEach(() => {
        playbackReducer(ACTIONS.RESET_STATE);
        vi.useFakeTimers();
    });

    it('should reset to default values', () => {
        playback.bpm = 150;
        playback.bandIntensity = 0.8;
        playbackReducer(ACTIONS.RESET_STATE);
        expect(playback.bpm).toBe(100);
        expect(playback.bandIntensity).toBe(0.35);
    });

    it('should set update available', () => {
        playbackReducer(ACTIONS.SET_UPDATE_AVAILABLE, true);
        expect(playback.updateAvailable).toBe(true);
    });

    it('should set BPM with clamping', () => {
        playbackReducer(ACTIONS.SET_BPM, 300);
        expect(playback.bpm).toBe(240);
        playbackReducer(ACTIONS.SET_BPM, 20);
        expect(playback.bpm).toBe(40);
    });

    it('should toggle playing state', () => {
        playbackReducer(ACTIONS.TOGGLE_PLAY);
        expect(playback.isPlaying).toBe(true);
        playbackReducer(ACTIONS.TOGGLE_PLAY);
        expect(playback.isPlaying).toBe(false);
    });

    it('should set various playback flags and params', () => {
        playbackReducer(ACTIONS.SET_BAND_INTENSITY, 0.9);
        expect(playback.bandIntensity).toBe(0.9);

        playbackReducer(ACTIONS.SET_COMPLEXITY, 0.1);
        expect(playback.complexity).toBe(0.1);

        playbackReducer(ACTIONS.SET_AUTO_INTENSITY, false);
        expect(playback.autoIntensity).toBe(false);

        playbackReducer(ACTIONS.SET_METRONOME, true);
        expect(playback.metronome).toBe(true);

        playbackReducer(ACTIONS.SET_PRESET_SETTINGS_MODE, true);
        expect(playback.applyPresetSettings).toBe(true);

        playbackReducer(ACTIONS.SET_SONG_MODE, false);
        expect(playback.songMode).toBe(false);

        playbackReducer(ACTIONS.SET_SESSION_TIMER, 10);
        expect(playback.sessionTimer).toBe(10);

        playbackReducer(ACTIONS.SET_STOP_AT_END, true);
        expect(playback.stopAtEnd).toBe(true);

        playbackReducer(ACTIONS.SET_ENDING_PENDING, true);
        expect(playback.isEndingPending).toBe(true);
    });

    it('should handle modal opening/closing for valid modals only (line 168)', () => {
        // Valid modal
        const result = playbackReducer(ACTIONS.SET_MODAL_OPEN, { modal: 'settings', open: true });
        expect(result).toBe(true);
        expect(playback.modals.settings).toBe(true);

        // Invalid modal (hits line 168)
        const invalidResult = playbackReducer(ACTIONS.SET_MODAL_OPEN, {
            modal: 'invalid_modal',
            open: true,
        });
        expect(invalidResult).toBe(false);
    });

    it('should handle generic SET_PARAM action and break for other modules (line 174)', () => {
        playbackReducer(ACTIONS.SET_PARAM, { module: 'playback', param: 'theme', value: 'dark' });
        expect(playback.theme).toBe('dark');

        // Other module (hits line 174)
        const result = playbackReducer(ACTIONS.SET_PARAM, {
            module: 'not_playback',
            param: 'theme',
            value: 'light',
        });
        expect(result).toBe(false);
    });

    it('should handle emergency lookahead doubling', () => {
        playback.scheduleAheadTime = 0.2;
        playbackReducer(ACTIONS.TRIGGER_EMERGENCY_LOOKAHEAD);
        expect(playback.scheduleAheadTime).toBe(0.4);

        // Should not double again if already >= 0.4
        playbackReducer(ACTIONS.TRIGGER_EMERGENCY_LOOKAHEAD);
        expect(playback.scheduleAheadTime).toBe(0.4);

        // Should reset after 10s
        vi.advanceTimersByTime(10000);
        expect(playback.scheduleAheadTime).toBe(0.2);
    });

    it('should show toasts and auto-remove them', () => {
        playbackReducer(ACTIONS.SHOW_TOAST, { id: 'test-id', message: 'Hello World' });
        expect(playback.toasts.length).toBe(1);
        expect(playback.toasts[0].message).toBe('Hello World');

        playbackReducer('TOAST_EXPIRED', 'test-id');
        expect(playback.toasts.length).toBe(0);
    });

    it('should trigger flash and auto-reset', () => {
        playbackReducer(ACTIONS.TRIGGER_FLASH, 0.5);
        expect(playback.flashIntensity).toBe(0.5);

        playbackReducer('FLASH_EXPIRED');
        expect(playback.flashIntensity).toBe(0);
    });

    it('should update conductor decision', () => {
        const payload = {
            velocity: 0.7,
            lyricalBias: 0.3,
            intent: { density: 0.8 },
        };
        playbackReducer(ACTIONS.UPDATE_CONDUCTOR_DECISION, payload);
        expect(playback.conductorVelocity).toBe(0.7);
        expect(playback.lyricalBias).toBe(0.3);
        expect(playback.intent.density).toBe(0.8);
    });

    describe('setPlaybackParam', () => {
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
                isCountingIn: true,
                countInBeat: 2,
                isDrawing: true,
                theme: 'light',
                wakeLock: { lock: true },
                bandIntensity: 0.8,
                complexity: 0.9,
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
                stopAtEnd: true,
                isEndingPending: true,
                intent: { density: 0.9 },
                lastActiveDrumElements: [],
                lastPlayingStep: 8,
                workerLogging: true,
                viz: { v: 1 },
                suspendTimeout: 123,
                conductorVelocity: 0.5,
                lyricalBias: 0.2,
                masterLimiter: { l: 1 },
                masterVolume: 0.7,
                countIn: false,
                visualFlash: true,
                haptic: true,
                toasts: [],
                flashIntensity: 0.1,
                updateAvailable: true,
                resolutionTriggered: true,
                isScheduling: true,
                stateVersion: 10,
                modals: { settings: true },
                soloistEQ: { eq: 1 },
                harmoniesGain: { g: 1 },
                harmoniesEQ: { eq: 1 },
            };

            for (const [param, value] of Object.entries(allParams)) {
                setPlaybackParam(param, value);
                expect(playback[param]).toEqual(value);
            }
        });

        it('should log warning for unknown parameters', () => {
            const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            setPlaybackParam('ghost_param', 'spooky');
            expect(spy).toHaveBeenCalledWith('[State] Unknown playback param: ghost_param');
            spy.mockRestore();
        });
    });
});
