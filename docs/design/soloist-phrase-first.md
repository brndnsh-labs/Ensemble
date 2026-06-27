# Soloist Re-Architecture — Phrase-First, Vocalist↔Improviser

**Status:** Design proposal v2 (not yet implemented). Source-of-truth body for the planned *Soloist* epic.
**Date:** 2026-06-27
**Goal:** A lead player that sounds like a tasteful session musician — composed but improvisational, idiomatic per genre, and *evolving over the course of a song* the way a great vocalist or a Beck/Satriani-style melodic player does.

*v2 incorporates a music-theory review of v1. The two structural changes from v1: a first-class **harmonic-target / tension-release grammar** (§5) and a **voice-leading-aware realizer** (§4.5) — without these, the original "develop then snap to the current chord" order would have reproduced the very "aimless" failure this design targets. v2 also defines the load-bearing **growth recurrence** (§6) that v1 hand-waved, splits v1's single personality dial into a small vector (§3), specifies the **arc's behavior under loops/vamps** (§9), and fixes several theory imprecisions.*

This doc is the written target the by-ear stories gate against. It is intentionally opinionated; the open questions in §13 are the parts we have *not* settled.

---

## 1. Diagnosis — why today's soloist sounds "aimless"

Two as-built audits of the current engine (control-flow trace + geminism hunt) produced a consistent picture. The notes are usually *right*; the line has no *intention over time*. Mechanically:

- **The melody is a frozen line that gets eroded, not developed.** At play start, `soloist-seeder.ts:generateSessionSeed` bakes a complete note list (pitch, anchor, duration). For the Head (Loop 0) and most later loops the live engine takes the **head-bypass** path (`soloist.ts` Path D): it pins each pitch to the frozen seed note (`isHeadBypass → selectedMidi = targetMidi` in `soloist-pitch-engine.ts:selectPitchAndDevices`, verified at `:1603-1605`) and **skips the weighted picker for pitch entirely.** Loop-over-loop "evolution" is then only *erosion*: probabilistic note-dropping (`survivalProb`), ±1–3 scale-step jitter, and added ornaments. **Erosion is the opposite of development** — the line can only become *less itself*, never grow.

- **The development engine already exists — but is frozen between edits.** The seeder genuinely applies one development op per restatement (`soloist-seeder.ts:1305-1411`, gated `iteration > 0`): rhythmic displacement, compression/subdivision, note-drop, interval-expansion, stationary-collapse, and a transposition op *labeled* "sequencing." This is the crown jewel of the system. It runs at `TOGGLE_PLAY` **and re-fires on mid-song arrangement/key/time edits** (`state-effects.ts:regenerateSessionSeeds`, `:170-219`) — but never *per phrase as the song unfolds*. Its output is frozen between those events.

- **There is no dramatic arc.** "Evolution over loops" is a single linear nudge: `effectiveIntensity = intensity + max(0,loopCount)*0.05` (`soloist.ts`). A ramp, not an arc. Nothing builds to a peak and resolves.

- **Rest is a budget constraint, not a musical choice.** Space comes from `budgetForcesRest` (bars-since-rest exceeded) — the player rests when it has overspent, not when a phrase has *ended*.

- **Many "intentionality" features are corner-wired** (the "geminism" texture — partial implementations left by successive model families):
  - `memory.rhythmicMotif`, `memory.hookBuffer` — first-class memory slots **only ever assigned `[]`**, never read (verified: zero reads). Pure ghosts.
  - `syncopationLikelihood` — set on ~15 profiles, but only reaches the *head seed*; the live `attackProb` honors syncopation through hardcoded `style==='ska'/'reggae'/'bossa'` branches that **don't read the field**. So funk/jazz/disco's settings are decorative.
  - `sharedHookBuffer` — published on every anchor for every genre behind a *deterministic* gate (`scrambleHash(...) >= 0.5`, `soloist.ts:694` — not an RNG burn), but read **only by Ska** (`harmonies.ts:439-444`). Wasted compute + a worker-synced buffer write for 12 genres.
  - Fatigue-decay — overridden by a rest-floor exactly on the jazz/blues "space styles" it was built for.
  - Syncopation-arc `driftFactor = sin(...)` — gated `> 0`, so dormant for half of every cycle by construction.

**Conclusion:** the system isn't a note-generator that needs better biases. It is a *replay-and-erode* machine wrapped around a *development engine that's switched off mid-song*. The fix is not "add intention" — it's to **move development from frozen-between-edits to live-per-phrase**, give it a **grammar of harmonic intention**, and subordinate it to a **dramatic arc** and **intentional breath**.

---

## 2. North star

> **A tasteful session player who always seems to know the right thing to play in the moment.**

Serves the song, never overplays, genre-fluent, knows when to shut up. Decomposed into mechanics that converged independently from both the listening references and the code:

1. **Theme-then-develop** — state a singable idea, then *do something to it* as the song unfolds (§6 defines how).
2. **Land with intention** — *where you land matters more than what you run.* Strong beats are targets; the rest is approach (§5). This is the grammar under everything.
3. **Breath** — phrases end; rests are where a phrase naturally finished, sized like a singer's inhale (§7).
4. **Call-and-response** — leave gaps for an implied other voice, and **answer your own phrase** (question ends on tension → gap → answer resolves).
5. **Express** — bends/slides/vibrato, dynamics-as-phrasing, and time-feel are what separate "instrument" from "singer" (§10).

Reference targets (owner's gut picks first): Jeff Beck — *"'Cause We've Ended as Lovers"*; Joe Satriani — *"Always With Me, Always With You"* (lyrical, mid-tempo, singable — the *singing* Beck/Satriani, not the shredding ones). Jazz home base leans **busier** — Charlie Parker bebop as the Slice-2 target.

---

## 3. Personality — a small vector, not a single dial

The soloist is **one engine** whose personality is a small **vector**, placed by genre + tempo + position in the arc. v1 collapsed this to a single vocalist↔improviser scalar; that's wrong — it makes *sparse improvisers* (Miles, B.B. King) inexpressible, and the owner's own "singing vs. shredding Beck" proves the personality moves *within one player*. The independent axes are at least:

- **Density** — notes per bar (King/Miles low; Parker high).
- **Breath / phrase length** — short & frequent-rest ↔ long & continuous.
- **Idiom vocabulary** — which development ops and articulations are in play (§8).

| Archetype | Density | Breath | Idiom |
|---|---|---|---|
| Ballad vocalist (Beck "Ended as Lovers") | low | generous | bend-into-target, register-reach, answer-self |
| Sparse improviser (Miles, B.B. King) | low | generous | guide-tones, space-as-tension, blues vocabulary |
| Dense improviser (Parker bebop) | high | sparse | enclosures, bebop-scale, sequence-through-changes |

For genres that don't typically feature a soloist, the vector sits at *low density / generous breath / simple-vocal idiom* and the question is literally *"what would a vocalist sing here?"* — a tasteful lead, never a forced shredder.

---

## 4. Architecture — six responsibilities (mostly reusing existing code)

A top-down pipeline. These are **conceptual responsibilities**, not a mandate for six new modules — three repurpose existing code. Guard against over-abstraction: build the minimum that proves the current slice (§11), not all idioms up front.

1. **Arc (narrative) layer — NEW, small.** A dramatic curve over the song, with one long-range **climax target** (the "money note", §9). Emits per-moment targets: energy, register ceiling, density, ornament budget, and *where we are in the story*. **Replaces** the linear `+0.05/loop` creep. Has a defined fallback for sectionless loops/vamps (§9).

2. **Phrase planner — NEW, small.** Decides *phrase vs. rest*, phrase length, and contour role (statement / question / answer / climax) from the arc. Owns breath (§7) and *places* dramatic silence (§10). Because determinism is position-keyed (§6), a **question and its answer are planned as a pair up front** — "answer your own phrase" responds to the *intended* question, not a reactively-heard one.

3. **Development engine (the promoted seeder) — REUSE + PROMOTE.** Holds the current idea as an abstract **interval-contour + rhythm cell** and applies development op(s) per phrase, governed by the growth recurrence in §6. This is the existing `soloist-seeder.ts` development logic, lifted from "frozen between edits" to "live per phrase," deterministically keyed on `(sectionId, loopCount, phraseIndex)`. **The spine.**

4. **Harmonic-target layer — NEW, first-class. The keystone correction (see §5).** Given the developed contour and the phrase's *chord span*, it assigns **target tones to strong beats** (chord tones, guide tones, ii–V resolutions) and marks the rest as approach. It is what turns a contour into an *intentional* line, and it spans the whole phrase so the realizer can voice-lead and anticipate across barlines — not snap to the current chord.

5. **Realizer — REPURPOSE the old picker, made voice-leading-aware.** Solves the actual notes connecting the §4-fixed targets with approach material (passing/neighbor/enclosure/chromatic), **across the phrase's harmonic span**, respecting register slotting. The old `selectPitchAndDevices` chord-tone/contour/common-tone biases earn their keep here — for the *connective/approach* choices, with the *targets* already pinned by layer 4. Crucially **not** greedy-per-chord (that was v1's fatal order).

6. **Expression & feel layer — KEEP + ELEVATE.** Bends/slides/vibrato (already healthy; blues bend already targets chord pillars) **plus** dynamics-as-phrasing (swell into a target, decay on release) and **time-feel** (laid-back vs. on-top micro-timing) — §10.

*(Deferred: a **Listening layer** — react to comp density / drum fills / walking bass. The dream, but the most expensive; sequenced last. §13.)*

> **Coupling note:** development (3) and harmonic-targeting (4) are not strictly sequential. Development proposes a *flexible* contour + rhythm; the target layer anchors it to the harmony and may reshape it (a contour peak gets nudged onto the chord's guide tone). Think "propose, then reconcile against the changes," not "finalize, then snap."

---

## 5. The grammar of intention — target tones & tension/release

The single most important thing a professional does, and the layer v1 was missing:

> **Where you land matters more than what you run.** Strong beats are *targets* — chord tones, guide tones (3rd/7th), the resolution of a ii–V. Weak beats and offbeats are *approach material* — passing tones, neighbors, enclosures, chromatic approach. And the line is heard **through the changes**: voice-lead across a ii–V–I as one gesture (7→3), and *anticipate* the next chord across the barline (play its 3rd/7th on the "and of 4").

This is **universal, not a bebop idiom** — Beck, King, Parker, and Miles all organize lines this way in every genre; only the *density* of approach material between targets changes. It is the difference between "a developed phrase" and "a developed phrase that sounds like it's going somewhere." A peak landed on a tension tone on a weak beat reads as wandering no matter how good the motif.

Architecturally this is why the harmonic-target layer (§4.4) is first-class and sits *before* realization, and why the realizer (§4.5) is phrase-span / voice-leading aware rather than greedy-per-chord.

---

## 6. How an idea grows — the recurrence (load-bearing)

"Develop live per phrase" is only as good as its definition of *accumulation*. Done naively (phrase N develops from phrase N−1, forever) it drifts into unrelated material — relocating "aimless" from a frozen line to a song-long random walk. The model is **cumulative-but-anchored**:

- **Cell identity is preserved.** The motif is an abstract **interval-shape + rhythm** (the thing that makes "da-da-da-DUM" survive transposition/inversion/augmentation), not a scale-degree list. Development ops transform the cell; a **similarity leash** keeps each statement *recognizably* the same idea (bounded contour/rhythm distance from the cell), so growth ≠ drift.
- **Develop from the last statement, return to the theme periodically.** Each phrase generally develops the *previous* statement (cumulative), but the solo **returns to the head** on a cadence that **scales with song length / loop count** — short loops come home sooner; long songs earn more departure before re-grounding. We deliberately *don't* fix a number; it's proportional, driven by the arc. Re-recognition of the theme is what makes the whole thing feel *composed* rather than wandering.
- **Ops can stack toward a peak.** Real development combines (fragment + sequence + augment as it climbs), not one-change-at-a-time. The inherited seeder picks exactly one op per restatement (`generateSessionSeed`'s restatement block); the live developer should treat single-op as a *floor*, stacking more as the arc intensifies.

**Implementation note (Build 2b — shipped).** The first live-development cut realizes the cumulative-but-anchored model with **depth-indexed re-derivation** rather than literal phrase-N-from-phrase-N−1 chaining: `getSoloistNotePhraseFirst` (`diatonicTranspose` + the development block) derives `depth = loopCount % cyclePeriod` (period scaled to song length — `3 + floor(loopLen/128)`, clamped 3–6) and **diatonically sequences the whole line up `DEPTH_DEGREES[depth]`** against the key scale, contour preserved. This is equivalent-feeling and strictly better-behaved: cumulative (depth d ⊃ depth d−1's reach), anchored (the bounded reach *is* the similarity leash — no carried mutable state to drift), deterministic, and it survives mid-song section edits because it depends only on `loopCount`, not on prior loops. `depth 0` (every cycle top) is the verbatim **theme return**. Keyed on `loopCount` (integer) so transposition only changes at a loop boundary — never a mid-phrase pitch jump. *Deferred to a follow-up:* apex/money-note reach, op variety (inversion/displacement/augmentation), and arc-position-driven development *within* a single long through-composed pass (today such a form develops across repeats).

---

## 7. Tempo model — the wall-clock ↔ musical-time bridge

The arc and phrasing live in **musical time** (beats/bars) for sync, but **breath is roughly constant in wall-clock** — a real singer's inhale is ~0.4–0.8 s regardless of tempo. So:

- **Breath has a seconds-floor.** `restBeats = max(musicalRest, ceil(minBreathSeconds * bpm / 60))`. At a ballad that's ~2 beats; at fast tempo the same half-second is several beats — which is *why* fast playing naturally has fewer rests without sounding breathless.
- **Density has a tempo ceiling.** A "singable" line thins as tempo climbs — *unless* the vector is at high-density/improviser (where dense is the point).
- **The self-answer gap scales** with tempo the same way.

Tempo-awareness is woven into how phrase/breath/density are computed, not a bolt-on flag.

---

## 8. Development vocabulary by idiom (the genuinely new content)

Idiom is **vocabulary + deployment rules, not a numeric knob** (you cannot get bebop from `syncopationLikelihood: 0.8`). Go **deep on a few, not wide on all 13**. Each op must be **deterministic** (seeded on `sectionId`/`loopCount`/`phraseIndex`) so critique tests and looped playback stay coherent.

**Core development ops** (which already exist vs. which are net-new — be honest in the migration plan):
- *Exist (promote to live):* transposition (the seeder's mislabeled "sequencing"), rhythmic displacement, note-drop, ornamental subdivision, interval-expansion.
- *Net-new:* **true sequencing** (motif stated then *restated adjacently* at a new pitch level — original + copy, not a single shift), **inversion** (mirror the interval contour — idiomatic to Parker), **augmentation/diminution** (uniformly scale all durations, preserving contour — a classic climax/relaxation device; distinct from the seeder's "compression," which only splits one note).

**Per-idiom vocabulary:**
- **Generic / vocal (default):** literal repeat, paraphrase, register-reach toward the climax note, question→gap→answer.
- **Blues-rock (Beck/Satriani — Slice 1):** bend-into-target on strong beats, answer-your-own-phrase, motif reached progressively higher across restatements toward the one climax note, pentatonic+ vocabulary, vibrato on sustains.
- **Bebop (Charlie Parker — Slice 2):** *articulated swung eighth-note lines with breath and rests* (bebop is a horn-singer idiom, **not** a continuous cascade), enclosures (chromatic approach above + below a target chord tone), bebop-scale passing tones (the 8-note scale exists so chord tones land on downbeats in eighth-note runs), guide-tone lines (7→3 across ii–V), motif sequenced *through* the changes, ii–V–I targeting.
- *(Separate, harder, deferred:* **sheets-of-sound** — late-Coltrane rapid arpeggiated/scalar cascades — is its own idiom, **not** Parker; do not conflate.)*

---

## 9. The arc, concretely — including loops & vamps

Map a dramatic curve onto the music with one long-range **climax target**:

- **Entrance:** restraint — low register ceiling, sparse, expression minimal. State the theme plainly.
- **Development:** build — register and density climb; ops get bolder and begin to stack (§6).
- **Climax:** the money moment — the arc places **one target pitch** (the "money note"), and development aims the contour at it over many phrases. Highest register reach, densest, most intense bends/vibrato. A *long-range pitch goal* is most of what makes a solo feel composed.
- **Resolution:** wind down — return toward the theme, resolve onto stable tones, open the breath. May leave a *placed silence* after the climax (§10).

**Implementation note (Build 2c — apex/money note; refined twice after review).** The apex is the **single highest seed note in the whole macro-form** — the solo's one definitional peak. Whenever it sounds it **lands on the money note**: a strong, resolved **key tone** (tonic/5th) derived **by construction** as the highest such tone in `(themeApex+3 … themeApex+9]`, capped at 90 — a clear but connected reach (≤ a sixth, no octave leaps), in-register (the high end is NOT clamped downstream, only `<52` is). If the apex is already so high none fits, the apex keeps its pitch.

Two findings shaped this:
- *(P1, code review)* The first cut **stacked** the reach on 2b's uniform diatonic lift and guarded it with `moneyNote > midi`; for high themes the lift alone pushed the apex past the capped money note, skipping the reach so the climax landed on a tension tone ~half the time. Fixed by driving the apex *only* by the reach, not the body lift.
- *(production-faithful probe)* The reach was then keyed on `reachFraction = developmentDepth/(cyclePeriod−1)` — but the apex is a **single fixed point** in the 128-bar macro-form while `developmentDepth` cycles every ~24 bars, so the two are **decoupled**: the apex almost always sounded at a low-reach phase and landed on a near-by tension tone (measured: the leading tone in 2 of 3 genres). Fixed by driving the reach from the apex's **identity as the form peak** — it lands the money note *whenever it sounds*, not on a loop-count phase. The body keeps its loop-count development/return; only the single peak follows the target.

The apex is exempt from the breath gate (the climax never gets gated out) and **keeps the money note rather than chord-snapping** (a held tonic/5th over the changes = idiomatic pedal climax), with a small velocity boost. The developed body line folds into register as **one unit** (contour never inverts at the seam); `emitsAt` (the duration-clamp lookahead) matches the live gate exactly — including **pickup notes**, whose negative step maps near the loop tail (skipping them let a held note overrun the pickup). *Open trade-off (Brandon's ear):* the climax is now reliable but **rare — once per ~128-bar macro-form**; a recurring signature peak would mean per-development-cycle or per-phrase local apexes. *Deferred:* a stepwise **run-up** into the apex, op variety (inversion/displacement), per-phrase apexes.

**Fallback under loops / vamps / edits (must be specified before Slice 1 — Slice 1's ballad may itself be a short loop):**
- **Single-section loop or single-chord vamp:** there are no narrative sections to map a curve onto, so the arc runs on a **loop-count-keyed curve with a defined period** (e.g. an N-loop rise-and-resolve cycle) rather than collapsing to flat.
- **Mid-song section add/remove/edit & key/time changes:** today these re-fire `regenerateSessionSeeds` (`state-effects.ts:170-219`) and rebuild the seed. The live arc must define how it *re-anchors* (preserve the climax target and current cell where musically possible, rather than restart cold).
- **User section-jump:** the arc must map the new position sensibly (don't replay the entrance from the top mid-song).

---

## 10. Expression & feel — the carry

Three expressive axes, elevated from v1's single "devices" mention because for a "tasteful session player" they matter as much as the notes:

- **Articulation (have it):** bends/slides/vibrato/harmonics, chosen to *serve the phrase* — bend *into* a target tone on a strong beat (§5), vibrato on held notes. `soloist-devices.ts` + synth path are LIVE-AND-EFFECTIVE.
- **Dynamics as phrasing (new):** a loudness *contour*, not per-note velocity — swell into a target, decay on release; ghosted approach notes vs. accented landings. The thing that makes a phrase breathe.
- **Time-feel (new axis):** where notes sit against the grid — laid-back (Beck/King ballads, neo-soul drag) vs. on-top (bebop push) vs. floating (reggae). Largely *what* makes a line read "vocal" vs. "urgent." A `timingOffset` field already exists in the note model; this elevates it from incidental to an intentional, idiom-driven axis.

---

## 11. Migration & safety — vertical slices, no big-bang

The soloist is the most by-ear subsystem in the app and has critique tests pinned to current behavior. We do **not** detonate it in one PR.

- **Keep the current engine path runnable** behind a flag/branch until a slice supersedes it.
- **Slice 0 — dead-code removal (independently shippable, burndown-safe, audit-verified):** delete `rhythmicMotif` + `hookBuffer` ghosts; gate `sharedHookBuffer` publish to Ska; un-corner or cut `syncopationLikelihood`-live / fatigue-on-space / drift half-cycle. Worth doing first regardless, to stop them confusing the rewrite.
- **Slice 1 — bones (forgiving):** the Beck/Satriani **ballad**. Build the arc (incl. the vamp/loop fallback, §9) + phrase planner + promoted live development + the **harmonic-target layer** + breath/self-answer + the **voice-leading realizer** + expression — where harmony is simple/static, the idiom is forgiving, and the already-healthy expression layer carries it. Goal: prove the **skeleton**, not the hardest idiom.
- **Slice 2 — flagship (hard, high-value):** **Parker bebop**. Add the bebop vocabulary (§8). This is where we're already relatively strongest *and* the idiom most likely to expose whether the bones hold — leading here first would confound "architecture wrong" with "idiom hard," which is why it's second. (Reinforced by the review: the greedy realizer would have failed *here* specifically.)
- **Then propagate** to the remaining genres as tasteful vocal-lead defaults — but note (§13) the personality *vector* (§3), not a single dial, is what makes country/reggae/neo-soul distinct; the propagation phase is where that bites.
- **Critique tests rewritten per slice** — phrase-level metrics (motif recurrence under the similarity leash, rest distribution, arc shape, target-tones-on-strong-beats, call-and-response presence), **not** note-correctness or the old erosion model. Statistical ranges, never rigid snapshots. The **by-ear listening gate is the hard human DoD.**

---

## 12. Keep / Repurpose / Kill (grounded in the audits)

| Verdict | Items |
|---|---|
| **Keep & promote** | seeder development ops → live spine (§6); `restatementEcho`; articulation devices; gap-fill |
| **Repurpose** | weighted picker `selectPitchAndDevices` → the **voice-leading realizer** (§4.5), with targets pinned by the harmonic-target layer |
| **Kill** | `memory.rhythmicMotif`, `memory.hookBuffer` (dead); erosion-as-evolution; budget-rest-as-only-breath; linear `+0.05/loop` creep; `sharedHookBuffer` publish for non-Ska |

---

## 13. Open questions & risks (unsettled — flag, don't pretend)

- **Personality vector vs. 13 genres.** Even a multi-axis vector (§3) is one *family* of leads; country (chicken-pickin'/pedal-steel), reggae (sparse offbeat), neo-soul (chromatic, behind-the-beat) are genuinely distinct identities. Fine for Slices 0–2; the **propagation phase** must decide how much per-genre vocabulary each needs.
- **Disco "lead = ensemble line."** In several genres the lead voice is historically a *section* (strings/horns), not one player. Parked: single-voice for now, but **must not hardcode single-voice assumptions** that block a future ensemble-lead branch.
- **Two-PRNG-worlds.** The seed's `createPRNG(songSeed)` and the live `scrambleHash(callSeedBase + …)` are independent. Promoting development to live must unify determinism so a phrase is reproducible from `(sectionId, loopCount, phraseIndex)`.
- **User-facing levers.** "busy ↔ spacious," "stick to the theme ↔ explore" fall naturally out of the vector/arc once they exist. Defer — a consequence of the architecture, not a first deliverable.
- **Bebop noodling risk.** Dense idioms have the most room to sound aimless; Slice 2 is gated hard by ear, and leans on §5 to stay intentional.
- **Coordination coupling, polyphony/voice-count, articulation timing.** How the phrase-first realizer interacts with `coordination-engine` (register slotting, comp-voicing handoff) is unscoped.
- **Thematic transformation & quoting (deferred but named):** recasting the theme in a new character at the peak (e.g. double-time) and quoting a recognizable lick are idiomatic to the references; neither is in scope for Slices 0–2.

---

## 14. Definition of done (per slice)

- **By-ear listening gate** (owner) is the hard human stop — warm praise ≠ sign-off; needs an explicit go.
- **Critique tests** assert phrase-level musical structure (recurrence under the similarity leash, rest distribution, arc shape, target-tones-on-strong-beats, call-and-response), within statistical ranges.
- Typecheck/lint/`npm test`/e2e green; AI_MAP updated for any new engine file; dead code removed.
