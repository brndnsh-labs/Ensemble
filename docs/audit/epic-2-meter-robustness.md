# Epic 2 — Meter Robustness + Genre Correctness

Synthesized 2026-05-28 from a thorough discovery sweep (2 read-only agents + main-thread triage of the two hot files) triggered after the compound-meter cycle (Epic 1) + the comping-lock fix exposed that the same two bug classes are latent across the generative engines, not just in jazz/All-Blues.

**Goal:** every genre × every instrument does something *reasonable* in any time signature (4/4, 3/4, 5/4, 7/4, 6/8, 7/8, 12/8). The bar is "groove + be musical / do our best," NOT idiomatic perfection — off-idiom combos (metal in 6/8) are *allowed to sound weird* but must still **groove and not break / jitter / drop out**. User decision 2026-05-28: **non-jazz odd/compound meters ARE in scope.** Taste/voicing layer is OUT — voicings sound good; this is **correctness**, not taste.

**Two bug classes:**
1. **Determinism / groove-lock** — raw `Math.random()` in *emission* paths (the `get*Notes` overlays + density gates) that re-randomize a deterministic generator, so the lane never locks loop-to-loop. (The Epic-1 comp fix was the exemplar — `accompaniment.ts:2543`.)
2. **Meter assumptions** — 4/4-shaped step math (`intBeat === N`, `beatIndex === N`, hardcoded 16-step / `% 4`, hardcoded mStep positions) that degrades or mis-places onsets in non-4/4.

The sweep also surfaced a **third, adjacent class — silent dead-key dispatch tables** — that is wrong in *every* meter (not meter-specific) but is the single highest-ROI find: one root cause, mechanical fix, fully audible. Included here because the user's broader ask was "correctness and musical oddities," and these make whole genres play wrong.

All findings below were **verified against source on 2026-05-28** (file:line quoted). Two independent discovery agents converged on the dead-key root cause from different directions (dispatch-table sweep + groove-reachability check), then the orchestrator grepped every cited line.

## How to use this doc

Same as Epic 1: this file holds the stories; `EPICS.md` is the tracker; ship one story per focused session, mark it done here, bump the count in `EPICS.md`. Treat every story's evidence as verified, but re-grep before editing — the tree shifts.

## Reachability ranking

Drums/comp/bass are always-on for every genre, so a bug there is always audible. Ranked by *audible-in-a-played-config* × *blast radius*:

1. **Dead-key cluster (Phase 1)** — whole genres (Ska-Punk, Metal, Bossa Nova) play the wrong strategy/fills/cadence in **every** meter. Mechanical fix, single root cause. Highest ROI.
2. **Determinism / lock (Phase 2)** — audible loop-to-loop jitter in bass + comp across many genres. The Epic-1 comp fix pattern, applied to the lanes it didn't cover.
3. **Compound groove density (Phase 3)** — 6/8 + 12/8 over-density in the two grooves that never opted into the shared `compound*Allowed` filters.
4. **Bass 4/4-position math (Phase 4)** — bossa/dub bass mis-place onsets in compound/odd.
5. **Odd-meter degradation (Phase 5)** — broad verification pass for 5/4, 7/4, 7/8 where the shared filters are inert.

---

## Phase 1 — Silent dead-key correctness (wrong in EVERY meter)

**Root cause:** the Ska-Punk genre's `feel` is the string `'Ska'` (`smart-genres.ts:124`), but four tables are keyed by `'Ska-Punk'` — the *strategy/preset* name — with misleading comments claiming "key matches groove-engine.ts." `accompaniment.ts` got it right (checks `=== 'Ska'` throughout), confirming `'Ska'` is canonical. `genreFeel` is validated against the 13-feel universe (`state-hydration.ts`): `Rock, Jazz, Funk, Disco, Hip Hop, Blues, Neo-Soul, Reggae, Acoustic, Bossa Nova, Country, Metal, Ska`. The Ska-Punk critique tests mask all of this by setting `genreFeel:'Ska-Punk'` — test-harness divergence from production.

Per [[canonical-genre-keys]], the fix is to rekey to the canonical feel (or add `Ska`/`Ska-Punk` to the known-alias family alongside `Rock`/`Shred`, `Neo-Soul`/`Neo`). Prefer rekey unless a single map legitimately needs both.

### S1 — Rekey all `'Ska-Punk'` dead-keys to `'Ska'` · Model: sonnet · ✅ SHIPPED 2026-05-28
- **Scope grew during implementation:** the planned 3 sites turned out to be **8** (all the same root cause — Ska-Punk's `genreFeel` is `'Ska'`). Fixed:
  1. `groove-engine.ts` `strategies` map (drum-strategy dispatch — was the big one; skaPunk strategy never ran, fell to `DEFAULT_CONFIG`).
  2. `groove-engine.ts` `HAT_SPINE_GENRES` set (final-bar hat-suppression — Ska-Punk's offbeat skank got cut on the final bar).
  3. `conductor.ts` `GENRE_INTENSITY_FLOORS` (floor was dead → upbeat-crack could fall below velocity threshold).
  4. `harmonies.ts:~372` shared-hook antiphony latch (`feel === 'Ska-Punk'` → `'Ska'`) — the antiphony feature was dead in production.
  5. `drum-seeder.ts:~138` `isRockFeel` snare check — Ska-Punk's backbeat could wrongly drop to sidestick at low energy.
  6. **`drop-mechanic.ts:45`** — reviewer-caught P0, the *inverted* variant: Ska-Punk is the substring **needle** (`'ska'.includes('ska-punk')` is false), so Ska-Punk got **no stop-time drops**. Needle → `'ska'`.
  7–8. Test-harness divergence: `tests/standards/ska-punk-*.test.ts` + `bass-walking-idiom-critique.test.ts` rekeyed to production-accurate `genreFeel:'Ska'` (+ one `getDrumMotif(...,'Ska',...)` arg, one `lastDrumPreset:'Ska'`). These were the masking smell — they passed *because* they set the dead key.
- **Verified:** full critique suite green (743 tests), typecheck clean. Reviewer (music-theory) confirmed the newly-activated skaPunk strategy/harmony/snare is musically coherent punk-ska, a net improvement over the `DEFAULT_CONFIG` fall-through.
- **Reviewer note carried to deferred item below:** `harmonies.ts:~328` (`feel === 'Ska-Punk'` offbeat-upstroke pattern) is unreachable for `feel='Ska'` because `:269` (`feel === 'Reggae' || feel === 'Ska'`) catches it first and gives Ska a *backbeat* skank. The follow-up should **DELETE 328 (vestigial), not activate it** — the ska offbeat upstroke is correctly owned by the chord channel (`accompaniment.ts:~837` `genre === 'Ska'`); activating 328 would recreate the harmony+chord double-stack bug Epic 6 S5 deleted.

### S2 — `FILL_TEMPLATES`: rekey `'Ska'` + add `Metal` · Model: sonnet · ✅ SHIPPED 2026-05-28
- **Where:** `fills.ts` — rekeyed the Ska-Punk fills `'Ska-Punk'` → `'Ska'`; added a new `Metal` entry (tom-and-double-kick driven, Crash over the bar line; low/medium/high tiers).
- **Bug fixed:** `FILL_TEMPLATES[genre] || FILL_TEMPLATES.Rock` at `:541`; Ska-Punk (`'Ska'`) **and** Metal both missed → both played **Rock** drum fills at section ends.
- **Verified:** `tom-vocabulary-critique.test.ts` extended to cover `'Ska'` + `'Metal'` (registry contract, 120-seed reachability sweeps at 0.6/0.85, voice-diversity) — 42 tests green; full standards suite green; typecheck clean. Metal fills use 3 tom voices, both medium + both high templates are tom-bearing.

### S3 — `GENRE_MAP` cadence coverage · Model: opus (taste call inside) · ✅ SHIPPED 2026-05-28
- **Where:** `resolution.ts:47` `GENRE_MAP` (keyed by genreFeel).
- **Fixed:** `'Bossa'` → `'Bossa Nova'` (dead key → Bossa Nova regains its `JAZZ_V_I, ritardando 1.0` instead of the Rock button — the most audible fix); `'Ska-Punk'` → `'Ska'` (kept `BUTTON, 0.0` — punk-ska ends hard; rekey just makes it reachable).
- **Cadence design call (orchestrator, user-delegated 2026-05-28):**
  - **Hip Hop → `BUTTON, 0.0`** — metronomic loop music; endings are hard cuts, a tempo ritardando is anti-idiomatic. Matches Rock/Funk/Disco.
  - **Country → `STANDARD_V_I, 0.8`** — strongly diatonic, resolves on a clear V-I authentic cadence with a gentle slow-down; matched to Blues' `0.8` (roots-Americana neighbor) rather than Acoustic's balladic `1.5`.
  - These values are a judgment call — revisit by ear if a Country chart wants more/less ritard.
- **Verified:** full standards + integration suite green (893 tests); typecheck clean.

---

## Phase 2 — Determinism / groove-lock (raw random in emission paths)

The Epic-1 comp fix ([[two-layer-determinism]]) seeded the **smart/jazz comping overlay** only. The same raw-`Math.random` lock-break lives in the **bass density gate** and the **per-genre comping lanes** — these re-roll every bar AND every loop, so the band never locks. Canonical seed shape (already used by bass/drums/comp): `((step * 0x9e3779b1) ^ ((loopCount | 0) * 0x85ebca77)) | 0`, then `scrambleHash(seed + n)` per gate.

### S4 — Bass density gate: seed the lock-breaking gates · Model: sonnet · ✅ SHIPPED 2026-05-28
- **Where:** `bass-styles.ts` `checkBassActiveStyle` — added a `bassRandSeed`/`bassDraw(n)` helper at the top (same shape as the compound walking gate + comping overlay) and seeded **5** gates (scope grew by one via a paired-site check): jazz/quarter eighth-skip `bassDraw(5)`, funk ghost `(1)`, metal gallop `(2)`, blues shuffle `(3)`, walking-ska skip `(4)`.
- **Bug fixed:** these decided *whether the bass plays this step* via raw `Math.random()` → rhythmic placement re-randomized every loop; the bass never locked.
- **Deliverable:** new `bass-density-lock-critique.test.ts` — per style: determinism, NON-tautology (the gate actually fires, bars vary), loop reproducibility. 15 tests.
- **Recalibration (reviewer-validated honest, not masking):** seeding the jazz/quarter gate shifted the deterministic beat-3 sample in `jazz-bass-critique.test.ts`, so two previously-green thresholds moved — A/B target-pull `≤ -0.20` → `≤ -0.10` (bias direction intact, magnitude is a sample artifact; `getBassNoteStyle` untouched) and octave-jump density upper `50` → `55` (prevMidi context shift, `withOctaveJump` untouched).
- **Verified:** full standards + engine-unit + integration suite green (1808 tests); typecheck clean; music-theory-reviewer confirmed completeness (all 5 gates seeded; pitch-picker color randomness correctly deferred) + recalibration honesty.
- **Pitch picker** (`getBassNoteStyle`) raw-random (octave/approach-tone color) stays deferred — color doesn't break the groove lock ([[two-layer-determinism]]).

### S5 — Accompaniment per-genre lanes: seed the emission overlays · Model: sonnet · ✅ SHIPPED 2026-05-28
- **Where:** `getAccompanimentNotes` — hoisted the `compRandSeed`/`compDraw` helper to the function top (was mid-function in the smart overlay) so the genre lanes share it. Seeded **5 ONSET gates** (offsets 20–24): soloist-yield skip (shared), strum-country ghost, Neo-Soul ghost, Funk conversational-displacement, Funk ghost chuck.
- **Bug fixed:** each lane decided whether a note plays via raw `Math.random`, re-randomizing offbeats every bar + loop — never locking.
- **Boundary (reviewer-validated):** seeded ONSET/placement (the groove lock); **left per-note velocity + micro-timing humanize raw** (power-metal chug vel, Neo-Soul drunk timing, Reggae skank vel, Funk vel/timing) — color, not placement, matching the comp-lock fix's own boundary + deferred §F.
- **Deliverable:** new `comp-lane-determinism-critique.test.ts` (strum-country, Neo-Soul, Funk) — determinism + produces-output + (for ghost-dominant lanes) non-tautology. 11 tests.
- **Recalibration (reviewer-validated honest stream re-alignment):** the shared soloist-yield gate runs for All Blues too; `all-blues-6-8-critique`'s sequence-PRNG harness re-aligned when the comp draw was removed, nudging soloist mean active-streak 9.x → 10.29 (max unchanged at 12 < 16). Raised mean threshold `≤10` → `≤11`; soloist code untouched (the known PRNG-migration stream re-alignment effect).
- **Verified:** full standards + engine-unit + integration suite green (1819 tests); typecheck clean; music-theory-reviewer confirmed completeness + boundary + recalibration honesty.

---

## Phase 3 — Compound-meter groove density (6/8, 12/8)

Only 6/8 + 12/8 are `isCompound` (`config.ts`); the shared `compoundHatAllowed`/`compoundKickAllowed` filters (`grooves/utils.ts`) are post-hoc density limiters that strategies must **opt into**. Two grooves never do.

### S6 — `minimal.ts`: opt into compound filters + fix beat predicates · Model: sonnet
- **Bug:** no `isCompound` ref; hat fires every eighth in 6/8 (over-dense); `safeIsOffbeat = loopStep % (stepsPerBar/8) === 2` (`:45`) hardcodes a 16-step bar; `beatIndex === 2` (`:51`) lands on the 3rd eighth, not beat 3.
- **Acceptance:** call `compoundHatAllowed`/`compoundKickAllowed`; replace the 16-step `safeIsOffbeat` + `beatIndex` predicates with meter-aware reads. Coherent groove in 6/8 + 12/8.

### S7 — `ska-punk.ts`: compound treatment · Model: sonnet · **blocked by S1**
- **Bug:** 4/4-only (kick on `beatIndex === 0/2`, every-step hat) → very busy in 6/8.
- **Prerequisite:** the skaPunk strategy doesn't even run today (S1) — fix S1 first, *then* this code is live and worth tuning.
- **Acceptance:** opt into the shared filters; coherent (if off-idiom) groove in compound meters.

### S8 — `acoustic.ts`: gate the kick lane · Model: sonnet
- **Bug:** hat is gated by `compoundHatAllowed` (`:138`) but the **kick lane has no `compoundKickAllowed`** — kick keys on `beatIndex === 2/3` (`:92–108`), mis-firing in 6/8. (Acoustic's idiomatic meters are 4/4 + 3/4, so 6/8 is off-idiom — lower stakes, but the fix is one filter call.)
- **Acceptance:** wrap the kick lane in `compoundKickAllowed`.

---

## Phase 4 — Bass 4/4-position math in compound/odd

### S9 — Bass density gate: bossa + dub meter-awareness · Model: opus (idiom design call)
- **Bug:** `bossa` branch (`bass-styles.ts:60`) uses `intBeat === 2`, `intBeat === 1 || 3` — assumes 4 beats; wrong onsets in 6/8 and misses beats 5/6. `dub` branch (`:330`) matches `REGGAE_RIDDIMS` positions that are **0–15 mStep literals** — they never align in a 12-step (6/8) or odd-meter bar.
- **Acceptance:** both produce a coherent groove in compound/odd. Mapping a clave/riddim idiom into compound is a design call — "do our best, groove," not idiomatic perfection.

---

## Phase 5 — Odd-meter (5/4, 7/4, 7/8) graceful degradation

### S10 — Audit `beatIndex === N` / `intBeat === N` sites for 5- and 7-beat bars · Model: opus (broad, may split)
- **Context:** the shared `compound*Allowed` filters are **inert** in odd simple meters (they only fire when `isCompound`, i.e. 6/8 + 12/8). So odd-meter coherence rests entirely on each strategy/style reading `beatIndex`/`isBackbeat`/`isPulse` vs. hardcoding a 4-beat bar. Most grooves read them, but agent B did not exhaustively verify every `beatIndex === 3` site degrades sensibly in a 5- or 7-beat bar.
- **Scope:** sweep grooves/*.ts + bass-styles.ts for `=== N` beat predicates; verify each is either meter-relative (`ts.beats - 1`) or harmless when the bar has 5/7 beats. Fix the ones that silently drop onsets or pile them on beat 1.
- **Acceptance:** each genre produces a non-degenerate groove in 5/4, 7/4, 7/8 (onsets distributed across the bar, downbeat present, no silent lanes). Likely splits into a grooves story + a bass story.

---

## Deferred to FOLLOWUPS (not stories)

- **Bass pitch-picker color randomness** (`getBassNoteStyle`, ~28 raw-`Math.random` sites): octave/approach-tone choices. Color, not lock — doesn't break the groove. Seed only if we later want byte-reproducible bass lines.
- **Accompaniment voicing-color randomness** (`:2811–3032`): already logged FOLLOWUPS §F.
