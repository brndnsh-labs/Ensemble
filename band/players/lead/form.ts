/**
 * The shape of the lead's solos. Which pass is a head, a solo chorus or a chorus of fours is
 * the arrangement's (`arrange/cycle.ts`); this is what a solo phrase slot is asked to do.
 *
 * The three solo choruses are one arc — low and sparse, developing, the cycle's one peak —
 * and the last phrase of the third winds down so the head can come back in.
 */
import type { EnergyTier } from '../../arrange/plan.js';
import type { Timeline } from '../../form/timeline.js';

export type Density = 'sparse' | 'mid' | 'busy';

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

/**
 * A trade: the soloist's turn to say something, straight in, and then the player answers. A
 * little high, the whole turn played through to an arrival; busy unless the style is a
 * spacious one (`space`, neo-soul and reggae), and a notch calmer at low energy.
 */
export function tradeArc(energy: EnergyTier, space: number): Arc {
    const density: Density = space >= 0.35 ? 'mid' : 'busy';
    return {
        density: energy === 'low' ? shift(density, -1) : density,
        register: 2,
        peak: false,
        windDown: false,
    };
}
