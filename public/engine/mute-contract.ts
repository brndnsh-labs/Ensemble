/**
 * The one authority for what a generated note's `muted` field means.
 *
 * `muted` carries **two unrelated meanings**, and every consumer that reads it has
 * to say which one it means:
 *
 * - **Bass** writes a NUMERIC palm-mute amount, `0` (open) … `1` (fully muted) —
 *   see `getBassNote`'s `@param muted` in `bass-engine.ts`. The funk slap "chuck"
 *   and the palm-muted chromatic pickups emit `1`. These are **real notes a bassist
 *   plays**; they sound, quietly.
 * - **Chords** write a BOOLEAN. `true` on a note with `midi: 0` is a CC-only carrier
 *   (a sustain-pedal event with no pitch); `true` on a real pitch is a ghost note;
 *   `false` is an ordinary audible note. See `getAccompanimentNotes` in
 *   `accompaniment.ts` and `emitCompNotes` in `comping-emit.ts`.
 * - **Soloist, harmony and drums** never write the field at all, so they always read
 *   `undefined` — which normalizes to "open", the same as `0`.
 *
 * A bare truthiness test collapses the two. That is how every palm-muted bass note
 * came to be dropped from live MIDI-out on every render while sounding normally in
 * audio (#1288), and how a boolean reaching the bass voice could have silenced it
 * outright (#1289). Read the field through these helpers, never with `!muted`.
 */

/**
 * How much gain a full mute leaves behind is `1 - amount * MUTE_ATTENUATION`, so a
 * fully-muted note keeps 15% — the level `playBassNoteNew` has always applied to its
 * audio gain, and the flat factor the `.mid` export hard-coded for bass before this
 * became shared.
 *
 * One constant keeps the mute *ratio* identical across the synth voice, the sampled
 * voice, live MIDI-out and the exported `.mid`. It does NOT make their absolute levels
 * equal: the export applies its own `Math.sqrt(noteVel)` compression that the live MIDI
 * path does not, so the same note lands on a different MIDI velocity in each. Only the
 * open-vs-muted relationship is shared.
 */
export const MUTE_ATTENUATION = 0.85;

/**
 * True when `muted` marks a **non-note** — the chords lanes' boolean `true`, which is
 * either a CC carrier with no pitch or a deliberately-ghosted comp voice. Those lanes
 * own their own emission rules, so a non-note must not be forwarded as a note.
 *
 * Deliberately `=== true`, not `typeof muted === 'boolean'`: those same lanes write
 * `muted: false` on perfectly ordinary audible notes, so a check keyed on the boolean
 * *type* would silently drop them. And deliberately not truthiness either, which is
 * the bug this module exists to prevent — a numeric `1` is a palm-muted bass note that
 * genuinely sounds, and it must reach MIDI attenuated rather than not at all.
 */
export function isSilentSentinel(muted: number | boolean | undefined): boolean {
    return muted === true;
}

/**
 * Normalize either meaning to a 0..1 amount: a boolean maps to its extremes, a number
 * clamps (an out-of-range value would otherwise drive gain negative through the
 * `1 - amount * MUTE_ATTENUATION` below — anything above ~1.176 does).
 *
 * A **non-finite** number stays non-finite by design, so a caller's own
 * `Number.isFinite` guard still fires on a malformed payload rather than being
 * silently rounded into a playable value. Callers that must not produce NaN should
 * use {@link muteGain}, which resolves that case.
 */
export function normalizeMuteAmount(muted: number | boolean | undefined): number {
    if (typeof muted === 'boolean') {
        return muted ? 1 : 0;
    }
    return Math.max(0, Math.min(1, muted as number));
}

/**
 * The gain multiplier a mute amount leaves behind — `1` for an open note, `0.15` for
 * a fully-muted one. Unlike {@link normalizeMuteAmount} this never returns a
 * non-finite value: an unusable amount resolves to `1` (treat it as open) so a MIDI
 * velocity computed from it can't go NaN.
 */
export function muteGain(muted: number | boolean | undefined): number {
    const amount = normalizeMuteAmount(muted);
    return Number.isFinite(amount) ? 1 - amount * MUTE_ATTENUATION : 1;
}
