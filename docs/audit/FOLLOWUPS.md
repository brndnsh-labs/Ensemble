# Follow-ups & Deferred Work

Companion to [`EPICS.md`](EPICS.md). Captures every "shippable but flagged" item that surfaced during audit work — items that don't justify a fresh story yet but shouldn't be lost to grep.

Each entry: **location** · what it is · why it's deferred · size estimate · provenance (which story or review surfaced it).

## How this doc gets used

- **When `/review` surfaces a P2 deferral** that isn't already covered by an existing story, append it to the relevant section here in the same pass as the Status block update. Don't bury it in the Status block alone — that hides the work from anyone scanning at the doc level.
- **When promoting a follow-up to a real story**, copy the entry into the appropriate epic file as a new S<N>, then delete the follow-up entry (or replace it with a single-line `→ Epic <N>/S<N>` pointer).
- **When fixing a follow-up inline** (e.g. while in adjacent code), delete the entry in the same commit that ships the fix.
- **When in doubt about "is this a follow-up or a story?"**: if it's <2h mechanical work in a file someone's already touching, follow-up. If it needs musical taste, design, or its own critique test, it's a story — promote it to the relevant epic.

A follow-up that's been sitting here for >2 months without being touched is signal: either promote it to a story (it's load-bearing) or delete it (we've decided we don't care). Don't let this file become a graveyard.

## Open count (reconciled 2026-05-20)

After the post-Epic-11 reconciliation pass, **~29 items remain open**, clustering into three shapes:

- **~19 per-genre listen-test / taste items** (all of §E) — acceptance is by-ear, not critique-test-gated. Best handled as genre-grouped listening sessions, not stories.
- **~7 small mechanical nits** (§B, §C, §D, §G) — 5min–2h each. Candidates for a future micro-cleanup sweep in the Epic 11 S5 mould.
- **3 genuine stories** — the soloist pitch-picker `scrambleHash` migration (§F), `evansIntervals` chord-quality awareness (§E), and profile-rotation sticky-retain (§E). The first is load-bearing (completes the engine-wide PRNG migration, unblocks a no-stub determinism test).

Plus `TECH_DEBT.md` #1 (the `arranger.progression` dispatch refactor) — non-musical, multi-day, tracked separately.

---

## A. Product calls — SHIPPED 2026-05-20 (Epic 11 S1–S4)

All four product decisions were promoted to Epic 11 and shipped. Section closed.

- **`breakdown` / `drop` semantics** → Epic 11 S1 ✅ — section-boundary lookahead + `drop-mechanic.ts` gate; 1-bar band-wide cut + downbeat crash + slam-back.
- **Macro-arc grand cycle** → Epic 11 S3 ✅ — `getJamMacroArc` genre-aware raised-cosine swell replaces the `formIteration % 8` ladder; tick-logic export parity.
- **SRDC Restatement** → Epic 11 S4 ✅ — motif echo: deterministic rhythm-grid reuse + final-stage contour-direction multiplier + new picker-driven critique test.
- **Rock harmonic-anticipation push** → Epic 11 S2 ✅ — push dropped to 10-25% band, two-tier `barsUntilSectionChange` section gate.

## B. Multiplier placement & architecture trade-offs

All three items promoted to **Epic 9 / S5 (Multiplier placement hardening)** on 2026-05-19. Originals retained below as pointers for grep-from-finding.

- **Epic 2 S6 — densityScale placement** → Epic 9 / S5 (a). `soloist-rhythm-engine.ts:337` puts the `1 + loopCount * 0.15` multiplier on `densityScale` before four downstream additive boosts.
- **Epic 1 S5 — soloist-devices unison floor** → Epic 9 / S5 (b). `soloist-devices.ts` enclosure/run/approach picker doesn't consult `accompanimentMidis`.
- **Epic 3 S2 — Bossa Charleston bank is a Jazz port** → Epic 9 / S5 (c). Anticipation-of-1 idiom missing; partido-alto-specific bank needed.

**Not promoted (still deferred from Epic 9 S5 review):**

- **Soloist rhythm critique fixture doesn't exercise active stepCoordination boosts.** Epic 9 S5.a moved the `1 + loopCount * 0.15` multiplier from `densityScale` to a final-stage `attackProb *=`, which is the canonical placement (mirrors pitch-engine). But the existing critique fixture (`soloist-chorus-evolution-rhythm.test.ts`) feeds a synthetic `stepCoordination` with no `kickHit` / `snareHit` / seed steps, so the additive boost-stack the audit-doc described (`+= 0.4` seed + `+= 0.2` per landmark = `attackProb` near 1.0 BEFORE the multiplier, where the move matters most) isn't observable — realized fixture delta is unchanged at +25%. The placement is correct for production; the test is just blind to the production-relevant case. Extend the fixture (or add a second case) with active `stepCoordination` boosts so the test guards the wash-out the placement prevents. ~1h. *Source: Epic 9 S5 review (2026-05-19).*

- **`accompanimentMidis` device-floor scope is run/enclosure only.** Epic 9 S5.b added a skip-or-flip unison floor to `run` and `enclosure` devices in `soloist-devices.ts`. Other devices (`bebopScale`, `bluesLick`, `chickenPick`, `quartal`, `birdFlurry`) walk chord tones by genre-defining design, so they're correctly left alone — the realized 23.1pp mean-abs-gap (vs audit-doc target 30pp) is the structural ceiling under the current device set. If a future story wants to push the absolute drop higher, the lever isn't widening the floor's scope but biasing device *selection* away from chord-tone walkers when the comper is dense. ~2h if pursued; flagged as a known structural limit, not a defect. *Source: Epic 9 S5 review (2026-05-19).*

- **`enclosure` device full-veto vs `run` flip asymmetry** → ✅ SHIPPED — Epic 11 S5 (enclosure now allowed when at least one ±1 neighbor is non-unison — partial 1-of-3 vs full skip). *Source: Epic 9 S5 review (2026-05-19) P2 #5.*

- **`pcAt` closure hoist from the run/enclosure branch** → ✅ SHIPPED — Epic 11 S5 (hoisted out of the per-call device branch). *Source: Epic 9 S5 review (2026-05-19) NIT.*

## C. Cross-engine consistency (same fix-shape repeated elsewhere)

Three items promoted on 2026-05-19; remainder reconciled below.

- **Native-style chromatic leading tones** → **Epic 9 / S4** (shipped 2026-05-19, narrowed to rock-only — country was already done in Epic 5 S5; pop/soul/gospel aren't native bass styles in current codebase).
- **Altered-dominant narrow consumers** → **Epic 9 / S3 (a)**. Two consumers (`soloist-pitch-engine.ts:418`, `accompaniment.ts:1228` `wasTense`) still narrow.
- **Three slash-chord-blind predicate sites in bass** → **Epic 9 / S3 (b)**. `bass-engine.ts:313/463/812` use `rootMidi`-only check; should migrate to `isChordChangeApproach` helper.
- **`bendStartInterval` not plumbed through `playBassNote` / `scheduler-core.ts`** → **Epic 9 / S3 (c)**. Affects funk walking approach bend + hip-hop 808 slide; both gestures inaudible at playback.

**Reconciled:**

- **`walking-ska` style slash-chord-blind predicate** → ✅ SHIPPED — Epic 11 S5 (`bass-styles.ts:1041` migrated to `isChordChangeApproach`). *Source: Epic 9 S4 review.*
- **Hash-helper consolidation across 3 engines** → ✅ SHIPPED — Epic 11 S9a (`public/engine/hash-utils.ts` exports canonical `scrambleHash` + `stringHash33` + `stringHash31`; every call site kept its exact prior variant, byte-identical distributions). *Source: Epic 2 S3 review.*
- **Three remaining `soloist.session.*` reads in `harmonies.ts`** → ✅ SHIPPED — Epic 11 S9b (two new `CoordinationContext` fields — `soloistSharedHookBuffer` + `soloistSeed`; `grep 'soloist.session' harmonies.ts` returns zero). *Source: Epic 1 S4 follow-up.*

**Not promoted (still deferred):**

- **Three remaining `Math.random()` in `groove-engine.ts`.** Lines 259/281/293 (drum-strategy probability/velocity randomness). Promote if drum tests start flaking. ~1h. *Source: Epic 3 S5 Status block.*

## D. Coordination consumption gaps

Four items promoted on 2026-05-19; remainder reconciled below.

- **Reggae bass coordination consumption** → **Epic 9 / S2 (b)**.
- **`bassMidi` floor consolidation across 4 lanes** → **Epic 9 / S1 (a)**.
- **Reggae organ-bubble on the harmony channel** → **Epic 9 / S1 (b)**.
- **Comper reacting to soloist phrase-end** → **Epic 9 / S2 (a)**.

**Reconciled (shipped via Epic 11):**

- **Wire `enableVoiceLeading` into the production jazz comping path** → ✅ Epic 11 S6a (production `parseProgressionPart` passes `enableVoiceLeading: true` gated on `genreFeel ∈ {Jazz, Bossa Nova, Blues}`; 10-arg signature folded to `InversionOptions`). **Listen-test still outstanding.** *Source: Epic 6 S1.*
- **Funk 3-note Clav** → ✅ Epic 11 S6b (`03f2ac14`) + follow-up (`8219e058`). *Source: Epic 6 Deferred.*
- **Color tones at moderate intensity** (`chords.md` P1 #11) → ✅ Epic 11 S6c (deterministic add9 at `intensity ≥ 0.35` for Acoustic/Neo-Soul/Country). *Source: Epic 6 Deferred.*
- **Soloist device-selection uniform-random over ranked list** → ✅ Epic 11 S7a (`pickByRank` rank-weighted device pick). *Source: Epic 4 Deferred.*
- **Final-bar cadence stays airy when bass is grounded high** → ✅ Epic 11 S5 (`accompaniment.ts:1559` cadence site allows the cluster to overlap the bass for one bar). *Source: Epic 9 S1 review.*
- **Country boom-chick bass leg coexists with band bass without safetyFloor** → ✅ Epic 11 S6d (`accompaniment.ts:1700-1726` boom-chick leg lifts by octaves to clear `max(52, bassMidi+5)` when a band bassist is present). *Source: Epic 9 S1 review.*
- **`generateCompingPattern` `motifCache` key audit** → ✅ Epic 11 S5 (`harmonies.ts:1002` keys on every input that branches the pattern body). *Source: Epic 9 S1 review.*
- **Funk + standard-lane comper `busySteps` bypass** → ✅ Epic 11 S5 (`accompaniment.ts:2067/:2222` migrated to `coordination.soloistBusy` — documented superset migration). *Source: Epic 9 S2 review.*
- **Reggae phrase-end-only fill replaces a clean root with a chromatic neighbor** → ✅ Epic 11 S7c (`3c9ad00b`, phrase-end fill walks in from a scale tone). *Source: Epic 9 S2 review.*
- **Phrase-end gate comment overstates "final-stage" guarantee** → ✅ Epic 11 S5 ("no later style override may resurrect a thinned hit" note appended). *Source: Epic 9 S2 review.*
- **Phrase-end breath duration vs. audit doc** → ✅ Epic 11 S5 (design call documented: 65% deterministic thin while the predicate holds, not a half-bar latch). *Source: Epic 9 S2 review NIT.*

**Not promoted (still deferred):**

- **Bossa phrase-end breath after the partido-alto bank lands.** Epic 9 S2.a excludes Bossa from `PHRASE_END_THIN_GENRES` because the partido-alto bank (Epic 9 S5.c) didn't yet exist when the gate was tuned to Jazz/Blues/Funk clav comping. Now that S5.c has shipped, re-evaluate whether Bossa should inherit the gate or whether the partido-alto bank encodes breath natively. ~15min eval, ~1h if a Bossa-shaped gate is needed. *Source: Epic 9 S2 review (2026-05-19).*

## E. Per-genre tuning & sound design

Taste-driven gestures or per-genre values still flat. **Acceptance for this section is by-ear** — these are not critique-test-gated stories; the natural home is genre-grouped listening sessions. Each one is a future candidate, not a follow-up to anything in particular.

> **Two items in this section are mis-bucketed correctness/product bugs, not taste nits — promote them to real stories:** the **profile-rotation churn** (user-selected soloist style silently overridden) and **`evansIntervals` chord-quality blindness** (a real theory defect touching all Greats profiles).

- **Per-genre final-bar drum gestures.** Epic 2 S4 uses a universal snare-stinger; jazz/bossa might prefer ride-bell + comping. *Source: Epic 2 S4 review.*
- **Final-bar voice-leading discards `previousVoicingMidis`.** Epic 2 S4 cadence voicing is chart-driven but drops voice-leading into the resolution. ~2h. *Source: Epic 2 S4 review.*
- **HiHat suppression on final bar reads abrupt in 8th-note-hat genres.** Epic 2 S4. Per-genre gate. ~1h. *Source: Epic 2 S4 review.*
- **Imperfect Symmetry intensity 0.4 floor.** Epic 2 S2 gates the gesture at `intensity ≥ 0.4`, suppressing it during quiet ballad-style Verse 2 — exactly where subtle variation is most musical. Consider 0.25 or gentler upward bias at low intensity. ~1h. *Source: Epic 2 S2 review.*
- **Per-genre intro/outro mute tuning.** Epic 2 S5 currently genre-flat (`INTRO_MUTES = { bass: 2, chords: 3, harmony: 4 }`). ~3h. *Source: Epic 2 S5 Deferred.*
- **S8 ramp-inversion aggressiveness.** `conductor.ts:229` ships `0.5 down / 1.5 up`; with `stepSize = (target - current)/16` the up-ramp can leap +0.25 in a single measure (verified in S8 trace: `0.50 → 0.75`). Effectively trades the pre-S8 floor-bias for a ceiling-bias. Listen-test alternative: `0.75 / 1.25` (gentler) or `1.0 / 1.0` (neutral baseline). Audit doc S8 explicitly said "Pick after a listen-test of both directions"; the shipped value is plausible but unverified by listening. ~1h. *Source: form-arrangement/S8 review (2026-05-17).*
- **S8 Ska-Punk genre floor.** S8 lowered the Ska-Punk backbeat Snare gate to 0.3 but did NOT add a `GENRE_INTENSITY_FLOORS` entry. Ska-Punk is high-energy by genre identity (the comment in `ska-punk.ts:155` says so); should get a floor around 0.4 analogous to Disco 0.45 to keep the upbeat-crack consistent. Inconsistent calibration story with Funk (which got gate + floor). ~30min. *Source: form-arrangement/S8 review (2026-05-17).*
- **Disco intensity-axis miscategorization.** `drums.md` P2 #18. The 4-motif system is mostly load-bearing for `synth-drums` velocity scaling; touch when Disco gets another audit pass. *Source: Epic 7 Deferred.*
- **Bossa/samba label split.** `bass.md` P2 #16. Currently conflates two distinct feels. ~2h. *Source: Epic 5 Notes.*
- **Walking-ska M6 over minor chords.** `bass.md` P1 #9. Small follow-on. ~1h. *Source: Epic 5 Notes.*
- **Generic walking target-awareness.** `bass.md` P1 #10. ~2h. *Source: Epic 5 Notes.*
- **Funk pop/chuck/hammer probability documentation.** `bass.md` P2 #17. Doc/comment pass. ~1h. *Source: Epic 5 Notes.*
- **Profile-rotation churn silently overrides user-selected soloist style.** `soloist.ts:1262` re-rolls `currentPhrase.context.profile` at every section boundary with `Math.random() < 0.8`, sampling from the genre's full influence pool. A user who selects "Bill Evans" gets Evans for ~1 section before the engine swaps to a random pool entry. Audit P1 #4 framed this as a tuning artifact but it's a real product issue: user-selected profile should sticky-retain at >90%, with pool rotation a smaller (~10-15%) optional variation. Couples with the Evans multiplier tuning in S2 — lower multipliers are musically defensible only when the profile actually persists. **Promote to a story.** ~2h. *Source: soloist-idiom/S2 review (2026-05-17).*
- **`evansIntervals` is chord-quality blind.** `soloist-pitch-engine.ts` `evansIntervals = new Set([2, 5, 6, 9])` (9, #11/b5, 13). The `6` is a real Evans color (#11 on dom7, Lydian on maj7) but lands as the *b5 avoid note* on min7 chords. Pre-S2 the +500 floor blanketed it; post-S2 at +60/×3.5 it's audible as ~25% of Evans extensions. Extension sets should be quality-aware (dom7 / min7 / maj7 / alt7 each get their own legal-extension list). Touches all Greats profiles, not just Evans. **Promote to a story.** ~4h. *Source: soloist-idiom/S2 review (2026-05-17).*
- **`findNextBebopMidi` whole-tone fallback.** `soloist-devices.ts` bebopScale branch's `findNextBebopMidi` falls back to `from + stepDir * 2` (a whole step) when no bebop-set PC is found within 4 semitones — only triggers on degenerate scales (whole-tone, diminished). The fallback steps a fixed whole tone regardless of which scale; for whole-tone scales it stays inside the scale (no-op), for diminished it lands on a non-scale tone. NIT-level; never observed in jazz-style runs. ~30min. *Source: Epic 4 / S3 review 2026-05-17.*
- **China cymbal `volumeScale` recalibration after triple-stack fix.** `synth-drums.ts` China runtime profile ships `volumeScale: 0.85` — picked to trim slightly under Crash's 0.90 as defensive headroom against the metal.ts triple-stack that fired three China voices per downbeat. After the Epic 7 S5 P0 fix scopes the accent to the Open lane only, that justification no longer holds. A real Holy China / Mb20 Trash typically peaks *above* the Crash in a kit; 0.85 leaves China reading quieter than the Crash it replaces. Listen-test 0.90 / 0.95 / 1.0 against Crash at the same accent and pick by ear. ~30min. *Source: drums-idiom/S5 review (2026-05-18).*
- **Funk motif-2 `+2` displacement frequency may be too high.** `grooves/funk.ts:184` ships `< 0.4 ? 0 : < 0.75 ? 1 : 2` — 25% of motif-2 phrases land on `+2` (both backbeats shifted to & of 2 / & of 4 for a sustained 2-bar phrase). Stubblefield/Garibaldi displacement is far more often the laid-back `+1` (e of backbeat); the full `+2` substitution is canonically a 1-bar fill setup, not a sustained groove. Consider 50%/35%/15% (normal-heavy) or restructure `+2` as a 1-bar gesture that returns to normal next bar. Listen-test required. ~1h. *Source: drums-idiom/S6 review (2026-05-18).*
- **Funk + Hip-Hop motif-tier test floors very loose vs expected rate.** S6 critique tests pin `barsWithBeat1Displacement >= 5` (funk) and `burstBars >= 5` (hip-hop) against expected rates of ~19 and ~13–30 respectively. A regression that halves either rate would still pass. Tighten after a 20-run reliability sample anchors the empirical floor. ~30min. *Source: drums-idiom/S6 review (2026-05-18).*
- **Ska-Punk shared-hook reinforcement branch is dead — `sharedHookBuffer` is never populated.** `harmonies.ts` `playShadowMode` has a Ska-Punk branch that echoes hooks the soloist has shared (`coordination.soloistSharedHookBuffer`). But repo-wide, the underlying buffer is only ever reset to `[]` — no code path ever pushes a `SoloistHook` entry, so the branch never fires in production. Pre-existing — S9(b) faithfully rerouted the (empty) buffer through the coordination contract without changing behavior. If Ska-Punk antiphony is intended to function, a separate story needs to write into the buffer (the soloist emitting a hook on a phrase it wants harmony to echo). ~3h if pursued. *Source: Epic 11 S9 review (2026-05-20).*

**Shipped via Epic 11:** Brush voice pan / envelope-click / bandpass-comment fixes → S5 ✅. bebopScale locrian-bebop `halfdim` + `augmaj7` quality routing → S7b ✅ (`b5191e29`). Reggae + Ska-Punk tom templates → S8a ✅ (`af558bc7`). Post-turnaround China splash on metal sections → S8b ✅ (`0db01245`).

## F. Test rigor & determinism

Most items promoted on 2026-05-19 to **Epic 10 / S2 (soloist)** and **Epic 10 / S3 (harmony/drums/conductor)**.

- **Deterministic-seeding of head-bypass jitter PRNG** → Epic 10 / S2 (a) ✅ (shipped 2026-05-19).
- **Engine-wide determinism test** → Epic 10 / S2 (b) ✅ (shipped 2026-05-19).
- **Picker-output-only chromatism metric for Epic 4 S1** → Epic 10 / S2 (c) ✅ (shipped 2026-05-19).
- **Soloist test fixtures don't seed `Math.random`** → Epic 10 / S2 (d) ✅ (shipped 2026-05-19; `tests/utils/seeded-random.ts`).
- **Evans cadence test doesn't isolate phrase-end attacks** → Epic 10 / S2 (e) ✅ (shipped 2026-05-19).
- **Accompaniment S3 test fixture primary seed lands target=0** → Epic 10 / S3 (a) ✅ (shipped 2026-05-19).
- **Drums-not-muted regression test asserts Kick only** → Epic 10 / S3 (b) ✅ (shipped 2026-05-19).
- **`withOctaveJump` PC-fold metric** → Epic 10 / S3 (c) ✅ (shipped 2026-05-19).
- **Conductor cool-down jitter headroom is thin** → Epic 10 / S3 (e) ✅ (shipped 2026-05-19).
- **Conductor critique only exercises ceiling-clamped section** → Epic 10 / S3 (f) ✅ (shipped 2026-05-19).
- **S8 funk-backbeat-presence integration coverage** → Epic 10 / S3 (h) ✅ (shipped 2026-05-19).
- **Pad-sustain test doesn't exercise scheduler or synth legato paths** → Epic 10 / S3 (g) ✅ (shipped 2026-05-19).

**Not promoted (still deferred):**

- **Sparse-vibe cell collapse + active-vibe ornament collision (Epic 3 S2).** Reviewer-flagged during the Epic 3 S2 (Jazz/Bossa/Blues Charleston picker) work: at sparse vibe the comping cell can collapse to near-silence, and at active vibe an ornament can collide with the cell's own hit. Both are engine-behavior issues in the chords/accompaniment vibe path, not test-rigor gaps — they need a musical-taste call + listen test. Promote to a real Epic 6 (chord voicing) follow-up story when the vibe path is next revisited. *Source: Epic 3 S2 review; re-confirmed deferred at Epic 10 S3 (2026-05-19).*
- **`instHash` for drum lanes uses bare polynomial hash** → ✅ SHIPPED — Epic 11 S5/S9a (`groove-engine.ts` `instHash` now routed through canonical `scrambleHash`; reviewer confirmed no dead ceiling gate). *Source: Epic 2 S3 review.*
- **`reggae-harmony-critique.test.ts` / `reggae-harmony-organ-critique.test.ts` duplicate 128-bar case** → ✅ SHIPPED — Epic 11 S5 (accept-the-duplication comment — the two files exercise independent engine entry points; only constant arrays overlapped). *Source: Epic 9 S1 review.*

**New entries surfaced during Epic 10 S2:**

- **Soloist pitch picker still uses un-seeded `Math.random()`.** The S2 (b) engine-wide determinism test (`soloist-engine-determinism.test.ts`) asserts byte-reproducibility only UNDER a pinned mulberry32 spy. A no-stub determinism test is impossible today: the picker's weighted roulette (`soloist-pitch-engine.ts` ~line 1182, `Math.random() * totalWeight`), the device-trigger gates, and timing jitter all draw from un-seeded `Math.random()` — two un-stubbed 1024-step runs diverge at ~338 positions. The May 2026 `scrambleHash` migration covered bass / harmonies / grooves but NOT the soloist picker. Migrating the picker roulette + device gates to a `scrambleHash` source keyed by `(barIndex, sectionId, step)` would make the soloist deterministic by construction and let the S2.b test drop the seeded-spy requirement. **The standout remaining story** — load-bearing (completes the engine-wide PRNG migration; `soloist.ts` still carries a byte-identical copy of `scrambleHash`, left un-consolidated by Epic 11 S9a to pair with this work; `pickByRank` from Epic 11 S7a is the ready injection point). ~3-4h, musically sensitive (roulette seed must not correlate adjacent steps). *Source: Epic 10 S2.b (2026-05-19).*

- **First-call module warm-up artifact in `getSoloistNote`.** ✅ RESOLVED 2026-05-20. Both `RESET_STATE` and `resetSoloistState()` now clear the five scalar `soloist.audio` fields; `soloist-engine-determinism.test.ts` dropped its discarded warm-up pass. *Source: Epic 10 S2.b (2026-05-19).*

- **`isEvansCadence` early-exit is a weak lever.** The S2 (e) finding's premise held, but the deeper cause is that the `isEvansCadence` early-exit (`soloist-pitch-engine.ts` ~line 757) shifts the phrase-end home rate only ~4.6pt (39.3% → 43.9%, 20-seed aggregate). The picker's phrase-end ×4.0 root/5th pull and `isCallResponse ×8.0` boost already dominate the ×3.5 Evans extension boost the guard suppresses. The new `soloist-evans-cadence-critique.test.ts` guards it via a 20-seed aggregate, but the headroom is intrinsically thin. If the V→I cadence at Evans phrase-ends is meant to be a stronger musical signal, the guard should additionally *boost* root/5th (not merely *skip* the extension boost). ~1-2h, needs a listen test. *Source: Epic 10 S2.e (2026-05-19).*

**New entries surfaced during Epic 10 S3:**

- **Conductor macro-arc jitter un-named inline literal** → ✅ SHIPPED — Epic 11 S5 (`MACRO_JITTER_RANGE` named at module scope and imported into `conductor-arc-critique.test.ts`). *Source: Epic 10 S3.e review.*
- **`dispatch(ACTIONS.UPDATE_PLAYBACK, …)` silent no-op in `jazz-soloist-authenticity.test.ts`** → ✅ SHIPPED — Epic 11 S5. *Source: Epic 10 S2.e.*

## G. Schema cleanup & stale carriers

All seven original items promoted on 2026-05-19 and shipped via Epic 10 / S1 sub-item commits. The live bug went to Epic 9 / S6. (Original pointer list elided in the 2026-05-20 reconciliation — see Epic 10 S1 / Epic 9 S6 history.)

### New (post-2026-05-19) — still deferred

- **`barsUntilSectionChange` lookahead window is one bar — no penultimate-bar "approach" tier.** `tick-logic.ts:175-178` only publishes `barsUntilSectionChange` inside the `remainingSteps <= stepsPerMeasure` guard, and floors `(remainingSteps - 1) / stepsPerMeasure` — so the field only ever holds `0` (final bar) or `-1` (default), never `1+`. Epic 11 S2's rock push therefore ships an honest *two-tier* gate (1.0× at boundary / 0.15× residual); a musically nicer three-tier ramp with a 60% "approach window" one bar out is impossible until the lookahead is widened to the penultimate bar. Widening the guard to `<= stepsPerMeasure * 2` would also shift when `upcomingSectionFirstChord` / `upcomingSectionLabel` / the drop mechanic publish — a cross-cutting S1-infrastructure change that needs its own story + listen test. ~2h if pursued. *Source: Epic 11 S2 review (2026-05-20).*

- **`CoordinationContext` interface does not declare the S1 lookahead/drop fields.** `tick-logic.ts` writes `upcomingSectionLabel`, `upcomingSectionEnergyDelta`, `barsUntilSectionChange`, `dropMuteActive`, `dropCrashPending` via `(coordination as any).field = …` and consumers read them the same way. This follows the pre-existing `(coordination as any)` pattern across the whole file, so it is consistent debt, not new — but declaring the five fields on the `CoordinationContext` interface would give `drop-mechanic.ts` + the Epic 11 S2 rock-push real type safety. Best done as part of a broader `coordination: any` → typed sweep. ~30min for the five fields alone. *Source: Epic 11 S1 review (2026-05-20).*

- **`bass-chord-change-approach-critique.test.ts` has an under-cushioned unseeded stochastic threshold.** The test asserts `jazzRate > rockRate + 0.1`; the observed gap is only ~1pp (jazz ~27.5% vs rock ~28.4% — the raw delta is sign-fragile) and the engine path runs on unseeded `Math.random()`. Any new test added before it in full-suite ordering that consumes extra `Math.random()` draws can tip it below threshold. Passes 30/30 in isolation. Fix: either seed the bass engine path for this test, or widen the delta cushion to a statistically honest margin. ~30min. *Source: Epic 11 S6 implementation (2026-05-20).*

### Reconciled (shipped)

- **Two pre-existing unit-test failures** (`hiphop-integrity`, `metal-shred-integrity`) → ✅ Epic 11 S8e (`240a0d1b`).
- **`mStep` / `stepInGroup` / `groupIndex` arrive as `undefined` in `applyGrooveOverrides`** → ✅ Epic 11 S8c (`336b5454`).
- **DRUM_MAP / dispatcher namespace asymmetry for Conga & Bongo families** → ✅ Epic 11 S8d (`5a4d6298`).
- **Three soloist motivic-fidelity test failures** → ✅ Epic 11 S10 closed the two `soloist-motivic-response` failures; the Neo-Soul `soloist-seeder-hook-shape` `richContourShare` failure had its threshold re-set in `fb2db2ba` (`test(soloist): re-baseline HEAD_C richContourShare after Epic 10 S2 PRNG migration`). Both files verified green on `main` 2026-05-20. *(Note: Epic 11 S8(e)'s status block still says `soloist-motivic-response` is "red on main" — that note is stale; the test passes.)*

## H. Cross-references (already routed to a story — no work tracked here)

Pointers in case someone greps from a finding:

- `chords.md` P0 #1 funk groove-cell determinism → Epic 3 S1 ✅
- `chords.md` P0 #2 Jazz/Bossa/Blues Charleston picker → Epic 3 S2 ✅
- `chords.md` P1 #5 per-chord-retrigger extension randomization → Epic 6 S1 ✅
- `chords.md` P2 #14 `accompanimentMidis` consumption → Epic 1 S5 ✅
- `drums.md` P2 #15 `humanizeVelocity` seeded → Epic 3 S5 ✅
- `drums.md` P2 #17 motif rotation fictional → Epic 2 S1 ✅ partial; binaryTier widening still open
- `harmony-coordination.md` P0 #2/#3/#4/#5 → Epic 1 ✅
- `harmony-coordination.md` P1 #8 → Epic 1 S2 ✅
- `harmony-coordination.md` P1 #9 → Epic 5 S6 ✅ + Epic 9 §D consumption ✅
- `harmony-coordination.md` P1 #10 → Epic 1 S6 ✅
- `harmony-coordination.md` P2 #13 → Epic 3 S5 ✅
- `soloist.md` P1 #6 → Epic 2 S6 ✅
- `soloist.md` P1 #8 → Epic 1 S5 ✅
- `form-arranger.md` P0 #2 (`upcomingSectionFirstChord`) → Epic 1 S3 ✅
- `form-arranger.md` P2 #11 (conductor `Math.random`) → Epic 3 area ✅

---

**Last reviewed:** 2026-05-20 — full post-Epic-11 reconciliation pass. §A closed (all four product calls shipped via Epic 11 S1–S4). §B/§C/§D/§E/§F/§G shipped entries marked against their Epic 11 story (S5 micro-cleanup sweep, S6–S9 medium engine follow-ups, S10 anchor suppression). §G test-failure entries verified green on `main`. ~29 items remain open — see the "Open count" block at the top.
