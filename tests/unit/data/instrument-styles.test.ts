import { describe, expect, it } from 'vitest';
import {
    BASS_STYLES,
    CHORD_STYLES,
    isKnownBassStyle,
    isKnownChordStyle,
    isKnownHarmonyStyle,
    isKnownSoloistStyle,
    SOLOIST_STYLES,
} from '../../../public/data/instrument-styles.js';

// The songbook codec validates an old chart's legacy `band.*.style` fields against these
// predicates, so the accepted ids are stored-data compatibility: removing one changes which
// saved charts decode. This pins the full set of each lane.
describe('instrument-styles legacy keyspaces', () => {
    it('chord lane: the listed ids, plus the genre-routed arp', () => {
        const listed = [
            'smart',
            'pad',
            'strum8',
            'strum-country',
            'power-metal',
            'jazz',
            'modern-piano',
            'open-modal',
            'neo-soul-rhodes',
            'funk',
            'ska-upstroke',
            'acoustic-strum',
        ];
        expect(CHORD_STYLES).toEqual(listed);
        for (const id of [...listed, 'arp']) {
            expect(isKnownChordStyle(id), id).toBe(true);
        }
        expect(isKnownChordStyle('whole')).toBe(false);
        expect(isKnownChordStyle('__proto__')).toBe(false);
        expect(isKnownChordStyle(7)).toBe(false);
    });

    it('bass lane', () => {
        const listed = [
            'smart',
            'rock',
            'country',
            'metal',
            'quarter',
            'funk',
            'disco',
            'dub',
            'neo',
            'bossa',
            'blues',
            'acoustic',
            'hiphop',
            'walking-ska',
        ];
        expect(BASS_STYLES).toEqual(listed);
        for (const id of listed) {
            expect(isKnownBassStyle(id), id).toBe(true);
        }
        expect(isKnownBassStyle('whole')).toBe(false);
    });

    it('soloist lane', () => {
        const listed = [
            'smart',
            'rock',
            'metal',
            'bird',
            'bossa',
            'blues',
            'funk',
            'disco',
            'neo',
            'hiphop',
            'reggae',
            'ska-horns',
            'country',
            'acoustic',
        ];
        expect(SOLOIST_STYLES).toEqual(listed);
        for (const id of listed) {
            expect(isKnownSoloistStyle(id), id).toBe(true);
        }
        expect(isKnownSoloistStyle('arp')).toBe(false);
    });

    it('harmony lane (retired, still decoded)', () => {
        for (const id of ['smart', 'horns', 'strings', 'organ', 'plucks', 'counter']) {
            expect(isKnownHarmonyStyle(id), id).toBe(true);
        }
        expect(isKnownHarmonyStyle('rock')).toBe(false);
    });
});
