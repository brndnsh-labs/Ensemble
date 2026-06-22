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
 * Today only the **harmony** lane has packs to map; chords/soloist/groove
 * generalize here as their packs' auto-mappings are chosen by ear.
 */

import { packIdFromVoice } from '../engine/instrument-registry.js';
import type { InstrumentModule, InstrumentVoice } from '../types.js';

/** genre name → per-module Auto-mode voice. Absent module/genre → synth. */
export const GENRE_SOUND_MAP: Readonly<
    Record<string, Partial<Record<InstrumentModule, InstrumentVoice>>>
> = {
    // Brass stabs — punchy genres where a horn section is the idiom.
    Funk: { harmony: 'pack:horns-section' },
    Metal: { harmony: 'pack:horns-section' },
    'Ska-Punk': { harmony: 'pack:horns-section' },
    Jazz: { harmony: 'pack:horns-section' },
    // Sustained string pad — genres that want a lush bed under the changes.
    Rock: { harmony: 'pack:strings-ensemble' },
    Disco: { harmony: 'pack:strings-ensemble' },
    Country: { harmony: 'pack:strings-ensemble' },
    Acoustic: { harmony: 'pack:strings-ensemble' },
    Bossa: { harmony: 'pack:strings-ensemble' },
    // Hip Hop · Blues · Neo-Soul · Reggae — no clear pack fit yet → synth pad.
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
