# Harmony + Coordination Audit

Reviewer: music-theory-reviewer agent
Date: 2026-05-16
Files audited:
- `public/engine/harmonies.ts`
- `public/engine/coordination-engine.ts`
- `public/engine/tick-logic.ts` (orchestration lines 92–393)
- `public/engine/soloist.ts` (phrase-end signal at 1461; coordination shape at 790–800)
- `public/engine/soloist-pitch-engine.ts` (upcomingSectionFirstChord at 379, 790)
- `public/engine/bass-engine.ts` (coordination reads at 42–54)
- `public/engine/accompaniment.ts` (coordination at 1021, 1172, 1323, 1459, 1566, 1702)
- `public/engine/synth-harmonies.ts`
- `tests/standards/ensemble-coordination.test.ts`

## P0 — Broken contracts, dropouts, dead-on-arrival fields, wrong timing

### 1. Register-slot critique test asserts a slot the engine does not enforce
- **Where:** `tests/standards/ensemble-coordination.test.ts:37-64`
- **What a listener hears (or doesn't):** Nothing wrong yet — but the test guards 28–51 while `coordination-engine.ts:116` enforces 23–57. Any future regression that drove bass notes into 23–27 (low Eb1–B1) or 52–57 (G3–A3) would not be caught.
- **Musical/contract claim being broken:** Per CLAUDE.md and `coordination-engine.ts:116`, the bass slot is 23–57; the test is enforcing an obsolete narrower window.
- **Suggested fix sketch:** Update the test to assert `23 ≤ midi ≤ 57`. If 28–51 was intentional for "rock," scope it to that style in `voicing-policy.ts`, not as the global slot.

### 2. `coordination.soloistMidi` is current-step-only; spectral-gap logic almost never fires in production
- **Where:** `harmonies.ts:535-540`; producer at `coordination-engine.ts:60`
- **What a listener hears (or doesn't):** When the soloist is high but resting on the harmony stab step (which is *most* harmony stabs, because the yielding rules at `harmonies.ts:335, 361, 364` actively push harmony away from soloist-active steps), `coordination.soloistMidi === 0`, so the octave-shift branch never engages. The "Proactive Generator Awareness" test at `ensemble-coordination.test.ts:94` passes by passing `soloistMidi` manually — in live playback the two instruments rarely fire on the same step.
- **Musical/contract claim being broken:** "Harmony fills spectral gaps based on Soloist position."
- **Suggested fix sketch:** Make the field sticky — only zero `soloistMidi` after N steps of soloist silence, or add `lastActiveSoloistMidi` written by the soloist whenever it produces a non-rest note. The per-tick recreation at `tick-logic.ts:92` is what kills the signal.

### 3. The "antiphonal response" gesture is a normal chord stab tagged `isResponse`
- **Where:** `harmonies.ts:263-268`; flag carried at `harmonies.ts:604`
- **What a listener hears:** On a soloist phrase-end step the harmony emits a generic guide-tone or full voicing — no pitch relationship to the soloist's resolution note, no complementary rhythm, no answering shape. The `isResponse` flag rides to `notesToMain` and `synth-harmonies.ts` reads nothing from it.
- **Musical/contract claim being broken:** "Mode 1: The Shadow → Antiphony (Response)" promises call-and-response. What ships is "a chord stab on the rest step."
- **Suggested fix sketch:** On `soloistPhraseEnd`, set `anchorMidi = coordination.soloistMidi || lastActiveSoloistMidi` so the tutti branch at `harmonies.ts:478` engages and the response *answers on the soloist's last note*. Pair with a shorter staccato duration when the soloist's last phrase was long, longer bloom when short.

### 4. `accompanimentMidis` / `avgChordMidi` written every chord tick, zero consumers — and harmony is the natural consumer
- **Where:** `coordination-engine.ts:90-93` (writes); no readers anywhere in `public/engine/`.
- **What a listener hears:** Harmony often fires a voicing with the same pitch-class set the chord stab just played one step earlier, producing flat doublings rather than complementary voices. This is a frequent texture issue in Comper mode for Jazz/Funk.
- **Musical/contract claim being broken:** A core arranging principle: the second comping instrument should not double the first.
- **Suggested fix sketch:** In `finalizeHarmonyNotes`, when `accompanimentCrowding` is true (line 427), filter `targetIntervals` to *prefer* pitch classes NOT in `coordination.accompanimentMidis`. This is the missing leg of the existing density-cap reaction at `harmonies.ts:513-518`.

### 5. Harmony reaches into `soloist.session.*` directly, bypassing the coordination contract
- **Where:** `harmonies.ts:332, 425-426, 446` read `soloist.session.phrasing.isResting` and `soloist.session.currentPhrase.notesInPhrase`.
- **What a listener hears:** The behavior is musically reasonable, but: any test that mocks only `coordination` (the contract surface — see `ensemble-coordination.test.ts:255`) skips these branches; and harmony running without a soloist initialized risks `undefined.phrasing.isResting`.
- **Musical/contract claim being broken:** The coordination context is the published cross-instrument contract. Reaching past it is exactly what the contract exists to prevent.
- **Suggested fix sketch:** Add `soloistResting: boolean` and `soloistNotesInPhrase: number` to the context, written in `updateCoordinationContext` case `'soloist'`. Replace the three private-state reads.

## P1 — Idiom gaps, missing counterpoint, missing cross-instrument reactivity

### 6. Pad mode retriggers on every chord change — there is no actual sustained pad
- **Where:** `harmonies.ts:385-392` (`playSeaMode`); duration cap at line 389 is `chord.beats * ts.stepsPerBeat` (current chord only); synth fade at `synth-harmonies.ts:18-27` is 20–30ms.
- **What a listener hears:** "Pad" mode is a string of one-chord-long stabs with a 20ms fade. There is no held-tone-across-chord-changes voice leading. "The Sea" and the `strings` preset suggest a true sustaining pad; voices retrigger every chord.
- **Musical/contract claim being broken:** Voice-led pads holding common tones across chord changes.
- **Suggested fix sketch:** On chord change, identify pitch classes shared with the previous voicing (`harmony.lastMidis`) and emit a *continuation* (no new attack — `isLegato`) for those; only retrigger voices whose pitch class is leaving. The note schema already supports `isLegato` for the soloist.

### 7. The harmony engine never reads `bassMidi`
- **Where:** grep `bassMidi` in `harmonies.ts` is empty; meanwhile `accompaniment.ts:1172, 1323, 1459, 1566, 1690` use it extensively for bass-spacing.
- **What a listener hears:** Harmony stacks crowd the bass/harmony register seam (52–57 is in both slots: bass tops at 57, harmony floors at 52). Without a `bassMidi`-aware floor, harmony repeatedly sits at the bottom of its slot when bass is at the top, producing muddy E3–A3 clusters.
- **Musical/contract claim being broken:** The "reserve bass space" rule that chords already implement via `bassMidi + 13` should apply equally — harmony is *closer* to bass than chords are.
- **Suggested fix sketch:** Replace the hard `safetyFloor = 52` at `harmonies.ts:499` with `safetyFloor = Math.max(52, (coordination.bassMidi || 0) + 7)`.

### 8. Soloist has no tension-chord awareness
- **Where:** `soloist.ts` and `soloist-pitch-engine.ts` — `isTensionChord` / `isTensionChordQuality` are not read at all.
- **What a listener hears:** On V7alt → I, the soloist plays diatonic-ish material no different from plain V7. The b9/#9/#11/b13 color tones that *define* the altered dominant sound are not preferred; `tensionScale` in `soloist-config.ts` is a per-profile constant, not a function of current chord quality.
- **Musical/contract claim being broken:** The single most idiomatic move in jazz soloing — "lean on the alterations over V7" — does not happen.
- **Suggested fix sketch:** Pipe `isTensionChord: boolean` (and ideally a list of alteration pitch classes) through `coordination`. In `soloist-pitch-engine.ts`'s pitch picker, apply `weight *= ~3` to altered-tone pitch classes — as a **final-stage multiplier** per the repo rule.

### 9. Bass has no soloist or section-boundary reactivity beyond `kickHit`
- **Where:** `bass-engine.ts:42-54` — the only coordination field consumed is `kickHit`. No reaction to `soloistPhraseEnd`, no `upcomingSectionFirstChord` consumption, no tension-chord awareness, no harmony-density awareness.
- **What a listener hears:** Bass plays the same line under a soloist climax and a soloist rest. No structural pickup into a new section. Walking-bass over V7→I doesn't chromatically approach the I root.
- **Musical/contract claim being broken:** Ensemble responsiveness; section-boundary handoffs.
- **Suggested fix sketch:** On `coordination.soloistPhraseEnd` permit an optional half-bar walking fill regardless of style; on `coordination.upcomingSectionFirstChord` being set, target the upcoming root via chromatic approach in the last 1–2 beats.

### 10. The shared `coordination` object is mutated by every producer with no producer-order discipline encoded
- **Where:** `tick-logic.ts:288, 332, 361` — `updateCoordinationContext(coordination, ...)` writes into the object downstream consumers read.
- **What a listener hears:** It works *today* only because the call order is hand-coded as soloist → bass → chords → harmony. There is no type or runtime guard. If anyone reorders, `soloistMidi` / `soloistBusy` become 0 in the consumer, and the yielding logic in `harmonies.ts:335, 349, 361, 364, 443` quietly breaks with no failing test.
- **Musical/contract claim being broken:** The producer-order invariant that makes "harmony yields to soloist" actually work.
- **Suggested fix sketch:** Annotate each context field with `// writer: <module>` / `// readable-after: <module>` comments, and add a Vitest unit that spies on `getHarmonyNotes` and asserts `coordination.soloistMidi` is non-zero when a soloist note was generated in the same tick.

## P2 — Programmer's-math, dead carriers, missing intent, missing tests for shipped behavior

### 11. Bare-magic intensity floor with no `// WHY`
- **Where:** `harmonies.ts:639` — `if (playback.bandIntensity < 0.22) return [];`
- **What a listener hears:** At ballad intensity 0.20, harmony is *silent*, including phrase-end responses and shadow latches. At 0.23 it audibly appears. The 0.22 cliff is undocumented; a jazz/blues ballad is the natural home for sparse organ swells.
- **Musical/contract claim being broken:** The "WHY" comment rule (CLAUDE.md "Musical intent").
- **Suggested fix sketch:** Either lower the floor to ~0.15 with a documented constant (`<0.15 = mute, 0.15–0.4 = pads only`), or remove the gate and let `playSeaMode` provide natural sparseness at low intensity.

### 12. `isResponse`, `isBloom`, `isLatched` survive into `notesToMain` but the synth ignores them
- **Where:** Carried at `harmonies.ts:602-605`; not read in `synth-harmonies.ts` (grep negative).
- **What a listener hears:** Currently nothing distinctive — the only effect is the `baseVol *= 1.8` at `harmonies.ts:580`. The flags are dead carriers in the note schema.
- **Suggested fix sketch:** Either consume them in `synth-harmonies.ts` (e.g. `isBloom` → +20% attack and slight detune; `isResponse` → +5ms timing offset — "answer behind the beat"), or drop the flags.

### 13. Coin-flip `Math.random()` inside otherwise-seeded harmony logic
- **Where:** `harmonies.ts:190, 223, 265, 294, 314, 352, 361, 364, 478, 590`. Outer comping pattern is properly seeded by `sectionId` hash at 736–740, but shadow-mode, antiphonal response, hype-man, and comper yielding all flip raw coins.
- **What a listener hears:** Loop-to-loop incoherence: the antiphonal response fires on loop 1 but not loop 2 at the same step; "hype-man" anticipation flickers.
- **Musical/contract claim being broken:** Deterministic seeded phrasing (CLAUDE.md).
- **Suggested fix sketch:** Derive a per-step PRNG from `motif.seed + step` and replace `Math.random()` at the listed sites.

### 14. `selectGroundedIntervals` orders colors before fifths
- **Where:** `harmonies.ts:147` — `return [...roots, ...guides, ...colors, ...fifths, ...others].slice(0, targetCount);`
- **What a listener hears:** A "grounded practice voicing" of a 7-chord with `targetCount = 4` picks R-3-7-color, *skipping the perfect fifth*. The 5th is a pillar of the chord; a color tone (2nd/6th/#11) is a stylistic upgrade. A practice voicing should be R-3-5-7.
- **Suggested fix sketch:** Reorder to `[roots, guides, fifths, colors, others]`.

## Notes for synthesis

Cluster A — **the coordination context is a half-finished contract.** Of 11 fields in `createCoordinationContext`, two are dead-on-arrival (`accompanimentMidis`, `avgChordMidi`, known), three are written-but-only-current-tick when they need to be sticky (`soloistMidi`, `bassMidi`, `soloistBusy`), and three SHOULD exist but don't (`soloistResting`, `isTensionChord`, sticky `lastActiveSoloistMidi`). Findings 2, 3, 4, 5, 8 are all symptoms of the same architectural gap — this is a single ~1-day refactor, not five separate fixes.

Cluster B — **the harmony engine has a sophisticated reactivity layer wired to a contract that doesn't carry the signals the layer needs.** The reach-into-private-state at `harmonies.ts:332, 425-426, 446` (Finding 5) is the engine working around its own contract. Fixing the context unlocks genuine antiphony (3) and tension awareness (8).

Cluster C — **bass is the least-coordinated instrument.** It reads only `kickHit`. Harmony yields to bass, accompaniment reserves bass space, but bass doesn't listen back. Finding 9 is a standalone improvement and the seed for "bass listens too."

**Judgment:** Not safe to ship the current "Proactive Generator Awareness" and "Antiphony" claims as production behavior — both are tested-green but production-broken (Findings 2 and 3). Recommend the coordination-context refactor (Cluster A) as one focused commit before further engine-side tuning.
