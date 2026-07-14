import { beforeEach, describe, expect, it, vi } from 'vitest';
import { playback, playbackReducer } from '../../../public/state/playback.js';
import { ACTIONS } from '../../../public/types.js';

describe('Playback Reducer', () => {
    beforeEach(() => {
        playbackReducer({ type: ACTIONS.RESET_STATE, payload: undefined });
        vi.useFakeTimers();
    });

    it('should reset to default values', () => {
        playback.bpm = 150;
        playback.bandIntensity = 0.8;
        playbackReducer({ type: ACTIONS.RESET_STATE, payload: undefined });
        expect(playback.bpm).toBe(100);
        expect(playback.bandIntensity).toBe(0.35);
    });

    it('should set update available', () => {
        playbackReducer({ type: ACTIONS.SET_UPDATE_AVAILABLE, payload: true });
        expect(playback.updateAvailable).toBe(true);
    });

    it('should set BPM with clamping', () => {
        playbackReducer({ type: ACTIONS.SET_BPM, payload: 300 });
        expect(playback.bpm).toBe(240);
        playbackReducer({ type: ACTIONS.SET_BPM, payload: 20 });
        expect(playback.bpm).toBe(40);
    });

    it('should toggle playing state', () => {
        playbackReducer({ type: ACTIONS.TOGGLE_PLAY, payload: undefined });
        expect(playback.isPlaying).toBe(true);
        playbackReducer({ type: ACTIONS.TOGGLE_PLAY, payload: undefined });
        expect(playback.isPlaying).toBe(false);
    });

    it('should set various playback flags and params', () => {
        playbackReducer({ type: ACTIONS.SET_BAND_INTENSITY, payload: 0.9 });
        expect(playback.bandIntensity).toBe(0.9);

        playbackReducer({ type: ACTIONS.SET_COMPLEXITY, payload: 0.1 });
        expect(playback.complexity).toBe(0.1);

        playbackReducer({ type: ACTIONS.SET_AUTO_INTENSITY, payload: false });
        expect(playback.autoIntensity).toBe(false);

        playbackReducer({ type: ACTIONS.SET_METRONOME, payload: true });
        expect(playback.metronome).toBe(true);

        playbackReducer({ type: ACTIONS.SET_PRESET_SETTINGS_MODE, payload: true });
        expect(playback.applyPresetSettings).toBe(true);

        playbackReducer({ type: ACTIONS.SET_SONG_MODE, payload: false });
        expect(playback.songMode).toBe(false);

        playbackReducer({ type: ACTIONS.SET_SESSION_TIMER, payload: 10 });
        expect(playback.sessionTimer).toBe(10);

        playbackReducer({ type: ACTIONS.SET_STOP_AT_END, payload: true });
        expect(playback.stopAtEnd).toBe(true);

        playbackReducer({ type: ACTIONS.SET_ENDING_PENDING, payload: true });
        expect(playback.isEndingPending).toBe(true);
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

        it('sets a valid practice loop, seeds startStep atomically, and clears on null', () => {
            playbackReducer({ type: ACTIONS.SET_PRACTICE_LOOP, payload: { start: 32, end: 64 } });
            expect(playback.loopStartStep).toBe(32);
            expect(playback.loopEndStep).toBe(64);
            // The loop always begins at its own start — seeded in one dispatch.
            expect(playback.startStep).toBe(32);

            // Clearing leaves startStep alone (playhead flows on from where it is).
            playbackReducer({ type: ACTIONS.SET_PRACTICE_LOOP, payload: null });
            expect(playback.loopStartStep).toBe(-1);
            expect(playback.loopEndStep).toBe(-1);
            expect(playback.startStep).toBe(32);
        });

        it('rejects an empty or inverted loop range (clears instead)', () => {
            playbackReducer({ type: ACTIONS.SET_PRACTICE_LOOP, payload: { start: 32, end: 64 } });
            // end <= start is not a loop — treat as clear.
            playbackReducer({ type: ACTIONS.SET_PRACTICE_LOOP, payload: { start: 64, end: 64 } });
            expect(playback.loopStartStep).toBe(-1);
            expect(playback.loopEndStep).toBe(-1);
        });

        it('stopping playback clears the drill (start step + loop)', () => {
            playbackReducer({ type: ACTIONS.SET_START_STEP, payload: 32 });
            playbackReducer({ type: ACTIONS.SET_PRACTICE_LOOP, payload: { start: 32, end: 64 } });
            // Start (isPlaying → true) keeps the seed…
            playbackReducer({ type: ACTIONS.TOGGLE_PLAY, payload: undefined });
            expect(playback.isPlaying).toBe(true);
            expect(playback.startStep).toBe(32);
            expect(playback.loopStartStep).toBe(32);
            // …stop (isPlaying → false) wipes it so the next plain Play starts at the top.
            playbackReducer({ type: ACTIONS.TOGGLE_PLAY, payload: undefined });
            expect(playback.isPlaying).toBe(false);
            expect(playback.startStep).toBe(0);
            expect(playback.loopStartStep).toBe(-1);
            expect(playback.loopEndStep).toBe(-1);
        });
    });

    it('should handle modal opening/closing for valid modals only (line 168)', () => {
        // Valid modal
        const result = playbackReducer({
            type: ACTIONS.SET_MODAL_OPEN,
            payload: { modal: 'settings', open: true },
        });
        expect(result).toBe(true);
        expect(playback.modals.settings).toBe(true);

        // Invalid modal (hits line 168)
        const invalidResult = playbackReducer({
            type: ACTIONS.SET_MODAL_OPEN,
            payload: { modal: 'invalid_modal', open: true },
        });
        expect(invalidResult).toBe(false);
    });

    it('should handle generic SET_PARAM action and break for other modules (line 174)', () => {
        playbackReducer({
            type: ACTIONS.SET_PARAM,
            payload: { module: 'playback', param: 'palette', value: 'midnight' },
        });
        expect(playback.palette).toBe('midnight');

        // Other module (hits line 174)
        const result = playbackReducer({
            type: ACTIONS.SET_PARAM,
            payload: { module: 'not_playback', param: 'palette', value: 'forest' },
        });
        expect(result).toBe(false);
    });

    it('should handle emergency lookahead doubling', () => {
        playback.scheduleAheadTime = 0.2;
        playbackReducer({ type: ACTIONS.TRIGGER_EMERGENCY_LOOKAHEAD, payload: undefined });
        expect(playback.scheduleAheadTime).toBe(0.4);

        // Should not double again if already >= 0.4
        playbackReducer({ type: ACTIONS.TRIGGER_EMERGENCY_LOOKAHEAD, payload: undefined });
        expect(playback.scheduleAheadTime).toBe(0.4);

        // Should reset after 10s
        vi.advanceTimersByTime(10000);
        expect(playback.scheduleAheadTime).toBe(0.2);
    });

    it('should show toasts and auto-remove them', () => {
        playbackReducer({
            type: ACTIONS.SHOW_TOAST,
            payload: { id: 'test-id', message: 'Hello World' },
        });
        expect(playback.toasts.length).toBe(1);
        expect(playback.toasts[0].message).toBe('Hello World');

        playbackReducer({ type: ACTIONS.TOAST_EXPIRED, payload: 'test-id' as any });
        expect(playback.toasts.length).toBe(0);
    });

    it('should trigger flash and auto-reset', () => {
        playbackReducer({ type: ACTIONS.TRIGGER_FLASH, payload: 0.5 });
        expect(playback.flashIntensity).toBe(0.5);

        playbackReducer({ type: ACTIONS.FLASH_EXPIRED, payload: undefined });
        expect(playback.flashIntensity).toBe(0);
    });

    it('should update conductor decision', () => {
        const payload = {
            velocity: 0.7,
            intent: { anticipation: 0.8 },
        };
        playbackReducer({ type: ACTIONS.UPDATE_CONDUCTOR_DECISION, payload });
        expect(playback.conductorVelocity).toBe(0.7);
        expect(playback.intent.anticipation).toBe(0.8);
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
                modals: { settings: true },
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
