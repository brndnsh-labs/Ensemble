/**
 * The arrangement plan: what each bar is *for*, decided once for the whole pass, before
 * any lane plays. It replaces the old conductor and its worker-side twin: energy is a pure
 * function of the form (section role, section target, pass) and the user's intensity,
 * never a value that drifts while the song plays.
 */

import type { BandSettings, Lane, TradeSettings } from '../core/types.js';
import { type Bar, chorusBars, type Timeline } from '../form/timeline.js';
import { type LeadRole, leadRole } from './cycle.js';

export type Fill = 'none' | 'phrase' | 'section';

export interface BarPlan {
    /** 0–1. Tiers (see `energyTier`) are what idioms branch on; the raw value scales dynamics. */
    energy: number;
    lanes: Record<Lane, boolean>;
    /** The drummer's job at the end of this bar. */
    fill: Fill;
    /**
     * How big a boundary a short loop's fill (`lapFill`) marks, as a count of its kind: odd is the
     * smaller boundary (the drummer plays a pickup), even the bigger (the full fill), so the fill
     * follows the form's hierarchy and consecutive laps don't repeat (#2009). 0 off a short loop,
     * whose fills are not repeats of one another.
     */
    fillOrdinal: number;
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

/**
 * A looping form shorter than this (under 8 bars; an 8-bar form already carries the 8-bar period
 * on its own wrap) is a vamp, not a song: its wrap back to the top is a lap of
 * the loop, not a section arriving, so its fills and crashes are counted in laps toward the
 * 8- and 16-bar periods a band phrases in (`lapFill`).
 */
const SHORT_FORM = 8;

/**
 * The fill a short form's wrap gets, by how many bars have gone by once the lap ends: a small
 * fill at each 8 bars, a section fill (and the crash after it) at each 16. why: a drummer
 * vamping a 4-bar groove marks the 8-bar phrase and the 16-bar period, not every lap — a fill
 * and a crash every 4 bars, the same each time, is a loop, not a band (#2009).
 */
function lapFill(lap: number, length: number): Fill {
    // The lap whose end crosses a 16- or 8-bar line, whatever the loop's length (a 7-bar vamp
    // still fills about every 8 bars played, not once in 56).
    const crosses = (period: number) =>
        Math.floor(((lap + 1) * length) / period) > Math.floor((lap * length) / period);
    return crosses(16) ? 'section' : crosses(8) ? 'phrase' : 'none';
}

/**
 * How big a boundary lap `lap` ends on is, as a count of its kind: odd is the smaller boundary
 * (a pickup), even the bigger (the full fill). Section fills fall on the 16-bar lines, so the
 * 16, 48… are small and the 32, 64… (the next level up) are full; the small fills on the 8-bar
 * lines the same way, the 8, 40… small and the 24, 56… full (the lead-in to the 32 line).
 */
function lapFillOrdinal(lap: number, length: number): number {
    const played = (lap + 1) * length;
    return lapFill(lap, length) === 'section'
        ? Math.floor(played / 16)
        : Math.floor((Math.floor(played / 8) - 1) / 2) + 1;
}

const TIER_ORDER: readonly EnergyTier[] = ['low', 'mid', 'high'];

/**
 * The tier a fill is sized by: the bigger of the bar it starts in and the bar it leads into. A
 * fill is the drummer announcing where the music is going, so the fill into a chorus is the
 * chorus's size, not the quieter verse's one beat (#2009).
 */
export function fillTier(here: number, there: number | null): EnergyTier {
    const a = energyTier(here);
    const b = there === null ? a : energyTier(there);
    return TIER_ORDER.indexOf(b) > TIER_ORDER.indexOf(a) ? b : a;
}

export type EnergyTier = 'low' | 'mid' | 'high';

/** Where the high tier starts (`energyTier`). */
const HIGH = 0.7;

/** The discrete energy an idiom plays at. Bar-stable by construction. */
export function energyTier(energy: number): EnergyTier {
    return energy < 0.42 ? 'low' : energy < HIGH ? 'mid' : 'high';
}

/**
 * How the jam arc moves one style (`Style.jamArc`, #1789). Absent, the full arc.
 */
export interface JamArcShape {
    /**
     * Scales the arc's offset (`jamArc`), before the clamp: 1 is the full arc, 0.5 half of it.
     * The dynamics keep the arc's shape, at a smaller swing.
     */
    depth: number;
}

// why: a lift (the jam arc, or the pass lift) carries a style that keeps its high line
// (`Style.keepsHighLine`) to the top of mid and no further — a hair
// under the line, so the raw energy (which scales the dynamics) still reaches as close to the
// climax as the tier allows.
const HIGH_CEILING = HIGH - 0.01;

/*
 * The jam arc (#1785): how a counted performance the band was asked to shape as a jam
 * (`BandSettings.arc === 'jam'`, song mode) breathes across its `n` choruses. A pure function of
 * the chorus and the bar's place in it, so it is planned once with the rest of the plan and
 * never drifts. Energy only: tempo never moves (metronomic by default). Each value is an offset
 * on the bar's section energy, so the form still shapes inside every chorus (a verse under its
 * chorus, an intro under both), and the arc REPLACES `passLift`, never stacks on it. A style
 * may shape it for itself (`JamArcShape`, #1789): the levels below are the full arc's.
 *
 * Levels are a chorus's mean, chosen by the tier each lands a plain chart (`DEFAULT_ENERGY`,
 * 0.55, mid) in, since tiers are what idioms branch on:
 */
// why: the head opens mid-low (0.52 on a plain chart; an intro stays low): the band has somewhere
// to go. No lower: a verse (0.5) must keep its opening phrase — the head's lean (`ARC_RISE`) puts
// it ~0.04 under the chorus level, at ~0.43 — clear of the low line (0.42), not thinned out to
// the low idioms a breakdown plays.
const ARC_START = -0.03;
// why: the climax, about two-thirds in, is the chorus a plain chart plays in the HIGH tier
// (0.74 mean): it opens upper mid and is high from its second phrase on (`ARC_RISE`) — a peak
// that stayed mid would be invisible to every idiom; a verse/chorus chart's chorus reaches
// about 0.95 there.
const ARC_PEAK = 0.19;
// why: a long jam (a short form, many choruses) keeps cooking after its climax, just under it —
// upper mid (0.67), the next soloist settling in — until the breath.
const ARC_SETTLE = 0.12;
// why: the breath, the chorus before the last: the band pulls back from the high tier to mid
// (0.59 on a plain chart) so the last chorus has room to lift — a clear drop, but above the
// head's own level, so it sounds like a breath late in the song and not "back to the top", and
// under `ARC_SETTLE`, so a long jam still eases down into it. Held flat: holding back is not
// building.
const ARC_BREATH = 0.04;
// why: the last chorus starts back up (0.64) and climbs into the held ending (0.75, high from
// about mid-chorus): a genre-agnostic out-chorus ends at about the climax's level, above the
// breath, with headroom over the high line (0.70) rather than grazing it.
const ARC_LAST_FROM = 0.09;
const ARC_END = 0.2;
// why: inside a building chorus the band leans in, ±0.05 around its level, as a soloist builds
// a chorus: the climax chorus opens upper mid and crosses into high by its second phrase. The
// bigger step comes at the chorus seam, where the section fill and crash already mark it.
const ARC_RISE = 0.1;

/**
 * The jam arc's energy offset for bar `index` of a counted performance of `n` choruses.
 *
 * Choruses step at their seams and lean within (`ARC_RISE`), the value held for each 4-bar
 * phrase — taken at the phrase's middle, so a chorus's mean is its level — because a band moves
 * its energy at phrase tops, and a jump mid-phrase (an idiom switching on bar 3 of 4) sounds
 * mechanical. The shape:
 * - n = 1: one build, from `ARC_START` into the ending.
 * - n = 2: the head at `ARC_START`, then the last chorus's lift into the ending.
 * - n ≥ 3: the head at `ARC_START`, building chorus by chorus to `ARC_PEAK` on chorus `peak`,
 *   which ENDS about two-thirds in; `ARC_SETTLE` after it, if the jam is long; the breath on
 *   the chorus before the last; then the last chorus's lift. At n = 3 the peak is the middle
 *   chorus and the breath is the top of the last one (the out-head comes back in under the solo
 *   it follows, then lifts), since a whole chorus of breath would leave no chorus to peak in.
 *
 * Once-only sections (#1483) sit where they play: an intro in the head (low: its role energy
 * under `ARC_START`), an outro in the last chorus's closing phrases, on the lift but at its own
 * lower role energy, so it lands rather than peaks.
 */
function jamArc(timeline: Timeline, index: number): number {
    const { bars } = timeline;
    const bar = bars[index];
    const n = (bars.at(-1)?.visit.chorus ?? 0) + 1;
    const chorus = bar.visit.chorus;
    const { first, end } = chorusBars(timeline, index);
    // Where the middle of this bar's phrase falls in its chorus, 0–1.
    const middle = index - bar.phrase.bar + bar.phrase.length / 2;
    const t = Math.min(1, (middle - first) / (end - first));
    const last = n - 1;
    if (chorus === last) {
        // The lift is read at each phrase's END, so the closing phrase plays at `ARC_END`
        // whatever the form's phrasing: the ending arrives at its level, not short of it.
        const reached = Math.min(
            1,
            (index - bar.phrase.bar + bar.phrase.length - first) / (end - first),
        );
        const from = n === 1 ? ARC_START : ARC_LAST_FROM;
        return from + (ARC_END - from) * reached;
    }
    // About two-thirds in: the peak chorus ends at round(2n/3)/n of the way, before the breath.
    const peak = Math.max(1, Math.min(n - 3, Math.round((2 * n) / 3) - 1));
    const lean = ARC_RISE * (t - 0.5);
    if (chorus <= peak) {
        return ARC_START + ((ARC_PEAK - ARC_START) * chorus) / peak + lean;
    }
    return chorus === last - 1 ? ARC_BREATH : ARC_SETTLE + lean;
}

/** Which bars a pass plays, in order. A pass that loops goes on to the top of the song. */
export interface PassWindow {
    /** First bar index played. */
    from: number;
    /** One past the last bar index played. */
    to: number;
    /**
     * The bar this PASS actually began on — not necessarily `from`. A fresh pass (a full pass
     * from the top, a play-from-here start) has nothing before it,
     * so this defaults to `from`. A pass resumed mid-flight by a settings change
     * (`BandHost.update()`) carries the original pass's own origin forward instead, so its own
     * first bar (now `from`) is still a continuation, not a fresh start: it still crashes into
     * a section arrival or answers a phrase fill if the form says so, exactly as the
     * uninterrupted pass would have.
     */
    origin?: number;
}

export function fullWindow(timeline: Timeline): PassWindow {
    return { from: 0, to: timeline.bars.length };
}

/**
 * The trade the band really plays: the one asked for (`BandSettings.trade`), when its partner is
 * there to take a turn. Trading with the soloist needs the lead on; trading with the drummer
 * needs the drums on and a drummer who can solo in this style.
 */
function tradeThatHappens(settings: BandSettings, drumSolos: boolean): TradeSettings | null {
    const wanted = settings.trade ?? null;
    return wanted &&
        (wanted.with === 'lead' ? settings.lanes.lead : settings.lanes.drums && drumSolos)
        ? wanted
        : null;
}

/**
 * The lead's job at performed bar `index` of the band's `pass` (the segment's pass plus the
 * bar's chorus), as the plan gives it: the same `leadRole` and the same trade rule `planBars`
 * uses, so a host that shows whose turn it is can never disagree with what the band plays.
 */
export function leadRoleAt(
    timeline: Timeline,
    settings: BandSettings,
    drumSolos: boolean,
    index: number,
    pass: number,
): LeadRole {
    return leadRole(timeline, index, pass, tradeThatHappens(settings, drumSolos));
}

/**
 * Plans for the bars in `window`, indexed by bar index (bars outside it are absent).
 * `next` is resolved in performance order: a looping pass's last bar leads back to the top of
 * the song. `planned` stops planning there (a chunk
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
        arcShape,
        keepsHighLine = false,
    }: {
        pass: number;
        looping: boolean;
        window: PassWindow;
        planned?: number;
        drumSolos?: boolean;
        /** The style's own shape of the jam arc (`Style.jamArc`); absent, the full arc. */
        arcShape?: JamArcShape;
        /**
         * The style's groove changes at the high tier (`Style.keepsHighLine`, #1789, #1794): no
         * lift (the build into a bigger section, the jam arc, the pass lift) moves a bar across
         * the high-tier line (`HIGH`), either way. A bar whose section sits under it stays under
         * it (at most `HIGH_CEILING`), a bar whose section sits over it stays over it.
         */
        keepsHighLine?: boolean;
    },
): BarPlan[] {
    const { bars } = timeline;
    // Where this pass truly began, for `first`/`before`/`priorFill` below — see `PassWindow`.
    const origin = window.origin ?? window.from;
    // The band's pass at bar `index` of lap `onPass` — see above.
    const passAt = (index: number, onPass: number) => onPass + bars[index].visit.chorus;
    // The player trades over the whole song (a pass resumed at a barline still is one).
    // Trading with the soloist needs it on; trading with the
    // drummer needs the drums on and a drummer who can solo in this style.
    const wanted = settings.trade ?? null;
    const trade = window.to === bars.length ? tradeThatHappens(settings, drumSolos) : null;
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
    // so the two can't drift apart. "Last bar" is window-relative (`window.to - 1`).
    // A short single-section, uncounted form: each lap's wrap is counted (`lapFill`), not
    // filled. A counted chart's choruses and a form with real section seams keep the section
    // fill. `shortForm` is the form alone (the previous lap of a final, non-looping pass is
    // still a lap of the loop); `shortLoop` is whether this call's pass wraps into another.
    const shortForm =
        bars.length < SHORT_FORM &&
        bars.every((b) => b.visit.chorus === 0 && b.visit.ordinal === bars[0].visit.ordinal);
    const shortLoop = looping && shortForm;
    const fillAt = (index: number, onPass: number): Fill => {
        const bar = bars[index];
        const isLast = index === window.to - 1;
        const role = leadRole(timeline, index, passAt(index, onPass), trade);
        if ((!looping && isLast) || (role.kind === 'trade' && role.with === 'drums')) {
            // Trading with the drummer, his turn is a solo, not a fill; the true end of a
            // non-looping song plays a held ending instead.
            return 'none';
        }
        const next = isLast ? (looping ? bars[0] : null) : bars[index + 1];
        const visitEnd = bar.barInVisit === bar.visit.barCount - 1;
        if (isLast && looping && shortLoop) {
            // The loop's wrap is a lap, counted toward the 8- and 16-bar periods.
            return lapFill(onPass, bars.length);
        }
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
    // is fuller than the first but the band never runs away from the player. Only on Auto: a
    // manual intensity is the level the player chose, and it holds every time round (#1796).
    const pinned = settings.intensity !== null;
    const passLift = (index: number) => (pinned ? 0 : Math.min(passAt(index, pass), 3) * 0.03);
    // A counted performance shaped as a jam (song mode) breathes across its choruses instead
    // (`jamArc`). Only on Auto: a manual intensity pins the level as it always has. A pass that
    // loops has no last chorus to shape towards, so it keeps the pass lift.
    const jam = settings.arc === 'jam' && !pinned && !looping;
    const depth = arcShape?.depth ?? 1;
    const lift = (index: number) => (jam ? jamArc(timeline, index) * depth : passLift(index));
    const plans: BarPlan[] = [];
    for (let i = window.from; i < Math.min(planned, window.to); i++) {
        const bar = bars[i];
        const isLast = i === window.to - 1;
        const next = isLast ? (looping ? bars[0] : null) : bars[i + 1];
        const section = sectionEnergy(bar);
        // A manual intensity sets the level; the form still shapes around it at half depth.
        let energy =
            settings.intensity === null
                ? section
                : settings.intensity + (section - DEFAULT_ENERGY) * 0.5;
        const visitEnd = bar.barInVisit === bar.visit.barCount - 1;
        // The section's own level, before anything lifts it: the side of the high line a
        // style that keeps it holds (#1794).
        const own = clamp01(energy);
        // Build into a bigger section over the last bar before it.
        if (visitEnd && next && sectionEnergy(next) > section + 0.05) {
            energy += 0.06;
        }
        // The lift is the last term, so nothing after it washes the arc out.
        energy = clamp01(energy + lift(i));
        if (keepsHighLine) {
            // The section's own side of the high line holds: the build into the next section,
            // the jam arc and a looping song's pass lift all move the bar within it.
            energy = own < HIGH ? Math.min(energy, HIGH_CEILING) : Math.max(energy, HIGH);
        }

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
            // returned head, even where the trade can't happen (the drums
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
        // genuinely fresh start (play-from-here) has nothing
        // before it and keeps the old suppression — its origin defaults to its own `from`.
        // `pass` here is the lap, not the band's pass (`passAt`): what matters is whether
        // anything was played before this bar, and a counted chart's later chorus has nothing
        // before it when the musician starts there.
        const first = i === origin && pass === 0;
        // The drummer's own turn opens with the kick under his statement, not a crash: the
        // crash is the band coming back in.
        const arrival = bar.barInVisit === 0 && !bar.visit.seamless && !first && !drumsTurn;
        // The top of a short loop's next lap is no new section: it crashes only after the
        // lap's section fill (`lapFill`), so a 4-bar loop crashes every 16 bars, not every 4.
        const lapTop = shortForm && i === 0 && pass > 0;
        // A crash marks an arrival: a new section, or the downbeat after a phrase fill once the
        // band is past quiet energy — the previous bar's fill, in performance order. Past the
        // origin, that's bar `i - 1` on this same pass, read from the form (`fillAt`) rather
        // than `plans`: a bar can sit outside this call's own window (a resumed pass's
        // predecessor, or a fresh window's own predecessor, which was never played), and even
        // one inside the window has no `plans` entry yet the first time the loop reaches it. AT
        // the origin: on pass 0 nothing played before it; on a later pass, the bar that played
        // right before it is the PREVIOUS pass's own last bar, which — having looped to reach
        // this pass at all — is a section fill (`isLast && looping` alone forces it, before
        // phrase parity is even asked), so it can never afterFill; a short loop's lap
        // answers by its own count (`lapFill`). Not asked of `fillAt`, since the current call's
        // own `looping` (which could by now be false, the render's own final pass) isn't the
        // previous pass's.
        const priorFill: Fill =
            i > origin
                ? fillAt(i - 1, pass)
                : pass === 0
                  ? 'none'
                  : shortForm
                    ? lapFill(pass - 1, bars.length)
                    : 'section';
        const afterFill = priorFill === 'phrase' && energy >= 0.5 && !lapTop;
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
            fillOrdinal:
                fill !== 'none' && shortLoop && isLast ? lapFillOrdinal(pass, bars.length) : 0,
            crash:
                (arrival && !(lapTop && priorFill !== 'section')) ||
                afterFill ||
                afterDrums ||
                ending,
            ending,
            lead,
        };
    }
    return plans;
}
