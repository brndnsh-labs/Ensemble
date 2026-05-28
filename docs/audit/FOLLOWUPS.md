# Follow-ups & Deferred Work

Captures every "shippable but flagged" item that surfaced during audit work — items that don't justify a fresh story yet but shouldn't be lost to grep. The 2026-05-16 audit cycle that originated most of these is archived at [`docs/archive/musical-audit-2026-05/`](../archive/musical-audit-2026-05/); this file is the LIVE follow-up backlog and survives the archive pass.

Each entry: **location** · what it is · why it's deferred · size estimate · provenance (which story or review surfaced it).

## How this doc gets used

- **When `/review` surfaces a P2 deferral** that isn't already covered by an existing story, append it to the relevant section here in the same pass as the Status block update. Don't bury it in the Status block alone — that hides the work from anyone scanning at the doc level.
- **When promoting a follow-up to a real story**, copy the entry into the appropriate epic file as a new S<N>, then delete the follow-up entry (or replace it with a single-line `→ Epic <N>/S<N>` pointer).
- **When fixing a follow-up inline** (e.g. while in adjacent code), delete the entry in the same commit that ships the fix.
- **When in doubt about "is this a follow-up or a story?"**: if it's <2h mechanical work in a file someone's already touching, follow-up. If it needs musical taste, design, or its own critique test, it's a story — promote it to the relevant epic.

A follow-up that's been sitting here for >2 months without being touched is signal: either promote it to a story (it's load-bearing) or delete it (we've decided we don't care). Don't let this file become a graveyard.

## Open count (reconciled 2026-05-26)

After the 2026-05-26 micro-sweep (Commits 1–5 complete), **~20 items remain open**, clustering into two shapes:

- **~17 per-genre listen-test / taste items** (all of §E) — acceptance is by-ear, not critique-test-gated. Best handled as genre-grouped listening sessions, not stories.
- **~3 small mechanical nits** (§B.2 documented structural limit; §D.4 Bossa phrase-end breath listen-eval; §G.15 `barsUntilSectionChange` lookahead — proper story-shaped, ~2 h + listen test). All three are either listen-driven or explicitly deferred-as-story.

The 2026-05-26 sweep closed seven engineering-tractable items in three engine areas:
- **§G**: §G.16 (Bossa genre-key canonicalization — accompaniment.ts + drum-seeder + chords-styles + voicing-policy + 5 tests), §G.17 (funk slap-bass PRNG migration).
- **§F**: §F.9 (classifyChordQuality case), §F.10 (defensive pinnedProfile clear), §F.11 (publishSoloistHook trim+cap rationale), §F.12 (ska-punk Restatement/Departure phase coverage), §F.13 (SoloistHook field trim), §F.14 (per-quality Greats controls).

Epic 12 S1–S11 closures were also folded in (Epic 12 shipped 2026-05-20 → 2026-05-25; previous reconciliation pre-dated most of it). The two "promote to a real story" candidates flagged in the previous reconciliation (`evansIntervals` chord-quality and profile-rotation sticky-retain) shipped silently in Epic 12 S2 and S3 respectively; both entries removed from §E.

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

- **Soloist rhythm critique fixture doesn't exercise active stepCoordination boosts** → ✅ SHIPPED — fixture now exercises active `stepCoordination` boosts (`kickHit` / `snareHit`) via the "final-stage multiplier survives active coordination boosts on non-forced steps" case in `soloist-chorus-evolution-rhythm.test.ts:259-398`; the wash-out scenario the audit-doc described is directly tested and passes. *Source: Epic 9 S5 review (2026-05-19); shipped during post-Epic-10 S2 fixture consolidation.*

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
- **Three remaining `Math.random()` in `groove-engine.ts` (lines 259/281/293)** → ✅ SHIPPED — Epic 12 S4 (drum-strategy probability/velocity randomness migrated to `scrambleHash`-keyed entropy). *Source: Epic 3 S5 Status block.*

**Not promoted (still deferred):**

- **Compound-aware `isQuarter` / jazz-walking density in 6/8 / 12/8** → 📌 PROMOTED — epic-1-compound-meter S12. *Source: epic-1-compound-meter S2 review (2026-05-27).*
- **Intensity-tapered rock/metal density in compound meters** → 📌 PROMOTED — epic-1-compound-meter S16 (broader per-genre drum density audit). *Source: epic-1-compound-meter S2 review (2026-05-27).*
- **Compound-aware pitch picker for the remaining non-jazz walking-bass styles (bossa/funk/country/etc.).** The `blues` style is now routed through the shared compound walking gate + pitch picker (see "Shipped" below). The other non-jazz styles (`bossa`, `funk`, `country`, `rockabilly`, `pop`, `rock backbeat`, `walking-ska`, `slap`) still have 4/4-shaped `intBeat === N` picks that would mis-fire in 6/8 — but the density gate only routes compound to jazz/quarter + blues, so that output stays dead unless a future story adds compound idiomatic support per style. Promote per genre when 6/8 support for that genre is on the agenda. *Source: epic-1-compound-meter S15 implementer paired-site audit (2026-05-27); blues shipped 2026-05-28.*
- **Generic 6/8 Latin snare/clave lane is empty unless the `Afro-Cuban 6/8` drum preset is loaded.** S16c gated the latin Samba (motif 2) and Partido Alto (motif 3) snare blocks on `!isCompound` (consistent with S16b), deferring the 6/8 clave to the dedicated `Afro-Cuban 6/8` preset (`drum-presets.ts:925`, which uses Perc/Conga/Bongo — no Snare lane). At intensity 0.9 a generic `Latin` feel in 6/8 now yields ~1.2 offbeat-ghost snares/bar with no clave spine. Defensible (a 4/4 son-clave step map is genuinely wrong in 6/8), but leaves a real hole *if selecting 6/8 + Latin doesn't auto-surface or route to the Afro-Cuban 6/8 preset*. Verify the routing; if it's manual-only, consider auto-suggesting the preset or authoring a genuine compound partido-alto pattern (the "build a 6/8 pattern" option deferred in S16c). Same hazard family as [[per-genre-dispatch-keys]] / [[orphaned-latin-content]]. Size: ~1h to verify + decide. *Source: epic-1-compound-meter S16c review (2026-05-28).*
- **Odd-meter dub plays a quarter-note root pedal in 16th-grid meters (5/4, 7/4) rather than the grouping pulse.** Epic-2 S9 routed non-4/4 dub onsets off `stepInfo.isPulse`, which is correct for compound (6/8 {0,6}) and 8th-grid odd (7/8 {0,4,8} = the true 2+2+3 grouping pulses). But in 16th-grid odd meters `tsConfig.pulse` is *every quarter* (5/4 → 0,4,8,12,16; 7/4 → …,24), so dub there is a locked quarter-note root pedal — on-pulse and not flooding the 8th grid (meets the S9 "groove, don't break" bar), but denser than the 3+2 / 4+3 grouping-pulse idiom. A sparser, more idiomatic result would key `feltBeat` off `isPulseStart` (the grouping pulse: 5/4 → {0,12}, 7/4 → {0,16}) for simple odd meters too — but One Drop's `!isMeasureStart` then drops to a single onset/bar (defensible as "one drop," but needs a deliberate by-ear call). Natural fit for the **S10 odd-meter sweep** (the dub half). Pinned by `bossa-dub-compound-bass-critique.test.ts` (`avg <= pulses.size`), so changing it is a deliberate test edit. *Source: epic-2-meter-robustness S9 review (2026-05-28, P2).*
- **`acoustic.ts` motif-0 snare lands off the felt pulse in compound (same `beatIndex === 2` mis-map S8 fixed in the kick).** Epic-2 S8 made the acoustic *kick*'s "beat 3 presence" meter-relative (`isSecondStrongBeat` → mStep 6 in 6/8) and gated it with `compoundKickAllowed`, but the **snare** lane's motif-0 half-time predicate `isBeatStart && beatIndex === 2` (`acoustic.ts:~87`) is unchanged — in 6/8 it fires the snare on mStep 4 (a weak in-group eighth), not the felt secondary pulse (mStep 6). The 4/4 half-time backbeat puts the snare on beat 3 = the bar midpoint; the faithful 6/8 equivalent is mStep 6. Now that the kick is faithful, kick and snare *disagree* about the secondary position in motif-0 6/8 — arguably worse than before. Out of S8's kick-only scope (no shared snare-density filter exists). Fix shape: a snare-lane `isSecondStrongBeat` mirror, or a `compoundSnareAllowed` gate. Motif-≥1 snare (mSteps 2+6) is less broken (mStep 6 hits the pulse), so the work is really motif-0 placement. Size: ~1.5h. *Source: epic-2-meter-robustness S8 review (2026-05-28, P1).*

**Shipped via the 2026-05-28 compound follow-up sweep:**

- **`getStepInfo.isEighthBoundary` triplet-grid mislabel** → ✅ generalized to `(2 * mStep) % stepsPerBeat === 0` (byte-identical for shipped spb 2/4; correct for triplet grids — fires only on beat-starts). Throw-guard rejected: `meter-integrity.test.ts` legitimately calls `getStepInfo` with `stepsPerBeat=3` for `isOffbeat`, so getStepInfo must not throw. *Source: S2 review.*
- **Jazz 12/8 ride skip-beat critique coverage** → ✅ added a 12/8 `describe` to `jazz-6-8-ride-position-critique.test.ts` (cluster `{0,4,6,10,12,16,18,22}` ≥ 90%, off-cluster `{5,11,17,23}` ≤ 5%); harness parameterized by tsConfig. *Source: S11 review.*
- **Jazz 6/8 comping chord-change coverage** → ✅ added a ii-V-I-VI walk `describe` to `jazz-comping-6-8-critique.test.ts` (8 seeds, same density/pulse bounds + downbeat-anchoring assertion). *Source: S13 review.*
- **`_nextActiveSteps` TS-normalization surprise** → ✅ documented at both soloist.ts sites (the `* stepsPerBeat` yields steps not bars and is intentionally un-normalized). *Source: S14 implementer notes.*
- **Compound `active`-vibe comping ornament 4/4-shaped** → ✅ `accompaniment.ts` now routes the ornament to the and-of-pulse anticipation slot in compound (`getBeatStep(2)`/`getBeatStep(beats-1)` → mStep 4/10 in 6/8) instead of the 4/4 beat-2. *Source: S7 review.*

**Shipped via the 2026-05-28 Tier-2 by-ear pass (jazz/blues compound All Blues refinement; all listen-verified):**

All soloist items scoped to jazz/blues via an `isSpaceStyle` flag in `soloist.ts` — applying them band-wide regressed neo-soul later-loop motivic recall (the recall test caught it).

- **§C.80 soloist phrase-budget cap** → ✅ jazz/blues `baseBarBudget` slope 8→10, cap 7→8 so a high-intensity solo can sustain an 8-bar phrase (i=1.0 → 8). Mid/low intensity unchanged.
- **§C.81 budget-forced rest length** → ✅ jazz/blues quadratic ramp `0.5 + (1-i)^2 * 3.5` (quiet ballad sections sit out 3-4 bars; was <2 at any intensity). Other genres keep the linear ramp.
- **§C.82 natural-resolution rest floor** → ✅ jazz/blues intensity-graded floor `0.2 + (1-i)^2 * 0.7` (~0.5 bar at default vs the 3-step "barely there"; ~0.9 bar when quiet). Other genres untouched.
- **§C.83 pickup approach direction** → ✅ follows the line's contour (prevMidi vs target), which IS the idiom — b7→root resolves from below, b2→root from above — instead of flat 50/50.
- **§C.84 approach-slot 3rd bias** → ✅ seeded 70/30 tilt toward the 3rd (chord identity, Chambers' tone) over the 5th, keeping bar-to-bar variety instead of droning one tone.
- **§C.85 (blues only) compound walking for the Blues smart-genre** → ✅ All Blues via the Blues smart-genre (bass style `'blues'`, feel `'Blues'`) was skipping the S12 compound density gate entirely and firing every eighth (6+ onsets/bar — a running line). Routed `blues` compound through the shared jazz density gate + pitch picker (one-clause broadenings in `checkBassActiveStyle` + `getBassNoteStyle`); high tier also tamed (pickup 0.95→0.8, approach 0.55→0.3 → ~4.2/bar at peak, was ~5). New guard: `tests/standards/blues-6-8-bass-density-critique.test.ts`. *Source: user listening report 2026-05-28.*

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
- **`findNextBebopMidi` whole-tone fallback.** `soloist-devices.ts` bebopScale branch's `findNextBebopMidi` falls back to `from + stepDir * 2` (a whole step) when no bebop-set PC is found within 4 semitones — only triggers on degenerate scales (whole-tone, diminished). The fallback steps a fixed whole tone regardless of which scale; for whole-tone scales it stays inside the scale (no-op), for diminished it lands on a non-scale tone. NIT-level; never observed in jazz-style runs. ~30min. *Source: Epic 4 / S3 review 2026-05-17.*
- **China cymbal `volumeScale` recalibration after triple-stack fix.** `synth-drums.ts` China runtime profile ships `volumeScale: 0.85` — picked to trim slightly under Crash's 0.90 as defensive headroom against the metal.ts triple-stack that fired three China voices per downbeat. After the Epic 7 S5 P0 fix scopes the accent to the Open lane only, that justification no longer holds. A real Holy China / Mb20 Trash typically peaks *above* the Crash in a kit; 0.85 leaves China reading quieter than the Crash it replaces. Listen-test 0.90 / 0.95 / 1.0 against Crash at the same accent and pick by ear. ~30min. *Source: drums-idiom/S5 review (2026-05-18).*
- **Funk motif-2 `+2` displacement frequency may be too high.** `grooves/funk.ts:184` ships `< 0.4 ? 0 : < 0.75 ? 1 : 2` — 25% of motif-2 phrases land on `+2` (both backbeats shifted to & of 2 / & of 4 for a sustained 2-bar phrase). Stubblefield/Garibaldi displacement is far more often the laid-back `+1` (e of backbeat); the full `+2` substitution is canonically a 1-bar fill setup, not a sustained groove. Consider 50%/35%/15% (normal-heavy) or restructure `+2` as a 1-bar gesture that returns to normal next bar. Listen-test required. ~1h. *Source: drums-idiom/S6 review (2026-05-18).*
- **Funk + Hip-Hop motif-tier test floors very loose vs expected rate.** S6 critique tests pin `barsWithBeat1Displacement >= 5` (funk) and `burstBars >= 5` (hip-hop) against expected rates of ~19 and ~13–30 respectively. A regression that halves either rate would still pass. Tighten after a 20-run reliability sample anchors the empirical floor. ~30min. *Source: drums-idiom/S6 review (2026-05-18).*
- **Ska-Punk shared-hook reinforcement branch is dead — `sharedHookBuffer` is never populated.** `harmonies.ts` `playShadowMode` has a Ska-Punk branch that echoes hooks the soloist has shared (`coordination.soloistSharedHookBuffer`). But repo-wide, the underlying buffer is only ever reset to `[]` — no code path ever pushes a `SoloistHook` entry, so the branch never fires in production. Pre-existing — S9(b) faithfully rerouted the (empty) buffer through the coordination contract without changing behavior. If Ska-Punk antiphony is intended to function, a separate story needs to write into the buffer (the soloist emitting a hook on a phrase it wants harmony to echo). ~3h if pursued. *Source: Epic 11 S9 review (2026-05-20).*

**Shipped via Epic 11:** Brush voice pan / envelope-click / bandpass-comment fixes → S5 ✅. bebopScale locrian-bebop `halfdim` + `augmaj7` quality routing → S7b ✅ (`b5191e29`). Reggae + Ska-Punk tom templates → S8a ✅ (`af558bc7`). Post-turnaround China splash on metal sections → S8b ✅ (`0db01245`).

**Shipped via Epic 12:** Profile-rotation churn (pinned profile sticky-retains at 100% via the `pinnedIsInPool` branch in `soloist.ts:1555-1576`) → S3 ✅. `evansIntervals` chord-quality blindness (`EVANS_INTERVALS_BY_QUALITY` per-quality table at `soloist-pitch-engine.ts:170-180`, dropping interval 6 on min/min6 and interval 9 on min6) → S2 ✅. Per-genre final-bar drum gestures (`PER_GENRE_FINAL_BAR` table in `groove-engine.ts:85-234`) → S11 ✅ (`0e9f889d`). Final-bar voice-leading discards `previousVoicingMidis` → S7 ✅ (`930bc3c7`).

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
- **Comping VOICING-color randomness still uses bare `Math.random()` (~6 sites, `accompaniment.ts:2811-3032`).** The 2026-05-28 comping-lock fix seeded all 10 RHYTHM/placement gates in the emission overlay (hit decisions, pulse anchoring, micro-timing push/lay-back), making the comp groove deterministic + pulse-locked. The remaining `Math.random` calls choose harmonic *color* (which extensions, octave sparkle, guide-tone drops) + a ±3ms `humanShift`/`humanVol` per note — voicing variation, not rhythm, so they don't affect the groove "lock" and were left intentionally. If a future story wants fully reproducible comping (e.g. for exact-match A/B or a "freeze the arrangement" feature), migrate these to `scrambleHash` keyed on `(step, loopCount, voiceIndex)` like the rhythm gates. ~1h. *Source: comping-lock fix 2026-05-28.*
- **`instHash` for drum lanes uses bare polynomial hash** → ✅ SHIPPED — Epic 11 S5/S9a (`groove-engine.ts` `instHash` now routed through canonical `scrambleHash`; reviewer confirmed no dead ceiling gate). *Source: Epic 2 S3 review.*
- **`reggae-harmony-critique.test.ts` / `reggae-harmony-organ-critique.test.ts` duplicate 128-bar case** → ✅ SHIPPED — Epic 11 S5 (accept-the-duplication comment — the two files exercise independent engine entry points; only constant arrays overlapped). *Source: Epic 9 S1 review.*

**New entries surfaced during Epic 10 S2:**

- **Soloist engine un-seeded `Math.random()`** → ✅ SHIPPED — Epic 12 S1 (2026-05-20). Re-scoped mid-cycle from picker-only to the full soloist engine once the implementer found `soloist-engine-determinism.test.ts` exercises all of `getSoloistNote`, not just the picker — ~56 draws across `soloist-pitch-engine.ts` / `soloist-rhythm-engine.ts` / `soloist.ts` (the "~338 divergences" figure was whole-engine entropy). All migrated to `scrambleHash` sources keyed on `(step, sectionLabel/sectionStart, occurrence, loopCount)` + per-draw discriminators; the deliberately un-seeded `soloist-rhythm-engine.ts` test seam preserved via injectable `random()`. The engine is now deterministic by construction — `soloist-engine-determinism.test.ts` runs un-stubbed (0 divergences) and dropped its mulberry32 spy. `form-analysis.ts`'s `scrambleHash` copy consolidated in the same commit — no `scrambleHash` body now duplicated outside `hash-utils.ts`. *Source: Epic 10 S2.b (2026-05-19).*

- **First-call module warm-up artifact in `getSoloistNote`.** ✅ RESOLVED 2026-05-20. Both `RESET_STATE` and `resetSoloistState()` now clear the five scalar `soloist.audio` fields; `soloist-engine-determinism.test.ts` dropped its discarded warm-up pass. *Source: Epic 10 S2.b (2026-05-19).*

- **`isEvansCadence` early-exit is a weak lever.** ✅ RESOLVED 2026-05-23 by Epic 12 S2. Skip-only is sufficient: the cumulative `isCallResponse ×8.0` × phrase-end role-aware `×4.0` root/5th boost (totaling ×32 at Evans response cadences without any Evans-specific addition) already pulls the cadence home reliably. Decision documented inline in `soloist-pitch-engine.ts`. *Source: Epic 10 S2.e (2026-05-19); resolved Epic 12 S2 (2026-05-23).*

**New entries surfaced during Epic 12 S2:**

- **`evansIntervals` per-quality test coverage is thin** → ✅ SHIPPED — 2026-05-26 micro-sweep (new "Evans per-quality buckets" test in `jazz-soloist-authenticity.test.ts` adds Cm6 interval-9 ceiling, C7 interval-6 floor, G7alt extension-rate < dom7 baseline). *Source: Epic 12 S2 review (2026-05-23) P2.*

- **`classifyChordQuality` is case-sensitive** → ✅ SHIPPED — 2026-05-26 micro-sweep (lowercase-normalize at function entry in `soloist-pitch-engine.ts:107`). *Source: Epic 12 S2 review (2026-05-23) P2.*

- **Evans `min6` bucket drops interval 9 — possibly over-conservative.** `EVANS_INTERVALS_BY_QUALITY.min6 = new Set([2, 5])` drops 9 because M6 (interval 9 over Cm6 = A) is the chord tone and the chord-tone bonus already fires. But m6 is exactly where Evans's signature 6/9 voicings live; the soloist should arguably *emphasize* the 6/9 there, not de-emphasize. Listen-test on a Cm6 vamp before/after restoring `min6: new Set([2, 5, 9])`. ~15min eval + 15min adjust. *Source: Epic 12 S2 review (2026-05-23) P2.*

- **`slashIntervals = {4, 9}` is chord-quality blind.** Slash profile is rock and rock charts rarely surface m7 through the Greats branch, but interval 4 (M3) over a minor chord is the false-major-coloring analog of the Evans-on-m7 bug just fixed. If a future minor-key rock chart exposes it, the fix is `SLASH_INTERVALS_BY_QUALITY` with `min: new Set([3, 9])` (M6 stays, M3 → m3). Track as listen-test follow-up, not pre-emptive fix. *Source: Epic 12 S2 implementer note (2026-05-23).*

- **Per-quality Greats table is bucket-by-quality, not by-active-scale.** The `min` bucket keeps interval 9 (M6) because Evans's jazz routing favors dorian and `theory-scales.ts` returns dorian for m7 in jazz style. If a future chart pins Evans to aeolian m7 (where 9 = b6 = avoid), the per-quality lookup won't catch it. The fix is to read `scaleMask` in the picker and intersect with the per-quality set — a larger refactor. Track until a real chart surfaces the regression. *Source: Epic 12 S2 implementer note (2026-05-23).*

**New entries surfaced during Epic 12 S3:**

- **No critique-test guard on saturated-pin distribution drift.** Pre-S3 Evans fired in ~1 of 4 jazz sections (auto-rotation across the 4-member pool, 80% shift). Post-S3 with `pinnedProfile = 'evans'`, Evans fires in 100% of sections. The Evans branch in `soloist-pitch-engine.ts:948-1014` applies `weight += 60; weight *= 3.5` on legal-extension intervals and `weight *= 0.1` on root mid-phrase — biases tuned against a population where Evans fired ~25-40% of the time. A pinned-Evans run for 5+ minutes may saturate the extension/avoid-note rate well outside the audited band (caricature risk). Add a saturated-pin variant of `soloist-evans-cadence-critique.test.ts` that runs with `pinnedProfile: 'evans'` (rather than direct context mutation) and asserts extension landings stay within the transcribed band even under 100% saturation. If the rate over-shoots, the `weight *= 3.5` multiplier was tuned for a diluted population and should be tempered to ~×2.5-3.0. ~1h. *Source: Epic 12 S3 review (2026-05-23) P2.*

- **`jazz-soloist-authenticity.test.ts` doesn't defensively clear `pinnedProfile`** → ✅ SHIPPED — 2026-05-26 micro-sweep (`pinnedProfile: null` merged into beforeEach `UPDATE_SB` dispatch). *Source: Epic 12 S3 review (2026-05-23) P2.*

**New entries surfaced during Epic 12 S10:**

- **`publishSoloistHook` buffer-trim + 16-entry cap is defensive over-engineering** → ✅ DOCUMENTED — 2026-05-26 micro-sweep (one-tick-handoff rationale appended to the trim block comment in `soloist.ts:~699`; trim+cap kept as forward-compat insurance). *Source: Epic 12 S10 music-theory-reviewer (2026-05-25) P2-1.*

- **`ska-punk-shared-hook-critique.test.ts` Restatement phase never witnessed** → ✅ SHIPPED — 2026-05-26 micro-sweep. The engine doesn't drive `preparePhraseResponseContext` on the head-playback test path (so engine-derived phase transitions don't fire from a multi-section arranger map). Closed by mirroring the existing Conclusion negative-control pattern: two new tests force `srdcState` directly (per-tick re-pin) and assert `phases.size === 1` matching the forced phase — one for `'restatement'`, one for `'departure'`. The existing Statement assertion was also tightened from a vacuous `toContain` over an (always-empty under the original sectionMap) Set to an explicit `publishedPhases.has('statement')` check. *Source: Epic 12 S10 music-theory-reviewer (2026-05-25) P2-2.*

- **`SoloistHook.midi` / `pitchClass` / `durationSteps` fields are unused by the Ska-Punk consumer** → ✅ SHIPPED — 2026-05-26 micro-sweep. Trimmed `SoloistHook` to `{ step, sourcePhase? }` in `public/types.ts:538` (dropped the open-index `[key: string]: unknown` signature); `publishSoloistHook` writer + signature simplified to drop the now-unused `primary` parameter. If a future pitch-aware consumer needs midi/pitchClass/durationSteps, re-add explicitly. *Source: Epic 12 S10 implementer note (2026-05-25).*

- **`harmonies.ts:931` smart-style fallback list did not include `'Ska-Punk'`** → ✅ Patched in Epic 12 S10 — added `'Ska-Punk'` to `['Funk', 'Metal', 'Afrobeat', 'Ska']` so the Smart Genre / preset-import path correctly routes Ska-Punk to the horns timbre. *Source: Epic 12 S10 music-theory-reviewer (2026-05-25) P1-3 (adjacent).*

**New entries surfaced during Epic 10 S3:**

- **Conductor macro-arc jitter un-named inline literal** → ✅ SHIPPED — Epic 11 S5 (`MACRO_JITTER_RANGE` named at module scope and imported into `conductor-arc-critique.test.ts`). *Source: Epic 10 S3.e review.*
- **`dispatch(ACTIONS.UPDATE_PLAYBACK, …)` silent no-op in `jazz-soloist-authenticity.test.ts`** → ✅ SHIPPED — Epic 11 S5. *Source: Epic 10 S2.e.*

**New entries surfaced during epic-1-compound-meter S16c:**

- **Latin Sidestick velocity jitter uses bare `Math.random()`** → ✅ SHIPPED — 2026-05-28 compound follow-up sweep (`grooves/latin.ts` migrated to a `scrambleHash((step * golden) | 0)` seeded ±0.05 jitter; loop-stable since GrooveContext.playback has no `currentLoopCount`). *Source: epic-1-compound-meter S16c review (2026-05-28) P2-2.*

## G. Schema cleanup & stale carriers

All seven original items promoted on 2026-05-19 and shipped via Epic 10 / S1 sub-item commits. The live bug went to Epic 9 / S6. (Original pointer list elided in the 2026-05-20 reconciliation — see Epic 10 S1 / Epic 9 S6 history.)

### New (post-2026-05-19) — still deferred

- **`barsUntilSectionChange` lookahead window is one bar — no penultimate-bar "approach" tier.** `tick-logic.ts:175-178` only publishes `barsUntilSectionChange` inside the `remainingSteps <= stepsPerMeasure` guard, and floors `(remainingSteps - 1) / stepsPerMeasure` — so the field only ever holds `0` (final bar) or `-1` (default), never `1+`. Epic 11 S2's rock push therefore ships an honest *two-tier* gate (1.0× at boundary / 0.15× residual); a musically nicer three-tier ramp with a 60% "approach window" one bar out is impossible until the lookahead is widened to the penultimate bar. Widening the guard to `<= stepsPerMeasure * 2` would also shift when `upcomingSectionFirstChord` / `upcomingSectionLabel` / the drop mechanic publish — a cross-cutting S1-infrastructure change that needs its own story + listen test. ~2h if pursued. *Source: Epic 11 S2 review (2026-05-20).*

- **`accompaniment.ts` Bossa genre-key audit — partido-alto bank likely dead in production** → ✅ SHIPPED — 2026-05-26 micro-sweep Commit 5. Confirmed real: `chords.style === 'jazz'` override at `accompaniment.ts:1218` collapsed Smart-Genre Bossa from `genre = 'Bossa Nova'` → `'Jazz'`, killing the partido-alto bank and 2-bar STICKY retention in production. Same shape hit Blues (chord:'jazz' Smart Genre + BLUES_COMPING_CELLS at ~884). Fix: (a) every short-form `'Bossa'` in `accompaniment.ts` migrated to canonical `'Bossa Nova'` (14 sites incl. STICKY_GENRES, DETERMINISTIC_PICKER_GENRES, CHORD_ANTICIPATION_GENRES); (b) style-override now preserves `groove.genreFeel` when it's `'Bossa Nova'` or `'Blues'`; (c) same shape bug fixed in `drum-seeder.ts:347`, `chords-styles.ts:168`, `voicing-policy.ts:9`; (d) five tests migrated to canonical key. Full suite (2098 tests / 281 files) green. The Smart Genre KEY `'Bossa'` (distinct from the `feel: 'Bossa Nova'` it sets) preserved at the three sites where the key, not the feel, is the right comparison. *Source: Epic 12 S4 music-theory-reviewer (2026-05-23).*

- **Funk slap-bass uses bare `Math.random()` for pop/chuck/hammer gates** → ✅ SHIPPED — confirmed already migrated during the 2026-05-28 compound follow-up sweep: the funk slap strategy (`bass-styles.ts` ~919-1034) seeds all six articulation gates via `scrambleHash((slapSeedBase + N) | 0)` with `slapSeedBase = (step × golden) ^ (loopCount × prime)` (the §G.17 WHY-comment block). The original line numbers (835/858/876/893) were stale; no remaining bare `Math.random()` in the slap block. *Source: Epic 12 S4 music-theory-reviewer (2026-05-23).*

### Reconciled (shipped)

- **`CoordinationContext` interface does not declare the S1 lookahead/drop fields** → ✅ Epic 12 S4 (`3d912d51`) — exported `CoordinationContext` type via `ReturnType<typeof createCoordinationContext>` with the five S1 fields documented in the JSDoc. Consumers still use `(coordination as any).field` writes (broader sweep deferred), but the type now exists for `drop-mechanic.ts` + the rock-push to import.
- **`bass-chord-change-approach-critique.test.ts` has an under-cushioned unseeded stochastic threshold** → ✅ Epic 12 S4 (`308af7ba`) — re-measured, the gap has grown organically from ~1pp to 14-24pp via engine churn since the FOLLOWUPS entry was written. The cushion is now statistically honest; documentation pass added to record the current measurement.
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

**Last reviewed:** 2026-05-26 — folded in Epic 12 S1–S11 closures (the cycle shipped 2026-05-20 → 2026-05-25). Stale entries removed from §B (B.1), §C (C.3), and §E (profile-rotation churn → S3, `evansIntervals` chord-quality → S2, per-genre final-bar drum gestures → S11, final-bar voice-leading → S7). The two previously-flagged "promote to a real story" candidates had already shipped silently. Open count refreshed — see the block at the top.

**Previously:** 2026-05-20 — full post-Epic-11 reconciliation pass. §A closed (all four product calls shipped via Epic 11 S1–S4). §B/§C/§D/§E/§F/§G shipped entries marked against their Epic 11 story (S5 micro-cleanup sweep, S6–S9 medium engine follow-ups, S10 anchor suppression). §G test-failure entries verified green on `main`. Epic 12 S1 (soloist `scrambleHash` migration) shipped 2026-05-20 — §F entry marked.
