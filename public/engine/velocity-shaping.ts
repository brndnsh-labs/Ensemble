/**
 * The one authority for a velocity curve that live playback and the `.mid`
 * export must apply **identically**.
 *
 * Sibling in spirit to `mute-contract.ts`: a note's generated `velocity` is
 * reinterpreted independently on several paths (the synth voice, the sampled
 * voice, live MIDI-out, and the `.mid` exporter — see `public/engine/CLAUDE.md`
 * §7 for the same hazard on bend gestures), and every time a curve got
 * copy-pasted into two of them they drifted apart while the comment claiming
 * they matched outlived the fact. #1322 audited the two curves the exporter
 * claimed to "match live" and found BOTH claims false, in different ways.
 *
 * #1325 resolved the **soloist** one, below. It deliberately did NOT resolve the
 * bass one: the obvious fix (give the exporter live's `[0,1]` clamp) turned out
 * to propagate a truncation rather than share a curve, and "match live" is
 * ill-defined for bass because the synth and sampled voices disagree with each
 * other. (The old engine's `.mid` exporter, where that reasoning lived, was deleted with it,
 * #1404.)
 *
 * #1331 closed that gap from the other end: rather than teaching the exporter
 * live's truncation, live dropped it. The bass velocity **domain** is now
 * `[0, 1.5]` on every path — the same domain `normalizeMidiVelocity` already
 * used — and `bassVelocityToAmplitude` (below) is live's shared law on it.
 *
 * Deliberately dependency-free (pure math, no state import) so both the
 * main-thread audio scheduler and the worker-side exporter can call it.
 */

/**
 * Top of the bass velocity **domain** (#1331). Every emission-side clamp in
 * `bass-engine.ts` uses this — it is the widest value a generated bass note may
 * carry, NOT the loudest value a style is allowed to author.
 *
 * why 1.5: it is the domain `normalizeMidiVelocity` (`midi-utils.ts`) has always
 * assumed for the `.mid` export ("we treat 1.5 as the theoretical maximum for
 * internal accents"), so live and export now measure velocity on the same ruler.
 * The old 1.25 clamp was the *authoring* ceiling doing double duty as the domain
 * ceiling: three stacked intensity terms (`velocityParam × accent ×
 * intensityFactor × bassEnvelope`) put the 1.15 odd-beat accent on that rail at
 * i≈0.70 and the base note at i≈0.93, so at chorus intensity every note in the
 * bar came out at one identical velocity — the accent hierarchy and the macro
 * swell both erased.
 *
 * #941 removed the stacking itself: the emitted product is now
 * `velocityParam × accent × bassEnvelope`, all three intensity-FREE, and the
 * lane's macro swell moved downstream into `bassMacroGain`. This clamp is
 * consequently near-unreachable in practice (the loudest authored combination is
 * a 1.25 slap token × a 1.15 accent × a 1.05 envelope = 1.51) — which is the
 * point. It is a contract on what an engine may EMIT, not a working ceiling the
 * dynamics have to fight.
 */
export const BASS_VELOCITY_DOMAIN_MAX = 1.5;

/**
 * Exponent applied to the above-unity part of the bass velocity domain.
 *
 * why 0.9: the accent band has to clear the ~1 dB JND for a low-register tone
 * inside a mix. The authored base→accent step is ×1.15, so the rendered gap is
 * `20·log10(1.15^q)` dB — q=0.5 (the plain sqrt this replaces above unity) gives
 * 0.61 dB, inaudible; q=0.9 gives 1.09 dB, an accent you can actually hear.
 * Still sub-linear, so the top of the domain lands at 1.5^0.9 = 1.44 (+3.2 dB
 * over a base note) rather than a full +3.5 dB — the bass anchors the mix floor
 * and its macro swell stays deliberately compressed against the soloist's arc.
 */
const BASS_ACCENT_EXPONENT = 0.9;

/**
 * Defensive input bound for the bass voice — NOT a musical ceiling.
 *
 * why 2.5: the loudest value the live chain can hand the voice is
 * `BASS_VELOCITY_DOMAIN_MAX (1.5) × bassMacroGain (≤1.5) × humanize
 * velocityMult (≤1.1)` = 2.48, so 2.5 sits just above every reachable product
 * and only ever engages if an upstream producer breaks its own contract. Bounded
 * rather than open-ended because this multiplies an oscillator gain: a runaway
 * velocity from a future producer bug should distort, not blow up the bus.
 *
 * Raised from 2.0 by #941 for exactly one reason: the bass lane's macro term
 * grew from the band-wide `conductorVelocity` (≤1.15) to `bassMacroGain` (≤1.5)
 * when it became the lane's SOLE intensity term. This is a defensive bound
 * tracking a changed reachable maximum, NOT a decision to make the bass louder —
 * mid-intensity level is unchanged (see `bassMacroGain`), and the realistic
 * chorus peak (funk's The One at i=1.0 with +10% humanize) is 2.22, still below
 * this. Leaving it at 2.0 would have re-introduced the #1331 bug one layer down:
 * a hard clamp flattening the top of the swell.
 */
const BASS_VOICE_INPUT_MAX = 2.5;

/**
 * The live bass velocity → rendered amplitude law (#1331): the one authority for
 * how hard a bass note actually *sounds*, extracted out of `playBassNoteNew`
 * (`synth-bass.ts`) so critique tests can assert on RENDERED dynamics instead of
 * engine-side `note.velocity` — which sits upstream of this curve and therefore
 * showed a healthy accent hierarchy the listener never got.
 *
 * Two segments, continuous at v=1 (both give exactly 1.0):
 *  - **v ≤ 1 — `sqrt(v)`, byte-identical to the pre-#1331 curve.** The soft end
 *    is where the bass's seat in the mix is set; verse/low-intensity playback
 *    must not move at all, so this half is deliberately untouched.
 *  - **v > 1 — `v^0.9`.** Where the old code had `Math.min(1, …)`: a hard flat
 *    region that collapsed 1.0 / 1.15 / 1.25 onto one amplitude. Compressive but
 *    much less so than the sqrt, because this is the accent band — the notes the
 *    player is digging into.
 *
 * **This law deliberately does NOT clamp at `BASS_VELOCITY_DOMAIN_MAX`.** That
 * constant is an *emission-side* contract — what `bass-engine.ts` may generate —
 * and the voice legitimately receives more, because `scheduler-core.ts`
 * multiplies the emitted velocity by the lane's macro swell (`bassMacroGain`,
 * up to 1.5) and by per-note humanize (`velSpread` 0.1 → up to 1.1) AFTER the
 * engine clamped. Re-clamping at 1.5 here would just move the original bug one
 * layer down: at chorus intensity every note above ~1.0 emitted would collapse
 * onto one amplitude again. `BASS_VOICE_INPUT_MAX` is a defensive bound sitting
 * just above the highest reachable product, not a musical ceiling.
 *
 * Mute attenuation is NOT applied here (the caller multiplies by the
 * `mute-contract.ts` factor) — this is the velocity axis only.
 *
 * @param velocity the velocity as the VOICE receives it: an engine note velocity
 *   on the `[0, 1.5]` domain, times any downstream band/humanize gain.
 *   Non-finite → 0 (silent), matching the voice's finite-guard discipline.
 * @returns rendered amplitude, `[0, 2.28]`. Strictly increasing across every
 *   reachable input — no flat region anywhere.
 */
export function bassVelocityToAmplitude(velocity: number): number {
    if (!Number.isFinite(velocity)) {
        return 0;
    }
    const v = Math.max(0, Math.min(BASS_VOICE_INPUT_MAX, velocity));
    return v <= 1 ? Math.sqrt(v) : v ** BASS_ACCENT_EXPONENT;
}
