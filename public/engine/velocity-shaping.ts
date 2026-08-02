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
 * `_writeNotesToTrack` (`midi-worker-logic.ts`); that question is filed separately.
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
