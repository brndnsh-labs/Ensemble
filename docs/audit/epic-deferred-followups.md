# Epic 11: Deferred Follow-ups & Product-Decision Backlog

## Why this epic exists

Post-audit (2026-05-20) follow-up promotion. Epics 9 and 10 swept the load-bearing follow-ups (coordination wiring, multiplier hardening, schema/test cleanup). What remained in `docs/audit/FOLLOWUPS.md` after that sweep split into three kinds of work:

1. **Product calls** (§A) — four items that were blocked on a feel/scope decision, not on engineering. All four were settled in a 2026-05-20 decision session; the decisions are recorded inline in FOLLOWUPS §A. S1–S4 below implement them.
2. **Micro-cleanup** — ~16 sub-30-minute mechanical items scattered across §B–§G. Individually too small for a story; batched into one commit-per-item sweep (S5).
3. **Medium engine follow-ups** — ~14 items in the 1–3h range that need a real critique test and (sometimes) a small musical-taste call. Batched by file/area into four sweep stories (S6–S9).

Two larger items are **deliberately out of scope** for this epic and tracked separately: the soloist-picker `scrambleHash` migration (FOLLOWUPS §F, ~3-4h, its own opus story) and the `arranger.progression` reducer refactor (`docs/TECH_DEBT.md` #1, multi-day). Listen-test-gated per-genre tuning (FOLLOWUPS §E) also stays deferred — those still need playback sessions before they're decidable.

Sweep stories (S5–S9) commit per sub-item so `git bisect` stays precise — the `/done` step inside `/cycle` should stage each sub-item separately.

## Stories

### S1. Section-boundary lookahead + Drop/Breakdown structural mechanic

**Implements product decision #1** (FOLLOWUPS §A, settled 2026-05-20: *build the real mechanic*).

Today a section labeled "Drop" plays like a normal chorus and "Breakdown" like a quiet verse — the energy map lists `drop: 1.0` / `breakdown: 0.3` (`public/form-analysis.ts:10,14`) but no engine branches on the labels for behavior, and `drum-seeder.ts:73` aliases `drop` to `Chorus`, erasing the semantics. A drop is a *structural event*: the band cuts for ~1 bar, then slams back together on the downbeat.

**Two pieces:**

**(a) Section-boundary lookahead.** The conductor needs to know "a section change is coming in N bars, and the energy delta is X." `coordination.upcomingSectionFirstChord` already exists; this adds the surrounding context (next section label, energy delta, bars-until-change) as coordination fields. **This is shared infrastructure — S2 consumes it too**, so it lands here first.

**(b) Drop/Breakdown mechanic.** When `currentSection.label` includes "drop"/"breakdown" OR the next section's energy delta crosses +0.3: emit a 1-bar pre-drop mute across all engines + a crash hit, then all engines resume on the next downbeat. Genre-dependent feel — strongest for EDM/hip-hop/rock/metal.

**Acceptance:** a section labeled "Drop" produces an audible 1-bar cut + crash + slam-back in a song-mode trace; the energy map labels now describe real behavior. New critique test asserting the mute window and the downbeat re-entry. Listen-test pass required.
**Effort:** ~5h. **Model:** opus (structural musical-design call + new coordination fields). **Reviewer:** music-theory-reviewer + state-discipline-reviewer (new coordination fields). **Source:** FOLLOWUPS §A (drop/breakdown).
**Status:** Done 2026-05-20 — shipped + **listen-test passed**. Section-boundary lookahead + `drop-mechanic.ts` gate (genre + strict-`>` energy-delta threshold, float-noise margin so canonical pre-chorus→chorus does not fire); 1-bar band-wide cut + downbeat crash + slam-back; `drum-seeder.ts` no longer aliases `drop`→`Chorus`. New `drop-breakdown-mechanic.test.ts` (13 cases). Trigger keys on `upcomingSection*` only — a chart that opens on a Drop is a documented non-goal. Breakdown reuses the Drop gesture by decision. Listen-test follow-up: the energy-delta-INFERRED cut (no literal label) was firing too aggressively on early choruses — now gated on `DROP_INFERRED_MIN_FORM_PROGRESS = 0.6` so it only fires in the back 40% of the form; authored Drop/Breakdown labels remain position-independent. Reviewer P2 (CoordinationContext typing) deferred to FOLLOWUPS §G.

### S2. Rock anticipation push — rare + section-gated

**Implements product decision #4** (FOLLOWUPS §A, settled 2026-05-20: *rare, section-boundary-gated*). **Depends on S1(a)** for the section-boundary lookahead.

`bass-styles.ts:432-438` fires the harmonic-anticipation push (bass jumps to the next chord's root on the "&" of beat 4) at `0.4 + intensity * 0.3` — ~55% of chord changes at intensity 0.5. A push is a *signpost* gesture; at that rate it stops signalling anything and becomes ambient.

Drop the probability to `0.1 + intensity * 0.15` (10-25%) **and** gate it on the section-boundary lookahead from S1(a) so the push mostly fires when a real section change is approaching, not on every chord change.

**Acceptance:** `rock-bass-critique.test.ts` extended — observed push rate falls in the 10-25% band, and pushes cluster at section boundaries rather than firing uniformly on chord changes.
**Effort:** ~2h. **Model:** sonnet (mechanical once S1's lookahead exists — probability + one gate). **Reviewer:** music-theory-reviewer. **Source:** FOLLOWUPS §A (rock anticipation push); `bass.md` P1 #8.
**Status:** Done 2026-05-20 — shipped. Push base probability dropped `0.4 + i*0.3` → `0.1 + i*0.15` (10-25% band) and gated through a `barsUntilSectionChange` parameter threaded `bass-engine.ts` → `getBassNoteStyle`. Section gate is **two-tier** (1.0× at boundary / 0.15× residual), not the sketched three-tier — S1(a)'s `barsUntilSectionChange` only ever holds `0` or `-1` (published inside `tick-logic.ts`'s final-bar guard), so a penultimate-bar "approach window" tier would be dead code; widening the lookahead is filed as a cross-cutting follow-up (FOLLOWUPS §G). `rock-bass-critique.test.ts` extended: push-rate-band test (13.7-23.4% observed) + clustering test (boundary ≥3× mid-section, 3.8-29× observed); pre-existing `> 30` melodic-variation threshold lowered to `> 15` (it had been tuned against the old ~55% push rate). Reviewer P1 (dead three-tier arm) patched; P2 (log/assert target mismatch) patched.

### S3. Open-jam macro-arc — make the cycle musical

**Implements product decision #2** (FOLLOWUPS §A, settled 2026-05-20: *keep a cycle, make it musical*).

When a session timer is set, the conductor builds a real song arc (`conductor.ts:399-418`). When there's no timer — an open-ended jam — it falls back to a rigid `formIteration % 8` counter (`conductor.ts:421-437`) that cycles the energy floor/ceiling every 8 form repeats then resets, forever. The reset feels robotic.

Replace the `% 8` fallback with a less mechanical wave for timer-less jams: a longer cycle, slight per-pass randomized variation (deterministic-seeded — see `docs/guides/musical-engine-patterns.md`), and/or genre-aware cycle length. The session-timer arc path (the `if` branch) is unchanged.

**Acceptance:** a timer-less jam over many form repeats shows a smoother, non-identical energy contour pass-to-pass; new or extended conductor critique test asserting the cycle is not a fixed-period sawtooth.
**Effort:** ~3h. **Model:** opus (musical-shape decision on the wave). **Reviewer:** music-theory-reviewer. **Source:** FOLLOWUPS §A (macro-arc grand cycle); `form-arranger.md` P1 #5 + P2 #10/#11.
**Status:** Done 2026-05-20 — shipped. Replaced the rigid `formIteration % 8` ladder with `getJamMacroArc`: a genre-aware raised-cosine swell (cycle length Jazz/Bossa 18, Funk/Disco 9, Rock/Metal 11, default 13 — not a multiple of common 4/8-bar section counts so the swell doesn't phase-lock) with `scrambleHash`-seeded per-cycle variation (phaseShift/crestLift/windowBreath). Floor and ceiling both track the swell — no hard reset. The helper was homed in `form-analysis.ts` (worker-safe, dep-light) so the **`tick-logic.ts` offline-export timer-less fallback** could consume the same swell instead of its own divergent `% 8` 3-step sawtooth — addresses `form-arranger.md` P2 #10/#11 parity for the open-jam path (export uses the floor/ceiling midpoint as its single intensity target). Extended `conductor-arc-critique.test.ts` (25 tests): periodicity (no exact period 4–16 repeat), cycle variation, smoothness, genre cycle length, plus a direct `getJamMacroArc` sweep guarding `macroFloor`/the dynamic window (reviewer P1 — the realized-target tests only ever observed the clamped ceiling). Reviewer P1×2 patched (test floor coverage + tick-logic parity); P2×2 patched (Bossa 16→18 unreasoned split, default 12→13). The session-timer arc branch and line-510 macro-jitter were left untouched per scope.

### S4. SRDC Restatement — motif echo

**Implements product decision #3** (FOLLOWUPS §A, settled 2026-05-20: *confirm by echoing the motif*).

The soloist's SRDC arc (Statement / Restatement / Departure / Conclusion) is audibly only 3 phases — Restatement is nudged by a noise-floor ×1.15 chord-tone multiplier (`soloist-pitch-engine.ts:478-485`) that's drowned by every competing bias, so it sounds identical to Statement.

Don't just bump the multiplier. Refold Restatement into contour/repetition logic: reuse the Statement's rhythm and melodic contour with looser landings — the player saying "yeah, I meant that" by echoing the idea. The SRDC critique test currently measures only Conclusion-vs-Departure, so a **new critique test** is part of the deliverable (it must distinguish Restatement from Statement).

**Acceptance:** a Restatement phrase measurably echoes its Statement's rhythm + contour vs a Statement-vs-Departure baseline; new critique test guards the distinction. Listen-test pass.
**Effort:** ~4-5h. **Model:** opus (fresh musical design — contour/repetition reuse). **Reviewer:** music-theory-reviewer. **Source:** FOLLOWUPS §A (SRDC Restatement); `soloist.md` P1 #5.
**Status:** Done 2026-05-20 — shipped. Restatement now structurally echoes the Statement, not via a noise-floor multiplier. **Rhythm echo:** new `restatementEcho: MotifSignature | null` field on `SoloistPhraseContext` captures the just-finished Statement's signature on a Statement→Restatement transition (≥3-note gate, worker-local memory parallel to `signature`); `buildRestatementEchoPlan` in `soloist-rhythm-engine.ts` deterministically reuses that rhythm grid (no `Math.random()`), checked before call/response mirroring and genre-independent (SRDC echo is form rhetoric, not a jazz-idiom feature). **Contour echo:** new `isRestatementEcho` predicate in `soloist-pitch-engine.ts` (gated on echo-node `responseSource === 'recent'` + `srdcState === 'restatement'`, independent of the call-and-response `isResponseGuided`/`responseConfig.enabled` gate) applies the Statement's interval-direction contour as a final-stage `weight *=` (direction-match ×3.4 / direction-fight ×0.45 / exact-PC ×1.3 — soft directional bias, narrows the chord-tone strong-beat margin ~11:1→~1.3:1 without inverting it, so strong beats still anchor: "looser landings"). Restatement chord-tone multiplier `1.15 → 1.0` (a Restatement resolving harder than its Statement would invert the SRDC arc). New `soloist-srdc-restatement-echo.test.ts`: rhythm half asserts `=== 1` (deterministic by construction); contour half drives the real picker (`selectPitchAndDevices`) over generated MIDI lines — Restatement-vs-Statement contour 64.7% vs Departure-vs-Statement 30.2% baseline (+34.5pt gap). Reviewer found a P0 on the first pass — contour was not actually wired into pitch selection, the contour metric was a self-comparison tautology — fixed in revision (the `isRestatementEcho` branch + picker-driven test); re-review clean. Listen-test gate outstanding (cannot be performed by an agent).

### S5. Micro-cleanup sweep (commit per item)

~16 sub-30-minute mechanical items, each too small for its own story. One sweep story, **one commit per item** so a regression bisects cleanly. No new musical behavior — comment fixes, predicate migrations, naming, mechanical wire-ups.

- **`pcAt` closure hoist** — `soloist-devices.ts` ~line 356; hoist out of the per-call device branch. (§B) ~5min.
- **`walking-ska` slash-chord-blind predicate** — `bass-styles.ts:1041`; migrate `nextChord.rootMidi !== chord.rootMidi` → `isChordChangeApproach`. (§C) ~10min.
- **`enclosure`/`run` veto asymmetry** — `soloist-devices.ts`; allow enclosure when at least one ±1 neighbor is non-unison (partial 1-of-3 vs full skip). (§B) ~30min.
- **`generateCompingPattern` `motifCache` key audit** — `harmonies.ts:1002`; key on every input that branches the pattern body (`feel`, `bandIntensity` tier, `complexity`), not just `activeStyle`. (§D) ~30min.
- **Funk + standard-lane comper `busySteps` bypass** — `accompaniment.ts:2067` and `:2222` read `soloist.session.phrasing.busySteps` directly; migrate to `coordination.soloistBusy`. (§D) ~30min.
- **Final-bar cadence stays airy when bass is grounded high** — `accompaniment.ts:1559`; at the cadence site only, allow the cadence cluster to overlap the bass for one bar. (§D) ~30min.
- **Conductor macro-arc jitter literal** — `conductor.ts:510`; name `MACRO_JITTER_RANGE = 0.15` at module scope, import it into `conductor-arc-critique.test.ts`. (§F) ~15min.
- **`dispatch(ACTIONS.UPDATE_PLAYBACK, …)` no-op** — `jazz-soloist-authenticity.test.ts:12`; `UPDATE_PLAYBACK` isn't a real action — fix to `SET_PARAM` or delete. (§F) ~5min.
- **Duplicate reggae-harmony critique case** — fold the shared 128-bar case in `reggae-harmony-critique.test.ts` / `reggae-harmony-organ-critique.test.ts` into a util, or accept the duplication. (§F) ~15min.
- **`instHash` bare polynomial hash** — `groove-engine.ts`; add canonical `scrambleHash` pre-scrambling for drum-lane hashing. (§F) ~30min.
- **Soloist picker `soloistState: any`** — `soloist-pitch-engine.ts:205`; declare `srdcState?: SrdcPhase` on `SoloistState` with a `@test-only` JSDoc, or document the loose typing. (TECH_DEBT #2) ~5min.
- **Brush voice pan discontinuity** — `synth-drums.ts`; add `'Brush'` to the Snare/Sidestick pan branch so it doesn't jump center→right on the intensity-driven Brush→Sidestick swap. (§E) ~15min.
- **Brush voice envelope tail click** — `synth-drums.ts:1313-1322`; add a fast tail-cut (`setTargetAtTime(0, playTime + 0.4, 0.02)`) before `noise.stop`. (§E) ~15min.
- **Brush bandpass sweep comment** — `synth-drums.ts:1297-1306`; the comment overstates acoustic mimicry — rewrite as a tasteful artistic choice, or hold the bandpass static. (§E) ~15min.
- **Phrase-end gate comment hardening** — `accompaniment.ts:2254-2261`; append a "no later style override may resurrect a thinned hit" note. (§D) ~5min.
- **Phrase-end breath duration note** — `accompaniment.ts` phrase-end gate; document that the impl is a 65% deterministic thin while the predicate holds, not a half-bar latch. (§D) ~5min.

**Acceptance:** all items shipped; no behavior change beyond the predicate migrations and the two Brush audio fixes; `npm test` green.
**Effort:** ~6-8h. **Model:** sonnet (mechanical; no taste calls). **Reviewer:** music-theory-reviewer (Brush audio fixes + predicate migrations touch musical behavior). **Source:** FOLLOWUPS §B/§C/§D/§E/§F + TECH_DEBT #2.
**Status:** Not started.

### S6. Chords & comping follow-ups

Four items in the chords/accompaniment layer, each needing a small musical-taste call + critique coverage.

**(a) Wire `enableVoiceLeading` into the production jazz comping path.** Epic 6 S1 added the opt-in flag; no production caller passes `true`. Gate it on `style ∈ {jazz, bossa, blues}` and confirm by listen-test that production audio matches the S1 test fixture. Fold the 10-positional-arg signature to an options object in the same pass. (§D) ~3h.

**(b) Funk 3-note Clav.** `chords.md` P2 #17 — small standalone clav voicing. (§D) ~1h.

**(c) Color tones at moderate intensity.** `chords.md` P1 #11 — extend color-tone reach below high intensity. (§D) ~1h.

**(d) Country boom-chick register collision.** `accompaniment.ts:1700-1726` boom-chick block writes notes at MIDI ≤ 55 (bass register) on the chord channel without consulting `coordination.bassMidi` — two engines can land in the same register on the same step. Chord-channel bass leg should yield to or pitch-merge with the band bass when present. (§D) ~1h.

**Acceptance:** (a) jazz/bossa/blues comping shows S1-style voice leading in production; (b)/(c) new or extended chord critique coverage; (d) no chord-channel/bass-channel register collision in a country trace.
**Effort:** ~6h. **Model:** opus (taste calls on voice-leading gating, clav voicing, register policy). **Reviewer:** music-theory-reviewer. **Source:** FOLLOWUPS §D.
**Status:** Not started.

### S7. Soloist & bass idiom follow-ups

Three idiom-correctness items across soloist and bass.

**(a) Soloist device-selection uniform-random over ranked list.** `soloist.md` P2 #14 — the device picker draws uniform-random over a ranked list, discarding the ranking. Weight the pick by rank. (§D) ~2h.

**(b) bebopScale quality routing for `halfdim` and `augmaj7`.** `soloist-devices.ts` bebopScale branch routes `halfdim` to the dominant-default passing PC (because `'halfdim'` doesn't start with `'m'`) and folds `augmaj7` into the major family where its b6 passing PC is actually the #5 chord tone — the bebop walk degenerates to a chromaticism-free scalar line. Add explicit `halfdim` (locrian-bebop) and `augmaj7` (PC 5 or PC 10) branches in the quality conditional. (§E) ~2h.

**(c) Reggae phrase-end-only fill substitutes a chromatic rub.** `bass-engine.ts:973-1040` — on the 54-46 riddim (the only riddim with a step-14 root entry) the phrase-end-only branch replaces a clean lock-in root with a half-step chromatic neighbor against the same chord — a jazz move, not a reggae idiom. Either skip phrase-end emission on riddims that already fill step 14, or prefer a scale-tone walk-in (target ±2). (§D) ~1h.

**Acceptance:** (a) device pick distribution tracks the ranking; (b) bebop walks over halfdim/augmaj7 chords carry a real chromatic passing tone — extended `soloist` critique coverage; (c) reggae 54-46 phrase-ends land a clean root or scale-tone walk-in, not a chromatic rub.
**Effort:** ~6h. **Model:** opus (idiom-correctness taste calls). **Reviewer:** music-theory-reviewer. **Source:** FOLLOWUPS §D/§E.
**Status:** Not started.

### S8. Drums follow-ups

Five drum-layer items — two genuine idiom additions, two schema/namespace cleanups, one diagnostic.

**(a) Reggae + Ska-Punk tom templates.** Epic 7 S4 shipped tom templates for 7 genres, trimming Reggae and Ska-Punk. Both have real tom vocabulary — Reggae's One Drop beat-1 silence wants a Carlton Barrett tom-down out of the gap; Ska-Punk's Travis Barker / Tim Armstrong fills are tom-laden. Same template-shape work as S4. (§E) ~2h.

**(b) Post-turnaround Crash should be China on metal sections.** `groove-engine.ts:222-237` hard-codes `soundName = 'Crash'` for the section-boundary splash; on Metal at high intensity the engine emits China on every downbeat but reverts to plain Crash on the strongest accent. Let genre strategies declare an `accentCymbal: 'Crash' | 'China'` in config and thread it through the section-boundary + crash-catch blocks. (§E) ~2h.

**(c) `mStep` / `stepInGroup` / `groupIndex` arrive `undefined` in `applyGrooveOverrides`.** `tick-logic.ts:338` builds the parameter bag without these three fields; per-genre strategies that read `context.mStep` etc. silently consume `undefined`. Audit consumers and either pass the values from tick-logic or remove the parameters. (§G) ~1h.

**(d) DRUM_MAP / dispatcher namespace asymmetry for Conga & Bongo.** MIDI export uses space-form keys (`'High Conga'`); `synth-drums.ts` dispatcher uses suffix-first (`'CongaHigh'`); `KNOWN_SOUND_NAMES` lists modifier-first (`'HighConga'`) — matching neither. No emitter writes a Conga/Bongo name today. Reconcile all three on one convention (suffix-first, matching Agogo/Cowbell). (§G) ~1h.

**(e) Two pre-existing unit-test failures.** `hiphop-integrity.test.ts` ("route phrase-release open accents through the open lane", ~line 166) and `metal-shred-integrity.test.ts` ("Blast Beat at high intensity", lines 127-132) have been red on `main` since before the Epic 10 S1 cycle. Diagnose whether the engine drifted or the fixtures went stale; fix the side that's wrong. (§G) ~1h.

**Acceptance:** (a) reggae/ska-punk produce idiomatic tom fills — extended `tom-vocabulary-critique.test.ts`; (b) Metal sections splash China on the post-turnaround accent; (c) no strategy reads `undefined` for `mStep`/`stepInGroup`/`groupIndex`; (d) one consistent Conga/Bongo naming convention; (e) full `npm test` green.
**Effort:** ~7h. **Model:** opus for (a)/(b)/(e) (idiom + diagnostic); (c)/(d) are sonnet-grade mechanical. **Reviewer:** music-theory-reviewer. **Source:** FOLLOWUPS §E/§G.
**Status:** Not started.

### S9. Cross-engine consistency cleanup

Two items where the same shape is fragmented across engines.

**(a) Hash-helper consolidation across 3 engines.** `bass-engine.ts` + `groove-engine.ts` use djb2-33-from-5381; `accompaniment.ts` uses djb2-31-from-0. The independent per-engine target distributions are currently a happy hash accident. Consolidate onto one canonical helper (verify each engine's distribution survives the change — see `feedback_prng_migration_dead_gates`). (§C) ~2h.

**(b) Three `soloist.session.*` reads in `harmonies.ts`.** `session.memory.sharedHookBuffer` (lines 271-272, Ska-Punk only) + `session.seed` (line 279, melodic shadowing) reach across the soloist↔harmony boundary instead of going through coordination context. Design a buffer-object + RNG-seed context-field pair and migrate. (§C) ~3h.

**Acceptance:** (a) one hash helper, all three engines' critique tests still pass within tolerance; (b) `grep 'soloist.session' harmonies.ts` returns zero — harmony reads only coordination context.
**Effort:** ~5h. **Model:** opus ((a) needs distribution verification; (b) is a context-shape design). **Reviewer:** music-theory-reviewer + worker-contract-reviewer (new coordination fields cross the worker boundary). **Source:** FOLLOWUPS §C.
**Status:** Not started.

## Notes on this epic's shape

- **S1 → S2 dependency:** S1(a) builds the section-boundary lookahead; S2 consumes it. Do S1 first. No other cross-story coupling — S3–S9 touch disjoint files and can run in any order.
- **S5** is a pure micro-sweep — one commit per item, no taste calls, sonnet-grade. Good `/cycle` candidate to clear in one session.
- **S6–S9** are multi-item sweeps in the Epic 9 shape: commit per sub-item at `/done`.
- **Out of scope, tracked elsewhere:** soloist-picker `scrambleHash` migration (FOLLOWUPS §F — its own opus story); `arranger.progression` reducer refactor (TECH_DEBT #1 — multi-day); listen-test-gated per-genre tuning (FOLLOWUPS §E remainder — needs playback sessions before it's decidable).
