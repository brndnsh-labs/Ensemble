/**
 * The arrangement plan: what each bar is *for*, decided once for the whole pass, before
 * any lane plays. It replaces the old conductor and its worker-side twin: energy is a pure
 * function of the form (section role, section target, pass) and the user's intensity,
 * never a value that drifts while the song plays.
 */

import type { BandSettings, Lane } from '../core/types.js';
import type { Bar, Timeline } from '../form/timeline.js';

export type Fill = 'none' | 'phrase' | 'section';

export interface BarPlan {
    /** 0–1. Tiers (see `energyTier`) are what idioms branch on; the raw value scales dynamics. */
    energy: number;
    lanes: Record<Lane, boolean>;
    /** The drummer's job at the end of this bar. */
    fill: Fill;
    /** Crash (and lift) on this bar's downbeat: a new section, or after a fill. */
    crash: boolean;
    /** The final bar of a performance that does not loop: play a held ending. */
    ending: boolean;
}

// Section roles by label. Unknown labels (A, B, Head…) sit at the middle.
const ROLE_ENERGY: readonly [RegExp, number][] = [
    [/^intro/i, 0.35],
    [/^(verse|v\d*$)/i, 0.5],
    [/^pre/i, 0.6],
    [/^(chorus|hook|refrain)/i, 0.75],
    [/^(bridge|b$)/i, 0.6],
    [/^solo/i, 0.65],
    [/^(break|breakdown)/i, 0.3],
    [/^(outro|coda|ending|tag)/i, 0.45],
];
const DEFAULT_ENERGY = 0.55;

function sectionEnergy(bar: Bar): number {
    if (bar.visit.targetIntensity !== null) {
        return bar.visit.targetIntensity;
    }
    const label = bar.visit.label.trim();
    return ROLE_ENERGY.find(([pattern]) => pattern.test(label))?.[1] ?? DEFAULT_ENERGY;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export type EnergyTier = 'low' | 'mid' | 'high';

/** The discrete energy an idiom plays at. Bar-stable by construction. */
export function energyTier(energy: number): EnergyTier {
    return energy < 0.42 ? 'low' : energy < 0.7 ? 'mid' : 'high';
}

export function planBars(
    timeline: Timeline,
    settings: BandSettings,
    { pass, looping }: { pass: number; looping: boolean },
): BarPlan[] {
    const { bars } = timeline;
    // A song that loops earns a little more each time round — capped, so the fourth chorus
    // is fuller than the first but the band never runs away from the player.
    const passLift = Math.min(pass, 3) * 0.03;
    return bars.map((bar, i) => {
        const section = sectionEnergy(bar);
        // A manual intensity sets the level; the form still shapes around it at half depth.
        let energy =
            settings.intensity === null
                ? section
                : settings.intensity + (section - DEFAULT_ENERGY) * 0.5;
        const next = bars[i + 1] ?? (looping ? bars[0] : null);
        const visitEnd = bar.barInVisit === bar.visit.barCount - 1;
        const lastPhrase = bar.phrase.index > 0 && bar.phrase.bar === bar.phrase.length - 1;
        // Build into a bigger section over the last bar before it.
        if (visitEnd && next && sectionEnergy(next) > section + 0.05) {
            energy += 0.06;
        }
        energy = clamp01(energy + passLift);

        const lanes = {} as Record<Lane, boolean>;
        for (const lane of ['drums', 'bass', 'keys'] as const) {
            lanes[lane] = settings.lanes[lane] && bar.visit.lanes[lane] !== false;
        }
        const ending = !looping && i === bars.length - 1;
        let fill: Fill = 'none';
        if (!ending) {
            if (visitEnd && !(next && bar.visit.seamless)) {
                fill = 'section';
            } else if (
                bar.phrase.bar === bar.phrase.length - 1 &&
                (bar.phrase.index % 2 === 1 || lastPhrase)
            ) {
                fill = 'phrase';
            }
        }
        const prev = bars[i - 1] ?? (looping && pass > 0 ? bars[bars.length - 1] : null);
        const crash =
            (bar.barInVisit === 0 && (i > 0 || pass > 0) && !bar.visit.seamless) || ending;
        return { energy, lanes, fill, crash: crash && prev !== null, ending };
    });
}
