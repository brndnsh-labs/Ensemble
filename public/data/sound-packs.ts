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

export interface SoundPack {
    /** Pack id — matches `/packs/<id>/` and the `pack:<id>` voice value. */
    readonly id: string;
    /** Human-facing name shown in the Sounds section and the source picker. */
    readonly name: string;
    /** Short description / character note. */
    readonly description: string;
    /** License / credit line for the sampled source. */
    readonly attribution: string;
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
}

export const SOUND_PACKS: readonly SoundPack[] = [
    {
        id: 'grand',
        name: 'Acoustic Grand Piano',
        description: 'A sampled Yamaha C5 grand — warm, real piano body for the chords.',
        attribution: 'Salamander Grand Piano (Yamaha C5) by Alexander Holm — CC-BY 3.0',
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
        description:
            'A sampled drawbar organ — warm tonewheel keys for reggae bubble, blues, gospel.',
        attribution: 'FreePats Drawbar Organ Emulation (setBfree) — CC0 1.0 (public domain)',
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
    },
    {
        id: 'clavinet',
        name: 'Clavinet',
        description: 'A sampled clavinet — bright, percussive funk keys for the chords.',
        attribution: 'GeneralUser GS by S. Christian Collins — permissive (host-your-own-copy)',
        approxSizeMB: 0.1,
        instruments: ['chords'],
        // Calibrated 2026-06-22 (#664) via `mix-report --calibrate-pack=chords:clavinet`.
        // Percussive plucked tone (short natural decay, no loop); loudnorm-leveled
        // across the 8 zones. NOTE: the manifest roots are FRACTIONAL on purpose —
        // the SF2 samples carry per-zone pitch-correction (mostly ~+30 cents flat,
        // plus B1 −12 / F#2 +3), baked into `rootMidi = originalPitch − cents/100`
        // so the seam's playbackRate tunes each zone true. Don't round them to ints.
        // mix-report RMS-match was 5.14× (pack sat 14.2 dB under
        // raw), but the clavinet is brighter (+193 Hz) and transient (high
        // peak-to-RMS → reads louder than its RMS), so seated under the match: 4.5×.
        // Confirm/nudge by ear on ensembletest (funk). Paired with SYNTH_CHORD_LEVEL.
        gain: 4.5,
    },
    {
        id: 'sax-alto',
        name: 'Alto Saxophone',
        description: 'A sampled alto sax — a real horn lead for the soloist.',
        attribution: 'Karoryfer Weresax (alto sax) — CC0 1.0 (public domain)',
        approxSizeMB: 0.7,
        instruments: ['soloist'],
        // Calibrated 2026-06-22 (#658) via `mix-report --calibrate-pack=soloist:sax-alto`:
        // RMS-match to the synth soloist (the lead seat) was 3.43×, but the sax is
        // ~677 Hz brighter than the synth trumpet (reads louder than its RMS), so
        // seated a touch under at 3.0×. Starting point — confirm by ear on ensembletest.
        gain: 3,
    },
    {
        id: 'strings-ensemble',
        name: 'String Ensemble',
        description: 'A sampled violin-ensemble pad — real sustained strings for the harmony.',
        attribution:
            'VSCO-2 Community Edition (Violin Ensemble, sustain) by Versilian Studios — CC0 1.0 (public domain)',
        approxSizeMB: 0.5,
        instruments: ['harmony'],
        // Calibrated 2026-06-22 (#660) via `mix-report --calibrate-pack=harmony:strings-ensemble`:
        // RMS-match to the synth pad is 5.7×. The ensemble is markedly brighter than
        // the synth pad (+1029 Hz mean centroid — reads louder than its RMS), so
        // seated a touch under the match at 5× (the tool flags "trust the listen
        // pass" for cross-timbre balance). Plays above unity — the seam passes this
        // straight to playSampledNote, which bounds it at MAX_SAMPLE_PEAK and the
        // master limiter catches stacked-voice peaks. Confirm/adjust by ear.
        gain: 5,
    },
    {
        id: 'horns-section',
        name: 'Horn Section',
        description: 'Sampled trumpet stabs — a punchy brass section for the harmony.',
        attribution:
            'VSCO-2 Community Edition (Trumpet, staccato) by Versilian Studios — CC0 1.0 (public domain)',
        approxSizeMB: 0.2,
        instruments: ['harmony'],
        // Calibrated 2026-06-22 (#661) via `mix-report --calibrate-pack=harmony:horns-section`:
        // RMS-match to the synth harmony is 1.67× (stabs are hot/punchy, so far less
        // lift than the strings pad). Seated at 1.5× — a touch under the match since
        // the brass is brighter (+701 Hz) and transient (peak energy reads louder
        // than RMS); on funk it already sits at/over the synth. Confirm by ear.
        gain: 1.5,
    },
    {
        id: 'acoustic-kit',
        name: 'Acoustic Drum Kit',
        description:
            'A full sampled acoustic kit — real kick/snare/hats/cymbals + aux perc for the groove.',
        attribution:
            'VCSL (Versilian Community Sample Library) by Versilian Studios — CC0 1.0; Virtuosity Drums (sfzinstruments) — CC0 1.0',
        approxSizeMB: 1.8,
        instruments: ['groove'],
        // First sampled *percussion* pack — keys by articulation, not pitch, and
        // plays each hit at native rate through `playSampledStrike` (#662). The kit
        // covers kick/snare/sidestick, the hi-hat family (closed/loose/open/pedal),
        // ride+bell/crash, toms, and aux perc (cowbell/agogo/shaker); china + snare
        // brushes have no clean CC0 source, so those hits fall back to the synth
        // voice. Deterministic round-robin (#657) over each articulation's takes
        // keeps repeated hits from machine-gunning. Calibrated 2026-06-22 (#662)
        // via `mix-report --calibrate-pack=groove:acoustic-kit`: pack sat ~4 dB
        // under the synth drum stem (RMS-match = 1.59×). Drums are the rhythmic
        // foundation and the synth stem is the right reference (unlike the grand,
        // which was buried under the band → 8×), so seated at the match: 1.6×.
        // Confirm by ear on ensembletest across rock/funk/jazz/blues.
        gain: 1.6,
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
