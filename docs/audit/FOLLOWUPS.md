# Follow-ups & Deferred Work

Companion to [`EPICS.md`](EPICS.md). Captures every "shippable but flagged" item that surfaced during audit work — items that don't justify a fresh story yet but shouldn't be lost to grep.

Each entry: **location** · what it is · why it's deferred · size estimate · provenance (which story or review surfaced it).

## How this doc gets used

- **When `/review` surfaces a P2 deferral** that isn't already covered by an existing story, append it to the relevant section here in the same pass as the Status block update. Don't bury it in the Status block alone — that hides the work from anyone scanning at the doc level.
- **When promoting a follow-up to a real story**, copy the entry into the appropriate epic file as a new S<N>, then delete the follow-up entry (or replace it with a single-line `→ Epic <N>/S<N>` pointer).
- **When fixing a follow-up inline** (e.g. while in adjacent code), delete the entry in the same commit that ships the fix.
- **When in doubt about "is this a follow-up or a story?"**: if it's <2h mechanical work in a file someone's already touching, follow-up. If it needs musical taste, design, or its own critique test, it's a story — promote it to the relevant epic.

A follow-up that's been sitting here for >2 months without being touched is signal: either promote it to a story (it's load-bearing) or delete it (we've decided we don't care). Don't let this file become a graveyard.

---

## A. Product calls needed (decide before any coding)

- **`breakdown` / `drop` semantics** — `form-arranger.md` P1 #5. Genre-dependent. Either implement as a structural mute+slam bar, or delete from the energy map. Discuss before picking up. *Source: Epic 2 Deferred.*
- **Macro-arc grand cycle** — `form-arranger.md` P1 #5 + P2 #10/#11. `formIteration % 8` placeholder; replacing it is a product conversation, not engine work. *Source: Epic 2 Deferred.*
- **SRDC Restatement multiplier** — `soloist.md` P1 #5. Currently ×1.15 sits inside the noise floor. Bump to ×1.3, OR refold Restatement into contour/repetition logic. Open question whether Restatement should feel pitch-wise ("I meant that") or motivic-recall rhythm-wise. *Source: Epic 4 Deferred.*
- **Rock harmonic-anticipation push tuning** — `bass.md` P1 #8. Needs a "Stones-y vs classic 70s" feel call. *Source: Epic 5 Notes.*

## B. Multiplier placement & architecture trade-offs

All three items promoted to **Epic 9 / S5 (Multiplier placement hardening)** on 2026-05-19. Originals retained below as pointers for grep-from-finding.

- **Epic 2 S6 — densityScale placement** → Epic 9 / S5 (a). `soloist-rhythm-engine.ts:337` puts the `1 + loopCount * 0.15` multiplier on `densityScale` before four downstream additive boosts.
- **Epic 1 S5 — soloist-devices unison floor** → Epic 9 / S5 (b). `soloist-devices.ts` enclosure/run/approach picker doesn't consult `accompanimentMidis`.
- **Epic 3 S2 — Bossa Charleston bank is a Jazz port** → Epic 9 / S5 (c). Anticipation-of-1 idiom missing; partido-alto-specific bank needed.

**Not promoted (still deferred from Epic 9 S5 review):**

- **Soloist rhythm critique fixture doesn't exercise active stepCoordination boosts.** Epic 9 S5.a moved the `1 + loopCount * 0.15` multiplier from `densityScale` to a final-stage `attackProb *=`, which is the canonical placement (mirrors pitch-engine). But the existing critique fixture (`soloist-chorus-evolution-rhythm.test.ts`) feeds a synthetic `stepCoordination` with no `kickHit` / `snareHit` / seed steps, so the additive boost-stack the audit-doc described (`+= 0.4` seed + `+= 0.2` per landmark = `attackProb` near 1.0 BEFORE the multiplier, where the move matters most) isn't observable — realized fixture delta is unchanged at +25%. The placement is correct for production; the test is just blind to the production-relevant case. Extend the fixture (or add a second case) with active `stepCoordination` boosts so the test guards the wash-out the placement prevents. ~1h. *Source: Epic 9 S5 review (2026-05-19).*

- **`accompanimentMidis` device-floor scope is run/enclosure only.** Epic 9 S5.b added a skip-or-flip unison floor to `run` and `enclosure` devices in `soloist-devices.ts`. Other devices (`bebopScale`, `bluesLick`, `chickenPick`, `quartal`, `birdFlurry`) walk chord tones by genre-defining design, so they're correctly left alone — the realized 23.1pp mean-abs-gap (vs audit-doc target 30pp) is the structural ceiling under the current device set. If a future story wants to push the absolute drop higher, the lever isn't widening the floor's scope but biasing device *selection* away from chord-tone walkers when the comper is dense. ~2h if pursued; flagged as a known structural limit, not a defect. *Source: Epic 9 S5 review (2026-05-19).*

- **`enclosure` device full-veto vs `run` flip is asymmetric.** Epic 9 S5.b vetoes enclosure when *either* ±1 neighbor is in the chord stab; `run` only flips direction when one of its 2-step spans collides. Vetoing on single-neighbor collision (when the other neighbor is clean) over-rejects ~50% of diatonic enclosure targets over chord stabs. Future refinement: allow enclosure to play if at least one neighbor is non-unison, accepting 1-of-3 partial unison (33%) vs the current full-skip. ~30min. *Source: Epic 9 S5 review (2026-05-19) P2 #5.*

- **`pcAt` closure could be hoisted from the run/enclosure branch.** Style nit — `soloist-devices.ts` ~line 356, `const pcAt = (delta) => ((selectedMidi + delta) % 12 + 12) % 12;` is created every call to the device branch. Hoist to module scope or above the `if (accompPcSet)` guard for consistency with the `accompPcSet` precompute pattern. ~5min. *Source: Epic 9 S5 review (2026-05-19) NIT.*

## C. Cross-engine consistency (same fix-shape repeated elsewhere)

Three items promoted on 2026-05-19; remainder still here as not-yet-load-bearing.

- **Native-style chromatic leading tones** → **Epic 9 / S4** (shipped 2026-05-19, narrowed to rock-only — country was already done in Epic 5 S5; pop/soul/gospel aren't native bass styles in current codebase).
- **Altered-dominant narrow consumers** → **Epic 9 / S3 (a)**. Two consumers (`soloist-pitch-engine.ts:418`, `accompaniment.ts:1228` `wasTense`) still narrow.
- **Three slash-chord-blind predicate sites in bass** → **Epic 9 / S3 (b)**. `bass-engine.ts:313/463/812` use `rootMidi`-only check; should migrate to `isChordChangeApproach` helper.
- **`bendStartInterval` not plumbed through `playBassNote` / `scheduler-core.ts`** → **Epic 9 / S3 (c)**. Affects funk walking approach bend + hip-hop 808 slide; both gestures inaudible at playback.

**Not promoted (still deferred):**

- **`walking-ska` style slash-chord-blind predicate.** `bass-styles.ts:1041` carries the same `nextChord.rootMidi !== chord.rootMidi` pattern that Epic 9 S3.b/S4 migrated elsewhere. Single inline site — could be folded into a future micro-sweep. Reviewer flagged during Epic 9 S4 review. ~10min. *Source: Epic 9 S4 review.*

- **Hash-helper consolidation across 3 engines.** `bass-engine.ts` + `groove-engine.ts` use djb2-33-from-5381; `accompaniment.ts` uses djb2-31-from-0. Independent per-engine target distributions are currently a happy hash accident. ~2h. *Source: Epic 2 S3 review.*
- **Three remaining `soloist.session.*` reads in `harmonies.ts`.** `session.memory.sharedHookBuffer` at lines 271-272 (Ska-Punk only) + `session.seed` at line 279 (melodic shadowing). Would need a buffer-object + RNG-seed context-fields design. Worth its own story if/when "grep returns zero" becomes a hard rule. ~3h. *Source: Epic 1 S4 follow-up.*
- **Three remaining `Math.random()` in `groove-engine.ts`.** Lines 259/281/293 (drum-strategy probability/velocity randomness). Promote if drum tests start flaking. ~1h. *Source: Epic 3 S5 Status block.*

## D. Coordination consumption gaps

Four items promoted on 2026-05-19; remainder deferred.

- **Reggae bass coordination consumption** → **Epic 9 / S2 (b)**.
- **`bassMidi` floor consolidation across 4 lanes** → **Epic 9 / S1 (a)**.
- **Reggae organ-bubble on the harmony channel** → **Epic 9 / S1 (b)**.
- **Comper reacting to soloist phrase-end** → **Epic 9 / S2 (a)**.

**Not promoted (still deferred):**

- **Wire `enableVoiceLeading` opt-in into production jazz comping path.** Epic 6 S1 added the opt-in flag; no production caller passes `true` yet. Needs gating on `style ∈ {jazz, bossa, blues}` + listen-test confirmation that production audio matches the test-fixture promise. Also: 10-positional-arg signature should fold to options object at the same time. ~3h. *Source: Epic 6 S1.*
- **Funk 3-note Clav.** `chords.md` P2 #17. Small standalone or bundle with future Epic 6 work. ~1h. *Source: Epic 6 Deferred.*
- **Color tones at moderate intensity.** `chords.md` P1 #11. ~1h. *Source: Epic 6 Deferred.*
- **Soloist device-selection uniform-random over ranked list.** `soloist.md` P2 #14. ~2h. *Source: Epic 4 Deferred.*
- **Final-bar cadence stays airy when bass is grounded high.** `accompaniment.ts:1559` `while (cadenceMidis[0] > 68 && cadenceMidis[0] - 12 >= cadenceFloor)`. When `bassMidi=62` → `cadenceFloor=69`, a cluster at `[72,76,79]` can't shift down to `[60,64,67]` (would crash bass), so it stays in soloist register — opposite of "grounded final cadence." The P5-above-bass rule is for *running* harmony, not the final-bar "we all converge" moment; cadence should be allowed to land *with* the bass at MIDI 62. Niche (bassMidi>55 on a final bar uncommon in practice) but musically wrong when it triggers. Fix shape: at the cadence site only, treat the floor permissively (allow overlap with bass for one bar). ~30min. *Source: Epic 9 S1 review (2026-05-19).*
- **Country boom-chick bass leg coexists with band bass without safetyFloor.** `accompaniment.ts:1700-1726` boom-chick block writes notes at MIDI ≤ 55 (bass register) on the chord channel without consulting `coordination.bassMidi`. The band bassist runs alongside in 23-55; two engines can land in the same register on the same step. Country idiom traditionally has a guitarist playing a bass note + strum, but in our two-engine model this duplicates pitches. Fix shape: chord-channel bass leg yields to or pitch-merges with band bass when present. ~1h. *Source: Epic 9 S1 review (2026-05-19).*
- **`generateCompingPattern` `motifCache` key audit.** `harmonies.ts:1002` `sectionKey = \`${chord.sectionId ?? ''}|${activeStyle}\`` now keys on `activeStyle` (Epic 9 S1.b fix) but cache will go stale on any future branch on `feel`, `bandIntensity` tier, or `complexity`. Pattern is "key on every input that branches the pattern body." ~30min. *Source: Epic 9 S1 review (2026-05-19).*
- **Funk + standard-lane comper read `soloist.session.phrasing.busySteps` directly instead of `coordination.soloistBusy`.** `accompaniment.ts:2067` (Funk lane conversational displacement) and `:2222` (standard lane skip-prob) bypass the coordination contract that already migrated other phrasing fields. Same shape as the `soloistResting` / `soloistNotesInPhrase` migration. ~30min. *Source: Epic 9 S2 implementer flag + review (2026-05-19).*
- **Bossa phrase-end breath after S5.c bank lands.** Epic 9 S2.a excludes Bossa from `PHRASE_END_THIN_GENRES` because the partido-alto bank is still S5.c-pending and the gate is tuned to Jazz/Blues/Funk clav comping. When S5.c ships, re-evaluate whether Bossa should inherit the gate or whether the partido-alto bank encodes breath natively. ~15min eval, ~1h if a Bossa-shaped gate is needed. *Source: Epic 9 S2 review (2026-05-19).*
- **Reggae phrase-end-only fill on 54-46 riddim replaces a clean root with a chromatic neighbor.** `bass-engine.ts:973-1040` chord-change branch is musically excellent (chromatic walk-in to next root). The phrase-end-only branch on 54-46 (the only riddim with a step-14 root entry) substitutes the lock-in root for a half-step rub against the same chord. Chromatic-from-below is a jazz move, not a reggae idiom. Options: (a) skip phrase-end emission on riddims that already fill step 14; (b) prefer scale-tone walk-in (target ± 2) for phrase-end-only; (c) accept the trade. ~1h. *Source: Epic 9 S2 review P2 (2026-05-19).*
- **Phrase-end gate comment overstates "final-stage" guarantee.** `accompaniment.ts:2254-2261` says the gate lands after the "Force hit on One" + "Group start" boosts, but Pad and Acoustic style overrides at `:2286/2291` run *after* the gate too. Those genres are not in `PHRASE_END_THIN_GENRES` so the override is invisible today, but future style-override blocks placed below would silently re-introduce smuggled hits. Append a "no later style override may resurrect a thinned hit" note. ~5min. *Source: Epic 9 S2 review P2 (2026-05-19).*
- **Phrase-end breath duration vs. audit doc.** Audit `epic-coordination-consistency.md:29` envisioned "~half-bar silence before next chord change." Impl is a 65% deterministic thin while the predicate (`soloistResting && notesInPhrase >= 3`) holds — typically 1-4 steps. Musical effect verified via critique test; if a deeper "half-bar latch" is desired, the gate would need to extend silence past the predicate window (e.g. latch-on-rest-onset). Documents the design call. ~5min note. *Source: Epic 9 S2 review NIT (2026-05-19).*

## E. Per-genre tuning & sound design

Taste-driven gestures or per-genre values still flat. Each one is a future-story candidate, not a follow-up to anything in particular.

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
- **Profile-rotation churn silently overrides user-selected soloist style.** `soloist.ts:1262` re-rolls `currentPhrase.context.profile` at every section boundary with `Math.random() < 0.8`, sampling from the genre's full influence pool. A user who selects "Bill Evans" gets Evans for ~1 section before the engine swaps to a random pool entry. Audit P1 #4 framed this as a tuning artifact but it's a real product issue: user-selected profile should sticky-retain at >90%, with pool rotation a smaller (~10-15%) optional variation. Couples with the Evans multiplier tuning in S2 — lower multipliers are musically defensible only when the profile actually persists. ~2h. *Source: soloist-idiom/S2 review (2026-05-17).*
- **`evansIntervals` is chord-quality blind.** `soloist-pitch-engine.ts` `evansIntervals = new Set([2, 5, 6, 9])` (9, #11/b5, 13). The `6` is a real Evans color (#11 on dom7, Lydian on maj7) but lands as the *b5 avoid note* on min7 chords. Pre-S2 the +500 floor blanketed it; post-S2 at +60/×3.5 it's audible as ~25% of Evans extensions. Extension sets should be quality-aware (dom7 / min7 / maj7 / alt7 each get their own legal-extension list). Touches all Greats profiles, not just Evans. ~4h. *Source: soloist-idiom/S2 review (2026-05-17).*
- **Brush voice pan-position discontinuity.** `synth-drums.ts` `'Brush'` is not in `RIGHT_PANNED_INSTRUMENTS`, doesn't literal-match `'Snare'`/`'Sidestick'`, and isn't in the Tom/Conga/Bongo family — so it lands at panValue 0 (center). When jazz intensity crosses 0.35 the snare lane swaps Brush→Sidestick (`-0.1`); listeners perceive the snare "shifting right" with intensity. Add `'Brush'` to the Snare/Sidestick pan branch (`name === 'Snare' || name === 'Sidestick' || name === 'Brush'`). ~15min. *Source: Epic 7 S2 review (2026-05-18).*
- **Brush voice envelope tail click.** `synth-drums.ts:1313-1322` `gain.setTargetAtTime(0, playTime + 0.2, 0.09)` runs ~0.25s before `noise.stop(playTime + 0.45)` — gain is at ~3% of peak when the buffer hard-cuts. Add `gain.gain.setTargetAtTime(0, playTime + 0.4, 0.02)` (or similar fast tail-cut) before `noise.stop`. ~15min. *Source: Epic 7 S2 review (2026-05-18).*
- **Brush bandpass sweep direction is artistic, not acoustic.** `synth-drums.ts:1297-1306` comment claims the 2.4kHz→1.4kHz downward sweep "mimics wire bristles decelerating." Real circular brush sweep on a coated snare has a roughly stationary spectrum ~1.5-2kHz. Audible result is fine (Q=0.9 is broad), but the WHY comment overstates the acoustic mimicry. Either accept the downward sweep as a tasteful artistic choice (rewrite the comment to say so) or hold the bandpass static at ~1.7kHz. ~15min comment-only. *Source: Epic 7 S2 review (2026-05-18).*
- **bebopScale locrian-bebop for halfdim/ø7.** `soloist-devices.ts` bebopScale branch routes `halfdim` to the dominant-default passing PC (maj7) because `'halfdim'` doesn't start with `'m'`. The musically correct passing PC for a half-diminished chord is the locrian-bebop tone (maj7 between b7 and root works on the locrian scale, so the default isn't catastrophic, but the canonical bebop choice would be `nat-3` or `nat-4` over the locrian b3 / b5). Adding an explicit `halfdim` branch in the quality conditional is the clean fix. ~1h. *Source: Epic 4 / S3 review 2026-05-17.*
- **bebopScale augmaj7 fold is musically inert.** `soloist-devices.ts` bebopScale folds `augmaj7` into the major-quality family, but the b6 passing PC (rootPc+8) IS the augmaj7 #5 — a chord tone, not a passing tone. The bebop walk degenerates to a clean Lydian-Augmented scalar line with zero chromaticism. Gracefully degraded (legal scalar motion), but doesn't honor the "Parker bebop with one chromatic passing tone" contract. Fix direction: route `augmaj7` to a passing PC that isn't already in the lydian-aug scale and isn't a chord tone (PC 5 = perfect 4 bridges PC 4→6; PC 10 = b7 bridges PC 9→11, more canonically bebop). Alternatively, blacklist `augmaj7` from bebopScale at the picker. ~1h. *Source: Epic 4 / S3 review 2026-05-17.*
- **`findNextBebopMidi` whole-tone fallback.** `soloist-devices.ts` bebopScale branch's `findNextBebopMidi` falls back to `from + stepDir * 2` (a whole step) when no bebop-set PC is found within 4 semitones — only triggers on degenerate scales (whole-tone, diminished). The fallback steps a fixed whole tone regardless of which scale; for whole-tone scales it stays inside the scale (no-op), for diminished it lands on a non-scale tone. NIT-level; never observed in jazz-style runs. ~30min. *Source: Epic 4 / S3 review 2026-05-17.*
- **Reggae + Ska-Punk tom templates.** `drums.md` P1 #5 names 9 genres; Epic 7 S4 shipped 7 (Funk/Country/Blues/Neo-Soul/Hip-Hop/Disco/Acoustic), trimming Reggae and Ska-Punk. Both have real tom vocabulary worth adding — Reggae's One Drop beat-1 silence cries out for a Carlton Barrett tom-down out of the gap; Ska-Punk's Travis Barker / Tim Armstrong fills are tom-laden. Same template-shape work as S4. ~2h. *Source: drums-idiom/S4 review (2026-05-18).*
- **China cymbal `volumeScale` recalibration after triple-stack fix.** `synth-drums.ts` China runtime profile ships `volumeScale: 0.85` — picked to trim slightly under Crash's 0.90 as defensive headroom against the metal.ts triple-stack that fired three China voices per downbeat. After the S5 P0 fix scopes the accent to the Open lane only, that justification no longer holds. A real Holy China / Mb20 Trash typically peaks *above* the Crash in a kit; 0.85 leaves China reading quieter than the Crash it replaces, opposite of the reference instrument. Listen-test 0.90 / 0.95 / 1.0 against Crash at the same accent and pick by ear. ~30min. *Source: drums-idiom/S5 review (2026-05-18).*
- **Post-turnaround Crash should be China on metal sections.** `groove-engine.ts:222-237` hard-codes `soundName = 'Crash'` for the section-boundary splash. On Metal at high intensity, the engine now emits China on every downbeat (the genre tell) but reverts to plain Crash on the strongest accent — the first downbeat after a turnaround. The genre identity is muted at the moment that matters most. Fix direction: let genre strategies declare an `accentCymbal: 'Crash' | 'China'` in config and thread it through the post-strategy section-boundary + crash-catch blocks. ~2h. *Source: drums-idiom/S5 review (2026-05-18).*
- **Funk motif-2 `+2` displacement frequency may be too high.** `grooves/funk.ts:184` ships `< 0.4 ? 0 : < 0.75 ? 1 : 2` — 25% of motif-2 phrases land on `+2` (both backbeats shifted to & of 2 / & of 4 for a sustained 2-bar phrase). Stubblefield/Garibaldi displacement is far more often the laid-back `+1` (e of backbeat); the full `+2` substitution is canonically a 1-bar fill setup, not a sustained groove. Consider 50%/35%/15% (normal-heavy) or restructure `+2` as a 1-bar gesture that returns to normal next bar. Listen-test required. ~1h. *Source: drums-idiom/S6 review (2026-05-18).*
- **Funk + Hip-Hop motif-tier test floors very loose vs expected rate.** S6 critique tests pin `barsWithBeat1Displacement >= 5` (funk) and `burstBars >= 5` (hip-hop) against expected rates of ~19 and ~13–30 respectively. A regression that halves either rate would still pass. Tighten after a 20-run reliability sample anchors the empirical floor. ~30min. *Source: drums-idiom/S6 review (2026-05-18).*

## F. Test rigor & determinism

Most items promoted on 2026-05-19 to **Epic 10 / S2 (soloist)** and **Epic 10 / S3 (harmony/drums/conductor)**. One item still here.

- **Deterministic-seeding of head-bypass jitter PRNG** → Epic 10 / S2 (a).
- **Engine-wide determinism test** → Epic 10 / S2 (b).
- **Picker-output-only chromatism metric for Epic 4 S1** → Epic 10 / S2 (c).
- **Soloist test fixtures don't seed `Math.random`** → Epic 10 / S2 (d).
- **Evans cadence test doesn't isolate phrase-end attacks** → Epic 10 / S2 (e).
- **Accompaniment S3 test fixture primary seed lands target=0** → Epic 10 / S3 (a).
- **Drums-not-muted regression test asserts Kick only** → Epic 10 / S3 (b).
- **`withOctaveJump` PC-fold metric** → Epic 10 / S3 (c).
- **Sparse-vibe cell collapse + active-vibe ornament collision** → Epic 10 / S3 (d).
- **Conductor cool-down jitter headroom is thin** → Epic 10 / S3 (e).
- **Conductor critique only exercises ceiling-clamped section** → Epic 10 / S3 (f).
- **S8 funk-backbeat-presence integration coverage** → Epic 10 / S3 (h).
- **Pad-sustain test doesn't exercise scheduler or synth legato paths** → Epic 10 / S3 (g).

**Not promoted (still deferred):**

- **`instHash` for drum lanes uses bare polynomial hash.** Epic 2 S3, `groove-engine.ts`. No canonical `scrambleHash` pre-scrambling. Empirically fine, future cleanup. ~30min. *Source: Epic 2 S3 review.*
- **`reggae-harmony-critique.test.ts` and `reggae-harmony-organ-critique.test.ts` share a near-identical 128-bar critique case.** S1.b kept both files for naming clarity (the organ-critique adds unit + non-organ regression cases the other lacks); the headline 128-bar critique is duplicated. Either fold the shared assertion into a util, or accept the duplication as cheap. ~15min. *Source: Epic 9 S1 review (2026-05-19).*

## G. Schema cleanup & stale carriers

All seven items promoted on 2026-05-19. Six to **Epic 10 / S1 (schema cleanup sweep)**; the live bug to **Epic 9 / S6**.

- **Naming collision: `soloist.ts:1257 isFinalMeasure` vs `coordination.isFinalMeasure`** → Epic 10 / S1 (a).
- **Three state-discipline NITs at Epic 2 S4** → Epic 10 / S1 (b).
- **MIDI export silently drops `CowbellHigh`/`CowbellLow`** → Epic 10 / S1 (c).
- **`KNOWN_SOUND_NAMES` substring-exemption too broad** → Epic 10 / S1 (d).
- **`KNOWN_SOUND_NAMES` carries inert no-space tom variants** → Epic 10 / S1 (e).
- **Legato-extension `voice.duration` grows monotonically across chains** → Epic 10 / S1 (f).
- **Dead role-switch arms in `conductor.ts:401-428`** → Epic 10 / S1 (also).
- **Hype Man branch never fires in either of its test fixtures** → Epic 9 / S6 ✅ (shipped 2026-05-19; gate ceiling was below the scrambleHash quantile for the common test seed after the May 2026 Math.random→scrambleHash migration — Loop 0 raised to 1.0, Loop 1+ to `0.2 + bandIntensity * 0.4`).

## H. Cross-references (already routed to a story — no work tracked here)

Pointers in case someone greps from a finding:

- `chords.md` P0 #1 funk groove-cell determinism → Epic 3 S1 ✅
- `chords.md` P0 #2 Jazz/Bossa/Blues Charleston picker → Epic 3 S2 ✅
- `chords.md` P1 #5 per-chord-retrigger extension randomization → folds into Epic 6 S1 (open)
- `chords.md` P2 #14 `accompanimentMidis` consumption → Epic 1 S5 ✅
- `drums.md` P2 #15 `humanizeVelocity` seeded → Epic 3 S5 ✅
- `drums.md` P2 #17 motif rotation fictional → Epic 2 S1 ✅ partial; binaryTier widening still open
- `harmony-coordination.md` P0 #2/#3/#4/#5 → Epic 1 ✅
- `harmony-coordination.md` P1 #8 → Epic 1 S2 ✅
- `harmony-coordination.md` P1 #9 → Epic 5 S6 (partial: delete only ✅; consumption still open in §D)
- `harmony-coordination.md` P1 #10 → Epic 1 S6 ✅
- `harmony-coordination.md` P2 #13 → Epic 3 S5 ✅
- `soloist.md` P1 #6 → Epic 2 S6 ✅
- `soloist.md` P1 #8 → Epic 1 S5 ✅
- `form-arranger.md` P0 #2 (`upcomingSectionFirstChord`) → Epic 1 S3 ✅
- `form-arranger.md` P2 #11 (conductor `Math.random`) → tracked in Epic 3 area

---

**Last reviewed:** 2026-05-19 (post-audit promotion: §B, §C native chromatic + altered-dom + slash-chord + bendStartInterval, §D bassMidi floor + reggae organ + comper phrase-end + reggae bass, §F most items, §G all items moved to Epic 9 + Epic 10 sweep stories. Remaining entries in §A/§C/§D/§E/§F are not-yet-promoted — still listen-test-gated or genuinely small adjacent-work candidates).
