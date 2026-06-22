/**
 * Genre → instrument sound defaults (Epic 7, #675).
 *
 * When an instrument is in **Auto (follow genre)** mode, its voice tracks the
 * selected genre via this map. Picked over the synth pad/stab on a per-genre
 * basis so the band sounds idiomatic without the user hand-swapping sources in
 * settings every time they change genre.
 *
 * Keys MUST be canonical genre names (`GENRE_NAMES` in `smart-genres.ts`) — a
 * typo'd key is silently dead (the genre falls through to synth). Pinned by
 * `tests/unit/data/genre-sound-map.test.ts`. A genre with no entry for a module
 * (or any genre not listed) resolves to `synth` — the safe, always-present
 * fallback — as does a mapped pack that isn't installed.
 *
 * The **harmony** and **chords** lanes have packs to map; soloist/groove
 * generalize here as their packs' auto-mappings are chosen by ear.
 */

import { packIdFromVoice } from '../engine/instrument-registry.js';
import type { InstrumentModule, InstrumentVoice } from '../types.js';

/** genre name → per-module Auto-mode voice. Absent module/genre → synth. */
export const GENRE_SOUND_MAP: Readonly<
    Record<string, Partial<Record<InstrumentModule, InstrumentVoice>>>
> = {
    // Each genre's lanes are chosen to pair coherently rather than fight: a
    // chords keyboard, a harmony section, a soloist lead, and a drum kit that
    // share the idiom. (#682 chords/harmony · #694 soloist · #695 drums.)
    //
    // chords — the keyboard playing the changes:
    //   • grand    → acoustic-piano genres (jazz comping, singer-songwriter,
    //                bossa, country, the disco/neo-soul Rhodes-ish seat, rock piano)
    //   • hammond  → tonewheel-organ genres (reggae bubble, blues/gospel, the
    //                2-tone ska skank that pairs with the horns)
    //   • clavinet → funk's percussive plucked comp
    //   • synth    → Hip Hop / Metal (no acoustic-keys idiom → keep the synth)
    // harmony — the section answering the changes (horns vs. string pad vs. synth).
    // soloist — sax (#694): a real horn lead only where it's idiomatic (jazz/blues
    //   blowing, funk hits, bossa cool); everything else keeps the synth lead — one
    //   alto voice on every genre would wear thin.
    // groove — acoustic kit (#695): a live-drummer kit for the acoustic-leaning
    //   genres (jazz swing/brushes, blues, singer-songwriter, country, bossa); the
    //   electronic/punchy genres keep the synth kit's tighter transient.
    Funk: { chords: 'pack:clavinet', harmony: 'pack:horns-section', soloist: 'pack:sax-alto' },
    Metal: { harmony: 'pack:horns-section' },
    'Ska-Punk': { chords: 'pack:hammond-organ', harmony: 'pack:horns-section' },
    Jazz: {
        chords: 'pack:grand',
        harmony: 'pack:horns-section',
        soloist: 'pack:sax-alto',
        groove: 'pack:acoustic-kit',
    },
    Blues: {
        chords: 'pack:hammond-organ',
        harmony: 'pack:horns-section',
        soloist: 'pack:sax-alto',
        groove: 'pack:acoustic-kit',
    },
    Reggae: { chords: 'pack:hammond-organ', harmony: 'pack:horns-section' },
    // Sustained string pad — genres that want a lush bed under the changes.
    Rock: { chords: 'pack:grand', harmony: 'pack:strings-ensemble' },
    Disco: { chords: 'pack:grand', harmony: 'pack:strings-ensemble' },
    Country: {
        chords: 'pack:grand',
        harmony: 'pack:strings-ensemble',
        groove: 'pack:acoustic-kit',
    },
    Acoustic: {
        chords: 'pack:grand',
        harmony: 'pack:strings-ensemble',
        groove: 'pack:acoustic-kit',
    },
    Bossa: {
        chords: 'pack:grand',
        harmony: 'pack:strings-ensemble',
        soloist: 'pack:sax-alto',
        groove: 'pack:acoustic-kit',
    },
    // Neo-Soul — grand on the keys; no harmony pack fit yet → synth pad.
    'Neo-Soul': { chords: 'pack:grand' },
    // Hip Hop · Metal chords — no acoustic-keys idiom yet → synth pad.
};

/**
 * The voice an Auto-mode instrument should use for `genre`. Falls back to
 * `synth` when the genre has no mapping for the module, or when the mapped pack
 * isn't installed (auto-follow never auto-downloads — that's the opt-in
 * "Install all packs" gesture; an uninstalled mapping just plays the synth).
 *
 * @param isPackInstalled sync predicate (registry's installed-set) — keeps this
 *   pure/testable and lets the genre effect resolve without async cache I/O.
 */
export function autoVoiceForGenre(
    genre: string | undefined,
    module: InstrumentModule,
    isPackInstalled: (packId: string) => boolean,
): InstrumentVoice {
    const mapped = genre ? GENRE_SOUND_MAP[genre]?.[module] : undefined;
    if (!mapped) {
        return 'synth';
    }
    const packId = packIdFromVoice(mapped);
    if (packId !== null && !isPackInstalled(packId)) {
        return 'synth';
    }
    return mapped;
}
