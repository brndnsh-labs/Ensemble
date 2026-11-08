/**
 * Catalog of available sample packs (synth-audit Epic 6).
 *
 * Declarative, UI-facing list of packs the Sounds settings section can install,
 * remove, preview, and assign as an instrument's sound source. Each entry's
 * `id` matches the pack folder (`/packs/<id>/manifest.json`) and the
 * `pack:<id>` `InstrumentVoice` value. `instruments` lists which modules can
 * actually route through the pack today — only the instruments whose engine
 * seam plays the pack's samples (e.g. the grand piano routes the *chords*
 * voice via `playSampledChord`).
 *
 * Adding a pack here surfaces it in the Sounds section automatically; the
 * engine routing for a new instrument family lands alongside its first pack.
 */

import type { InstrumentModule } from '../types.js';
import { SOUND_LICENSES, type SoundCredit } from './sound-credits.js';

export interface SoundPack {
    /** Pack id — matches `/packs/<id>/` and the `pack:<id>` voice value. */
    readonly id: string;
    /** Human-facing name shown in the Sounds section and the source picker. */
    readonly name: string;
    /**
     * Who made the recordings, under what licence, and what we changed (#2113). The one
     * source of truth for Settings → Sound credits, the lane's short credit and the pack
     * folder's `CREDITS.txt`; every licence was checked at its source before it was recorded.
     */
    readonly credit: SoundCredit;
    /** Approximate download size, MB — shown before install. */
    readonly approxSizeMB: number;
    /** Instrument modules whose voice can route through this pack today. */
    readonly instruments: readonly InstrumentModule[];
    /**
     * Playback gain multiplier that lands the (loudness-normalized) samples at
     * the same seat as the synth voice they replace. Calibrated against the
     * synth baseline by `scripts/mix-report.ts --calibrate-pack <module>:<id>`
     * (RMS-match + a confirming listen). Defaults to `1` when omitted.
     */
    readonly gain?: number;
    /**
     * Multiplier on the lane's bus **reverb send** when this pack is the active
     * voice (#686). The send is otherwise a single per-instrument value identical
     * for synth and every pack — but the sources live in different rooms, so a
     * DI-dry pack (clavinet/Hammond) needs *more* hall to share the space and a
     * pack with baked-in ambience (the string ensemble, the drum kit) needs
     * *less* so it doesn't stack room-on-hall. `1` (or omitted) = the synth send,
     * unchanged. Multiplies the lane's reverb value (applied at init and on each
     * voice change via `syncBusReverbSend`). By-ear.
     */
    readonly reverbSend?: number;
    /**
     * Spectral **tilt** in dB applied to this pack's own playback path (#755) so
     * its brightness sits right through the bus EQ — which was authored around
     * the *synth* voice and is shared, unchanged, by every pack on the lane. A
     * sampled voice is `gainForPack`-matched in loudness but not in timbre (the
     * calibrator reports centroid deltas of hundreds of Hz: nylon reads dark,
     * the strings bright), so a dark pack lands at the right level but the wrong
     * brightness. One number: positive = brighter (high-shelf lift + low-shelf
     * cut), negative = darker; level-preserving by construction (±tilt/2 around
     * the pivot), so it shapes tone without re-opening the `gain` calibration.
     * Seeded from the calibrator's centroid Δ, then ear-locked. `0`/omitted = no
     * correction (the path is byte-identical to the un-tilted sampler).
     */
    readonly toneTiltDb?: number;
    /**
     * A sustaining instrument: a note held longer than its recording plays on, the recording
     * crossfaded into itself (#1532, `playSampledNote`'s `sustain`). For an organ, whose key
     * sounds for as long as it is down. Omitted for anything struck or plucked, whose note
     * should die away with its recording.
     */
    readonly sustains?: boolean;
    /**
     * Cache-bust revision for this pack's audio (#752). Pack files live at stable
     * `/packs/<id>/*` URLs served `CacheFirst` (correct while packs are add-only/
     * immutable). If a pack's audio is ever **re-encoded in place**, bump `rev`:
     * the loader appends `?v=<rev>` to the manifest + sample URLs, so the SW +
     * browser cache (keyed by full URL incl. query) miss and re-fetch. The token
     * MUST come from this bundled catalog — it's hash-busted on every deploy —
     * not from `manifest.json`, which is itself under `/packs/` and would go stale
     * too (chicken-and-egg). `1`/omitted = today's bare URLs, byte-identical, so
     * the rollout re-downloads nothing already cached.
     */
    readonly rev?: number;
}

export const SOUND_PACKS: readonly SoundPack[] = [
    {
        id: 'grand',
        name: 'Acoustic Grand Piano',
        credit: {
            sources: [
                {
                    work: 'Salamander Grand Piano V3',
                    author: 'Alexander Holm',
                    source: 'https://archive.org/details/SalamanderGrandPianoV3',
                    license: SOUND_LICENSES['CC-BY-3.0'],
                },
            ],
            changes: 'trimmed, converted to AAC',
        },
        approxSizeMB: 1.3,
        instruments: ['chords'],
        // Ear-locked 2026-06-22 (#656): grand at 8× seats it against the full band.
        // mix-report had the old 3.5× sitting ~13 dB under bass/drums/soloist
        // (buried); Brandon A/B'd 8× on ensembletest — present under the lead, not
        // poking. Paired with the synth chords' SYNTH_CHORD_LEVEL 0.85× trim.
        gain: 8,
    },
    {
        id: 'hammond-organ',
        name: 'Drawbar Organ',
        credit: {
            sources: [
                {
                    work: 'FreePats Drawbar Organ Emulation',
                    author: 'Roberto, for the FreePats project',
                    source: 'https://freepats.zenvoid.org/Organ/electric-organ.html',
                    license: SOUND_LICENSES['CC0-1.0'],
                },
            ],
            changes: 'trimmed with a tail fade, levelled, converted to AAC',
        },
        approxSizeMB: 0.8,
        instruments: ['chords'],
        // Calibrated 2026-06-22 (#663) via `mix-report --calibrate-pack=chords:hammond-organ`.
        // Sustained tonewheel tone (no Leslie baked in — the app adds its own
        // movement); loudnorm-leveled across zones. mix-report RMS-match to the
        // synth chords baseline was 6.62× (pack sat 16.4 dB under raw); the organ is
        // a touch darker (−82 Hz centroid → reads slightly quieter than its RMS), so
        // seated at the match: 6.6×. Confirm/nudge by ear on ensembletest (reggae
        // bubble / blues / gospel). Paired with SYNTH_CHORD_LEVEL.
        gain: 6.6,
        // DI-dry tonewheel emulation (no recorded room) — push the send up so it
        // shares the band's space instead of sitting flat up front. #686 start.
        reverbSend: 1.5,
        // The band holds an organ chord for bars; the recordings are four seconds (#1532).
        sustains: true,
    },
    {
        id: 'clavinet',
        name: 'Clavinet',
        credit: {
            sources: [
                {
                    work: 'GeneralUser GS (Clavinet)',
                    author: 'S. Christian Collins',
                    source: 'https://www.schristiancollins.com/generaluser.php',
                    license: SOUND_LICENSES['GeneralUser-GS'],
                },
            ],
            changes:
                'extracted from the SoundFont, loop rendered out, levelled, converted to AAC, retuned',
        },
        approxSizeMB: 0.2,
        instruments: ['chords'],
        // Re-calibrated 2026-11-07 (#2116) via `mix:report --calibrate-pack=chords:clavinet`.
        // The 8 GeneralUser GS zones are loop-sustain samples (0.35-0.74 s); they used to play
        // one-shot and stop mid-ring, so the loop is now rendered out to a 2.2 s natural decay
        // (recipe: docs/guides/sample-pack-sourcing.md). Zones are leveled by static gain, not
        // loudnorm. A longer ring raises the pack's RMS, but the catalog still sat 4.49 dB under
        // the synth (rock/blues/jazz/funk: 3.86/4.82/5.24/4.04 dB): RMS-match 7.55x. Seated under
        // the match at 6.5x (-1.3 dB), as the old 4.5x sat 1.2 dB under its 5.14x match: the clav
        // is brighter (+419 Hz) and transient, so it reads louder than its RMS. NOTE: the manifest
        // roots are FRACTIONAL on purpose, the SF2 samples carry per-zone pitch-correction (mostly
        // ~+30 cents flat, plus B1 -12 / F#2 +3), baked into
        // `rootMidi = originalPitch - cents/100` so the seam's playbackRate tunes each zone
        // true. Don't round them to ints. Confirm/nudge by ear on ensembletest (funk).
        // Paired with SYNTH_CHORD_LEVEL.
        gain: 6.5,
        // Bone-dry DI pluck — the driest pack; lift the send most so it doesn't
        // read pasted-on-top of the band. #686 start.
        reverbSend: 1.6,
    },
    {
        id: 'rhodes',
        name: 'Electric Piano (Rhodes)',
        credit: {
            sources: [
                {
                    work: 'jRhodes3c',
                    author: 'Jeff Learman',
                    source: 'https://github.com/sfzinstruments/jlearman.jRhodes3c',
                    license: SOUND_LICENSES['CC-BY-NC-SA-4.0'],
                },
            ],
            changes: 'trimmed with a tail fade, levelled, converted to AAC',
        },
        approxSizeMB: 0.8,
        instruments: ['chords'],
        // Calibrated 2026-06-23 (#655) via `mix-report --calibrate-pack=chords:rhodes`:
        // pack sat 13.1 dB under the synth chords across rock/blues/jazz/funk
        // (RMS-match = 4.5×). The Rhodes is markedly darker than the synth chords
        // (−287 Hz centroid → reads slightly quieter than its RMS), so seated AT
        // the match (a percussive/bright voice would seat under, cf. clavinet) and
        // it may want a small nudge UP on the listen. Tine electric piano with a
        // natural per-note decay (no loop — the looped source clips were
        // tail-faded, so a chord held longer than the sample decays out rather
        // than cutting hard). 15 zones F1–C7, kept STEREO on purpose: jRhodes3c
        // bakes a mid-side doubling-chorus that *cancels to mono*, so a mono
        // downmix would strip the shimmer that defines the tone. Source zones were
        // loudnorm-leveled (uneven raw peaks) before AAC. Confirm/nudge by ear on
        // ensembletest (neo-soul comp / hip-hop keys / jazz Rhodes).
        gain: 4.5,
        // DI-ish electric piano (only the baked chorus for width, no recorded
        // room) — lift the send like the other dry keys (hammond/clav) so it
        // shares the band's space. By-ear start. #686-style.
        reverbSend: 1.4,
    },
    {
        id: 'sax-alto',
        name: 'Alto Saxophone',
        credit: {
            sources: [
                {
                    work: 'Weresax (alto saxophone)',
                    author: 'Karoryfer Samples',
                    source: 'https://github.com/sfzinstruments/karoryfer.weresax',
                    license: SOUND_LICENSES['CC0-1.0'],
                },
            ],
            changes: 'trimmed, converted to AAC',
        },
        approxSizeMB: 0.7,
        instruments: ['soloist'],
        // Calibrated 2026-06-22 (#658) via `mix-report --calibrate-pack=soloist:sax-alto`:
        // RMS-match to the synth soloist (the lead seat) was 3.43×, but the sax is
        // ~677 Hz brighter than the synth trumpet (reads louder than its RMS), so
        // seated a touch under at 3.0×. Starting point — confirm by ear on ensembletest.
        gain: 3,
        // Tone tilt (#755): the sax reads ~677 Hz brighter than the synth trumpet
        // on the shared soloist bus, so a gentle darkening seats its timbre.
        // Seeded from the centroid Δ, ear-locked 2026-06-23 on ensembletest.
        toneTiltDb: -1.5,
        // Close-mic'd horn, fairly dry — a small lift to seat the lead in the room. #686 start.
        reverbSend: 1.2,
    },
    {
        id: 'nylon-guitar',
        name: 'Nylon Guitar',
        credit: {
            sources: [
                {
                    work: 'FreePats Spanish Classical Guitar',
                    author: 'Roberto, for the FreePats project',
                    source: 'https://freepats.zenvoid.org/Guitar/acoustic-guitar.html',
                    license: SOUND_LICENSES['CC0-1.0'],
                },
            ],
            changes: 'trimmed, mixed to mono, converted to AAC',
        },
        approxSizeMB: 0.6,
        instruments: ['soloist', 'chords'],
        // Calibrated 2026-06-23 (#659) via `mix-report --calibrate-pack=soloist:nylon-guitar`:
        // pack sat 12.0 dB under the synth lead across rock/blues/jazz/funk
        // (RMS-match = 4.0×). The nylon is markedly darker than the synth lead
        // (−820 Hz centroid → reads quieter than its RMS), so it read low/back even
        // at the match — Brandon's ear 2026-06-23: bumped to 5× (~+2 dB over the
        // match, the expected over-match for a dark voice) to sit it higher in the
        // full mix. (If it still needs to *cut* rather than just sit louder, the
        // next lever is a baked ~3 kHz presence lift — held off to keep the tone.)
        // Plucked single-note lead
        // — natural per-note decay (no loop), 19 mono zones C3–C6 every 2 semitones
        // (denser than the sax's every-3: plucked transients pitch-shift more
        // audibly than a sustained horn). Source was already peak-even across notes
        // (~−0.1 dB), so left un-loudnorm'd to avoid pumping up the recording's
        // noise-floor tail. Confirm/nudge by ear on ensembletest (bossa / acoustic
        // / country lead lines).
        gain: 5,
        // Tone tilt (#755): this is the "~3 kHz presence lift held off to keep the
        // tone" the gain note above anticipated — the nylon reads ~820 Hz darker
        // than the synth lead, so a modest brightening lets it cut rather than only
        // sit louder. Kept gentle to preserve the warm fingerstyle body. Seeded
        // from the centroid Δ, ear-locked 2026-06-23 on ensembletest. (Brightening
        // first exposed an upward-pitch-shift ring on the soloist's top notes; that
        // is fixed at the source by foldToSampledCeiling, so +2 is artifact-free.)
        toneTiltDb: 2,
        // Close-mic'd, dry-ish room (FreePats home recording). Started at 1.3 (a
        // sax-like lift), but reverb pushes a lead back/down — pulled to 1.0 (the
        // synth send, unchanged) to bring the nylon *forward* in the mix without
        // adding loudness. Brandon's ear 2026-06-23. #686-style.
        reverbSend: 1.0,
    },
    {
        id: 'electric-guitar-clean',
        name: 'Electric Guitar (Clean)',
        credit: {
            sources: [
                {
                    work: 'FSBS Electric Guitar Clean #1 (small)',
                    author: 'FreePats project',
                    source: 'https://freepats.zenvoid.org/ElectricGuitar/clean-electric-guitar.html',
                    license: SOUND_LICENSES['CC0-1.0'],
                },
            ],
            changes: 'trimmed with a tail fade, mixed to mono, converted to AAC',
        },
        approxSizeMB: 0.7,
        // Also a rhythm guitar: the band engine comps on it with fretboard grips and strums
        // (band/players/comp/). Its gain was calibrated on the soloist bus; unverified on
        // the chords bus until an ear pass.
        instruments: ['soloist', 'chords'],
        // Calibrated 2026-06-23 (#740) via `mix-report --calibrate-pack=soloist:electric-guitar-clean`:
        // pack sat 9.7 dB under the synth lead (RMS-match = 3.0×). Centroid is
        // essentially matched (−52 Hz — unlike the dark nylon's −820 Hz), so the
        // RMS-match is trustworthy and no dark-voice over-match is needed: seated AT
        // the match, 3×. Confirm/nudge by ear on ensembletest.
        // Sustained single-coil lead — looped source (loop_continuous), so the
        // clips were tail-faded for the one-shot seam (a long held note decays out
        // rather than ringing forever). 13 zones C2–C#6 at the FreePats author's
        // own key ranges (~major-third spacing — sustain masks the modest pitch-shift
        // between zones, unlike the plucked nylon's denser every-2). Mono (single-
        // note lead, halves size); source peaked at 0 dBFS so backed off −1 dB for
        // AAC true-peak headroom (gain compensates). PROOF OF CONCEPT (#740) for the
        // electric-lead family: same samples feed the driven-tone v2 (#741) and can
        // serve the chords lane (clean comp, #698) by adding 'chords' here. Manual-
        // select for now — genre Auto-map seats are a by-ear call after the listen.
        gain: 3,
        // Clean amp/FX-rack tone, fairly dry — a small lift like the sax/nylon to
        // seat the lead in the band's space. By-ear start. #686-style.
        reverbSend: 1.1,
    },
    {
        id: 'electric-guitar-driven',
        name: 'Electric Guitar (Driven)',
        credit: {
            sources: [
                {
                    work: 'FSBS Electric Guitar Clean #1 (small)',
                    author: 'FreePats project',
                    source: 'https://freepats.zenvoid.org/ElectricGuitar/clean-electric-guitar.html',
                    license: SOUND_LICENSES['CC0-1.0'],
                },
            ],
            changes:
                'trimmed with a tail fade, mixed to mono, converted to AAC, + overdrive and cabinet voicing',
        },
        approxSizeMB: 0.7,
        instruments: ['soloist'],
        // Same 13 source zones as the clean electric (#740), re-voiced through an
        // OFFLINE amp sim (data-only, no engine code): tanh soft-clip drive (×4,
        // even-harmonic asymmetry for tube warmth) → cabinet EQ. Pitch-preserving
        // (waveshaping); the drive measurably enriches the upper harmonics. The
        // honest limit: drive + sustain approximate a lead tone but bends/vibrato
        // still aren't in the samples (the real "screaming lead" unlock is
        // soloist-engine pitch expression, separate).
        // CABINET VOICING — warmed 2026-06-23 after Brandon's ear ("a little
        // brittle"): the first cut (5.2k low-pass, +4 dB presence at 2.6k, low-mid
        // scoop) read thin/edgy. Now: darker 4.0k low-pass (real-cab roll-off, less
        // fizz), a +2.5 dB BODY bump at 450 Hz (was a scoop — that was the missing
        // warmth), and only a gentle +1.5 dB presence at 2.4k (cut without glass).
        // Flipped the centroid from +353 Hz (bright) to −159 Hz (warmer than synth).
        // DRIVE (×4) is the #1 by-ear knob — push to 5–6 for more grit, down to 3 for
        // a bluesy edge; re-bake from the clean source to retune. Manual-select PoC —
        // genre seat (Rock the intended target) decided by ear after the listen.
        // Calibrated via `mix-report --calibrate-pack=soloist:electric-guitar-driven`:
        // the warm re-voice rolled off HF energy so it sits 5.6 dB under the synth
        // lead (RMS-match = 3.4×, up from the bright cut's 1.9×); slightly darker
        // now (−159 Hz) so seated AT the match, 3.4×. Ear-lock on test.
        gain: 3.4,
        // Amp-sim tone, no recorded room — a lead-guitar lift to seat it in the
        // band's space. By-ear start. #686-style.
        reverbSend: 1.2,
    },
    {
        id: 'electric-guitar-rhythm',
        name: 'Rhythm Electric (Crunch)',
        credit: {
            sources: [
                {
                    work: 'FSBS Electric Guitar Clean #1 (small)',
                    author: 'FreePats project',
                    source: 'https://freepats.zenvoid.org/ElectricGuitar/clean-electric-guitar.html',
                    license: SOUND_LICENSES['CC0-1.0'],
                },
            ],
            changes:
                'trimmed with a tail fade, mixed to mono, converted to AAC, + overdrive and cabinet voicing',
        },
        approxSizeMB: 0.7,
        instruments: ['chords'],
        // Rhythm-guitar CHORDS voice (#698). Same 13 crunch zones as the driven
        // LEAD pack (electric-guitar-driven) — a distinct catalog id so the chord
        // seat calibrates independently of the lead seat (`gain`/`reverbSend` are
        // per-pack-id). The old chords engine reduced its voicings to POWER CHORDS
        // (root+5+oct) when this voice was active (`applyPowerChordVoicing`, behind a
        // `tick-logic.ts` gate, both deleted); the band's Metal comp plays them now
        // (`band/styles/metal.ts`). Distorted triads mud up (the
        // thirds clash under drive), which is the whole reason a guitar plays
        // power chords.
        // GAIN calibrated 2026-07-01 via `mix-report --calibrate-pack=chords:electric-guitar-rhythm`
        // (RMS-match to the synth chords baseline). Suggested 4.157× (mean Δ 0.33
        // dB across rock/blues/jazz/funk); seated at 4.2×. The pack reads +481 Hz
        // brighter than the synth chords — a candidate darkening `toneTiltDb`, left
        // for the ear-lock on ensembletest. Ear-lock on ensembletest.
        gain: 4.2,
        // Amp-sim tone, no recorded room — lift the send so it shares the band's
        // space (mirrors the driven lead). By-ear start.
        reverbSend: 1.2,
        // A re-voice for a tighter, more mid-focused RHYTHM crunch (the shared
        // zones are voiced for a LEAD) is a by-ear follow-up — re-bake from the
        // clean source like the driven lead. This first cut reuses the lead crunch.
    },
    {
        id: 'acoustic-kit',
        name: 'Acoustic Drum Kit',
        credit: {
            sources: [
                {
                    work: 'VCSL (Versilian Community Sample Library)',
                    author: 'Versilian Studios',
                    source: 'https://github.com/sgossner/VCSL',
                    license: SOUND_LICENSES['CC0-1.0'],
                },
                {
                    work: 'Virtuosity Drums',
                    author: 'Versilian Studios and Karoryfer Samples',
                    source: 'https://github.com/sfzinstruments/virtuosity_drums',
                    license: SOUND_LICENSES['CC0-1.0'],
                },
            ],
            changes:
                'trimmed, levelled, mixed to mono, converted to AAC; the mid tom is the high tom pitched down',
        },
        approxSizeMB: 1.5,
        instruments: ['groove'],
        // First sampled *percussion* pack — keys by articulation, not pitch, and
        // plays each hit at native rate through `playSampledStrike` (#662). The kit
        // covers kick/snare/sidestick, the hi-hat family (closed/open/pedal),
        // ride+bell/crash, toms and shaker: every articulation `drumArticulationKey`
        // can return and no other (`rev` 2, #1651, dropped four that nothing could
        // trigger). Three toms, high/mid/low (`rev` 3, #1998): the sources carry two,
        // ~4 semitones apart (high ~107 Hz, low ~85 Hz), so `tom-mid` is the high
        // tom's takes resampled 2 semitones down (~95 Hz, a slightly longer ring, as
        // a bigger drum has). Deterministic round-robin (#657) over each articulation's takes
        // keeps repeated hits from machine-gunning. Calibrated 2026-06-22 (#662)
        // via `mix-report --calibrate-pack=groove:acoustic-kit`: pack sat ~4 dB
        // under the synth drum stem (RMS-match = 1.59×). Drums are the rhythmic
        // foundation and the synth stem is the right reference (unlike the grand,
        // which was buried under the band → 8×), so seated at the match: 1.6×.
        // Confirm by ear on ensembletest across rock/funk/jazz/blues.
        gain: 1.6,
        rev: 3,
        // Kit carries overhead/room — pull the send back so the drums stay tight
        // and don't wash the pocket with hall-on-room. #686 start.
        reverbSend: 0.7,
    },
    {
        id: 'upright-bass',
        name: 'Upright Bass',
        credit: {
            sources: [
                {
                    work: 'VSCO-2 Community Edition (Solo Contrabass, pizzicato)',
                    author: 'Versilian Studios',
                    source: 'https://github.com/sgossner/VSCO-2-CE',
                    license: SOUND_LICENSES['CC0-1.0'],
                },
            ],
            changes: 'trimmed, levelled, mixed to mono, converted to AAC, retuned',
        },
        approxSizeMB: 0.2,
        instruments: ['bass'],
        // First sampled pack on the BASS lane (#697) — plays the nearest of 8
        // pizz zones (MIDI 28–52, every 3–4 semitones) through `playSampledBass`
        // → `playSampledNote`, inheriting the bass bus EQ / reverb send / kick
        // sidechain-duck. The seam doesn't model continuous bends or the synth's
        // mute-morph (accepted tradeoff for a real upright; muted notes just
        // attenuate). Zone roots are the *measured* fractional fundamental (FFT +
        // YIN + harmonic-template), not VSCO's unreliable filename octaves — and
        // NOT rounded to the nearest integer note. Rounding discarded up to ±50c
        // of each sample's true pitch, which `pitchRatio` then baked in as constant
        // per-zone detuning (zones 31/42/45 read −12/+23/+18c — audibly off while
        // the rest sang). The fractional roots in the manifest cancel that. If a
        // re-measure or re-sample lands a zone back on an integer, suspect this.
        // Re-measured over the first 400 ms after the pluck (#1575): a pizzicato
        // note drifts as it rings, and the band's bass notes are heard in that first
        // stretch, where #754's whole-sample roots played zone 42 43 cents flat and
        // zone 45 16 sharp. Zone 42 is flatter still in its first 200 ms, so its
        // root sits between what a short funk note and a walking quarter read
        // (−8 and +7 cents). Zones 34 and 38 moved 4 cents the same way. Measured
        // with `mix:verify`'s TUNING readout; `rev` 2 refreshes the manifest on
        // devices that hold the pack.
        // Source is loudnorm-leveled (VSCO is quiet) + mono. Calibrated 2026-06-22
        // (#697) via `mix:report --calibrate-pack=bass:upright-bass`: pack sat
        // 3.2 dB under the synth bass across rock/blues/jazz/funk (RMS-match =
        // 1.45×). Bass is the foundation, so the synth bass stem is the right
        // reference (like the drum kit, unlike the buried grand). The upright is
        // a touch darker (−72 Hz centroid → reads slightly quieter than its RMS),
        // so seated just over the match at 1.5×. Confirm/nudge by ear on
        // ensembletest (jazz walking / bossa / blues).
        gain: 1.5,
        rev: 2,
        // Close-mic'd DI-ish pizz, fairly dry — a small lift to seat it in the
        // room without washing out the low end. #686-style start; tune by ear.
        reverbSend: 0.6,
    },
    {
        id: 'electric-bass-jazz',
        name: 'Electric Bass (Jazz Bass)',
        credit: {
            sources: [
                {
                    work: 'Growlybass (Squier Jazz Bass)',
                    author: 'Karoryfer Lecolds',
                    source: 'https://github.com/sfzinstruments/karoryfer.growlybass',
                    license: SOUND_LICENSES['CC0-1.0'],
                },
            ],
            changes:
                'one velocity layer kept, trimmed, attack peaks limited, levelled, converted to AAC, retuned',
        },
        approxSizeMB: 0.9,
        instruments: ['bass'],
        // An electric bass for the 8 styles the upright doesn't suit (#2001). One of two
        // candidates; Brandon's A/B found it harsh beside the fingered one, so it is
        // manual-select and the fingered pack is the Auto bass. Recorded direct,
        // both pickups and every knob up, so its body sits at 200–400 Hz (the fingered
        // Washburn's sits near 100 Hz): it reaches a tablet speaker through its overtones,
        // the reason the issue exists. 12 mono zones from the third of four velocity layers
        // (`f`, round robin 1), MIDI 25–57 every 3 semitones (one 2), each a full 6 s
        // recording with its natural decay and a 0.4 s fade. Karoryfer's filenames sit an
        // octave above the sounding pitch ("e2" is E1 = 28). Roots measured over the 400 ms
        // after the attack, re-measured on the encoded files. Zones levelled with a static
        // gain each (not loudnorm, which is dynamic and would flatten the decay), after a
        // look-ahead limiter held each pluck's spike to 15 dB over the note's RMS (it rose
        // 23 dB over it, which would have left the pack 8 dB quieter). Its staccato takes
        // wait for #2000's articulation format. Decodes to 13.8 MB at 48 kHz.
        // Calibrated 2026-11-07 via `mix:report --calibrate-pack=bass:electric-bass-jazz`:
        // 13.2 dB under the synth bass at 1× (RMS-match 4.56×). Seated where the upright sits
        // against the synth (3.4 dB under it, the upright's own calibration at 1.5×), so the
        // band's bass level doesn't jump between a jazz chart and a rock one: 4.56 × 0.68 ≈
        // 3.1×. In the loudness scenes the bass then sits 4.4–8.3 dB under the whole band,
        // where the upright sits in jazz (6.5 dB); through a tablet-speaker stand-in (high-pass
        // 150 Hz, 2nd order) 4.8–9.8 dB under it, against the synth bass's 7.3–15.3 and the
        // upright's 14.3. Confirm by ear on ensembletest.
        gain: 3.1,
        // Direct-recorded, no room: a small lift like the upright's. By-ear start.
        reverbSend: 0.6,
    },
    {
        id: 'electric-bass-fingered',
        name: 'Electric Bass (Fingered)',
        credit: {
            sources: [
                {
                    work: 'Black And Blue Basses (darkblack, Washburn AB-95)',
                    author: 'Drogomir Smolken (Karoryfer Samples)',
                    source: 'https://github.com/sfzinstruments/karoryfer.black-and-blue-basses',
                    license: SOUND_LICENSES['CC0-1.0'],
                },
            ],
            changes:
                'one velocity layer kept, trimmed, the pre-note noise cut, levelled, converted to AAC, retuned',
        },
        approxSizeMB: 0.7,
        instruments: ['bass'],
        // The Auto bass for the 8 electric styles (#2001, Brandon's pick by ear over the Jazz
        // Bass: it sits in the mix): a 5-string played with the fingers on the neck pickup, a
        // warm, round tone. 12 mono zones from the third of
        // four layers (`mf`, round robin 1), MIDI 23–56 every 3 semitones, the low B string
        // included, each its full 5 s recording with a 0.4 s fade. The source's ~25 ms of
        // pre-note noise is cut so notes land on time. Filenames sit an octave above the
        // sounding pitch ("b1" is B0 = 23). Its staccato and ghost takes wait for #2000's
        // articulation format. Decodes to 11.5 MB at 48 kHz.
        // Calibrated 2026-11-07 via `mix:report --calibrate-pack=bass:electric-bass-fingered`:
        // 12.5 dB under the synth bass at 1× (RMS-match 4.23×), centroid matched (+48 Hz).
        // Seated as the Jazz Bass is, 3.4 dB under the match: 2.9×. Through the tablet-speaker
        // stand-in it reads 0.8–1.7 dB under the Jazz Bass at the same full-range level.
        gain: 2.9,
        reverbSend: 0.6,
    },
];

/** The packs that can serve as a source for `module`, in catalog order. */
export function packsForInstrument(module: InstrumentModule): readonly SoundPack[] {
    return SOUND_PACKS.filter((pack) => pack.instruments.includes(module));
}

/**
 * The playback gain for a pack id — the calibrated lift that sits its samples
 * at the synth voice's level. Unknown id or no calibrated value → `1` (no lift),
 * so a freshly-added pack plays at its raw sample level until calibrated.
 */
export function gainForPack(packId: string): number {
    const pack = SOUND_PACKS.find((entry) => entry.id === packId);
    return pack?.gain ?? 1;
}

/**
 * The reverb-send multiplier for a pack id (#686) — scales the lane's bus reverb
 * send so a DI-dry pack gets more hall and a baked-ambience pack gets less, all
 * sitting in one shared room. `null`/unknown id (i.e. the synth voice) → `1`, so
 * the synth send is unchanged and a freshly-added pack defaults to no change.
 */
export function reverbSendForPack(packId: string | null): number {
    if (!packId) {
        return 1;
    }
    const pack = SOUND_PACKS.find((entry) => entry.id === packId);
    return pack?.reverbSend ?? 1;
}

/**
 * The tone-correction tilt (dB) for a pack id (#755) — the per-pack brightness
 * trim that sits its samples right through the synth-authored bus EQ. `0` for a
 * `null`/unknown id (the synth voice) or an un-tuned pack, so the synth path and
 * any freshly-added pack are unfiltered until a tilt is calibrated and ear-locked.
 */
export function toneTiltForPack(packId: string | null): number {
    if (!packId) {
        return 0;
    }
    const pack = SOUND_PACKS.find((entry) => entry.id === packId);
    return pack?.toneTiltDb ?? 0;
}

/** Whether a pack is a sustaining instrument (`SoundPack.sustains`, #1532). */
export function packSustains(packId: string | null): boolean {
    return SOUND_PACKS.find((entry) => entry.id === packId)?.sustains === true;
}

/**
 * The cache-bust revision for a pack id (#752) — bumped when a pack's audio is
 * re-encoded in place so the loader's `?v=<rev>` token forces a cache miss.
 * Unknown id or unset → `1` (today's bare URLs, byte-identical — no re-download).
 */
export function revForPack(packId: string): number {
    const pack = SOUND_PACKS.find((entry) => entry.id === packId);
    return pack?.rev ?? 1;
}
