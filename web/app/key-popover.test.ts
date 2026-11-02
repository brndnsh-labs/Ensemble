import { describe, expect, it } from 'vitest';
import type { ChartDocument } from '../lib/runtime';
import { openedSongAnnouncement } from './key-popover';

function song(title: string, key: string, isMinor: boolean, bpm: number): ChartDocument {
    return {
        title,
        chart: { score: { key, isMinor }, performance: { bpm } },
    } as unknown as ChartDocument;
}

describe('openedSongAnnouncement', () => {
    it('says title, key and tempo', () => {
        expect(openedSongAnnouncement(song('Blue pocket', 'Bb', false, 92))).toBe(
            'Blue pocket, B♭, 92 BPM',
        );
    });

    it('spells a minor key out', () => {
        expect(openedSongAnnouncement(song('Autumn Leaves', 'G', true, 120))).toBe(
            'Autumn Leaves, G minor, 120 BPM',
        );
    });
});
