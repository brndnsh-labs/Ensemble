// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { SMART_BASS_STYLE_MAP, SMART_SCALE_STYLE_MAP } from '../../public/config.js';
import { GENRE_FEELS } from '../../public/data/smart-genres.js';
import { GENRE_POCKET } from '../../public/engine/coordination-engine.js';
import { strategies } from '../../public/engine/groove-engine.js';
import { GENRE_STYLE_MAPPING } from '../../public/engine/soloist-config.js';

// #1130 — genreFeel-routing completeness guard, the feel-keyspace companion to
// genre-canon-guard (#544, which guards the genre-NAME keyspace via GENRE_NAMES).
//
// Genre routing lives in two keyspaces. The UI picker shows genre NAMES
// (GENRE_NAMES); at runtime `groove.genreFeel` carries the mapped FEEL. For most
// genres name === feel, but two diverge: the "Bossa" genre has feel 'Bossa Nova'
// and "Ska-Punk" has feel 'Ska' (the alias lives in exactly one place —
// GENRE_OVERRIDES[name].feel in smart-genres.ts). The tables below are indexed by
// groove.genreFeel, so their keys must be FEELS, never genre names.
//
// The bug class this guards (shipped twice for Ska-Punk — see the comments in
// groove-engine.ts / fills.ts / harmonies.ts / conductor.ts): a table carries a
// genre-NAME-shaped key (e.g. 'Ska-Punk', 'Bossa', 'Rock/Metal') that never
// matches a real genreFeel and silently falls through to a genre-specific default
// (rock bass, rock scale, DEFAULT_CONFIG groove, 'scalar' soloist). GENRE_NAMES
// is loudly gated; this extends the same discipline to the feel keyspace.
describe('genreFeel routing canon (#1130)', () => {
    // Every table keyed by groove.genreFeel. A missing feel here does NOT crash —
    // it silently routes to a genre-specific fallback, which is the bug.
    const FEEL_KEYED: Record<string, Record<string, unknown>> = {
        'groove strategies': strategies,
        SMART_BASS_STYLE_MAP,
        SMART_SCALE_STYLE_MAP,
        'soloist GENRE_STYLE_MAPPING': GENRE_STYLE_MAPPING,
        GENRE_POCKET,
    };

    it.each(Object.entries(FEEL_KEYED))(
        '%s maps every canonical genreFeel (no silent fallback)',
        (name, table) => {
            const missing = GENRE_FEELS.filter((feel) => !Object.hasOwn(table, feel));
            expect(missing, `${name} is missing feel key(s): ${missing.join(', ')}`).toEqual([]);
        },
    );

    // Pure feel-keyed tables use a single-key lookup (no secondary preset key), so
    // any key that isn't a feel is dead weight that never matches at runtime.
    // SMART_BASS_STYLE_MAP is excluded: its resolver also accepts a drum-preset
    // name as a secondary key, so preset-name keys are legitimate there.
    const PURE_FEEL_KEYED: Record<string, Record<string, unknown>> = {
        'groove strategies': strategies,
        SMART_SCALE_STYLE_MAP,
        'soloist GENRE_STYLE_MAPPING': GENRE_STYLE_MAPPING,
        GENRE_POCKET,
    };

    it.each(Object.entries(PURE_FEEL_KEYED))(
        '%s carries no non-feel (dead) keys',
        (name, table) => {
            const dead = Object.keys(table).filter((key) => !GENRE_FEELS.includes(key));
            expect(dead, `${name} has dead non-feel key(s): ${dead.join(', ')}`).toEqual([]);
        },
    );

    // Belt-and-suspenders across every table (including the bass map): the exact
    // retired phantom/alias keys must never reappear. Matches the phantom list in
    // genre-canon-guard (#544) plus the genre-name aliases removed in #1130.
    it('no routing table resurrects a retired phantom / alias key', () => {
        const PHANTOMS = [
            'Ska-Punk',
            'Bossa',
            'Rock/Metal',
            'Minimal',
            'Shred',
            'Latin',
            'Afrobeat',
            'Soul',
        ];
        for (const [name, table] of Object.entries(FEEL_KEYED)) {
            for (const phantom of PHANTOMS) {
                expect(Object.hasOwn(table, phantom), `${name} must not key on '${phantom}'`).toBe(
                    false,
                );
            }
        }
    });
});
