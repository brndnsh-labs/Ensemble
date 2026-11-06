/**
 * @vitest-environment happy-dom
 */
/**
 * An audio export renders the band at its calibrated loudness (#2002): the master volume sits
 * after the limiter and is this device's listening level, so the render's detached clone plays at
 * full whatever the live slider says — and the live state is never written.
 */
import { compileTimeline } from '@band/index';
import { describe, expect, it, vi } from 'vitest';

const seen = vi.hoisted(() => ({ masterVolume: [] as number[] }));

vi.mock('@core/engine/engine', () => ({
    initAudio: vi.fn((state: { playback: { masterVolume: number } }) => {
        seen.masterVolume.push(state.playback.masterVolume);
    }),
}));
vi.mock('@core/engine/master-limiter', () => ({ masterChainReady: vi.fn(async () => {}) }));

import { getState } from '@core/state';
import { renderBandPasses } from './band-export';
import { buildStandardDocument, STANDARDS } from './standards';

describe('audio export level (#2002)', () => {
    it('renders at full master volume whatever the live slider, leaving the live slider alone', async () => {
        const rendered = { numberOfChannels: 2, sampleRate: 44100, duration: 1 };
        Object.assign(rendered, { getChannelData: () => new Float32Array(4) });
        vi.stubGlobal(
            'OfflineAudioContext',
            vi.fn().mockImplementation(function (this: Record<string, unknown>) {
                this.startRendering = vi.fn(async () => rendered);
            }),
        );
        const playback = getState().playback as unknown as { masterVolume: number };
        playback.masterVolume = 0.5;
        const timeline = compileTimeline(buildStandardDocument(STANDARDS[0]).chart.score);
        await renderBandPasses([[]], timeline, 120, { sampleRate: 44100 });
        expect(seen.masterVolume).toEqual([1]);
        expect(getState().playback.masterVolume).toBe(0.5);
        vi.unstubAllGlobals();
    });
});
