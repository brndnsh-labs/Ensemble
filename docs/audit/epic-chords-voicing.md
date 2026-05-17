# Epic 6: Chord Voicing & Comping Cells

## Why this epic exists

The chords audit's two strongest patterns are: (1) "the engine is single-bar-stochastic, but real comping is multi-bar-deterministic" — every bar's rhythmic shape is decided by a fresh `Math.random()` call, with STICKY_GENRES explicitly excluding the genres where motivic development matters most (jazz, blues, bossa); and (2) voice leading between chord changes is absent — `getBestInversion` is a register-centroid optimizer that ignores common-tone holds and 7→3 resolution. The voice-leading machinery (`getNearestVoiceLeadingCost`) exists but is consumed by only the altered-dominant resolver lane.

A handful of standalone idiom fixes finish the epic: power-metal voicing doesn't respect chord quality; Neo-Soul "cluster crunch" stacks an actual half-step inside the chord; altered-dominant logic fires only on literal `'7alt'` quality (misses `7b9` / `7#9` / `7b13`); strum-country alternation is 90% probabilistic where it should be strict.

Two stories here unlock listening tests: sticky comping cells (S1) and voice-leading second pass (S2) are the biggest perceptual wins.

## Source findings

- `chords.md` P0 #3, #4 (S1+S2 are tracked in epic 3)
- `chords.md` P1 #5, #6, #7, #8, #9, #10, #11
- `chords.md` P2 #13, #15, #16, #17

## Stories

### S1. Voice-leading second pass on `getBestInversion`
`chords-engine.ts:202-286` places each interval at "nearest octave to targetCenter" independently. Add a second pass: for each pitch-class in the new chord that exists in `previousMidis`, snap to the same octave (common-tone hold); for each new 3rd/b7, find the previous chord's 7th/3rd and move by minimum interval. Use the existing `getNearestVoiceLeadingCost` at `accompaniment.ts:261`.

**Acceptance:** ii–V–I in C produces guide-tone voice leading (F→E held, A held, B↘E). New critique test in `jazz-piano-critique.test.ts` asserts top-voice movement minimization.
**Effort:** ~5h. **Model:** opus (architectural + musical judgment; ii-V-I behavior must be auditioned). **Reviewer:** music-theory-reviewer. **Source:** `chords.md` P1 #6.

### S2. Neo-Soul quartal m7 voicing drops the half-step cluster
`chords-styles.ts:60-67` returns `[2, 3, 5, 10, 15, 19]` — pc 2 (D) and 3 (Eb) are adjacent half-steps. Drop the `2` from the rich quartal stack — `[5, 10, 14, 17]` (4, b7, 9, 11) is the canonical D'Angelo m7 voicing. If "cluster crunch" still wanted, voice the 9 above the b3 in a higher octave.

**Acceptance:** Cm7 Neo-Soul rich voicing no longer has adjacent half-steps in the same octave. `neo-soul-piano-critique.test.ts` extended with adjacency check.
**Effort:** ~2h. **Model:** sonnet (one-line voicing change + adjacency test). **Reviewer:** music-theory-reviewer. **Source:** `chords.md` P0 #3.

### S3. Power-metal voicing respects chord quality
`accompaniment.ts:1105-1142` slams `[root, root+7, root+12]` over every chord including dim/halfdim/aug/7alt. Read `chord.quality`: dim/halfdim/7b5 → `[root, root+6, root+12]` (tritone power chord); aug/7#5 → `[root, root+8, root+12]`; else keep P5.

**Acceptance:** metal turnaround over m7b5 → V7alt → im no longer plays P5 voicings on m7b5. New `metal-piano-critique.test.ts` (none exists).
**Effort:** ~3h. **Model:** sonnet (per-quality voicing table + first metal-piano critique test). **Reviewer:** music-theory-reviewer. **Source:** `chords.md` P0 #4.

### S4. Altered-dominant voicing covers all altered qualities
`accompaniment.ts:1538-1539` gates `shouldUseResolvingAlteredVoicing` on `chord.quality === '7alt'` only. Extend to `{'7alt', '7b9', '7#9', '7b13', '7#11'}`. All share the same comping idiom (guide tones + 1-2 altered colors).

**Acceptance:** charts spelling `G7b9 → Cm` get the same comping idiom as `G7alt → Cm`. Listening parity test.
**Effort:** ~2h. **Model:** sonnet (extend a quality set). **Reviewer:** music-theory-reviewer. **Source:** `chords.md` P1 #7.

### S5. Reggae piano: pick one lane per phrase, not union of skank+bubble
`accompaniment.ts:1226-1296` fires skank on backbeats AND bubble on offbeats. Pick lane per-bar (or per-section) instead: low/medium intensity → skank-only; high intensity OR `chords.style === 'organ'` → bubble-only. Mirrors the per-phrase determinism pattern.

**Acceptance:** reggae piano texture is one lane at a time. `reggae-piano-critique.test.ts` assertions extended to forbid same-bar skank+bubble overlap.
**Effort:** ~3h. **Model:** opus (musical choice of when each lane fires; tied to organ style). **Reviewer:** music-theory-reviewer. **Source:** `chords.md` P1 #8.

### S6. Strum-country: strict R-5 alternation + dedicated strum voicing
`accompaniment.ts:1046-1058` uses 90% probability for beat-3 fifth. Replace with strict `if (measureStep === 0) root; else fifth;`. Build a dedicated strum voicing (octave-doubled root with third and fifth on top) instead of raw `chord.freqs.slice(0, 3)`, and recenter against `previousMidis`.

**Acceptance:** Country boom-chick alternates strictly. New `country-piano-critique.test.ts` (none exists).
**Effort:** ~3h. **Model:** opus (new voicing design + first country-piano critique test). **Reviewer:** music-theory-reviewer. **Source:** `chords.md` P1 #9, #10.

## Deferred / merged

- Funk groove-cell determinism (`chords.md` P0 #1) → Epic 3, S1.
- Jazz/Bossa/Blues Charleston-family per-phrase picker (`chords.md` P0 #2) → Epic 3, S2.
- Per-chord-retrigger extension randomization (`chords.md` P1 #5) — folds into S1's voice-leading pass; once extensions are picked deterministically per chord, retriggers hold.
- `accompanimentMidis` consumption (`chords.md` P2 #14) → Epic 1, S5.
- `bassMidi` floor consolidation across 4 lanes (`chords.md` P2 #15) — small ~2h follow-on; bundle with whichever S above touches the relevant lane.
- Comper reacting to soloist phrase-end (`chords.md` P2 #16) — depends on Epic 1's soloist-phrase-end coordination field.
- Funk 3-note Clav (`chords.md` P2 #17) — small change, can bundle with S5 or stand alone.
- Color tones at moderate intensity (`chords.md` P1 #11) — small change; bundle with S6 or stand alone.
