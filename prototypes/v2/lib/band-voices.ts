/**
 * How the app names the band's parts in its own terms: a genre to the band's style, and a lane
 * sound to the instrument the band plays it as. Plain tables with type-only imports, so the
 * listening-gate tools (`scripts/band-scene.ts`) build the same `BandSettings` from a scene as
 * `runtime.ts` builds from the stand, in node, without the browser runtime.
 */
import type { CompInstrument, LeadInstrument, StyleId } from '@band/index';
import type { InstrumentVoice } from '@engine/types';

/**
 * The band engine's style for each of the 13 canonical genres (all native). A lookup by a
 * persisted genre name is guarded with `Object.hasOwn`.
 */
export const STYLE_FOR_GENRE: Record<string, StyleId> = {
    Rock: 'rock',
    Jazz: 'jazz',
    Funk: 'funk',
    Bossa: 'bossa',
    Blues: 'blues',
    'Neo-Soul': 'neosoul',
    Disco: 'disco',
    'Hip Hop': 'hiphop',
    Reggae: 'reggae',
    Acoustic: 'acoustic',
    Country: 'country',
    Metal: 'metal',
    'Ska-Punk': 'skapunk',
};
/** The chords-lane sound for each comp instrument (what the band's Auto sound selects). */
export const VOICE_FOR_COMP: Record<CompInstrument, InstrumentVoice> = {
    piano: 'pack:grand',
    rhodes: 'pack:rhodes',
    organ: 'pack:hammond-organ',
    clav: 'pack:clavinet',
    guitar: 'pack:electric-guitar-clean',
    nylon: 'pack:nylon-guitar',
};
/**
 * How the band plays the sound on the chords lane: a guitar sound gets guitar grips and
 * strums, the organ holds, the rest are keyboards. Any other sound (the synth) is a piano.
 */
export const COMP_FOR_VOICE: Record<string, CompInstrument> = Object.assign(Object.create(null), {
    ...Object.fromEntries(Object.entries(VOICE_FOR_COMP).map(([comp, voice]) => [voice, comp])),
    'pack:electric-guitar-rhythm': 'guitar',
    'pack:electric-guitar-driven': 'guitar',
});
/**
 * A native style whose Auto sound is not its comp instrument's default sound. Metal's comp is
 * the guitar book, but heard through the crunch pack (the old engine's #698): power chords are
 * what a *distorted* guitar plays, and on the clean pack they sound thin. The sound is the
 * app's business, so it lives here rather than on the engine's `Style`; `COMP_FOR_VOICE` still
 * maps the pack back to the guitar book.
 */
export const AUTO_VOICE_FOR_STYLE: Partial<Record<StyleId, InstrumentVoice>> = {
    metal: 'pack:electric-guitar-rhythm',
};
/** The lead's instruments as the soloist lane's sounds. The built-in lead voice is a trumpet. */
export const VOICE_FOR_LEAD: Record<LeadInstrument, InstrumentVoice> = {
    sax: 'pack:sax-alto',
    trumpet: 'synth',
    guitar: 'pack:electric-guitar-clean',
    overdrive: 'pack:electric-guitar-driven',
    nylon: 'pack:nylon-guitar',
};
export const LEAD_FOR_VOICE: Record<string, LeadInstrument> = Object.assign(
    Object.create(null),
    Object.fromEntries(Object.entries(VOICE_FOR_LEAD).map(([lead, voice]) => [voice, lead])),
);
