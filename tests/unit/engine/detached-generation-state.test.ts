// @ts-nocheck
import { describe, expect, it, vi } from 'vitest';
import { cloneStateForDetachedGeneration } from '../../../public/export/detached-generation-state.js';
import { getState } from '../../../public/state.js';

describe('detached generation state', () => {
    it('preserves generation inputs while stripping live handles and runtime buffers', () => {
        const live = getState();
        const input = {
            ...live,
            playback: {
                ...live.playback,
                audio: { close: vi.fn() },
                audioGraph: { master: { disconnect: vi.fn() } },
                isPlaying: true,
            },
            arranger: {
                ...live.arranger,
                progression: [{ rootMidi: 60, quality: 'major' }],
                stepMap: [{ start: 0, end: 16, chord: { rootMidi: 60 } }],
            },
            groove: {
                ...live.groove,
                lastHatGain: { disconnect: vi.fn() },
                lastSampledHatVoice: { choke: vi.fn() },
            },
            bass: {
                ...live.bass,
                lastBassGain: { disconnect: vi.fn() },
            },
        };

        const detached = cloneStateForDetachedGeneration(input);

        expect(() => structuredClone(detached)).not.toThrow();
        expect(detached.playback).toMatchObject({
            audio: null,
            audioGraph: null,
            isPlaying: false,
        });
        expect(detached.groove.lastHatGain).toBeNull();
        expect(detached.groove.lastSampledHatVoice).toBeNull();
        expect(detached.bass.lastBassGain).toBeNull();
        expect(detached.arranger.progression).toEqual(input.arranger.progression);
        expect(detached.arranger.progression).not.toBe(input.arranger.progression);
    });
});
