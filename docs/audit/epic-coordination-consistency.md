# Epic 9: Coordination & Consistency Sweep

## Why this epic exists

Post-audit (2026-05-19) follow-up promotion. The 50-story audit cycle shipped the structural moves — coordination context fields, deterministic phrasing, per-genre idiom, form awareness. What's left is **wiring**: fields that were published but only some consumers read them; helpers introduced in one place but not consistently adopted in the other 3-5 sites that have the same predicate inline; one live bug (Hype Man branch fires never on `main` despite two red test fixtures) that fell out of Epic 8 S4 work.

Items are individually small (~1-3h each) but cohesive when batched by file proximity or shared concept. Each sweep story commits per item so `git bisect` can pinpoint regressions — the `/done` step inside `/cycle` should stage each sub-item separately rather than one squashed commit.

Promoted from `docs/audit/FOLLOWUPS.md` sections B, C, D, and G (the live bug). See FOLLOWUPS.md for the underlying entries.

## Stories

### S1. Coordination consumption sweep — register seam + harmony channel

**Two items that share "harmony register/channel design":**

**(a) `bassMidi` floor consolidation across 4 lanes (`chords.md` P2 #15).** Epic 8 S2 added `safetyFloor = max(52, bassMidi + 7)` for the harmony main path. Three other voicing/lane sites in `accompaniment.ts` and `chords-engine.ts` still hard-code 52. Audit chord-voicing call sites; apply the same bass-aware floor where it's musically right (preserve any genre-specific floor that's intentional). Reviewer should pass on every site individually — pocket genres (Neo-Soul) may want a different policy than jazz.

**(b) Reggae organ-bubble on harmony channel** (FOLLOWUPS §D, from Epic 6 S5). S5 removed the bubble lane from `accompaniment.ts` (chord channel = keyboardist plays skank). The bubble (eighth-note offbeats on chord tones, occasional dyad on the higher voice) is the organist's idiom. Belongs in `harmonies.ts` under `activeStyle === 'organ' && genre === 'Reggae'`. Note: `harmonies.ts:242-250` already has a Reggae/Ska comping pattern firing on backbeats (steps 4 and 12) — this is a **replacement** of those lines with bubble positions (steps 2, 6, 10, 14), not an addition (avoid recreating the union bug S5 deleted). Add a `reggae-harmony-organ-critique.test.ts` asserting bubble coverage on offbeats and silence on backbeats.

**Acceptance:** (a) muddy E3-A3 clusters disappear at every chord lane when bass is at the top of its range; (b) reggae organ plays the bubble where skank previously was, no double-stack with the chord channel's skank. Two new/extended critique tests.
**Effort:** ~5h. **Model:** opus (musical-design call on register seam policy + reggae idiom). **Reviewer:** music-theory-reviewer. **Source:** FOLLOWUPS §D (bassMidi floor; reggae organ bubble).

### S2. Coordination consumption sweep — soloist-driven reactions

**Two items that share "the comper/bass listens to the soloist":**

**(a) Comper reacts to soloist phrase-end (`chords.md` P2 #16).** Epic 1 S4 added `coordination.soloistResting` and `soloistNotesInPhrase`. `accompaniment.ts` should react to phrase-end with a brief comping rest (~half-bar silence before next chord change) so the chord channel breathes with the soloist. Define "phrase-end" via existing fields — `soloistResting === true && prior soloistNotesInPhrase >= 3` or similar threshold. Critique test asserts comper attack count drops on phrase-end ticks vs phrase-middle ticks.

**(b) Reggae bass coordination consumption** (FOLLOWUPS §D, from Epic 5 S6). `bass-engine.ts:42-54` currently reads only `kickHit` for reggae. On `coordination.soloistPhraseEnd` (or the existing `soloistResting + soloistNotesInPhrase` shape from Epic 1 S4), permit an optional half-bar fill; on tension-chord, allow scalar approach to upcoming root. Reuses the field set already published — no new context fields.

**Acceptance:** (a) comper visibly thins on phrase-end across Jazz/Blues/Funk fixtures; (b) reggae bass produces audible half-bar fills on soloist phrase-ends in a song-mode trace. Two new critique tests or extensions.
**Effort:** ~5h. **Model:** opus (musical-design on phrase-end definition + reggae fill shape). **Reviewer:** music-theory-reviewer. **Source:** FOLLOWUPS §D (comper phrase-end; reggae bass).

### S3. Cross-engine consistency sweep

**Three items that share "the same fix-shape is repeated at multiple sites — apply once, audit everywhere":**

**(a) Altered-dominant narrow consumers (FOLLOWUPS §C).** Epic 6 S4 broadened `ALTERED_DOMINANT_QUALITIES`. Two consumers still narrow: `soloist-pitch-engine.ts:418` checks only `7alt`/`7#9`; `accompaniment.ts:1228` `wasTense` sustain-pedal list covers only `7alt`/`dim`/`halfdim`/`7b9`/`7#9`. Both should consume the broader set.

**(b) Slash-chord-blind predicate sites in bass (FOLLOWUPS §C).** Epic 5 S1 added `isChordChangeApproach` using `bassMidi ?? rootMidi`, catching slash-chord changes. Three inline predicate sites still use the narrower rootMidi-only check: `bass-engine.ts:313/463/812`. Migrate to the helper.

**(c) `bendStartInterval` plumbing (FOLLOWUPS §C, shared between Epic 5 S3 and S7).** Both funk walking approach bend (`bass-styles.ts:1118-1120`) and hip-hop 808 slide (`bass-styles.ts:516-527`) write `bendStartInterval` onto the note. Scheduler doesn't destructure it; `synth-bass.ts:26-33` has no parameter for it. Both gestures are engine-layer-testable but inaudible at playback. Wire it through `scheduler-core.ts` bass buffer + `synth-bass.ts` mirroring the `synth-soloist.ts:741-762` `applyPitchEnvelope` pattern.

**Acceptance:** (a) grep for the narrow quality lists returns the canonical broader set; (b) grep for inline `rootMidi !== chord.rootMidi` slash-chord-blind predicates in bass returns zero; (c) `npm run test:e2e` Playwright smoke confirms the bend is audible on funk + hip-hop sample charts.
**Effort:** ~5h. **Model:** sonnet (mechanical migrations + one plumbing wire-up). **Reviewer:** music-theory-reviewer + worker-contract-reviewer (for the synth-bass param change). **Source:** FOLLOWUPS §C.

### S4. Native-style chromatic leading tones (5 styles)

Epic 5 S2's gate removal only benefits the generic walking-bass / `quarter` fallback. Native handlers in `bass-styles.ts` for **rock** (~445-489), **pop**, **country**, **soul**, **gospel** return non-`undefined` from `getBassNoteStyle` on every 8th and bypass the gated branch — chromatic leading tones never fire in these styles.

Add a ~5-10% chromatic-leading-tone sub-branch inside each native style on `intBeat === ts.beats - 1` chord-change boundaries, gated by `isChordChangeApproach`. Per-style probability tuning is the load-bearing musical decision — country wants higher (signature Nashville sound), gospel slightly lower (chord-rich already), pop sparse.

**Disjoint-file fan-out candidate**: five styles, mostly independent in `bass-styles.ts`. Use `/fan-out` with five Sonnet workers, each on one style + the critique-test extension for that style. Reviewer fires on the combined diff after all five land.

**Acceptance:** existing `rock-bass-critique.test.ts`, `country-bass-critique.test.ts`, etc. extended with chromatic-approach assertions at chord-change boundaries. Per-style observed rate falls in the audit-doc band (5-15% generally; country higher).
**Effort:** ~10h total (~2h per style). **Model:** sonnet (mechanical per-style sub-branch following Epic 5 S2's pattern; per-style probability is the only taste call). **Reviewer:** music-theory-reviewer on the combined diff. **Source:** FOLLOWUPS §C (native-style chromatic leading tones).

### S5. Multiplier placement hardening

**Three items that share "shipped fix was consistent-with-adjacent rather than strictly final-stage; harden to canonical":**

**(a) `densityScale` placement (Epic 2 S6 follow-up).** `soloist-rhythm-engine.ts:337` puts the `1 + loopCount * 0.15` multiplier on `densityScale` before four downstream additive boosts (`+= 0.4` seed, `+= 0.2` × downbeat/kick/snare). Realized delta is +25% vs audit-doc target +30%; canonical fix is a post-multiplier on `attackProb` right before the jitter. Mirrors pitch engine for symmetry.

**(b) `soloist-devices` unison floor (Epic 1 S5 follow-up).** `soloist-devices.ts` enclosure/run/approach picker (~lines 314-340) doesn't consult `coordination.stepCoordination.accompanimentMidis`. Puts a ~10pp absolute floor on unison-rate drop — why Epic 1 S5 acceptance reframed from "≥30pp absolute" to "≥30% relative." Closing this would push absolute drop above 30pp; gives Epic 1 S5 the absolute number the audit originally asked for.

**(c) Bossa Charleston bank (Epic 3 S2 follow-up).** Bossa currently reuses the Jazz cell bank as a port-for-fidelity. Anticipation-of-1 idiom missing; partido-alto-specific bank needed. Same shape as Epic 3 S1 (funk) and Epic 3 S2 (jazz/blues banks).

**Acceptance:** (a) Epic 2 S6 test re-measures aggregate density delta closer to +30%; (b) Epic 1 S5 critique re-runs with absolute-30pp threshold and passes ≥27/30; (c) new bossa partido-alto critique test asserts anticipation-of-1 pattern on chord-change downbeats.
**Effort:** ~5h. **Model:** opus (each item is small but the bossa bank is fresh musical design). **Reviewer:** music-theory-reviewer. **Source:** FOLLOWUPS §B.

### S6. Hype Man dead branch investigation

**Live bug, not cleanup.** Two tests have been red on `main` since at least the Epic 8 S1 commit:
- `tests/integration/melodic-harmony-support.test.ts:111-135` ("should play an anticipation hit before a soloist anchor")
- `tests/unit/engine/harmonies-logic.test.ts > "should trigger Hype Man (Anticipation) hits before anchors"` (~line 590)

Both call `getHarmonyNotes` 2 steps before a soloist anchor and assert `notes[0].isLatched === true`, but the engine returns 0 notes. The Hype Man branch in `harmonies.ts` ~lines 340-354 (playShadowMode tag 3) fires never in either fixture.

**Investigation deliverable:** trace why `playShadowMode` returns null for the test setup at step 6 with a step-8 anchor. Most likely: a coordination field the tests mock doesn't satisfy the gate any more (e.g. `anchorStep` math drift, `anchorMidi` lookup change), OR the engine moved the gate after a refactor and the tests still target the old conditions.

**Acceptance:** Hype Man branch fires when a soloist anchor is upcoming AND the existing fixtures stop being red. If the fix requires re-shaping the test fixtures (because the gate now requires different mocking), the test names and assertions should still match the original "Anticipation hits before anchors" musical claim.
**Effort:** ~2h (mostly investigation; the actual fix is likely ≤30 lines). **Model:** opus (this is a "which side has drifted" diagnostic call). **Reviewer:** music-theory-reviewer. **Source:** FOLLOWUPS §G (Hype Man dead branch).

## Notes on this epic's shape

Stories S1–S3, S5 are **multi-item sweeps**: each one ships as 2-3 separate commits (one per sub-item) at the `/done` step rather than a single squashed commit. Keeps `git bisect` precise — if a sub-item regresses, `git bisect` lands on the exact commit.

S4 is a **fan-out candidate**: five disjoint-file Sonnet workers, music-theory-reviewer on the combined diff. Pattern proven in Phase 2 of the audit (see `feedback_delegate_to_subagents`).

S6 stands alone — diagnostic + small fix, single commit.
