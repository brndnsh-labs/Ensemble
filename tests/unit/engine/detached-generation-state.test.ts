import { describe, expect, it, vi } from 'vitest';
import { cloneStateForDetachedGeneration } from '../../../core/export/detached-generation-state.js';
import { getState } from '../../../core/state.js';
import type { EnsembleState } from '../../../core/types.js';

describe('detached generation state', () => {
    it('preserves generation inputs while stripping live handles and runtime buffers', () => {
        const live = getState();
        // Live handles stand in for Web Audio nodes, which the slice types do not model.
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
                key: 'D',
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
        } as unknown as EnsembleState;

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
        expect(detached.arranger.key).toBe('D');
    });
});
