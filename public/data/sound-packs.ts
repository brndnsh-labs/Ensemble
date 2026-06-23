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
        // DI-dry tonewheel emulation (no recorded room) — push the send up so it
        // shares the band's space instead of sitting flat up front. #686 start.
        reverbSend: 1.5,
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
        // Bone-dry DI pluck — the driest pack; lift the send most so it doesn't
        // read pasted-on-top of the band. #686 start.
        reverbSend: 1.6,
    },
    {
        id: 'rhodes',
        name: 'Electric Piano (Rhodes)',
        description:
            'A sampled 1977 Rhodes Mark I — warm tine electric piano with a bell-y bark for neo-soul, hip-hop, jazz.',
        attribution: 'jRhodes3c (1977 Rhodes Mark I) by Jeff Learman — CC BY-NC-SA 4.0',
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
        description: 'A sampled alto sax — a real horn lead for the soloist.',
        attribution: 'Karoryfer Weresax (alto sax) — CC0 1.0 (public domain)',
        approxSizeMB: 0.7,
        instruments: ['soloist'],
        // Calibrated 2026-06-22 (#658) via `mix-report --calibrate-pack=soloist:sax-alto`:
        // RMS-match to the synth soloist (the lead seat) was 3.43×, but the sax is
        // ~677 Hz brighter than the synth trumpet (reads louder than its RMS), so
        // seated a touch under at 3.0×. Starting point — confirm by ear on ensembletest.
        gain: 3,
        // Close-mic'd horn, fairly dry — a small lift to seat the lead in the room. #686 start.
        reverbSend: 1.2,
    },
    {
        id: 'nylon-guitar',
        name: 'Nylon Guitar',
        description:
            'A sampled Spanish classical guitar — a warm fingerstyle nylon lead for bossa, acoustic, country.',
        attribution:
            'FreePats Spanish Classical Guitar (nylon-string) by roberto@zenvoid.org — CC0 1.0 (public domain)',
        approxSizeMB: 0.6,
        instruments: ['soloist'],
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
        // Close-mic'd, dry-ish room (FreePats home recording). Started at 1.3 (a
        // sax-like lift), but reverb pushes a lead back/down — pulled to 1.0 (the
        // synth send, unchanged) to bring the nylon *forward* in the mix without
        // adding loudness. Brandon's ear 2026-06-23. #686-style.
        reverbSend: 1.0,
    },
    {
        id: 'electric-guitar-clean',
        name: 'Electric Guitar (Clean)',
        description:
            'A sampled clean Fender electric — a real single-coil lead for jazz, funk, soul, country, clean blues.',
        attribution:
            'FreePats Clean Electric Guitar (Fender, bridge pickup) — CC0 1.0 (public domain)',
        approxSizeMB: 0.7,
        instruments: ['soloist'],
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
        description:
            'An overdriven electric — a crunchy amp tone for rock leads (and a gritty blues option).',
        attribution:
            'FreePats Clean Electric Guitar (Fender) — CC0 1.0; overdrive + cabinet voicing applied (CC0)',
        approxSizeMB: 0.7,
        instruments: ['soloist'],
        // Calibrated 2026-06-23 (#741) via `mix-report --calibrate-pack=soloist:electric-guitar-driven`.
        // Same 13 source zones as the clean electric (#740), re-voiced through an
        // OFFLINE amp sim (data-only, no engine code): tanh soft-clip drive (×4,
        // slight even-harmonic asymmetry for tube warmth) → cabinet EQ (sharp ~5.2k
        // low-pass to kill the clipping fizz, sub trim, +4 dB presence at 2.6k for
        // cut, small low-mid scoop). Pitch-preserving (waveshaping); the drive
        // measurably enriches the upper harmonics. The honest limit: drive + sustain
        // approximate a lead tone but bends/vibrato still aren't in the samples (the
        // real "screaming lead" unlock is soloist-engine pitch expression, separate).
        // DRIVE (×4) is the #1 by-ear knob — push to 5–6 for more grit, down to 3 for
        // a bluesy edge; re-bake from the clean source to retune. Manual-select PoC —
        // genre seat (Rock the intended target) decided by ear after the listen.
        // Calibrated via `mix-report --calibrate-pack=soloist:electric-guitar-driven`:
        // only 5.7 dB under the synth lead (RMS-match = 1.92×) — far less lift than
        // the clean's 3× because the drive's compression already raised the RMS.
        // Brighter (+353 Hz) so seated just under the match at 1.8×. Ear-lock on test.
        gain: 1.8,
        // Amp-sim tone, no recorded room — a lead-guitar lift to seat it in the
        // band's space. By-ear start. #686-style.
        reverbSend: 1.2,
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
        // VSCO ensemble carries its own hall — pull the send back so we don't
        // stack the algorithmic hall on the recorded room (mud). #686 start.
        reverbSend: 0.7,
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
        // Some recorded room on the stabs — a slight pull-back. #686 start.
        reverbSend: 0.9,
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
        // Kit carries overhead/room — pull the send back so the drums stay tight
        // and don't wash the pocket with hall-on-room. #686 start.
        reverbSend: 0.7,
    },
    {
        id: 'upright-bass',
        name: 'Upright Bass',
        description:
            'A sampled pizzicato double bass — a real acoustic upright for jazz/bossa/blues walking lines.',
        attribution:
            'VSCO-2 Community Edition (Solo Contrabass, pizzicato) by Versilian Studios — CC0 1.0 (public domain)',
        approxSizeMB: 0.2,
        instruments: ['bass'],
        // First sampled pack on the BASS lane (#697) — plays the nearest of 8
        // pizz zones (MIDI 28–52, every 3–4 semitones) through `playSampledBass`
        // → `playSampledNote`, inheriting the bass bus EQ / reverb send / kick
        // sidechain-duck. The seam doesn't model continuous bends or the synth's
        // mute-morph (accepted tradeoff for a real upright; muted notes just
        // attenuate). Zone roots were set from the *measured* fundamental (FFT +
        // YIN + harmonic-template), not VSCO's unreliable filename octaves.
        // Source is loudnorm-leveled (VSCO is quiet) + mono. Calibrated 2026-06-22
        // (#697) via `mix:report --calibrate-pack=bass:upright-bass`: pack sat
        // 3.2 dB under the synth bass across rock/blues/jazz/funk (RMS-match =
        // 1.45×). Bass is the foundation, so the synth bass stem is the right
        // reference (like the drum kit, unlike the buried grand). The upright is
        // a touch darker (−72 Hz centroid → reads slightly quieter than its RMS),
        // so seated just over the match at 1.5×. Confirm/nudge by ear on
        // ensembletest (jazz walking / bossa / blues).
        gain: 1.5,
        // Close-mic'd DI-ish pizz, fairly dry — a small lift to seat it in the
        // room without washing out the low end. #686-style start; tune by ear.
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
