// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { GENRE_NAMES, SMART_GENRES } from '../../public/data/smart-genres.js';

// #544 — the supported-genre canon. The 13 genres below are the column axis of
// the instrument×genre matrix and the EXACT set the UI exposes: the genre picker
// (`InstrumentRail.tsx`) and Surprise Me both render straight over `GENRE_NAMES`
// (= Object.keys(GENRE_OVERRIDES)), so there is no config-vs-UI drift by
// construction. This guard pins the set so a new genre can't silently leak in
// (or an existing one vanish) without a deliberate update here — the
// canonicalization discipline from CLAUDE.md "Naming / Canonicalization".
//
// NOTE: "phantom" routing keys like Minimal / Shred / Latin appear in some
// engine routing maps (config.ts SMART_BASS_STYLE_MAP, soloist-config
// GENRE_STYLE_MAPPING) but are NOT canonical genres — they are not selectable
// and are slated for retirement. They must never appear in GENRE_NAMES.
describe('Supported-genre canon (#544)', () => {
    const CANON = [
        'Rock',
        'Jazz',
        'Funk',
        'Disco',
        'Hip Hop',
        'Blues',
        'Neo-Soul',
        'Reggae',
        'Acoustic',
        'Bossa',
        'Country',
        'Metal',
        'Ska-Punk',
    ];

    it('GENRE_NAMES is exactly the 13-genre canon', () => {
        // Order-independent set equality, plus an explicit count so a duplicate
        // or an off-by-one addition fails loudly rather than silently passing.
        expect(GENRE_NAMES).toHaveLength(CANON.length);
        expect([...GENRE_NAMES].sort()).toEqual([...CANON].sort());
    });

    it('every canonical genre has a SMART_GENRES entry (no name without a config)', () => {
        for (const genre of CANON) {
            expect(SMART_GENRES[genre]).toBeDefined();
        }
    });

    it('no non-canonical / phantom genre leaks into the selectable set', () => {
        const PHANTOMS = ['Minimal', 'Shred', 'Latin', 'Afrobeat', 'Soul', 'Ska', 'Bossa Nova'];
        for (const phantom of PHANTOMS) {
            expect(GENRE_NAMES).not.toContain(phantom);
        }
    });
});
