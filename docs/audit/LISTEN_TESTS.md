# Listen-Test & Human-Decision Checklist

The single bucket for **everything in the audit backlog that needs human ears** — Claude/agents cannot perform these. Companion to [`FOLLOWUPS.md`](FOLLOWUPS.md) and [`epic-followup-drain.md`](epic-followup-drain.md) (Epic 12).

Three kinds of item:

- **Part A — Verification.** Shipped Epic 11 engine changes whose listen-test gate is still open. You're confirming the change sounds right; if it doesn't, file a regression.
- **Part B — Decisions.** A value or direction has to be picked by ear. Each recorded decision unblocks **Epic 12 / S5** (the per-genre tuning sweep) — fill in the `Decision:` line and S5's acceptance criteria become concrete.
- **Part C — Sessions.** Bigger design-by-ear work — needs a proposal + listening pass together. Each maps to an Epic 12 story (S6–S9).

**How to run:** `npm run dev` → http://localhost:5173. Pick the genre noted per item from the instrument rail, set the key/intensity as directed, and play. Check the box when done; for B/C, write your call on the `Decision:` line.

---

## Part A — Verification of shipped engine work

- [x] **A1. SRDC Restatement motif echo** *(Epic 11 S4)*
  Genre: any soloist-forward style (Jazz recommended). Play through at least one full SRDC cycle (Statement → Restatement → Departure → Conclusion — roughly two choruses).
  **Listen for:** the Restatement phrase should feel like a *paraphrase of the Statement* — same rhythmic grid, same melodic contour direction, but with looser landings (it should not resolve harder than the Statement did). It should not sound like a literal repeat, nor like an unrelated new phrase.
  Result: ☑ sounds right — verified 2026-05-25. Owner can "guess where the soloist might be going as the song progresses," which is exactly the SRDC contract producing audible structure.

- [x] **A2. Production voice-leading in Jazz/Bossa/Blues comping** *(Epic 11 S6a)*
  Genre: Jazz, then Bossa Nova, then Blues. Use a progression with stepwise-related chords (e.g. ii–V–I, Dm7–G7–Cmaj7).
  **Listen for:** comping voicings should move by common tone / guide tone — the chord changes should sound *connected and smooth*, voices sliding by small intervals, not the whole hand jumping register on every chord.
  Result: ☑ sounds right — verified 2026-05-25.

- [x] **A3. China splash on Metal section boundaries** *(Epic 11 S8b)*
  Genre: Metal (or Shred). Play across a section boundary so the post-turnaround accent fires.
  **Listen for:** the accent should be a trashy *China* cymbal, not a Crash. **Also note the China's loudness relative to the Crash** — this is the input to decision **B4** below.
  Result: ☑ default-pass — verified 2026-05-25 (no issues noticed in normal Metal playback; low-usage genre, will revisit if specific scenarios surface).

- [x] **A4. Soloist engine determinism migration** *(Epic 12 S1)*
  Genre: any soloist-forward style. Play a few choruses, ideally looping.
  **Listen for:** the soloist migrated from un-seeded `Math.random()` to deterministic `scrambleHash` seeding. The line should sound exactly as musical as before — not more mechanical or repetitive (looped passages especially), and not more random. Critique tests confirm no statistical drift; this is the by-ear sanity check.
  Result: ☑ sounds right — verified 2026-05-20.

---

## Part B — Decisions (each unblocks Epic 12 / S6) — **COMPLETE 2026-05-24**

- [x] **B1. Imperfect Symmetry intensity floor**
  **Decision:** lower to 0.25 (shipped Epic 12 S6 commit `118c5018` 2026-05-24). Gate at `bass-engine.ts:451` now lets the octave-displacement gesture diverge on quiet ballad-style verses — the window where mechanical-loop feel is most exposed.

- [x] **B2. S8 energy-ramp inversion aggressiveness**
  **Decision:** soften to 0.75 / 1.25 (shipped Epic 12 S6 commit `9423fbbb` 2026-05-24). `conductor.ts:251` ramp multipliers preserve the asymmetric "settle in, build up" feel but cap the per-measure rise to ≈+0.0625 from the prior +0.25 lurch.

- [x] **B3. S8 Ska-Punk genre intensity floor**
  **Decision:** add floor at 0.4 (shipped Epic 12 S6 commit `a349b777` 2026-05-24). `'Ska-Punk': 0.4` added to `GENRE_INTENSITY_FLOORS`, one notch below Disco's 0.45.

- [x] **B4. China cymbal `volumeScale`**
  **Decision:** raise to 1.0 (shipped Epic 12 S6 commit `7f875c9d` 2026-05-24). China now sits ≈+0.92 dB over Crash (which is at 0.9), matching idiomatic metal trash-cymbal mixes. Closes the volume question on [A3](#part-a--verification-of-shipped-engine-work) as well.

- [x] **B5. Funk motif-2 `+2` displacement frequency**
  **Decision:** restructure `+2` as a 1-bar gesture (shipped Epic 12 S6 commit `c183362e` 2026-05-24). `grooves/funk.ts:189` now collapses `+2` back to spine backbeat on bar 2 of the 2-bar phrase via `effectiveDisplacement`, matching the canonical antecedent-consequent shape. `+0` and `+1` keep their 2-bar sustained scope.

- [x] **B6. Final-bar HiHat suppression**
  **Decision:** per-genre gate via `HAT_SPINE_GENRES` (shipped Epic 12 S6 commits `0ef382a9` + `313e96d1` 2026-05-24). HiHat suppression preserved on sparse-hat genres (Jazz / Bossa / Acoustic / Country / Blues / Reggae / Latin / Minimal); kept on the spine in Disco / Funk / Rock / Metal / Shred / Ska-Punk / Hip Hop / Neo-Soul. The patch commit added Hip Hop and Neo-Soul after a music-theory-reviewer P1 + P2 and renamed `HAT_DENSE_GENRES` → `HAT_SPINE_GENRES` since Ska-Punk's skank is offbeat-only, not dense.

---

## Part C — Design sessions (each maps to an Epic 12 story) — **DECIDED 2026-05-25**

All six C-items were decided in a single walkthrough session 2026-05-25. Story-level dispositions updated in `epic-followup-drain.md`.

- [x] **C1. Per-genre final-bar drum gestures** *(→ Epic 12 / S7 drum-gesture half)*
  Epic 2 S4 uses a universal snare-stinger for every genre's final bar. Jazz/Bossa might want a ride-bell + comping figure; other genres their own idiom.
  **Decision (2026-05-25):** **build per-genre final-bar drum gestures.** Owner confirms all genres currently end the same way, there's clear room for variation. Unblocks the deferred drum-gesture half of S7. Per-genre final-bar treatments to be designed across Jazz/Bossa/Country/Hip-Hop/Neo-Soul etc.

- [x] **C2. Per-genre intro/outro mute tuning** *(→ Epic 12 / S8)*
  Epic 2 S5 ships genre-flat `INTRO_MUTES = { bass: 2, chords: 3, harmony: 4 }`. Different genres layer in differently (a jazz intro vs a metal intro).
  **Decision (2026-05-25):** **defer — keep genre-flat for now.** Owner says intros feel natural across genres with the current app surface; revisit as part of a broader future composition-experience improvement, not as a follow-up.

- [x] **C3. Bossa/samba label split** *(→ Epic 12 / S8)*
  `bass.md` P2 #16 — the current single label conflates two distinct feels (bossa is laid-back, samba is driving).
  **Decision (2026-05-25):** **defer — keep strong Bossa identity for now.** Owner doesn't personally reach for samba; bossa-as-bossa works for current usage. Leaves room for a future Samba genre addition rather than a split. Preserves the option to add Samba as a new genre later without breaking existing Bossa presets.

- [x] **C4. Disco intensity-axis re-categorization** *(→ Epic 12 / S9 — disco half)*
  `drums.md` P2 #18 — Disco's 4-motif system is mis-categorized on the intensity axis; it's load-bearing for `synth-drums` velocity scaling so it needs care.
  **Decision (2026-05-25):** **fix it.** Diagnosis pass confirmed the audit: Motif 2 (syncopated interplay) and Motif 3 (Octave Cowbells) are gated behind `intensity > 0.7`, so the cowbell + ghost-snare + syncopated-hat texture is unreachable at verse-level intensity (~6% of high-intensity sections only). End-to-end wiring verified — Perc lane *is* iterated by the worker, Cowbell voices *are* in `KNOWN_SOUND_NAMES`, synth-drums.ts:2444 *does* play Cowbell. Bug is purely the motif-selection gate. Audit-recommended fix: collapse 4 motifs → 2 (foundation + busy), pick density on a non-intensity axis, keep velocity scaling intensity-driven. Shipping in-flight (musical-engine-implementer, 2026-05-25).

- [x] **C5. Sparse-vibe cell collapse + active-vibe ornament collision** *(→ Epic 12 / S9 — vibe-path half)*
  Epic 3 S2 — at sparse vibe the comping cell can collapse to near-silence; at active vibe an ornament can collide with the cell's own hit.
  **Decision (2026-05-25):** **no concern — close as decided-no-action.** "Vibe" is a derived tri-state (sparse|balanced|active) computed inside `accompaniment.ts:1296-1307` from `bandIntensity` + `complexity` + soloist-busy flags. Owner confirms vibe range feels usable end-to-end in normal testing — neither sparse-dropout nor active-collision audible in practice. If a regression surfaces at extremes, file as a fresh FOLLOWUPS entry; not preemptively fixing.

- [x] **C6. Ska-Punk shared-hook antiphony** *(→ Epic 12 / S10)*
  The `playShadowMode` Ska-Punk branch that echoes soloist hooks is dead — `sharedHookBuffer` is never populated. Making it work needs the soloist to emit a hook on phrases it wants harmony to echo.
  **Decision (2026-05-25):** **build it.** Owner finds the call-and-response horn-section idiom appealing; Epic 11 S9b already routed the buffer through `CoordinationContext`, so the remaining work is the soloist-side hook emission + harmony-side consumption gate. Unblocks S10.

---

## Logging a regression

If a Part A check fails, append a dated entry to the relevant `FOLLOWUPS.md` section (the engine area it regressed) with what you heard and the genre/setup that reproduces it — then it re-enters the normal `/cycle` flow.

**Last updated:** 2026-05-20 (created during the post-Epic-11 scoping pass).
