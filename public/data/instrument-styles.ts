/*
 * The per-lane style keyspaces a saved chart may name. v1's per-instrument style pickers are
 * gone and no `prototypes/v2` file imports this module, but it is NOT dead (#1437 kept it): the
 * songbook codec (`songbook/codec.ts`) validates an old chart's legacy `band.*.style` fields
 * against `isKnownChordStyle`/`isKnownBassStyle`/`isKnownSoloistStyle`/`isKnownHarmonyStyle`,
 * so v2 reaches it through every chart it opens. Deleting it, or a list entry, changes which
 * stored charts decode. Each list is just the accepted ids (v1's picker labels are gone).
 */
import { SMART_GENRES } from './smart-genres.js';

export const CHORD_STYLES: readonly string[] = [
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

export const BASS_STYLES: readonly string[] = [
    'smart',
    // #628: the 'whole' drone style was retired with the Minimal phantom genre
    // (its only route). An old persisted/shared session with bass.style 'whole'
    // now falls through hydration's BASS_STYLES guard to the 'smart' default
    // (genre-routed bass) — graceful, never silent.
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

// #628: the one soloist voice per canonical genre (the 13). The manual soloist
// picker is gone, and so is the v1 manual's generated style table (#1358), so this list
// now serves the songbook codec's legacy `soloist.style` validation (`isKnownSoloistStyle`).
// Ids are the values the 13 genres once routed to the lead; nothing sets or reads a lead
// style any more, so the list only says what an old chart may carry.
export const SOLOIST_STYLES: readonly string[] = [
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

// The retired harmony lane's styles (#1436): kept only so the codec can still validate the
// legacy `ChartBand.harmony` lane an old chart carries (`isKnownHarmonyStyle`).
const HARMONY_STYLES: readonly string[] = [
    'smart',
    'horns',
    'strings',
    'organ',
    'plucks',
    'counter',
];

const KNOWN_CHORD_STYLES: ReadonlySet<string> = new Set([
    ...CHORD_STYLES,
    ...Object.values(SMART_GENRES).map((g) => g.chord),
]);

/**
 * Is `id` a chord style the app can legitimately hold?
 *
 * why (#1257): `CHORD_STYLES` is the **picker** list — UI metadata. It is NOT the
 * set of values `chords.style` can hold, because the genre table routes styles the
 * picker doesn't offer: Acoustic sets `chord: 'arp'` (see `GENRE_OVERRIDES` in
 * smart-genres.ts), which the old engine's `comping-emit.ts` read via `chords.style === 'arp'`
 * to emit the fingerpick arpeggio. Validating untrusted input against the picker list
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

const KNOWN_BASS_STYLES: ReadonlySet<string> = new Set(BASS_STYLES);
const KNOWN_SOLOIST_STYLES: ReadonlySet<string> = new Set(SOLOIST_STYLES);
const KNOWN_HARMONY_STYLES: ReadonlySet<string> = new Set(HARMONY_STYLES);

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
 * place and every reader asks the same question. (Those two readers went with v1's
 * load/save layer, #1424; the songbook codec's legacy-field validation reads them now.)
 *
 * Unlike chords, none of these three unions in a genre-routed value. Within
 * `public/`, a `style` write for bass reaches the slice only through
 * `SET_GENRE_FEEL` (bulk, genre-driven) or a loaded chart's own data (the soloist
 * and harmony lanes no longer hold a style at all) —
 * never an arbitrary per-lane value (the old dedicated `ACTIONS.SET_STYLE`,
 * which was `module: 'chords'`-only in practice, was deleted in #1381; nothing
 * dispatched it — the live generic `SET_PARAM` write could still
 * set a bass `style` — it checks the field name, not the value — but nothing does). The old engine's genre
 * tables routed bass and soloist at *read* time without ever writing the
 * resolved key back to the slice.
 * So the picker list
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
