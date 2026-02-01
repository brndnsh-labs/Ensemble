/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getVisualTime, _resetChromiumCheck } from '../../../public/engine/engine.js';
import { dispatch, getState, storage } from '../../../public/state.js';
const { arranger, playback, chords, bass, soloist, harmony, groove, vizState, midi } = getState();

describe('Engine Logic & Sync', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        playback.audio = {
            currentTime: 10.0,
            outputLatency: 0.015
        };
        if (_resetChromiumCheck) _resetChromiumCheck();
    });

    describe('getVisualTime', () => {
        it('should return 0 if audio context is missing', () => {
            playback.audio = null;
            expect(getVisualTime()).toBe(0);
        });

        it('should apply latency compensation', () => {
            vi.spyOn(performance, 'now').mockReturnValue(1000); // 1s
            playback.audio = { currentTime: 10.0, outputLatency: 0.02 };
            
            // First call sets lastAudioTime = 10.0, lastPerfTime = 1000
            getVisualTime();
            
            // Advance performance time by 10ms (0.01s)
            vi.spyOn(performance, 'now').mockReturnValue(1010);
            
            const vTime = getVisualTime();
            // audioTime(10.0) + dt(0.01) - latency(0.02) = 9.99
            expect(vTime).toBeCloseTo(9.99, 2);
        });

        it('should use default offsets if outputLatency is unavailable', () => {
            vi.spyOn(performance, 'now').mockReturnValue(1000);
            playback.audio = { currentTime: 10.0 }; // no outputLatency
            
            // Mock user agent for Chromium-like behavior
            Object.defineProperty(navigator, 'userAgent', { value: 'Chrome', configurable: true });
            Object.defineProperty(navigator, 'vendor', { value: 'Google Inc', configurable: true });
            
            getVisualTime();
            
            vi.spyOn(performance, 'now').mockReturnValue(1000); // no progress
            const vTime = getVisualTime();
            // audioTime(10.0) + dt(0) - offset(0.015) = 9.985
            expect(vTime).toBeCloseTo(9.985, 2);
        });
    });
});
