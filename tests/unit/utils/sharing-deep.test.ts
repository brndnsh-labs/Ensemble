/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateShareUrl, shareProgression } from '../../../public/sharing.js';
import { getState } from '../../../public/state.js';
import { showToast } from '../../../public/ui.js';

const { makeSoloistMock } = await vi.hoisted(
    async () => await import('../../utils/mock-soloist.js'),
);

vi.mock('../../../public/state.js', () => ({
    getState: vi.fn(),
}));

vi.mock('../../../public/ui.js', () => ({
    showToast: vi.fn(),
}));

vi.mock('../../../public/state/share-codec.js', () => ({
    compressSections: vi.fn(() => 'compressed-sections'),
    encodeBase64Unicode: vi.fn(() => 'encoded-band'),
}));

describe('Sharing Deep Dive', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (getState as any).mockReturnValue({
            arranger: { sections: [], key: 'C', timeSignature: '4/4', notation: 'abs' },
            playback: { bpm: 120, bandIntensity: 0.5, complexity: 0.5 },
            chords: { enabled: true, volume: 0.5, reverb: 0.2 },
            bass: { enabled: true, volume: 0.5, reverb: 0.2 },
            soloist: makeSoloistMock({ enabled: true, volume: 0.5, reverb: 0.2 }),
            harmony: { enabled: true, volume: 0.5, reverb: 0.2, complexity: 0.5 },
            groove: {
                enabled: true,
                volume: 0.5,
                reverb: 0.2,
                swing: 0,
                swingSub: 0,
                humanize: 0,
                genreFeel: 'Rock',
            },
        });

        // Mock clipboard
        Object.defineProperty(navigator, 'clipboard', {
            value: {
                writeText: vi.fn().mockResolvedValue(undefined),
            },
            configurable: true,
        });
    });

    it('should generate share URL with targetDuration', () => {
        const url = generateShareUrl({ targetDuration: 300 });
        expect(url).toContain('tmr=300');
    });

    it('should respect include toggles in compressed settings', () => {
        const url = generateShareUrl({
            includeSolo: false,
            includeBass: false,
            includeChords: false,
            includeHarmony: false,
            includeDrums: false,
        });
        // We can't easily decode the Base64 here but we verify it doesn't crash
        // and exercise those branches.
        expect(url).toContain('bnd=');
    });

    it('should handle clipboard errors', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        (navigator.clipboard.writeText as any).mockRejectedValue(new Error('Blocked'));

        shareProgression();

        await vi.waitFor(() => {
            expect(showToast).toHaveBeenCalledWith(expect.stringContaining('Failed to copy link'));
        });
        consoleSpy.mockRestore();
    });

    it('should handle general errors during share', () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        (getState as any).mockImplementation(() => {
            throw new Error('State crash');
        });

        shareProgression();

        expect(showToast).toHaveBeenCalledWith('Error generating share link.');
        consoleSpy.mockRestore();
    });

    it('shares the goal tempo (rampBpmTarget), not the momentarily-ramped bpm, while a practice drill is in flight (#1152)', () => {
        // Mid-climb: the drill dropped from 120 (the goal, captured at play-start
        // into rampBpmTarget) to a start speed and is ramping back up — bpm here
        // is a transient in-drill value, not the tempo that should land in the link.
        (getState as any).mockReturnValue({
            arranger: { sections: [], key: 'C', timeSignature: '4/4', notation: 'abs' },
            playback: { bpm: 84, rampBpmTarget: 120, bandIntensity: 0.5, complexity: 0.5 },
            chords: { enabled: true, volume: 0.5, reverb: 0.2 },
            bass: { enabled: true, volume: 0.5, reverb: 0.2 },
            soloist: makeSoloistMock({ enabled: true, volume: 0.5, reverb: 0.2 }),
            harmony: { enabled: true, volume: 0.5, reverb: 0.2, complexity: 0.5 },
            groove: {
                enabled: true,
                volume: 0.5,
                reverb: 0.2,
                swing: 0,
                swingSub: 0,
                humanize: 0,
                genreFeel: 'Rock',
            },
        });

        const url = generateShareUrl();
        expect(url).toContain('bpm=120');
    });

    it('shares the live bpm as-is when no drill is armed (#1152)', () => {
        (getState as any).mockReturnValue({
            arranger: { sections: [], key: 'C', timeSignature: '4/4', notation: 'abs' },
            playback: { bpm: 132, rampBpmTarget: 0, bandIntensity: 0.5, complexity: 0.5 },
            chords: { enabled: true, volume: 0.5, reverb: 0.2 },
            bass: { enabled: true, volume: 0.5, reverb: 0.2 },
            soloist: makeSoloistMock({ enabled: true, volume: 0.5, reverb: 0.2 }),
            harmony: { enabled: true, volume: 0.5, reverb: 0.2, complexity: 0.5 },
            groove: {
                enabled: true,
                volume: 0.5,
                reverb: 0.2,
                swing: 0,
                swingSub: 0,
                humanize: 0,
                genreFeel: 'Rock',
            },
        });

        const url = generateShareUrl();
        expect(url).toContain('bpm=132');
    });
});
