import { SMART_GENRES } from './smart-genres.js';

export interface StyleEntry {
    id: string;
    name: string;
    category: string;
}

export const CHORD_STYLES: StyleEntry[] = [
    { id: 'smart', name: 'Smart (Rhythmic)', category: 'Modern' },
    { id: 'pad', name: 'Pad (Sustain)', category: 'Modern' },
    { id: 'strum8', name: 'Strum (8th)', category: 'Pop/Rock' },
    { id: 'strum-country', name: 'Country Strum', category: 'Country/Folk' },
    { id: 'power-metal', name: 'Power Metal', category: 'Rock/Metal' },
    { id: 'jazz', name: 'Jazz Comp', category: 'Jazz' },
    { id: 'funk', name: 'Funk Scratch', category: 'Soul/Funk' },
    { id: 'ska-upstroke', name: 'Ska Upstroke', category: 'Pop/Rock' },
];

export const BASS_STYLES: StyleEntry[] = [
    { id: 'smart', name: 'Smart (Auto)', category: 'Experimental' },
    // #628: the 'whole' drone style was retired with the Minimal phantom genre
    // (its only route). An old persisted/shared session with bass.style 'whole'
    // now falls through hydration's BASS_STYLES guard to the 'smart' default
    // (genre-routed bass) — graceful, never silent.
    { id: 'rock', name: 'Rock (8th)', category: 'Pop/Rock' },
    { id: 'country', name: 'Country (1-5)', category: 'Country/Folk' },
    { id: 'metal', name: 'Metal (Gallop)', category: 'Rock/Metal' },
    { id: 'quarter', name: 'Walking', category: 'Jazz' },
    { id: 'funk', name: 'Funk', category: 'Soul/Funk' },
    { id: 'disco', name: 'Disco (Octaves)', category: 'Soul/Funk' },
    { id: 'dub', name: 'Dub (Reggae)', category: 'World/Latin' },
    { id: 'neo', name: 'Neo-Soul', category: 'Soul/R&B' },
    { id: 'bossa', name: 'Bossa Nova', category: 'World/Latin' },
    { id: 'blues', name: 'Blues (Shuffle/Box)', category: 'Blues' },
    { id: 'acoustic', name: 'Acoustic (Warm)', category: 'Country/Folk' },
    { id: 'hiphop', name: 'Hip Hop (808/Sub)', category: 'Electronic' },
    { id: 'walking-ska', name: 'Walking (Ska)', category: 'Pop/Rock' },
];

// #628: the one soloist voice per canonical genre (the 13). The manual soloist
// picker is gone, so this list now serves two consumers: the auto-generated
// MANUAL.md style table and share-URL hydration validation (state-hydration.ts).
// Ids match the voices the 13 genres actually resolve to via smart-genres.ts
// `.soloist`; the retired `shred`/`minimal` phantom profiles are gone.
export const SOLOIST_STYLES: StyleEntry[] = [
    { id: 'smart', name: 'Smart (Auto)', category: 'Experimental' },
    { id: 'rock', name: 'Rock', category: 'Rock/Metal' },
    { id: 'metal', name: 'Metal', category: 'Rock/Metal' },
    { id: 'bird', name: 'Bird (Jazz)', category: 'Jazz' },
    { id: 'bossa', name: 'Bossa', category: 'Jazz' },
    { id: 'blues', name: 'Blues', category: 'Blues' },
    { id: 'funk', name: 'Funk', category: 'Soul/Funk' },
    { id: 'disco', name: 'Disco', category: 'Soul/Funk' },
    { id: 'neo', name: 'Neo-Soul', category: 'Soul/R&B' },
    { id: 'hiphop', name: 'Hip Hop', category: 'Modern' },
    { id: 'reggae', name: 'Reggae', category: 'Modern' },
    { id: 'ska-horns', name: 'Ska Horns', category: 'Modern' },
    { id: 'country', name: 'Country', category: 'Country/Folk' },
    { id: 'acoustic', name: 'Acoustic', category: 'Country/Folk' },
];

export const HARMONY_STYLES: StyleEntry[] = [
    { id: 'smart', name: 'Smart (Auto)', category: 'Experimental' },
    { id: 'horns', name: 'Horns (Stabs)', category: 'Modern' },
    { id: 'strings', name: 'Strings (Pads)', category: 'Classical/Trad' },
    { id: 'organ', name: 'Organ (B3)', category: 'Soul/Funk' },
    { id: 'plucks', name: 'Modern Synth (Plucks)', category: 'Electronic' },
    { id: 'counter', name: 'Contrapuntal', category: 'Jazz' },
];

const KNOWN_CHORD_STYLES: ReadonlySet<string> = new Set([
    ...CHORD_STYLES.map((s) => s.id),
    ...Object.values(SMART_GENRES).map((g) => g.chord),
]);

/**
 * Is `id` a chord style the app can legitimately hold?
 *
 * why (#1257): `CHORD_STYLES` is the **picker** list — UI metadata. It is NOT the
 * set of values `chords.style` can hold, because the genre table routes styles the
 * picker doesn't offer: Acoustic sets `chord: 'arp'` (see `GENRE_OVERRIDES` in
 * smart-genres.ts), which `comping-emit.ts` reads via `chords.style === 'arp'` to
 * emit the fingerpick arpeggio. Validating untrusted input against the picker list
 * alone therefore *rejects a live style* — sharing an Acoustic session silently
 * dropped its arpeggio and landed the recipient's current comp style instead. The
 * share reader is not re-applying the genre either (it writes `genreFeel` without
 * dispatching `SET_GENRE_FEEL`), so nothing downstream restores it.
 *
 * Union the two so the predicate means "a value the engine can act on", which is
 * what a validating reader actually wants. Kept here, next to the list it corrects,
 * rather than inlined at each call site — per CLAUDE.md, alias/validity knowledge
 * lives with the data that owns the concept.
 *
 * Note this deliberately does **not** add `'arp'` to `CHORD_STYLES`: whether the
 * arpeggio should also become a user-selectable picker entry is a product question,
 * separate from the reader accepting a value the engine already produces.
 */
export function isKnownChordStyle(id: unknown): boolean {
    return typeof id === 'string' && KNOWN_CHORD_STYLES.has(id);
}

const KNOWN_BASS_STYLES: ReadonlySet<string> = new Set(BASS_STYLES.map((s) => s.id));
const KNOWN_SOLOIST_STYLES: ReadonlySet<string> = new Set(SOLOIST_STYLES.map((s) => s.id));
const KNOWN_HARMONY_STYLES: ReadonlySet<string> = new Set(HARMONY_STYLES.map((s) => s.id));

/*
 * The bass/soloist/harmony siblings of `isKnownChordStyle`, added by #1266.
 *
 * why they exist rather than an inline `BASS_STYLES.some(s => s.id === x)`: the
 * share reader (`loadFromUrl`) validated these three inline while the persist
 * reader (`hydrateSavedState`) passed the saved value straight through, and the
 * two readers then drifted independently — the exact failure mode that made
 * `swingSub` (#1257) and `chords.density` (#1258) each need a *second*,
 * retrofitted persist-side fix after their share-side one. One exported
 * predicate per lane means "what values may this field hold" is answered in one
 * place and both readers ask the same question.
 *
 * Unlike chords, none of these three unions in a genre-routed value. Within
 * `public/`, `SET_STYLE` is only ever dispatched for `module: 'chords'`, and the
 * genre tables route bass and soloist at *read* time (`resolveMappedStyle` /
 * `resolveSoloistStyle`) without ever writing the resolved key back to the slice.
 * (`scripts/ensemble-analysis-utils.ts` does drive all four lanes, but only with
 * values already in these lists — checked, not assumed.) So the picker list
 * genuinely is the whole keyspace here — see `isKnownChordStyle` above for why
 * that is emphatically NOT true of chords.
 */
export function isKnownBassStyle(id: unknown): boolean {
    return typeof id === 'string' && KNOWN_BASS_STYLES.has(id);
}

export function isKnownSoloistStyle(id: unknown): boolean {
    return typeof id === 'string' && KNOWN_SOLOIST_STYLES.has(id);
}

export function isKnownHarmonyStyle(id: unknown): boolean {
    return typeof id === 'string' && KNOWN_HARMONY_STYLES.has(id);
}
