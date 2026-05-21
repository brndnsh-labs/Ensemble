# Epic 6: Pack Infrastructure & First Pack

## Why this epic exists

Three things genuinely beat synthesis with samples: a **true acoustic grand piano**, **acoustic cymbals**, and a **string ensemble**. The synthesized core (Epics 1–5) keeps the app instant-loading and under ~1 MB. Packs are the opt-in ceiling-raiser: a few MB each, lazy-loaded, PWA-cached after first install — and a plausible place to draw a paid "pro" upgrade line.

This epic is **last** on purpose: packs are upside, not a crutch. The core synthesized voices must carry the app on their own first. It also depends on real infrastructure that does not exist today — there is no `decodeAudioData` path anywhere in the codebase.

## Source findings

`shared.md` §6. `chords.md` §4, `harmony.md` §4, `drums.md` §4 (the pack candidate list).

## Stories

### S1. Instrument-source indirection registry
Synthesis selection is hardcoded today (`scheduleChords` hardcodes `instrument || 'Piano'`; `INSTRUMENT_PRESETS` is a static export). Build an instrument registry: each voice resolves to either a synth function *or* a sample buffer, decided at resolution time. This is the seam that makes graceful synth-fallback clean when a pack isn't installed.

**Acceptance:** every instrument routes through the registry; with no packs installed, output is bit-identical to pre-epic (synth path). `npm run typecheck` green.
**Effort:** ~6h. **Model:** opus (architecture). **Reviewer:** synth-graph-reviewer + state-discipline-reviewer. **Source:** `shared.md` §6 blocker 1.

### S2. Non-persisted entitlement service
Packs may be a paid upgrade. Add an entitlement check the registry and loader consult. **It must NOT live in persisted or shareable state** — a share URL must not be able to leak or forge entitlements. A separate non-persisted service/slice.

**Acceptance:** entitlement state exists, is readable by the registry, and is provably absent from persisted state and share URLs. `state-discipline-reviewer` confirms.
**Effort:** ~4h. **Model:** opus (state-boundary design). **Reviewer:** state-discipline-reviewer. **Source:** `shared.md` §6 blocker 2.

### S3. Sample loader + decode + cache
New `sample-loader.ts`: `fetch → arrayBuffer → audioContext.decodeAudioData`, results cached in an `AudioBuffer` map (the `groove.audioBuffers` slot is documented for this). Decode after `initAudio()`. Lazy — only loads a pack on demand. Fail-fast on malformed pack payloads.

**Acceptance:** a pack of test buffers loads, decodes, caches, and is retrievable; loading is lazy and non-blocking; a malformed pack fails loudly.
**Effort:** ~5h. **Model:** opus (loader design). **Reviewer:** synth-graph-reviewer. **Source:** `shared.md` §6.

### S4. PWA runtime-cache rule for packs
Add a service-worker runtime-cache rule for pack asset URLs, separate from the precached <1 MB core bundle. Packs persist in Cache Storage after first install; the core's instant-load guarantee is untouched.

**Acceptance:** a downloaded pack survives reload offline; the core bundle precache is unchanged and still <1 MB.
**Effort:** ~3h. **Model:** sonnet (workbox rule, concrete). **Reviewer:** none (build config). **Source:** `shared.md` §6.

### S5. `playSampledNote` helper for pitched instruments
Sampled drums can reuse `playPercussiveStrike` (it already takes an `AudioBuffer`). Pitched instruments need a new `playSampledNote` — `playbackRate`-based pitch-shift from a root-note buffer (or multi-sampled zones), connecting to the existing `[name]Gain` bus so it inherits EQ, reverb send, and limiting.

**Acceptance:** a pitched sampled instrument plays in tune across its range through the normal bus chain.
**Effort:** ~4h. **Model:** opus (pitch-shift + zone design). **Reviewer:** synth-graph-reviewer. **Source:** `shared.md` §6.

### S6. First pack — acoustic grand piano
Build the first real pack: a multi-velocity, multi-key sampled acoustic grand, compressed to a few MB, wired through the registry as a chord-voice option with the synthesized electric piano (Epic 2) as the entitlement/availability fallback.

**Acceptance:** the acoustic grand pack installs, loads lazily, plays through the chord bus, and falls back to the synth voice when absent. Pack size within "a few MB." A/B against the synth voice — the pack is audibly worth it.
**Effort:** ~8h+ (includes sample sourcing/prep). **Model:** opus. **Reviewer:** synth-graph-reviewer. **Source:** `chords.md` §4.

## Notes

- S1 → S2 → (S3, S5) → S6 is the natural order; S4 is independent build config.
- After S6, the **acoustic cymbal** pack (`drums.md` §4) and **string ensemble** pack (`harmony.md` §4) reuse the same infrastructure — file them as follow-on stories once the first pack proves the system.
- Keep the core synth voices as the permanent fallback for every pack — the app must always work instantly with nothing downloaded.
