/**
 * The lead's form: what each phrase slot of a pass is for, decided from where it sits in the
 * performance before any note is chosen.
 *
 * The first time through, the lead plays the head (a tune it writes from the changes). Looping,
 * it solos for three choruses and brings the head back on the fourth: head, solo, solo, solo,
 * head… The three solo choruses are one arc — low and sparse, developing, the cycle's one peak
 * — and the last phrase of the third winds down so the head can come back in.
 */
import type { EnergyTier } from '../../arrange/plan.js';
import type { Bar, Timeline } from '../../form/timeline.js';

export type Density = 'sparse' | 'mid' | 'busy';

export type LeadRole =
    | { kind: 'rest' }
    | { kind: 'head' }
    | {
          kind: 'solo';
          /** Which chorus of the solo arc, 1–3. */
          chorus: 1 | 2 | 3;
      };

/** How many passes one head-and-solos cycle lasts. */
export const CYCLE = 4;

export function leadRole(bar: Bar, pass: number): LeadRole {
    const label = bar.visit.label.trim();
    // An intro is the band's; the lead comes in after it.
    if (/^intro/i.test(label)) {
        return { kind: 'rest' };
    }
    const cycle = pass % CYCLE;
    // A section written as a solo is one, even the first time through.
    if (/^solo/i.test(label)) {
        return { kind: 'solo', chorus: cycle === 0 ? 1 : (cycle as 1 | 2 | 3) };
    }
    return cycle === 0 ? { kind: 'head' } : { kind: 'solo', chorus: cycle as 1 | 2 | 3 };
}

/** What one solo phrase slot is asked to do: how busy, how high, and whether it is the peak. */
export interface Arc {
    density: Density;
    /** Semitones above (or below) the instrument's home register for this phrase's centre. */
    register: number;
    /** The cycle's one peak: this phrase climbs to the top of the instrument. */
    peak: boolean;
    /** The phrase that hands back to the head: it comes down and settles. */
    windDown: boolean;
}

const DENSITIES: readonly Density[] = ['sparse', 'mid', 'busy'];

function shift(density: Density, by: number): Density {
    const i = Math.min(2, Math.max(0, DENSITIES.indexOf(density) + by));
    return DENSITIES[i];
}

/**
 * The arc for a solo slot starting at `slotStart`. `through` is how far through the song the
 * slot starts (0–1); the energy tier moves density one step either way, so a quiet section
 * stays sparse whatever the arc wants.
 */
export function soloArc(
    chorus: 1 | 2 | 3,
    timeline: Timeline,
    slotStart: number,
    energy: EnergyTier,
): Arc {
    const bars = timeline.bars;
    const slotLength = bars[slotStart].phrase.length;
    const through = bars[slotStart].start / timeline.ticks;
    const lastSlot = slotStart + slotLength >= bars.length;
    const secondLast =
        !lastSlot &&
        slotStart + slotLength + bars[slotStart + slotLength].phrase.length >= bars.length;
    let arc: Arc;
    if (chorus === 1) {
        arc = {
            density: through < 0.5 ? 'sparse' : 'mid',
            register: through < 0.5 ? -3 : -1,
            peak: false,
            windDown: false,
        };
    } else if (chorus === 2) {
        arc = {
            density: through < 0.5 ? 'mid' : 'busy',
            register: through < 0.5 ? 0 : 2,
            peak: false,
            windDown: false,
        };
    } else if (lastSlot && bars.length > slotLength) {
        arc = { density: 'mid', register: 0, peak: false, windDown: true };
    } else {
        // The peak is the phrase before the wind-down (or the only phrase of a short chart).
        const peak = secondLast || bars.length <= slotLength;
        arc = { density: 'busy', register: 3, peak, windDown: false };
    }
    const lift = energy === 'low' ? -1 : energy === 'high' ? 1 : 0;
    return { ...arc, density: shift(arc.density, arc.peak ? Math.max(0, lift) : lift) };
}
