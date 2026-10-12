import { beforeEach, describe, expect, it, vi } from 'vitest';
import { playback, playbackReducer } from '../../../public/state/playback.js';
import { ACTIONS, type GlobalContext } from '../../../public/types.js';
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

        // Another slice's write is not this reducer's.
        const result = playbackReducer({
            type: ACTIONS.SET_PARAM,
            payload: { module: 'groove', param: 'swing', value: 30 },
        });
        expect(result).toBe(false);
        expect(playback.masterVolume).toBe(0.6);
    });

    it('does not create a field the slice does not declare (#1633)', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const result = playbackReducer({
            type: ACTIONS.SET_PARAM,
            payload: { module: 'playback', param: 'noSuchField', value: 1 },
        } as any);
        expect(result).toBe(false);
        expect(Object.hasOwn(playback, 'noSuchField')).toBe(false);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain("'playback' has no field 'noSuchField'");
        warn.mockRestore();
    });

    it('can write a field that starts null (own at init)', () => {
        const audio = { ctx: true } as unknown as AudioContext;
        playbackReducer({
            type: ACTIONS.SET_PARAM,
            payload: { module: 'playback', param: 'audio', value: audio },
        });
        expect(playback.audio).toBeTruthy();
    });

    describe('setPlaybackParam via reducer', () => {
        it('should update ALL supported parameters', () => {
            // Every field `GlobalContext` declares (the type is the checklist).
            const allParams: { [K in keyof GlobalContext]: unknown } = {
                audio: null,
                audioGraph: null,
                isPlaying: true,
                startStep: 16,
                bpm: 120,
                bandIntensity: 0.8,
                autoIntensity: false,
                metronome: true,
                masterVolume: 0.7,
                countIn: false,
            };

            for (const [param, value] of Object.entries(allParams) as Array<
                [keyof GlobalContext, unknown]
            >) {
                playbackReducer({
                    type: ACTIONS.SET_PARAM,
                    payload: { module: 'playback', param, value },
                });
                expect((playback as any)[param]).toEqual(value);
            }
        });
    });
});
