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
 * other. The reasoning and the measurements live at the bass branch in
 * `_writeNotesToTrack` (`midi-worker-logic.ts`).
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
 * The soloist's band-intensity swell: how much louder the lead plays as the
 * conductor drives the band harder.
 *
 * Musical intent: a soloist is the lane that *responds* to the room — laid back
 * under a quiet verse, leaning in over a shout chorus. The `0.5` floor / `0.9`
 * span are the numbers the `.mid` exporter has always written; #1325's decision
 * was that the exported dynamics were RIGHT and live playback was the side
 * missing them, so live adopted these rather than the export flattening to
 * live's un-swelled velocity.
 *
 * **Apply this as a FINAL-STAGE multiplier**, after the accent / conductor /
 * polyphony factors — per CLAUDE.md's weight-tuning rule. Folded into one of
 * those terms it washes out against the others.
 *
 * **The live curve this participates in is QUADRATIC, and that is intended.**
 * This function is linear, but it is not the only intensity→velocity term in the
 * live path: `playback.conductorVelocity` is itself `0.7 + bandIntensity * 0.45`
 * (`applyConductor` in `conductor.ts`, running every step while `autoIntensity`
 * is on). The live soloist multiplies by both, so the effective curve is
 * `(0.7 + 0.45·I) × (0.5 + 0.9·I)` = `0.35 + 0.855·I + 0.405·I²` — live swings
 * 0.35x–1.61x where the export swings only this function's 0.50x–1.40x.
 *
 * That accelerating shape is a feature, not the double-application bug it can
 * look like: across the conductor's realistic operating band the lead's dynamic
 * range goes from ~4.1 dB to ~8.7 dB, which is closer to how a horn or lead
 * guitar actually plays a climax — you don't ramp linearly into a peak, you
 * commit late. **Don't "fix" the linearity here**; a fourth term stacked on top
 * is the real risk. The live-vs-export range divergence is a known, accepted
 * open question (the exporter never reads `conductorVelocity`, though it IS
 * synced to the worker) — filed, not forgotten.
 *
 * @param bandIntensity `playback.bandIntensity`, 0..1 — production default 0.35
 *   (gain 0.815), floored at 0.01 by the auto-conductor and at 0.3–0.45 by most
 *   genres, so the 0.5 gain at a true 0 is a bound, not a resting seat. Absent
 *   or non-finite → 0.5; production always sends a real number, so that fallback
 *   is a test-shape affordance rather than a live path. Guarded with
 *   `Number.isFinite` rather than `??` because this is the first term in the live
 *   soloist velocity product that can carry non-finiteness, and
 *   `dispatchMidiSoloist` → `normalizeMidiVelocity` would pass a NaN straight
 *   through as a MIDI data byte (the synth voices guard, MIDI-out doesn't). Same
 *   guard shape as `soloistBrightnessDrive` in `synth-soloist.ts`.
 * @returns a gain multiplier in [0.5, 1.4]. Total function — every input,
 *   including NaN, yields a finite gain.
 */
export function soloistIntensityGain(bandIntensity: number | undefined): number {
    const intensity = Number.isFinite(bandIntensity) ? (bandIntensity as number) : 0.5;
    return 0.5 + intensity * 0.9;
}

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
 */
export const BASS_VELOCITY_DOMAIN_MAX = 1.5;

/**
 * The loudest *static* per-note token a bass *style* may author (`bass-styles.ts`
 * / `bass-engine.ts` lane velocities: 1.0 base, 1.15 odd-beat accent, 1.25 funk
 * slap). Deliberately BELOW `BASS_VELOCITY_DOMAIN_MAX`: the gap between the two
 * is the headroom the intensity/envelope terms multiply into, which is exactly
 * what the old single-number ceiling had no room for.
 *
 * Not a hard invariant today: several tokens already add an intensity term on
 * top of it by design (`bass-styles.ts`'s `popVel`/`slapVel`, ~1.25 + intensity
 * * 0.1-0.2, reaching ~1.35-1.45) — #1334/#1336 are about giving those terms
 * real headroom to swell, which will push authored peaks further past this
 * number, not less. Read this as "the base-case ceiling a style starts from,"
 * not an enforced cap — module-local (not exported) so nothing downstream can
 * mistake it for a runtime guard. Referenced by the funk slap token
 * (`bass-engine.ts`) — the one static token that literally IS this ceiling.
 */
export const BASS_AUTHORING_CEILING = 1.25;

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
 * why 2.0: the loudest value the live chain can hand the voice is
 * `BASS_VELOCITY_DOMAIN_MAX (1.5) × conductorVelocity (≤1.15) × humanize
 * velocityMult (≤1.1)` = 1.90, so 2.0 sits just above every reachable product
 * and only ever engages if an upstream producer breaks its own contract. Bounded
 * rather than open-ended because this multiplies an oscillator gain: a runaway
 * velocity from a future producer bug should distort, not blow up the bus.
 */
const BASS_VOICE_INPUT_MAX = 2.0;

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
 * multiplies the emitted velocity by the band-wide `conductorVelocity`
 * (`0.7 + bandIntensity*0.45`, up to 1.15) and by per-note humanize
 * (`velSpread` 0.1 → up to 1.1) AFTER the engine clamped. Re-clamping at 1.5
 * here would just move the original bug one layer down: at chorus intensity the
 * top two velocity tiers (1.41 and 1.50 × 1.105 conductor) both land above 1.5
 * and would collapse onto one amplitude again. `BASS_VOICE_INPUT_MAX` is a
 * defensive bound sitting just above the highest reachable product, not a
 * musical ceiling.
 *
 * Mute attenuation is NOT applied here (the caller multiplies by the
 * `mute-contract.ts` factor) — this is the velocity axis only.
 *
 * @param velocity the velocity as the VOICE receives it: an engine note velocity
 *   on the `[0, 1.5]` domain, times any downstream band/humanize gain.
 *   Non-finite → 0 (silent), matching the voice's finite-guard discipline.
 * @returns rendered amplitude, `[0, 1.87]`. Strictly increasing across every
 *   reachable input — no flat region anywhere.
 */
export function bassVelocityToAmplitude(velocity: number): number {
    if (!Number.isFinite(velocity)) {
        return 0;
    }
    const v = Math.max(0, Math.min(BASS_VOICE_INPUT_MAX, velocity));
    return v <= 1 ? Math.sqrt(v) : v ** BASS_ACCENT_EXPONENT;
}
