# Synth Audit Epics

Synthesized from the 2026-05-21 parallel synthesis-discovery review — six Opus reviewers, one per instrument voice plus one cross-cutting. Raw reports preserved untouched in `docs/synth-audit/{drums,bass,chords,harmony,soloist,shared}.md`.

This is a **separate track** from the musical audit (`docs/audit/`). It deliberately does not share `docs/audit/EPICS.md` because the two tracks differ on three axes:

- **Definition of Done.** The musical audit gates on critique tests (statistical ranges, an automated oracle). Synth sound design has no such oracle — this track gates on **listening through the A/B audition harness** (Epic 0 S1).
- **Agents.** This track uses an audio-DSP implementer and `synth-graph-reviewer` (Epic 0 S2), not `musical-engine-implementer` / `music-theory-reviewer`.
- **`docs/audit/EPICS.md` is live** (Epic 12 in flight) — mixing tracks would confuse phase logic.

## North star

A listener should think *"I can't believe there's nothing to download."* The core problem today: the app sounds **synthy/toy-ish**. Note that "synthy" and "toy-ish" are different problems — a great synth voice is legitimately synthetic *and* expensive. The goal is to kill toy-ish (a craft failure), not synthesis itself.

**Constraint:** the synthesized **core** stays 100% pure synthesis and under ~1 MB total bundle for instant load. Optional **packs** (a few MB, sample-based, possibly a paid "pro" upgrade) are Epic 6 and a separate workstream.

## How to use this doc

- **EPICS.md (this file)** = the tracker. One line per epic with status.
- **`docs/synth-audit/epic-<N>-<slug>.md`** = stories for that epic. Pick one up, ship it, audition it, mark it done in the epic file, update the count here.
- **`docs/synth-audit/<area>.md`** = the six raw discovery reports, untouched. New findings during work go back into the area file.

## Definition of Done (per story)

`implement` → `/review` (`synth-graph-reviewer` for audio-graph hygiene; `state-discipline-reviewer` if state slices change) → **A/B audition by the owner through the Epic 0 S1 harness** → `done`. The listening gate is non-negotiable — no story is done until it has been heard against the old voice and approved.

## Picking up in a new session

This track is **not** driven by `/cycle`, `/next`, `/implement`, or `/done` — those skills are wired to the musical-audit track (`docs/audit/`) and will pick a musical story, not a synth one. Run the synth audit by hand:

1. Read this file for the board; open the relevant `epic-<N>-<slug>.md` for the next story. A story with no **Status:** line is unshipped.
2. Implement it. For a per-instrument voice story, fill in the `play<X>New` function in the relevant `synth-*.ts` — **never touch `play<X>Current`** (it is the bit-identical original and the `current` toggle position).
3. Review the diff: `synth-graph-reviewer` for any synth/audio-graph change, `state-discipline-reviewer` if state slices changed.
4. **Listening gate** — the owner A/B-auditions the change through the per-instrument "New Sound" toggle before it ships. No story is done until heard.
5. Add a **Status:** line to the story, bump the tally in this file, commit (one commit per story).

**Current position:** Epic 0 complete (7/7, 2026-05-21). **Epic 1 (Harmony Voice Rebuild) complete (6/6, 2026-05-22)** — `playHarmonyNoteNew` rebuilt into a real voice: decoupled style/genreFeel, ADSR, named Horn Section + String Pad formant voices, bus character EQ, hygiene cleanup. Organ branch carried over untouched. **Epic 2 (Chords → Electric Piano) in progress (4/7, 2026-05-22)** — S1 strum-stagger (low→high roll); S2 two-part attack transient; S3 velocity-scaled bright-wave layer; S4 rebuilt the body as a 9-partial additive bank with per-partial decay (no more delegation for Piano). **Next: Epic 2 S5 (Inharmonicity)** — depends on S4's per-partial model; resume with `/synth-cycle`.

## The five cross-cutting themes

The same handful of root causes produced "toy-ish" across every voice. Epic 0 attacks the shared ones; the per-instrument epics apply them locally.

1. **Velocity drives loudness, never timbre.** Real instruments get *brighter* when hit harder, not just louder. Missing in chords, soloist, most percussion.
2. **No per-note variation.** Repeated notes are byte-identical in timbre. No shared humanization layer; what exists is scattered.
3. **Static sustains.** Timbre freezes once the attack settles. Real held notes breathe.
4. **Three dead-code features** — shipped but disabled: chord strum-stagger (`index:0`), soloist legato/portamento (`isLegato` hardcoded `false`), harmony `tremoloGain` (allocated, never connected).
5. **Shared-layer leverage.** FDN reverb, a glue compressor, and a humanization helper each lift *every* voice at once.

## Status (2026-05-21)

Foundation-first ordering: Epic 0 lands the A/B harness and shared infrastructure, then per-instrument epics fan out (each independently auditable through the harness). Per-instrument order follows the owner's listening triage: harmony and chords are the worst offenders, soloist is highest-risk, bass is closest to done.

| # | Epic | Stories | Done | Notes |
| :- | :- | :-: | :-: | :- |
| 0 | [Audio Foundation & A/B Harness](epic-0-foundation.md) | 7 | 7 | ✅ Complete. A/B harness, `synth-graph-reviewer`, typed audio graph, algorithmic reverb, chord de-burial, shared humanization + velocity→timbre helpers. Semi-manual. All 7 shipped 2026-05-21. |
| 1 | [Harmony Voice Rebuild](epic-1-harmony.md) | 6 | 6 | ✅ Complete. Generic soloist skeleton + style switch rebuilt into named formant voices (Horn Section, String Pad), real ADSR, bus EQ, hygiene. Organ branch left intact. All 6 shipped 2026-05-22. |
| 2 | [Chords → Electric Piano](epic-2-chords.md) | 7 | 4 | Buried by 3 mechanisms. Per-partial additive + inharmonicity + real transient → convincing electric piano. S1–S4 shipped 2026-05-22. |
| 3 | [Soloist Expressiveness](epic-3-soloist.md) | 7 | 0 | Highest-risk (most exposed). Frozen sustains, velocity→loudness-only, zero per-note variation. Wakes the dead legato path. |
| 4 | [Drums Polish](epic-4-drums.md) | 8 | 0 | Strongest voice already. Un-choke the hat, in-between positions, velocity→timbre on percussion. Includes one real bug: the panner leak. |
| 5 | [Bass Finishing](epic-5-bass.md) | 5 | 0 | Synthy-but-good — finishing, not a rebuild. Sub layer, velocity-driven saturation, animated growl cutoff. |
| 6 | [Pack Infrastructure & First Pack](epic-6-packs.md) | 6 | 0 | Sample-pack system + first pack. Needs instrument-source indirection + non-persisted entitlement. Last. |

**Total: 17 / 46 stories shipped.**

## The honest pack list

Across all six reports, only three things genuinely beat synthesis with samples: a **true acoustic grand piano**, **acoustic cymbals**, and a **string ensemble**. Everything else — bass, electric piano, horn stabs, organ, synth leads, drums — pure synthesis is the right call and can reach "expensive." Epic 6 builds the system and the first pack (acoustic grand); cymbals and strings are noted as later packs.

## Notes from synthesis

- The real audio graph lives in `engine.ts` `initAudio()`, not the `synth-*.ts` files. Reverb, a master limiter, a saturator, and per-instrument buses **already exist** — Epic 0 polishes an architecture rather than building one.
- "Chords get buried" is largely a *mix* problem, not a chord-voice problem — three independent mechanisms (lowest gain multiplier, a −2 dB cut in the chords' own 2.5 kHz presence band, polyphony attenuation) all push the same way. Epic 0 S5 fixes it; Epic 2 fixes the voice itself.
- Three audio-graph hygiene bugs surfaced in discovery and are folded into stories rather than left loose: the `StereoPannerNode` leak (Epic 4 S1), overpromised NaN guards (Epic 2 S7, Epic 5 S4), the unconnected `tremoloGain` (Epic 1 S6).
