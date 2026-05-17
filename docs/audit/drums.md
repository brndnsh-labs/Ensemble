# Drums / Grooves Audit

Reviewer: music-theory-reviewer agent
Date: 2026-05-16
Files audited:
- `public/engine/groove-engine.ts`
- `public/engine/grooves/utils.ts`
- `public/engine/grooves/{acoustic,blues,country,disco,funk,hiphop,jazz,latin,metal,minimal,neo-soul,reggae,rock,shred,ska-punk}.ts`
- `public/engine/fills.ts`
- `public/engine/drum-seeder.ts`
- `public/engine/synth-drums.ts` (selected sections)
- `public/engine/tick-logic.ts` (fill consumption)

## P0 — Silences, dropouts, wrong-genre output

### 1. Crash accents never play a Crash cymbal
- **Where:** `groove-engine.ts:202-210` (accent-catch routing) and `:146-160` (turnaround section signal). Both write `soundName = 'Open'`.
- **What a drummer hears:** The "section-start crash" and "soloist crash-catch" both produce a louder Open hi-hat, not a Crash. Where the listener expects the wash of a crash cymbal at the top of a new chorus or on a peak soloist hit, they get a slightly louder hat splash.
- **Musical claim being broken:** `synth-drums.ts` has a real `Crash` voice at lines 285/937. The accent-catch system never reaches it. The comment at line 152 even says "section-start crash" while writing `'Open'`.
- **Suggested fix sketch:** Route `crash-catch` and post-turnaround downbeat to a Crash instrument lane (as `FILL_TEMPLATES.Rock.high` already does). Add a Crash lane to the per-instrument loop, or have the fill writer emit a `Crash` step when `pendingCrash` is set.

### 2. `firstIterationSuppression` flips backwards when arranger `totalSteps` is unset
- **Where:** `groove-engine.ts:230-231`: `const firstIterationSuppression = step < (arrangerState.totalSteps || 0) ? 0.3 : 1.0;`
- **What a drummer hears:** The "first iteration is rock-solid, later iterations get expressive" intent is inverted whenever `totalSteps` is undefined or zero — the condition becomes `step < 0`, always false, so entropy runs at 1.0× from bar 1.
- **Musical claim being broken:** Comment says "Suppress entropy during the first iteration to establish a solid 'Pocket'". For any session without a defined arrangement length (free-play, smoke tests, certain export paths) the head loop receives MORE entropy than later choruses.
- **Suggested fix sketch:** Fall back on `groove.seedTimelineStartStep`, or treat undefined `totalSteps` as "suppress for the first N bars" (e.g. `step < 32`). Document the WHY for the magic `0.3` adjacent.

### 3. Disco "Octave Cowbells" hit a missing synth voice
- **Where:** `grooves/disco.ts:148-156` writes `'CowbellHigh'` / `'CowbellLow'`.
- **What a drummer hears:** Motif 3 (Disco Octave Percussion) is silent on every cowbell step. Grep of `synth-drums.ts` shows no `Cowbell*` branch — `name.startsWith('Agogo')` is the only handler in that range. MIDI export emits GM note 56; live audio drops it.
- **Musical claim being broken:** The motif's `Octave Cowbells` comment promises a defining disco element. The audio lane is dead.
- **Suggested fix sketch:** Add a `Cowbell` branch to `synth-drums.ts` (resonant ~800 Hz tone + bandpass click). Until then, fall back to `'AgogoHigh'`/`'AgogoLow'` — the Agogo voice at line 1050 is close-enough timbre.

### 4. Latin Snare stays on Sidestick across every motif, even at high intensity
- **Where:** `grooves/latin.ts:79-140` and final override at `:167-169`. Snare voice hardcoded to `'Sidestick'` at line 81; only the turnaround block at 130-135 escapes.
- **What a drummer hears:** No path ever switches the body of the groove to a full Snare even at maximum intensity. A real samba batería uses a caixa (snare with crisp top) at full crack. The current output reads as "bossa rim" across all four motifs.
- **Musical claim being broken:** Motif 2 ("Samba") and motif 3 ("Partido Alto") should have a Snare body. The comment "Busy cross-stick" is honest for Samba but no path opens up for full Snare at `intensity > 0.85`.
- **Suggested fix sketch:** On `activeMotif >= 2 && intensity > 0.8`, route the on-beat-2/4 hit to `'Snare'` while keeping clave on Sidestick. The turnaround switch at line 130-135 is the right pattern; generalise it.

## P1 — Idiom gaps per genre, missing fills, weak vocabulary

### 5. No tom usage in 9 of 15 genres
- **Where:** `fills.ts FILL_TEMPLATES` has tom entries only for Rock and Bossa Nova; `grooves/rock.ts:252-260` is the only genre file with a Toms lane.
- **What a drummer hears:** Funk, Disco, Country, Blues, Acoustic, Hip-Hop, Neo-Soul, Reggae, Ska-Punk never play a tom — not in fills, not in turnarounds, not in builds. Every fill is snare-only, which sounds clinical. A Bonham fill, a Questlove tom-down, a country waltz roll all live on the toms.
- **Musical claim being broken:** `tick-logic.ts:430` advertises "Thematic Fill Memory" with rich fill vocabulary; actual vocabulary is snares + occasional kick/crash.
- **Suggested fix sketch:** Add genre-appropriate tom templates to `FILL_TEMPLATES` for Funk, Country, Blues, Neo-Soul, Hip-Hop, Disco. Add a tom-fill lane to those grooves.

### 6. Metal blast beat is co-articulation, not alternation; no china distinction
- **Where:** `grooves/metal.ts:62-156`.
- **What a drummer hears:** Motif 4 ("Blast Beat") lays snare on every 8th note while motifs 3/4 lay kick on every 16th. Real blast beats alternate snare-on-8ths against kick-on-8ths (offset by a 16th), producing the buzzing texture. Co-articulation reads as "single-stroke roll under double-kick," not a Slayer/Cannibal Corpse blast. Cymbal lane at `:131-156` picks Ride vs Open by `sectionSeed > 0.5` — no China voicing, even though china is the genre tell.
- **Musical claim being broken:** Motif comment "Blast Beat" promises alternation; engine produces stacked unison.
- **Suggested fix sketch:** At motif 4 + high intensity, alternate snare on `isBeatStart` vs kick on `isOffbeat`. Add a `China` lane tied to section accents.

### 7. Jazz has no brushes vocabulary and no "trading fours" detection
- **Where:** `grooves/jazz.ts` (entire file).
- **What a drummer hears:** At low intensity snare routes to Sidestick (line 222-225) — partial brush substitute, but with none of the brush sweep continuity. There is no detection of the soloist drop-out moment that defines "trading 4s."
- **Musical claim being broken:** Jazz at <0.4 intensity should read as ballad/brush; sidestick-on-2-and-4 sounds like bossa or country, not jazz brushwork.
- **Suggested fix sketch:** Add a `Brush` sound to `synth-drums.ts` (long noise sweep with bandpass automation), route the snare lane through it when `intensity < 0.35 && bpm < 130`. For trading: consult `coordination.soloistPhraseEnd` (already wired) to detect a 4-bar drop in soloist activity and fire a denser snare/tom statement.

### 8. Funk's "displaced backbeat" (motif 2) is a 50/50 coin flip, not a structural displacement
- **Where:** `grooves/funk.ts:168-181`:
  ```ts
  if (isBackbeat) {
      if (roll(0.5)) { shouldPlay = true; velocity = 1.15; }
  } else if (isOffbeat && !isPulse) {
      if (roll(0.8, intensity)) { shouldPlay = true; velocity = 1.1; }
  }
  ```
- **What a drummer hears:** Backbeat appears half the time, displacement appears most of the time. That is snare scatter, not displacement.
- **Musical claim being broken:** Displaced backbeat in funk ("Cissy Strut", "Funky Drummer") is a structural relocation — backbeat moves earlier or later by a 16th for an entire phrase, then returns. Deterministic per phrase, not stochastic per step.
- **Suggested fix sketch:** Use `phraseSeed` (already in the file) to pick a displacement amount once per phrase. For 16 steps: snare lands at `[5, 13]` (e of 2 / e of 4) instead of `[4, 12]` for an entire phrase, then returns.

### 9. Hip-Hop has no 32nd / triplet trap hat rolls
- **Where:** `grooves/hiphop.ts:106-180`. Motif 2 is labeled `// 2: Trap Skitter (Hi-hat rolls)` at line 24.
- **What a drummer hears:** The hat lane fires `isBeatStart || isOffbeat || isEOfBeat || isAOfBeat` for motifs ≥1 — that's 16ths, fine for trap foundation. But the genre-defining feature is the roll: rapid 32nd / 16th-triplet bursts on one or two slots per bar. The current `skitterHit` (line 128) is one extra 16th. There is no burst anywhere.
- **Musical claim being broken:** Motif name explicitly says "Hi-hat rolls" — no actual roll lives in the code.
- **Suggested fix sketch:** When `activeMotif >= 2 && phraseSeed > 0.7`, schedule a 4-6 hit burst at `instTimeOffset = -0.05 ... +0.05` triplet subdivision on one beat per bar.

### 10. Reggae lay-back is global; entropy fills the One Drop's defining beat-1 silence
- **Where:** `grooves/reggae.ts:52` (global `instTimeOffset += 0.008 + intensity * 0.005`) and `groove-engine.ts:233-272` (entropy phase).
- **What a drummer hears:** One Drop (motif 0) is silent on beats 1 and 3 BY DESIGN. But entropy at `intensity * 0.15 * config.entropyMultiplier` adds random snare hits on syncopated 16ths regardless of motif — phantom snares land where One Drop would never play. Also: the uniform lay-back gets applied to ALL hats including the offbeat skanks, but in reggae the kick/snare lay back while hats stay on-grid as the timing reference.
- **Musical claim being broken:** `reggae.ts:59` comment "One Drop: Kick only on the backbeat" is contradicted by entropy phantom hits.
- **Suggested fix sketch:** Set `config.entropyMultiplier = 0` for reggae (or add `config.disableEntropy`); apply `instTimeOffset += 0.008 + intensity * 0.005` only to Kick and Snare, not HiHat/Open.

### 11. Country snare ghost lane is gated on `Math.random()` per step (machine-gun risk)
- **Where:** `grooves/country.ts:72-82`:
  ```ts
  } else if (isEOfBeat || isAOfBeat) {
      const ghostProb = 0.5 + intensity * 0.5;
      if (roll(ghostProb)) {
          shouldPlay = true; velocity = scaleVelocity(0.15, intensity, 0.08) + jitter;
      } else { shouldPlay = false; }
  }
  ```
- **What a drummer hears:** Train-beat motifs (1, 2) decide each 16th-note "chicka" ghost via independent rolls. Result jitters between dense and gappy across the bar. Real train beat is a continuous 16th roll with the BACKBEAT accented — not stochastic gaps.
- **Musical claim being broken:** Line 56 comment "Train Beat snare is consistent 16ths" — code produces stochastic-gapped 16ths.
- **Suggested fix sketch:** Drop the per-step roll. For motif 2 fire 16ths deterministically; for motif 1, use only `isEOfBeat`.

### 12. Acoustic motif 0 is half-time backbeat, not "Minimal Folk"
- **Where:** `grooves/acoustic.ts:52-66` (snare) and `:76-89` (kick).
- **What a drummer hears:** Motif 0 fires snare on beat 3 only and kick on beat 1 only. Result: Kick on 1, Snare on 3 — the dominant Americana / "Hotel California" half-time backbeat pattern, NOT minimal folk. Folk usually has continuous brush snare or none at all.
- **Musical claim being broken:** Motif name says "Minimal Folk/Cajon"; code produces pop-rock half-time.
- **Suggested fix sketch:** Either rename motif 0 to "Half-time" or move snare to beats 2+4 (light Sidestick). The Cajon convention is bass-tone-bass-slap per bar, not 1-and-3.

### 13. Ska-Punk D-Beat (motif 3) kick pattern is not D-beat
- **Where:** `grooves/ska-punk.ts:103-113`:
  ```ts
  if (isDownbeat || (isAOfBeat && beatIndex === 0) ||
      (isBeatStart && beatIndex === 2) || (isOffbeat && beatIndex === 3)) {
      shouldPlay = true;
  }
  ```
- **What a drummer hears:** Real D-beat (Discharge / crust-punk descendant) is kick on 1+3 with a doubled offbeat kick creating the gallop, snare on 2+4, heavy 8ths on hat. The current pattern is kick on 1, "a" of 1, 3, "and" of 4 — that's a reggaeton-adjacent syncopation, not D-beat.
- **Musical claim being broken:** Comment "D-Beat / Syncopated" at line 104.
- **Suggested fix sketch:** D-beat skeleton: kick on 1, "and of 1", 3, "and of 3" + snare on 2, 4 + open hat on "and of 4".

### 14. No section-boundary crash signalling outside Rock/Blues/Disco/Ska-Punk
- **Where:** `fills.ts FILL_TEMPLATES` (Crash entries exist only in Rock high, Blues high, Disco high, Ska-Punk medium/high). `drum-seeder.ts:265-274` only attaches `crash: pendingCrash` to the fill, which fires Crash only if the chosen fill template happens to contain it.
- **What a drummer hears:** Entering Chorus at intensity 0.7 in Funk/Jazz/Country/Acoustic/Bossa/Hip-Hop/Neo-Soul/Reggae — the listener gets a snare roll into NOTHING on the downbeat. No crash to mark the transition.
- **Musical claim being broken:** `drum-seeder.ts:268` defines a "Crash Contract" — "only crash if energy is rising or it's a major structural return". The decision-bit is there; the audio output is not connected to it.
- **Suggested fix sketch:** When `fillMap[step].crash === true`, the consumer in `tick-logic.ts:431-438` should also emit a Crash event on the next downbeat after the fill ends, not rely on it being inside the template.

## P2 — Programmer's-math, missing variation, motif similarity, intensity-axis miscategorization

### 15. `humanizeVelocity` uses `Math.random()` instead of seeded variation
- **Where:** `groove-engine.ts:55-57`.
- **What a drummer hears:** Every drum hit's micro-velocity wobble (±5% default, ±8% on hat) is independent per-step and unseeded. Across loops the same step gets a different velocity — pink noise on velocity rather than a player's signature.
- **Musical claim being broken:** CLAUDE.md § Deterministic phrasing.
- **Suggested fix sketch:** Replace with `getPhraseSeed(sectionSeed, barIndex, 1, step)` → map to a deterministic ±amount.

### 16. Entropy phase floor wrong for quiet sections
- **Where:** `groove-engine.ts:233-272`. Documented as latent in `MUSICAL_AUDIT.md`; restating per-genre.
- **What a drummer hears:** At intensity 0.3, `entropyMultiplier = 0.15` (default), each step has ≈4.5% chance to fire a random snare or hat hit. At intensity 0.5 it is 7.5%. Over a 32-bar verse that is 12-25 random hits — audible noise on quiet sections. Worst on Reggae (One Drop holes), Jazz (intentional ride emptiness), Acoustic (intentional sparseness).
- **Suggested fix sketch:** Add `if (intensity < 0.4) return currentState` early in the entropy block, OR add a `config.suppressEntropyBelow: number` field with per-genre floors (Reggae 0.5, Jazz 0.45, Acoustic 0.5; Bossa already exempt via `isLatin`).

### 17. Motif "rotation" is fictional in practice — deterministic seed pins one motif per section
- **Where:** `binaryTier(0.6, 0.6)` / `(0.7, 0.6)` across rock/funk/hiphop/metal/etc. Seed source at `groove-engine.ts:142-143`.
- **What a drummer hears:** For a given session the same section ALWAYS gets the same motif. Over 16 bars one motif dominates; the listener never hears motif 1 in a low-energy section. Combined with the drum-seeder's `motifComplexity = Math.min(motifComplexity, 1)` head cap at `drum-seeder.ts:157`, the busy motifs LITERALLY NEVER APPEAR on the Head.
- **Musical claim being broken:** The "Motif rotation" naming and 4-motif structure imply the listener hears several feels across a song; in practice they hear one per tier.
- **Suggested fix sketch:** Reseed per-section (use `sectionId * 137 + barIndex`) so motif varies bar-to-bar within a section, OR widen the binaryTier so motif 1 is reachable at low intensity.

### 18. Disco intensity axis is loudness, but motif gating implies density
- **Where:** `grooves/disco.ts:22-42` (`getMotif`).
- **What a drummer hears:** Motif 3 ("Octave Cowbells") only fires at `intensity > 0.7 && seed >= 0.8` AND lives in the dead synth lane (P0 #3). Motif 2 ("Syncopated interplay") requires `intensity > 0.7`. So intensity 0-0.7 is locked to motifs 0/1.
- **Musical claim being broken:** Per `MUSICAL_AUDIT.md` disco entry, the scaling axis is documented as "velocity/timbre not density"; the motif system gates on density anyway.
- **Suggested fix sketch:** Collapse the four motifs to two (foundation + busy) and move velocity-tier choices into `applyOverrides`.

## Notes for synthesis

**Cluster 1 — Sound-design wiring gaps (P0).** Findings #1 (Crash never plays), #3 (Cowbell missing), partly #7 (Brush missing) share one root: groove engines write `soundName` strings with no synth handler. A `KNOWN_SOUND_NAMES` set in `synth-drums.ts` with a console warning on miss would surface future occurrences immediately.

**Cluster 2 — Entropy phase is musically wrong for half the genres (P0/P1).** Findings #2 (suppression-flip), #10 (One Drop fill-in), #16 (low-intensity floor) all stem from `groove-engine.ts:233-272` running the same probability ladder regardless of musical intent. `MUSICAL_AUDIT.md` recommended tolerating it in tests; this audit recommends fixing it in engine.

**Cluster 3 — Fill vocabulary is one-dimensional (P1).** Findings #5 (no toms in 9 genres), #6 (metal blast wrong), #9 (no trap rolls), #14 (no crash on boundary outside fills) all describe: the fill system is templates-of-snare while real drummers' fills are tom-down, crash-up, china-accent, brush-sweep. Worth one focused fill-system redesign session.

**Cluster 4 — Motif "rotation" is largely fictional (P2).** Finding #17 overlaps with the drum-seeder's `motifComplexity ≤ 1` head cap.

**Judgment call on Funk #8.** Borderline P0 (audible incorrectness of a named motif) vs P1 (idiom gap). Filed P1.

**Open question for orchestrator.** Drum-seeder's `motifComplexity ≤ 1` head cap (drum-seeder.ts:157) is intentional ("Pocket Discipline") but means busy motifs only appear Loop 1+. This collides with SRDC head-adherence on the soloist side.
