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
    /**
     * The bar this PASS actually began on — not necessarily `from`. A fresh pass (a full pass
     * from the top, a practice loop's own lap, a play-from-here start) has nothing before it,
     * so this defaults to `from`. A pass resumed mid-flight by a settings change
     * (`BandHost.update()`) carries the original pass's own origin forward instead, so its own
     * first bar (now `from`) is still a continuation, not a fresh start: it still crashes into
     * a section arrival or answers a phrase fill if the form says so, exactly as the
     * uninterrupted pass would have.
     */
    origin?: number;
}

export function fullWindow(timeline: Timeline): PassWindow {
    return { from: 0, to: timeline.bars.length, wrapTo: 0 };
}

/**
 * Plans for the bars in `window`, indexed by bar index (bars outside it are absent).
 * `next` is resolved in performance order, so a practice loop's last bar leads back to the
 * loop's first bar rather than on to the next section. `planned` stops planning there (a chunk
 * of a long counted performance needs only its own bars and the ones it looks across); the
 * window, and so where the performance goes and ends, is unchanged.
 *
 * A counted chart (`SemanticScore.choruses`, #1475) is performed as ONE pass over its
 * unrolled choruses, so "which time through the song" is the pass plus the bar's chorus
 * (`passAt`): its second chorus plans exactly as an uncounted chart's second time round the
 * loop does — the solos after the head, the pass lift, the trading cycle. An uncounted chart's
 * chorus is always 0, so there the pass is the pass.
 */
export function planBars(
    timeline: Timeline,
    settings: BandSettings,
    {
        pass,
        looping,
        window,
        planned = window.to,
        drumSolos = false,
    }: {
        pass: number;
        looping: boolean;
        window: PassWindow;
        planned?: number;
        drumSolos?: boolean;
    },
): BarPlan[] {
    const { bars } = timeline;
    // Where this pass truly began, for `first`/`before`/`priorFill` below — see `PassWindow`.
    const origin = window.origin ?? window.from;
    // The band's pass at bar `index` of lap `onPass` — see above.
    const passAt = (index: number, onPass: number) => onPass + bars[index].visit.chorus;
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
        const role = leadRole(timeline, index, passAt(index, onPass), trade);
        return (
            role.kind === 'trade' &&
            role.with === 'drums' &&
            role.turn === 'band' &&
            bars[index].visit.lanes.drums !== false
        );
    };
    // The fill bar `index` would get on `onPass`, worked out from the form alone — the ONE
    // rule for a bar inside this call's own window (bar `i`, in the loop below) and one
    // outside it (its predecessor, when a resumed pass or a fresh pass's own origin needs it),
    // so the two can't drift apart. "Last bar" is window-relative (`window.to - 1`), not the
    // song's own last bar: a practice loop's own lap-end gets its big fill on the loop's own
    // last bar, whatever the song's length.
    const fillAt = (index: number, onPass: number): Fill => {
        const bar = bars[index];
        const isLast = index === window.to - 1;
        const role = leadRole(timeline, index, passAt(index, onPass), trade);
        if ((!looping && isLast) || (role.kind === 'trade' && role.with === 'drums')) {
            // Trading with the drummer, his turn is a solo, not a fill; the true end of a
            // non-looping song plays a held ending instead.
            return 'none';
        }
        const next = isLast ? (looping ? bars[window.wrapTo] : null) : bars[index + 1];
        const visitEnd = bar.barInVisit === bar.visit.barCount - 1;
        // A counted chart's chorus ends into its next chorus the way a looping song's last
        // bar wraps to the top: a section fill, even out of a seamless section.
        const wraps =
            (isLast && looping) || (!isLast && bars[index + 1].visit.chorus !== bar.visit.chorus);
        if ((visitEnd || wraps) && !(next && bar.visit.seamless && !isLast && !wraps)) {
            return 'section';
        }
        if (bar.phrase.bar === bar.phrase.length - 1 && bar.phrase.index % 2 === 1) {
            return 'phrase';
        }
        return 'none';
    };
    // A song that loops earns a little more each time round — capped, so the fourth chorus
    // is fuller than the first but the band never runs away from the player.
    const passLift = (index: number) => Math.min(passAt(index, pass), 3) * 0.03;
    const plans: BarPlan[] = [];
    for (let i = window.from; i < Math.min(planned, window.to); i++) {
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
        energy = clamp01(energy + passLift(i));

        const lanes = {} as Record<Lane, boolean>;
        for (const lane of ['drums', 'bass', 'comp', 'lead'] as const) {
            lanes[lane] = settings.lanes[lane] && bar.visit.lanes[lane] !== false;
        }
        const lead = leadRole(timeline, i, passAt(i, pass), trade);
        const drumsTurn = lanes.drums && drummerAlone(i, pass);
        if (lead.kind === 'trade' && lead.turn === 'you') {
            // Your turn is yours: the soloist lays out.
            lanes.lead = false;
        }
        if (
            wanted?.with === 'drums' &&
            leadRole(timeline, i, passAt(i, pass), wanted).kind !== 'head'
        ) {
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
        // `fillAt` already carries the "trading with the drummer, or the true end of a
        // non-looping song, gets no fill" guard (the same `isLast`/`looping`/`lead` this bar
        // just computed), so bar `i`'s own fill is just its own answer — the loop and the
        // lookup below can't disagree because they're the same function.
        const fill = fillAt(i, pass);
        // The bar this PASS truly began on (`origin`), not this call's own window: a pass
        // resumed by a settings change (`BandHost.update()`) is a continuation of one already
        // under way, so its own first bar still arrives with a crash if the form says so. A
        // genuinely fresh start (play-from-here, a practice loop's own first lap) has nothing
        // before it and keeps the old suppression — its origin defaults to its own `from`.
        // `pass` here is the lap, not the band's pass (`passAt`): what matters is whether
        // anything was played before this bar, and a counted chart's later chorus has nothing
        // before it when the musician starts there.
        const first = i === origin && pass === 0;
        // The drummer's own turn opens with the kick under his statement, not a crash: the
        // crash is the band coming back in.
        const arrival = bar.barInVisit === 0 && !bar.visit.seamless && !first && !drumsTurn;
        // A crash marks an arrival: a new section, or the downbeat after a phrase fill once the
        // band is past quiet energy — the previous bar's fill, in performance order. Past the
        // origin, that's bar `i - 1` on this same pass, read from the form (`fillAt`) rather
        // than `plans`: a bar can sit outside this call's own window (a resumed pass's
        // predecessor, or a fresh window's own predecessor, which was never played), and even
        // one inside the window has no `plans` entry yet the first time the loop reaches it. AT
        // the origin: on pass 0 nothing played before it; on a later pass, the bar that played
        // right before it is the PREVIOUS pass's own last bar, which — having looped to reach
        // this pass at all — `fillAt` always answers 'section' for (`isLast && looping` alone
        // forces it, before phrase parity is even asked), so it can never afterFill. Hardcoded
        // rather than asked, since the current call's own `looping` (which could by now be
        // false, the render's own final pass) isn't the previous pass's.
        const priorFill: Fill = i > origin ? fillAt(i - 1, pass) : pass === 0 ? 'none' : 'section';
        const afterFill = priorFill === 'phrase' && energy >= 0.5;
        // The band comes back in on a crash after the drummer's four. Read from the form, not
        // the previous plan, so a pass resumed here still crashes; the same origin rule as
        // `first`/`priorFill` above governs what "before" means at the start of this call.
        const before =
            i > origin
                ? drummerAlone(i - 1, pass)
                : pass > 0 && drummerAlone(window.to - 1, pass - 1);
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
