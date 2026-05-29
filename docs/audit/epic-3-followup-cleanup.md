# Epic 3 — Deferred Follow-up Sweep

Synthesized 2026-05-28 from a decision pass over the open items in [`FOLLOWUPS.md`](FOLLOWUPS.md). The owner triaged every open follow-up one at a time; this epic captures the items that survived as real work, with the decided disposition baked into each story's acceptance.

**Reconciliation note (important):** the `FOLLOWUPS.md` "Open count" block was last reconciled **2026-05-26**, *before* Epic 12 S6/S10/S11 and the two 2026-05-28 meter cycles (Epic 1 compound, Epic 2 meter-robustness) closed a chunk of §E. During synthesis, **six decided items were found already shipped** and were NOT promoted — see "Verified already-shipped" below. The lesson ([[followup-sweep-triage]]): verify each entry against live source before writing a story.

**Goal:** burn down the genuinely-open follow-up backlog methodically via `/cycle`. The bar per story is the same as the prior cycles — one engine touch + critique test (or listen gate) + reliability loop. No new product surface; this is cleanup and per-genre correctness/taste the prior cycles deliberately deferred.

## How to use this doc

Same as Epics 1 & 2: this file holds the stories; `EPICS.md` is the tracker. Ship one story per focused session, mark it `✅ SHIPPED <date>` in its block here, bump the count in `EPICS.md`. Every file:line below was grepped against live source on 2026-05-28, but **re-grep before editing** — the tree shifts.

## Verified already-shipped during synthesis (NOT stories)

These were decided "yes, change it" by the owner but the change already exists in live code. Annotated as closed in `FOLLOWUPS.md`; listed here so a future reader doesn't re-promote them.

- **China cymbal `volumeScale`** → already `1.0` (`synth-drums.ts:467`, Epic 12 S6 B4 raised it from the original defensive 0.85). The decided 0.95 is moot — China already reads above the Crash.
- **Final-bar HiHat per-genre suppression** → already gated `!HAT_SPINE_GENRES.has(genreFeel)` (`groove-engine.ts:809/840`, Epic 12 S6 B6) — the exact per-genre gate the owner chose.
- **Conductor intensity ramp** → already `0.75` down / `1.25` up (`conductor.ts:~272`, Epic 12 S6 / LISTEN_TESTS B2) — the exact values chosen.
- **Ska-Punk `GENRE_INTENSITY_FLOORS`** → already `Ska: 0.4` (`conductor.ts:~67`, meter-robustness S1) — the exact value chosen.
- **Ska-Punk shared-hook antiphony** → already fully wired: `publishSoloistHook` writes hooks to `memory.sharedHookBuffer` (`soloist.ts:660`), `tick-logic.ts:597` syncs to `coordination.soloistSharedHookBuffer`, `harmonies.ts:375` consumes on `feel === 'Ska'` (writer added post-2026-05-20; consumer rekeyed by meter-robustness S1). The §E "dead branch" note is stale.

## Disposition summary

| Disposition | Items |
| :- | :- |
| **Promoted to story** (this epic) | 12 |
| **Verified already-shipped** | 6 (above) |
| **Deferred to a listening session** | 1 — per-genre intro/outro mute staggering (`FOLLOWUPS.md` §E, stays) |
| **Left as-is (intentional)** | comping harmonic-color RNG (variety is the point); §B.2 soloist device-floor ceiling (documented structural limit); non-jazz walking-bass compound pickers (latent — revisit per-genre when 6/8 support lands); Disco intensity-axis re-classification (when Disco next gets a pass) |

---

## Phase 1 — Mechanical, decided-value fixes (sonnet)

Unambiguous fixes with the value already chosen; no musical-taste decision left. Disjoint files — could fan out, but they're fast enough to walk via `/cycle`.

### S1 — Funk motif-2 displacement re-weight + re-baseline motif-tier test floors · Model: sonnet · Reviewer: music-theory
- **Where:** `grooves/funk.ts:195` — `const displacement = snarePhraseSeed < 0.4 ? 0 : snarePhraseSeed < 0.75 ? 1 : 2;`
- **Decision (owner 2026-05-28):** re-weight to **50 / 35 / 15** (normal / +1 / +2). The full `+2` (both backbeats shifted to the `&` for a sustained 2-bar phrase) currently fires ~25% — but Stubblefield/Garibaldi displacement is far more often the laid-back single-step `+1`; the full `+2` is canonically a 1-bar fill setup, not a sustained groove. New thresholds: `< 0.5 ? 0 : < 0.85 ? 1 : 2`.
- **Paired deliverable (same commit):** the §E motif-tier test floors are loose — `barsWithBeat1Displacement >= 5` (funk) and `burstBars >= 5` (hip-hop) pass even if the rate halved. The funk re-weight *changes* the expected displacement rate, so re-measure with a 20-run reliability sample and re-baseline both floors honestly (tighten toward the empirical rate, keep a statistical cushion — not a rigid snapshot). *Source: FOLLOWUPS §E (drums-idiom/S6) + §E motif-tier floors.*
- **Acceptance:** funk critique test green at the new distribution; the two motif-tier floors tightened with a documented 20-run measurement; no other funk/hip-hop critique regresses.

### S2 — Walking-ska 6th: chord-quality aware · Model: sonnet · Reviewer: music-theory
- **Where:** `bass-styles.ts:~1341` (the `bass.md P1 #9` walking-ska "6th" block).
- **Bug:** the walking-ska bass plays a major 6th over the chord regardless of quality; over a minor chord the M6 implies dorian, which is often wrong against the chord's actual quality.
- **Decision (owner 2026-05-28):** make the 6th **chord-quality aware** — M6 over major (and genuine dorian-minor) but m6 / the scale-correct 6th when the chord or active scale calls for it. Read the chord quality / scale mask already available in the bass context rather than hardcoding M6.
- **Acceptance:** over a minor-key ska progression the 6th matches the chord's scale; major chords unchanged. Add/extend the walking-ska critique coverage to assert the 6th's interval tracks chord quality. *Source: FOLLOWUPS §E (`bass.md` P1 #9).*

### S3 — Bebop whole-tone fallback off-scale fix · Model: sonnet · Reviewer: music-theory
- **Where:** `soloist-devices.ts:614` — `findNextBebopMidi` returns `from + stepDir * 2` (a fixed whole-tone step) when no bebop-set PC is found within 4 semitones (only on degenerate scales — whole-tone / diminished).
- **Bug:** the fixed whole-tone step stays in-scale for whole-tone scales (no-op) but lands **off-scale** for diminished. NIT-level — never observed in jazz-style runs, but it's a latent wrong-note.
- **Decision (owner 2026-05-28):** fix the fallback to step to the nearest *in-scale* tone in `stepDir` rather than a blind whole tone.
- **Acceptance:** on a diminished scale the fallback returns a scale tone; whole-tone behavior unchanged. *Source: FOLLOWUPS §E (Epic 4 / S3 review).*

### S4 — Funk slap pop/chuck/hammer probability documentation · Model: sonnet · Reviewer: music-theory
- **Where:** funk slap-bass strategy in `bass-styles.ts` (~919–1034, the six articulation gates seeded via `scrambleHash` per the §G.17 WHY-block).
- **Note:** the §G.17 PRNG migration already added a WHY-comment block for the *seeding*; this story is the **musical-intent documentation** of the pop/chuck/hammer *probability values* themselves (why each gate sits where it does). **Verify what's already documented first** — if the §G.17 block already covers the probabilities, downscope to filling any gaps. No behavior change.
- **Acceptance:** each articulation probability has an inline musical-intent comment; `npm run typecheck` + lint clean; zero behavior diff. *Source: FOLLOWUPS §E (`bass.md` P2 #17).*

### S5 — Odd-meter dub: grouping-pulse onsets · Model: sonnet · Reviewer: music-theory
- **Where:** the dub branch of the bass density gate (`bass-engine.ts` / `bass-styles.ts`), reached for non-4/4 via `stepInfo.isPulse` (meter-robustness S9). The pinning test is `bossa-dub-compound-bass-critique.test.ts`.
- **Bug:** in 16th-grid odd meters (5/4, 7/4) `tsConfig.pulse` is *every quarter*, so dub plays a locked quarter-note root pedal — on-pulse and not flooding the grid (meets the S9 "groove, don't break" bar), but denser than the sparse 3+2 / 4+3 grouping-pulse idiom dub actually uses.
- **Decision (owner 2026-05-28):** key the felt onset off **`isPulseStart`** (the *grouping* pulse: 5/4 → {0,12}, 7/4 → {0,16}; 8th-grid odd like 7/8 → {0,4,8} stays correct) for simple odd meters too. Watch the One Drop interaction: its `!isMeasureStart` then drops to a single onset/bar — keep that as a deliberate "one drop" only if it reads musically; otherwise guard it.
- **Acceptance:** 5/4 + 7/4 dub sits on the grouping pulse, not every quarter; compound (6/8) and 8th-grid odd unchanged. **This deliberately edits the pinning test** (`avg <= pulses.size` → grouping-pulse bound) — call that out in the diff. *Source: FOLLOWUPS §C (meter-robustness S9 review, P2).*

### S6 — Bossa phrase-end breath gate inclusion · Model: sonnet · Reviewer: music-theory
- **Where:** `accompaniment.ts:2681` — `PHRASE_END_THIN_GENRES = new Set(['Jazz', 'Blues', 'Funk'])` (Bossa excluded).
- **Context:** Bossa was excluded when the gate was tuned, before the partido-alto comping bank existed. The bank exists now.
- **Decision (owner 2026-05-28):** add `'Bossa Nova'` to the breath gate — **but eval first**: confirm the partido-alto bank isn't already encoding phrase-end breath natively. If the generic thin reads too aggressive against Bossa's steadier comp, fall back to a gentler Bossa-shaped value instead of the blanket gate.
- **Acceptance:** Bossa comping breathes at phrase ends without over-thinning the partido-alto figure; a short listen confirms it. Use the canonical key `'Bossa Nova'` ([[canonical-genre-keys]]). *Source: FOLLOWUPS §D (Epic 9 S2 review).*

---

## Phase 2 — Correctness needing a critique test or listen gate (mixed)

### S7 — Acoustic 6/8 snare → felt secondary pulse (mStep 6) · Model: sonnet · Reviewer: music-theory
- **Where:** `grooves/acoustic.ts:87` — motif-0 half-time snare predicate `isBeatStart && beatIndex === 2`.
- **Bug:** in 6/8 that fires the snare on mStep 4 (a weak in-group eighth), not the felt secondary pulse (mStep 6). Meter-robustness S8 made the acoustic *kick*'s beat-3 presence meter-relative (`isSecondStrongBeat` → mStep 6) — so now the kick and snare **disagree** about the secondary position in motif-0 6/8, arguably worse than before. Logged as the one real defect from the synthesis pass.
- **Decision (owner 2026-05-28):** mirror the kick's `isSecondStrongBeat` pattern on the snare lane (the established S6/S8 fix shape — compound → `isPulseStart && groupIndex === midGroup`), so kick and snare agree on the felt backbeat. Motif-≥1 snare (mSteps 2+6) already hits the pulse, so the work is really motif-0 placement.
- **Acceptance:** extend `acoustic-drummer-critique.test.ts` with a 6/8 + 12/8 harness asserting the motif-0 snare lands on the felt secondary pulse (mStep 6/12) and **zero** snares on the old mis-map (mStep 4); 4/4 byte-identical; 30/30 reliable. *Source: FOLLOWUPS §C (meter-robustness S8 review, P1).*

### S8 — Imperfect Symmetry at low intensity (INVESTIGATE → lower floor) · Model: opus · Reviewer: music-theory
- **Where:** unclear in current source — the §E entry cites the archived "Epic 2 S2 gates the gesture at `intensity >= 0.4`", but the gesture was refactored since: soloist SRDC symmetry moved to `arranger-utils.ts`, drum imperfect-symmetry (`groove-engine.ts:652`) is gated on `timeSignature === '4/4'` + repeat-pass (not an intensity floor). **No `intensity >= 0.4` suppressor was located during synthesis.**
- **Decision (owner 2026-05-28):** lower the floor to **0.25** so subtle motivic drift still operates in quiet ballad-style sections (where a looping clone is most exposed) — **but first locate the actual current gating.** If the 0.4 floor no longer exists, downscope to documenting that and confirming low-intensity sections already get drift (then close, no behavior change). If it exists, lower to 0.25 and guard truly-silent/intro moments.
- **Acceptance:** quiet repeated sections show motivic variation rather than mechanical repetition; if no gate is found, a written confirmation of current behavior + a closed note. Opus because it's investigation + a taste call. *Source: FOLLOWUPS §E (Epic 2 S2 review).*

### S9 — Comping vibe edge-cases: sparse-floor + active-collision guard · Model: opus · Reviewer: music-theory
- **Where:** the chords/accompaniment vibe path (`accompaniment.ts` comping-cell + ornament logic).
- **Bug (two opposite edges):** at **sparse** vibe the comping cell can collapse to near-silence (comper drops out); at **active** vibe an ornament can collide with the cell's own hit (doubled/flammed attack).
- **Decision (owner 2026-05-28):** add a **minimum-density floor** so sparse never fully collapses, and a **collision guard** so active-vibe ornaments don't land on an existing hit. The floor value is listen-set.
- **Acceptance:** sparse vibe always keeps at least the floor density; active-vibe ornaments never double the cell's own hit; a listen pass confirms both edges. Opus because the floor is taste-driven. *Source: FOLLOWUPS §F (Epic 3 S2 review).*

### S10 — Latin generic 6/8 bell pattern · Model: opus · Reviewer: music-theory
- **Where:** `grooves/latin.ts` — the son-clave block is gated `!isCompound` (correct — a 4/4 son-clave is wrong in 6/8), and `activeMotif === 2` Afro-Cuban bell content is also `!isCompound`. The dedicated `Afro-Cuban 6/8` drum preset has the real bell, but a generic `Latin` feel in 6/8 has **no clave spine** — at high intensity it yields ~1.2 offbeat-ghost snares/bar and nothing else.
- **Decision (owner 2026-05-28):** **author a genuine compound 6/8 bell/clave** (the standard 12/8 Afro-Cuban bell) into the Latin groove so any 6/8 + Latin pairing grooves correctly without requiring the special preset. This is the "build a 6/8 pattern" option deferred in compound-meter S16c.
- **Acceptance:** new critique coverage asserting the 6/8 Latin groove carries an idiomatic bell pattern on the felt pulses; a listen pass confirms it reads as Afro-Cuban 6/8. Keep the `!isCompound` son-clave gate (4/4 clave stays out of compound). Opus — authoring an idiomatic pattern is musical design. *Source: FOLLOWUPS §C (compound-meter S16c review).*

---

## Phase 3 — Larger / cross-cutting (opus)

### S11 — Generic walking-bass next-chord target-awareness · Model: opus · Reviewer: music-theory
- **Where:** the generic walking-bass picker in `bass-styles.ts` / `bass-engine.ts` (`bass.md P1 #10`).
- **Bug:** the generic walking line doesn't look ahead to the **next chord's root** when choosing its approach note, so it walks without consistently leading the ear into the upcoming change — the core mechanic of a good walking line.
- **Decision (owner 2026-05-28):** add next-chord target-awareness — on the bar's final beat(s), bias toward a chromatic or scale-step approach into the next chord's root. **Verify it isn't already partially done** (the FOLLOWUPS reconciliation is stale; jazz walking already has compound/target work from S12/S15).
- **Acceptance:** new walking-bass critique test asserting the final-beat note approaches the next chord's root (chromatically or by scale step) at an idiomatic rate; existing walking critiques don't regress. Opus — walking-bass quality is taste-driven, warrants its own critique test. *Source: FOLLOWUPS §E (`bass.md` P1 #10).*

### S12 — Penultimate-bar approach window (widen section-change lookahead) · Model: opus · Reviewer: music-theory + worker-contract
- **Where:** `tick-logic.ts:179` — `barsUntilSectionChange` is only published inside the `remainingSteps <= stepsPerMeasure` guard, so it only ever holds `0` (final bar) or `-1` (default), never `1+`.
- **Bug:** build-ups (the Epic 11 S2 rock harmonic push) can only be a **two-tier** gate (at-boundary / residual). A musically nicer **three-tier** ramp with a ~60% "approach window" one bar out is impossible until the lookahead widens to the penultimate bar.
- **Decision (owner 2026-05-28):** widen the guard to `<= stepsPerMeasure * 2` and add the three-tier approach ramp. This is **cross-cutting** — it also shifts when `upcomingSectionFirstChord` / `upcomingSectionLabel` / the drop mechanic publish, all of which cross the worker boundary (hence the worker-contract reviewer).
- **Acceptance:** `barsUntilSectionChange` can hold `1` on the penultimate bar; the rock push (and any other consumer) gets a documented three-tier ramp; the drop mechanic still fires correctly at the boundary; worker-synced section-lookahead fields update on the same schedule on both threads; a listen pass confirms the transition reads as a swell, not a lurch. Opus — cross-cutting infra + listen test. *Source: FOLLOWUPS §G (Epic 11 S2 review).*

---

## Model + reviewer tags

- **Model:** `opus` (default) or `sonnet`. `sonnet` = fix sketch unambiguous, acceptance concrete, no musical-taste decision left.
- **Reviewer:** `music-theory-reviewer` (any musical-behavior change — all stories here), plus `worker-contract-reviewer` on S12 (section-lookahead fields cross the worker boundary). Default expectation: review on the uncommitted diff before merge.
