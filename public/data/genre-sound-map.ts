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
    // chords keyboard, a harmony section, a soloist lead, a bass, and a drum kit
    // that share the idiom. (#682 chords/harmony · #694 soloist · #695 drums ·
    // #697 bass.)
    // bass — upright (#697): a pizzicato double bass for the acoustic combo
    //   (jazz/bossa/blues walking, singer-songwriter, country); everything else
    //   keeps the synth electric (the only electric-bass voice we have).
    //
    // chords — the keyboard playing the changes:
    //   • grand    → acoustic-piano genres (jazz comping, singer-songwriter,
    //                bossa, country, rock piano)
    //   • rhodes   → tine electric piano (#655): neo-soul, hip-hop, disco — the
    //                seats the grand used to stand in for as a "Rhodes-ish" placeholder
    //   • hammond  → tonewheel-organ genres (reggae bubble, blues/gospel, the
    //                2-tone ska skank that pairs with the horns)
    //   • clavinet → funk's percussive plucked comp
    //   • electric-guitar-rhythm → Metal's crunch power chords (#698)
    //   • grand    → Rock (stays the piano; users can override to the guitar)
    // harmony — the section answering the changes (horns vs. string pad vs. synth).
    // soloist — three real leads, each only where idiomatic (everything else keeps
    //   the synth lead — one voice on every genre would wear thin):
    //   • sax (#694)          → jazz/blues blowing (blues flips to harp once #699
    //                           ships — harmonica is the surer blues lead)
    //   • nylon (#659)        → the fingerstyle-guitar combo: bossa (the nylon
    //                           takes the lead over the sax — bossa nova IS nylon),
    //                           acoustic singer-songwriter
    //   • electric-clean (#740)  → funk (iconic single-coil lead) + country (clean
    //                            electric twang — more idiomatic there than the nylon)
    //   • electric-driven (#741) → rock (a crunchy overdrive lead; baked offline
    //                            from the same clean source)
    // groove — acoustic kit (#695): a live drummer is the better default for most
    //   genres (Brandon's ear 2026-06-22), so the kit is the default and synth is
    //   the exception. Synth kit only where the drums are programmed/triggered:
    //   Hip Hop (beats) and Metal (our natural kit reads too soft for triggered
    //   metal aggression — the synth kit's tighter transient is closer).
    Funk: {
        chords: 'pack:clavinet',
        harmony: 'pack:horns-section',
        soloist: 'pack:electric-guitar-clean',
        groove: 'pack:acoustic-kit',
    },
    // Metal — crunch rhythm guitar on the chords (#698): the chords engine
    // reduces to power chords (root+5+oct) under this voice, since distorted
    // triads mud up. Rock keeps the grand piano (Brandon's call — stay close to
    // today's default; users can hand-override to the guitar).
    Metal: { chords: 'pack:electric-guitar-rhythm', harmony: 'pack:horns-section' },
    'Ska-Punk': {
        chords: 'pack:hammond-organ',
        harmony: 'pack:horns-section',
        groove: 'pack:acoustic-kit',
    },
    Jazz: {
        chords: 'pack:grand',
        harmony: 'pack:horns-section',
        soloist: 'pack:sax-alto',
        bass: 'pack:upright-bass',
        groove: 'pack:acoustic-kit',
    },
    Blues: {
        chords: 'pack:hammond-organ',
        harmony: 'pack:horns-section',
        soloist: 'pack:sax-alto',
        bass: 'pack:upright-bass',
        groove: 'pack:acoustic-kit',
    },
    Reggae: {
        chords: 'pack:hammond-organ',
        harmony: 'pack:horns-section',
        groove: 'pack:acoustic-kit',
    },
    // Sustained string pad — genres that want a lush bed under the changes.
    Rock: {
        chords: 'pack:grand',
        harmony: 'pack:strings-ensemble',
        soloist: 'pack:electric-guitar-driven',
        groove: 'pack:acoustic-kit',
    },
    Disco: { chords: 'pack:rhodes', harmony: 'pack:strings-ensemble', groove: 'pack:acoustic-kit' },
    Country: {
        chords: 'pack:grand',
        harmony: 'pack:strings-ensemble',
        soloist: 'pack:electric-guitar-clean',
        bass: 'pack:upright-bass',
        groove: 'pack:acoustic-kit',
    },
    Acoustic: {
        chords: 'pack:grand',
        harmony: 'pack:strings-ensemble',
        soloist: 'pack:nylon-guitar',
        bass: 'pack:upright-bass',
        groove: 'pack:acoustic-kit',
    },
    Bossa: {
        chords: 'pack:grand',
        harmony: 'pack:strings-ensemble',
        soloist: 'pack:nylon-guitar',
        bass: 'pack:upright-bass',
        groove: 'pack:acoustic-kit',
    },
    // Neo-Soul — Rhodes on the keys (#655); no harmony pack fit yet → synth pad.
    'Neo-Soul': { chords: 'pack:rhodes', groove: 'pack:acoustic-kit' },
    // Hip Hop — Rhodes keys (#655); groove stays the synth kit (programmed beats).
    'Hip Hop': { chords: 'pack:rhodes' },
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
