import { PPQ } from '../core/types.js';

/**
 * A bar's metric skeleton. Players think in *pulses* (the felt beats: quarter notes in
 * 4/4, dotted quarters in 6/8, 2+2+3 eighths in 7/8), and in the strong/weak role of each
 * pulse, so one idiom can play 4/4, 3/4, 6/8 and 7/8 without a table per meter.
 */
export interface Meter {
    name: string;
    counts: number;
    unit: number;
    barTicks: number;
    /** Tick offsets of each pulse (group start) within the bar. */
    pulses: number[];
    /** Length in ticks of each pulse. */
    pulseTicks: number[];
    /**
     * Pulse roles: 'down' (the one), 'back' (backbeat — where a snare lands), 'strong'
     * (a secondary downbeat), in drummer terms rather than music-theory ones.
     */
    roles: ('down' | 'back' | 'strong')[];
    /** True when every pulse is a quarter note — swing and 8th/16th grids apply cleanly. */
    quarterPulse: boolean;
}

function defaultGrouping(counts: number, unit: number): number[] {
    if (unit <= 4) {
        return Array.from({ length: counts }, () => 1);
    }
    // Eighth- and sixteenth-based meters group in threes when they divide (compound time),
    // otherwise in twos with a closing three (7/8 = 2+2+3, 5/8 = 2+3).
    const size = unit === 8 ? 3 : 4;
    if (counts % size === 0) {
        return Array.from({ length: counts / size }, () => size);
    }
    const groups: number[] = [];
    let left = counts;
    while (left > 3) {
        groups.push(2);
        left -= 2;
    }
    groups.push(left);
    return groups;
}

function pulseRoles(n: number): Meter['roles'] {
    // 4/4 → down back strong back; 3/4 → down back back; 2/4 → down back;
    // 5/4 → down back strong back back; 7/8 (3 pulses) → down back back.
    return Array.from({ length: n }, (_, i) => {
        if (i === 0) {
            return 'down';
        }
        if (i % 2 === 1 || i === n - 1) {
            return 'back';
        }
        return 'strong';
    });
}

export function buildMeter(name: string, grouping: number[] | null): Meter {
    const match = /^(\d{1,2})\/(\d{1,2})$/.exec(name);
    if (!match) {
        throw new Error(`Unsupported meter ${name}`);
    }
    const counts = Number(match[1]);
    const unit = Number(match[2]);
    const unitTicks = (PPQ * 4) / unit;
    const groups =
        grouping && grouping.reduce((a, b) => a + b, 0) === counts
            ? grouping
            : defaultGrouping(counts, unit);
    const pulses: number[] = [];
    const pulseTicks: number[] = [];
    let at = 0;
    for (const size of groups) {
        pulses.push(at);
        pulseTicks.push(size * unitTicks);
        at += size * unitTicks;
    }
    return {
        name,
        counts,
        unit,
        barTicks: counts * unitTicks,
        pulses,
        pulseTicks,
        roles: pulseRoles(pulses.length),
        quarterPulse: pulseTicks.every((t) => t === PPQ),
    };
}
