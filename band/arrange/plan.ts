/**
 * The arrangement plan: what each bar is *for*, decided once for the whole pass, before
 * any lane plays. It replaces the old conductor and its worker-side twin: energy is a pure
 * function of the form (section role, section target, pass) and the user's intensity,
 * never a value that drifts while the song plays.
 */

import type { BandSettings, Lane } from '../core/types.js';
import type { Bar, Timeline } from '../form/timeline.js';
import { type LeadRole, leadRole } from './cycle.js';

export type Fill = 'none' | 'phrase' | 'section';

export interface BarPlan {
    /** 0–1. Tiers (see `energyTier`) are what idioms branch on; the raw value scales dynamics. */
    energy: number;
    lanes: Record<Lane, boolean>;
    /** The drummer's job at the end of this bar. */
    fill: Fill;
    /** Crash on this bar's downbeat: a new section, or the downbeat after a phrase fill. */
    crash: boolean;
    /** The final bar of a performance that does not loop: play a held ending. */
    ending: boolean;
    /**
     * The lead's job in this bar (`arrange/cycle.ts`). On the drummer's turn in a chorus of
     * fours, the drums play alone.
     */
    lead: LeadRole;
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

/** Which bars a pass plays, in order, and where it goes after the last one. */
export interface PassWindow {
    /** First bar index played. */
    from: number;
    /** One past the last bar index played. */
    to: number;
    /** The bar that follows the window when the performance loops (a practice loop wraps to
     * its own start; a play-from-here pass wraps to the top of the song). */
    wrapTo: number;
}

export function fullWindow(timeline: Timeline): PassWindow {
    return { from: 0, to: timeline.bars.length, wrapTo: 0 };
}

/**
 * Plans for the bars in `window`, indexed by bar index (bars outside it are absent).
 * `next` is resolved in performance order, so a practice loop's last bar leads back to the
 * loop's first bar rather than on to the next section.
 */
export function planBars(
    timeline: Timeline,
    settings: BandSettings,
    {
        pass,
        looping,
        window,
        drumSolos = false,
    }: { pass: number; looping: boolean; window: PassWindow; drumSolos?: boolean },
): BarPlan[] {
    const { bars } = timeline;
    // The player trades over the whole song (a pass resumed at a barline still is one); a
    // practice loop keeps its band. Trading with the soloist needs it on; trading with the
    // drummer needs the drums on and a drummer who can solo in this style.
    const wanted = settings.trade ?? null;
    const trade =
        wanted &&
        window.to === bars.length &&
        window.wrapTo === 0 &&
        (wanted.with === 'lead' ? settings.lanes.lead : settings.lanes.drums && drumSolos)
            ? wanted
            : null;
    // Whether the drummer has bar `index` of `pass` to himself: his turn in a trade.
    const drummerAlone = (index: number, onPass: number) => {
        const role = leadRole(timeline, index, onPass, trade);
        return (
            role.kind === 'trade' &&
            role.with === 'drums' &&
            role.turn === 'band' &&
            bars[index].visit.lanes.drums !== false
        );
    };
    // The fill bar `index` would get on `onPass`, worked out from the form alone (never from
    // `plans`), so a bar outside this call's own window — the one right before a resumed pass,
    // or the last bar of the pass before — can still be asked. Mirrors the bar-i fill logic
    // below, but `index` need not be in `window`.
    const fillAt = (index: number, onPass: number): Fill => {
        const bar = bars[index];
        const isLastOfSong = index === bars.length - 1;
        const role = leadRole(timeline, index, onPass, trade);
        if ((!looping && isLastOfSong) || (role.kind === 'trade' && role.with === 'drums')) {
            // Trading with the drummer, his turn is a solo, not a fill; the true end of a
            // non-looping song plays a held ending instead.
            return 'none';
        }
        const next = isLastOfSong ? (looping ? bars[window.wrapTo] : null) : bars[index + 1];
        const visitEnd = bar.barInVisit === bar.visit.barCount - 1;
        if (
            (visitEnd || (isLastOfSong && looping)) &&
            !(next && bar.visit.seamless && !isLastOfSong)
        ) {
            return 'section';
        }
        if (bar.phrase.bar === bar.phrase.length - 1 && bar.phrase.index % 2 === 1) {
            return 'phrase';
        }
        return 'none';
    };
    // A song that loops earns a little more each time round — capped, so the fourth chorus
    // is fuller than the first but the band never runs away from the player.
    const passLift = Math.min(pass, 3) * 0.03;
    const plans: BarPlan[] = [];
    for (let i = window.from; i < window.to; i++) {
        const bar = bars[i];
        const isLast = i === window.to - 1;
        const next = isLast ? (looping ? bars[window.wrapTo] : null) : bars[i + 1];
        const section = sectionEnergy(bar);
        // A manual intensity sets the level; the form still shapes around it at half depth.
        let energy =
            settings.intensity === null
                ? section
                : settings.intensity + (section - DEFAULT_ENERGY) * 0.5;
        const visitEnd = bar.barInVisit === bar.visit.barCount - 1;
        // Build into a bigger section over the last bar before it.
        if (visitEnd && next && sectionEnergy(next) > section + 0.05) {
            energy += 0.06;
        }
        energy = clamp01(energy + passLift);

        const lanes = {} as Record<Lane, boolean>;
        for (const lane of ['drums', 'bass', 'comp', 'lead'] as const) {
            lanes[lane] = settings.lanes[lane] && bar.visit.lanes[lane] !== false;
        }
        const lead = leadRole(timeline, i, pass, trade);
        const drumsTurn = lanes.drums && drummerAlone(i, pass);
        if (lead.kind === 'trade' && lead.turn === 'you') {
            // Your turn is yours: the soloist lays out.
            lanes.lead = false;
        }
        if (wanted?.with === 'drums' && leadRole(timeline, i, pass, wanted).kind !== 'head') {
            // Asking to trade with the drummer makes you the soloist for every pass but a
            // returned head, even where the trade can't happen (a practice loop, the drums
            // off, a drummer who doesn't solo): the band's soloist never plays over you, but
            // it does play the head when it comes back.
            lanes.lead = false;
        }
        if (drumsTurn) {
            // The drummer's turn is his alone.
            lanes.bass = false;
            lanes.comp = false;
        }
        const ending = !looping && isLast;
        let fill: Fill = 'none';
        // Trading with the drummer, the trade is its own fill: his turn is a solo, and he
        // hands yours back with a crash.
        if (!ending && !(lead.kind === 'trade' && lead.with === 'drums')) {
            if ((visitEnd || (isLast && looping)) && !(next && bar.visit.seamless && !isLast)) {
                // The end of a section — or of a practice loop's lap — gets the big fill.
                fill = 'section';
            } else if (bar.phrase.bar === bar.phrase.length - 1 && bar.phrase.index % 2 === 1) {
                // Every other phrase ends with a small one (bars 8, 16…), not every phrase.
                fill = 'phrase';
            }
        }
        // The very top of the whole performance, not of this call's own window: a pass resumed
        // mid-song is a continuation, not a fresh start, so its first bar still arrives with a
        // crash if the form says so (the same "index `0`, not `window.from`" fix as `fillAt`
        // and `before`/`drummerAlone` below — a section repeat's own arrival bar lost its crash
        // on resume before this read the true song position instead of the window's).
        const first = i === 0 && pass === 0;
        // The drummer's own turn opens with the kick under his statement, not a crash: the
        // crash is the band coming back in.
        const arrival = bar.barInVisit === 0 && !bar.visit.seamless && !first && !drumsTurn;
        // A crash marks an arrival: a new section, or the downbeat after a phrase fill once
        // the band is past quiet energy. Read the previous bar's fill from the form (`fillAt`),
        // not from `plans` — a pass resumed here has no plan for the bar before its own window,
        // and even a full pass replans from scratch every time round, so `plans[i - 1]` is
        // undefined at the top of every pass but the very first.
        const priorFill =
            i > 0 ? fillAt(i - 1, pass) : pass > 0 ? fillAt(bars.length - 1, pass - 1) : 'none';
        const afterFill = priorFill === 'phrase' && energy >= 0.5;
        // The band comes back in on a crash after the drummer's four.
        // Read from the form, not the previous plan, so a pass resumed here still crashes; the
        // bar before the first is the last bar of the pass before.
        const before =
            i > 0 ? drummerAlone(i - 1, pass) : pass > 0 && drummerAlone(bars.length - 1, pass - 1);
        const afterDrums = before && !drumsTurn;
        plans[i] = {
            energy,
            lanes,
            fill,
            crash: arrival || afterFill || afterDrums || ending,
            ending,
            lead,
        };
    }
    return plans;
}
