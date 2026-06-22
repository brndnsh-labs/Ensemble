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
}

export const SOUND_PACKS: readonly SoundPack[] = [
    {
        id: 'grand',
        name: 'Acoustic Grand Piano',
        description: 'A sampled Yamaha C5 grand — warm, real piano body for the chords.',
        attribution: 'Salamander Grand Piano (Yamaha C5) by Alexander Holm — CC-BY 3.0',
        approxSizeMB: 1.3,
        instruments: ['chords'],
    },
];

/** The packs that can serve as a source for `module`, in catalog order. */
export function packsForInstrument(module: InstrumentModule): readonly SoundPack[] {
    return SOUND_PACKS.filter((pack) => pack.instruments.includes(module));
}
