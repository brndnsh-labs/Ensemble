/**
 * The sixteenth-note grid players write on. Every meter the chart codec accepts has a bar
 * length that is a whole number of sixteenths, so a bar is always `steps` sixteenths long;
 * pulses are 4 sixteenths (a quarter) or 6 (a dotted quarter), or 4 for a 2-eighth group.
 */
import { PPQ } from '../core/types.js';
import type { Bar } from '../form/timeline.js';

export const STEP = PPQ / 4;

export function barSteps(bar: Bar): number {
    return Math.round(bar.meter.barTicks / STEP);
}

/** True for plain 4/4 — the meter idioms write whole-bar patterns for. */
export function isCommonTime(bar: Bar): boolean {
    return bar.meter.name === '4/4' || (bar.meter.quarterPulse && bar.meter.pulses.length === 4);
}

export interface Pulse {
    /** First sixteenth step of the pulse within the bar. */
    step: number;
    /** Length in sixteenths. */
    steps: number;
    role: 'down' | 'back' | 'strong';
    index: number;
}

export function pulses(bar: Bar): Pulse[] {
    return bar.meter.pulses.map((tick, index) => ({
        step: Math.round(tick / STEP),
        steps: Math.round(bar.meter.pulseTicks[index] / STEP),
        role: bar.meter.roles[index],
        index,
    }));
}

/** Absolute tick of a step in a bar. */
export const at = (bar: Bar, step: number): number => bar.start + step * STEP;

/** The bar's chord spans that begin with an attack, with their step range in the bar. */
export function spanSteps(bar: Bar) {
    return bar.spans.map((span) => ({
        span,
        from: Math.round((span.start - bar.start) / STEP),
        to: Math.round((span.end - bar.start) / STEP),
    }));
}

/**
 * A pattern line: one char per step. `X` accent, `x` normal, `o` soft, `g` ghost, `.` rest.
 * Returns [step, velocity] pairs.
 */
const LEVEL: Record<string, number> = { X: 118, x: 96, o: 72, g: 36 };

export function readLine(line: string): [number, number][] {
    const out: [number, number][] = [];
    for (let i = 0; i < line.length; i++) {
        const v = LEVEL[line[i]];
        if (v) {
            out.push([i, v]);
        }
    }
    return out;
}

/**
 * Stretch or fit a 4-step pulse cell onto a pulse of any length. A compound (6-step)
 * pulse keeps the cell's downbeat, maps its "&" to the last eighth of the group, and
 * fills eighths for a continuous line (a cell with every "&" and beat filled).
 */
export function fitCell(cell: string, steps: number): string {
    if (cell.length === steps) {
        return cell;
    }
    if (steps === 6 && cell.length === 4) {
        const continuous = cell[0] !== '.' && cell[2] !== '.';
        if (continuous) {
            return `${cell[0]}.${cell[2]}.${cell[2]}.`;
        }
        return `${cell[0]}...${cell[2]}.`;
    }
    return cell.padEnd(steps, '.').slice(0, steps);
}

/** Scale a velocity by energy: quieter bands play softer, not just sparser. */
export function dyn(velocity: number, energy: number): number {
    return Math.round(Math.min(127, Math.max(1, velocity * (0.72 + 0.4 * energy))));
}
