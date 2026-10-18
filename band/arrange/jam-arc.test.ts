/**
 * The jam arc (#1785): a counted performance shaped as a jam (`BandSettings.arc === 'jam'`,
 * song mode) starts mid-low, builds to a peak about two-thirds in, eases back for one chorus
 * and lifts into the last chorus and the held ending. Asserted as ranges over chorus means and
 * tiers, never as a snapshot of the numbers — so the constants can be tuned by ear.
 */

import type { SemanticScore } from '../../core/songbook/score-types.js';
import { type BandSettings, DEFAULT_SETTINGS } from '../core/types.js';
import { compileTimeline, type Timeline } from '../form/timeline.js';
import { performPass } from '../perform.js';
import { STYLE_IDS, STYLES } from '../styles/index.js';
import type { Style } from '../styles/types.js';
import { COUNTED_FIXTURES, FIXTURES, score } from '../test/scores.js';
import { type BarPlan, energyTier, planBars } from './plan.js';

const A8 = 'C | Am7 | Dm7 | G7 | C | Am7 | Dm7 | G7';
/** A plain 32-bar form whose every section sits at the default energy (0.55). */
const plain = score([
    { label: 'A', bars: A8 },
    { label: 'A', bars: A8 },
    { label: 'A', bars: A8 },
    { label: 'A', bars: A8 },
]);
/** A verse/chorus song with no targets: the role table shapes it (verse 0.5, chorus 0.75). */
const verseChorus = score([
    { label: 'Verse', bars: A8 },
    { label: 'Chorus', bars: 'F | G | Am | C | F | G | C | C' },
]);
/** The blues fixture: one 12-bar section, three phrases a chorus. */
const blues = FIXTURES.blues;

const CHARTS: Record<string, SemanticScore> = { plain, verseChorus, blues };
const JAM: BandSettings = { ...DEFAULT_SETTINGS, arc: 'jam' };

function counted(chart: SemanticScore, choruses: number): Timeline {
    return compileTimeline({ ...chart, choruses });
}

/** What a style tells the plan about its lifts, as `perform.ts` passes it. */
type Shape = Pick<Style, 'jamArc' | 'keepsHighLine'>;

function plan(
    timeline: Timeline,
    settings: BandSettings,
    looping = false,
    shape: Shape = {},
    pass = 0,
): BarPlan[] {
    return planBars(timeline, settings, {
        pass,
        looping,
        window: { from: 0, to: timeline.bars.length },
        arcShape: shape.jamArc,
        keepsHighLine: shape.keepsHighLine,
    });
}

/** Mean energy of each chorus, by bar. */
function chorusMeans(timeline: Timeline, plans: BarPlan[]): number[] {
    const sums: number[] = [];
    const counts: number[] = [];
    for (const bar of timeline.bars) {
        const c = bar.visit.chorus;
        sums[c] = (sums[c] ?? 0) + plans[bar.index].energy;
        counts[c] = (counts[c] ?? 0) + 1;
    }
    return sums.map((sum, c) => sum / counts[c]);
}

function chorusEndFraction(timeline: Timeline, chorus: number): number {
    const end = timeline.bars.filter((bar) => bar.visit.chorus <= chorus).length;
    return end / timeline.bars.length;
}

/** The closing sections' labels, as the plan's role table reads them. */
const CLOSING = /^(outro|coda|ending|tag)/i;

const loudest = (values: number[]) => values.indexOf(Math.max(...values));

describe('the jam arc across a counted performance', () => {
    for (const [name, chart] of Object.entries(CHARTS)) {
        for (const n of [4, 6, 8, 10, 16]) {
            it(`${name}, ${n} choruses: build, peak ending between half and four-fifths in, breath, lift`, () => {
                const timeline = counted(chart, n);
                const means = chorusMeans(timeline, plan(timeline, JAM));
                const peak = loudest(means);
                // The climax is reached late in the song but before the end: the peak chorus
                // ends between half and four-fifths of the way in (two-thirds where the chorus
                // count allows; n = 4 can only end it at the half).
                const end = chorusEndFraction(timeline, peak);
                expect(end).toBeGreaterThanOrEqual(0.5);
                expect(end).toBeLessThanOrEqual(0.8);
                // A build, chorus on chorus, from the head to the peak.
                for (let c = 1; c <= peak; c++) {
                    expect(means[c]).toBeGreaterThan(means[c - 1]);
                }
                // The head starts well under the peak: somewhere to go.
                expect(means[peak] - means[0]).toBeGreaterThanOrEqual(0.15);
                // The breath: the chorus before the last eases well back from the peak.
                expect(means[n - 2]).toBeLessThan(means[peak] - 0.1);
                // The lift: the last chorus above the breath, ending about at the climax.
                expect(means[n - 1]).toBeGreaterThan(means[n - 2] + 0.05);
                expect(means[n - 1]).toBeLessThanOrEqual(means[peak] + 0.02);
                // Nothing between the peak and the breath outdoes the peak.
                for (let c = peak + 1; c < n - 1; c++) {
                    expect(means[c]).toBeLessThan(means[peak]);
                }
            });
        }
    }

    it('three choruses: the middle one peaks, the last eases back in and lifts', () => {
        for (const chart of Object.values(CHARTS)) {
            const timeline = counted(chart, 3);
            const plans = plan(timeline, JAM);
            const means = chorusMeans(timeline, plans);
            expect(loudest(means)).toBe(1);
            expect(means[1] - means[0]).toBeGreaterThanOrEqual(0.15);
            expect(means[2]).toBeLessThan(means[1]);
            expect(means[2]).toBeGreaterThan(means[0]);
            // The last chorus's own lift: its closing bars above its opening ones.
            const last = timeline.bars.filter((bar) => bar.visit.chorus === 2);
            const at = (k: number) => plans[last[k].index].energy;
            if (chart === plain) {
                expect(at(last.length - 1)).toBeGreaterThan(at(0) + 0.05);
            }
        }
    });

    it('one or two choruses: a simple build into the ending', () => {
        for (const n of [1, 2]) {
            const timeline = counted(plain, n);
            const plans = plan(timeline, JAM);
            const energies = timeline.bars.map((bar) => plans[bar.index].energy);
            for (let i = 1; i < energies.length; i++) {
                expect(energies[i]).toBeGreaterThanOrEqual(energies[i - 1]);
            }
            expect(energies.at(-1)! - energies[0]).toBeGreaterThanOrEqual(0.08);
            // It ends where the idioms hear it: high.
            expect(energyTier(energies.at(-1)!)).toBe('high');
        }
    });

    it('moves a default-energy chart between tiers: mid head, high peak, mid breath', () => {
        for (const n of [4, 6, 8, 10]) {
            const timeline = counted(plain, n);
            const plans = plan(timeline, JAM);
            const means = chorusMeans(timeline, plans);
            const peak = loudest(means);
            const tiersOf = (chorus: number) =>
                new Set(
                    timeline.bars
                        .filter((bar) => bar.visit.chorus === chorus)
                        .map((bar) => energyTier(plans[bar.index].energy)),
                );
            expect([...tiersOf(0)]).toEqual(['mid']);
            // The climax builds as a soloist does: it opens upper mid and is high from its
            // second phrase on. A peak that stayed mid would be invisible to every idiom.
            const climax = timeline.bars.filter((bar) => bar.visit.chorus === peak);
            const opening = climax[0].phrase.length;
            for (const [k, bar] of climax.entries()) {
                const tier = energyTier(plans[bar.index].energy);
                expect(tier, `n=${n} climax bar ${k}`).toBe(k < opening ? tier : 'high');
                expect(tier, `n=${n} climax bar ${k}`).not.toBe('low');
            }
            expect([...tiersOf(n - 2)]).toEqual(['mid']);
            // The last chorus lands high by its end.
            const lastBar = timeline.bars.at(-1)!;
            expect(energyTier(plans[lastBar.index].energy)).toBe('high');
        }
    });

    it('holds each phrase at one level: the band moves at phrase tops, never mid-phrase', () => {
        const timeline = counted(plain, 6);
        const plans = plan(timeline, JAM);
        for (const bar of timeline.bars) {
            if (bar.phrase.bar > 0) {
                expect(plans[bar.index].energy).toBe(plans[bar.index - 1].energy);
            }
        }
    });

    it('lands a once-only outro and coda below the climax rather than peaking on them', () => {
        let landed = 0;
        for (const [name, chart] of Object.entries(COUNTED_FIXTURES)) {
            const timeline = compileTimeline(chart);
            const plans = plan(timeline, JAM);
            const climax = Math.max(...chorusMeans(timeline, plans));
            for (const bar of timeline.bars) {
                if (CLOSING.test(bar.visit.label.trim())) {
                    expect(plans[bar.index].energy, `${name} bar ${bar.index}`).toBeLessThan(
                        climax,
                    );
                    landed++;
                }
            }
            expect(plans[timeline.bars.length - 1].ending, name).toBe(true);
        }
        // The fixtures hold both an outro (popSongThree) and a last-chorus coda (bluesCoda).
        expect(landed).toBeGreaterThan(0);
    });
});

describe('the jam arc changes nothing it was not asked to', () => {
    const timelines = [
        ...Object.values(COUNTED_FIXTURES).map((chart) => compileTimeline(chart)),
        ...Object.values(CHARTS).flatMap((chart) => [1, 3, 5].map((n) => counted(chart, n))),
    ];

    it('a manual intensity plans exactly as it does without the arc', () => {
        for (const timeline of timelines) {
            for (const intensity of [0.2, 0.55, 0.9]) {
                const manual = { ...DEFAULT_SETTINGS, intensity };
                expect(plan(timeline, { ...manual, arc: 'jam' })).toEqual(plan(timeline, manual));
            }
        }
    });

    it('an absent or null arc plans exactly as before', () => {
        for (const timeline of timelines) {
            expect(plan(timeline, { ...DEFAULT_SETTINGS, arc: null })).toEqual(
                plan(timeline, DEFAULT_SETTINGS),
            );
        }
    });

    it('a pass that loops keeps the pass lift', () => {
        for (const chart of Object.values(CHARTS)) {
            const timeline = compileTimeline(chart);
            for (const pass of [0, 2, 5]) {
                const options = {
                    pass,
                    looping: true,
                    window: { from: 0, to: timeline.bars.length },
                };
                expect(planBars(timeline, JAM, options)).toEqual(
                    planBars(timeline, DEFAULT_SETTINGS, options),
                );
            }
        }
    });

    it('the arc moves energy on an Auto counted performance', () => {
        const timeline = counted(plain, 6);
        expect(plan(timeline, JAM)).not.toEqual(plan(timeline, DEFAULT_SETTINGS));
    });
});

/** A verse, a pre-chorus building into the chorus, a chorus: the pre sits just under the line. */
const preChorus = score([
    { label: 'Verse', bars: A8 },
    { label: 'Pre', bars: 'F | G | F | G' },
    { label: 'Chorus', bars: 'F | G | Am | C | F | G | C | C' },
]);
/** A solo just under the line building into a chorus: its build bar alone would cross. */
const soloChorus = score([
    { label: 'Verse', bars: A8 },
    { label: 'Solo', bars: A8 },
    { label: 'Chorus', bars: 'F | G | Am | C | F | G | C | C' },
]);
const loopCharts: Record<string, SemanticScore> = { ...CHARTS, preChorus, soloChorus };
const HOLDING = { reggae: STYLES.reggae, bossa: STYLES.bossa };
const isHigh = (plan: BarPlan) => energyTier(plan.energy) === 'high';

describe('a style whose high tier is another groove keeps its side of the line (#1789)', () => {
    const charts = { ...CHARTS, preChorus };

    it('only reggae and bossa reshape the arc', () => {
        expect(STYLE_IDS.filter((id) => STYLES[id].jamArc)).toEqual(['bossa', 'reggae']);
        expect(STYLE_IDS.filter((id) => STYLES[id].keepsHighLine)).toEqual(['bossa', 'reggae']);
    });

    for (const [id, style] of Object.entries(HOLDING)) {
        it(`${id}: the arc never carries a bar across the high line`, () => {
            for (const [name, chart] of Object.entries(charts)) {
                for (let n = 1; n <= 16; n++) {
                    const timeline = counted(chart, n);
                    const arced = plan(timeline, JAM, false, style);
                    const without = plan(timeline, { ...JAM, arc: null }, false, style);
                    // The form's own energy: the arc at no depth (no pass lift either).
                    const own = plan(timeline, JAM, false, { jamArc: { depth: 0 } });
                    for (const bar of timeline.bars) {
                        const at = `${name} n=${n} bar ${bar.index}`;
                        if (isHigh(arced[bar.index])) {
                            expect(isHigh(without[bar.index]), at).toBe(true);
                        }
                        expect(isHigh(arced[bar.index]), at).toBe(isHigh(own[bar.index]));
                    }
                }
            }
        });

        it(`${id}: the arc's shape still holds in the chorus means`, () => {
            for (const chart of Object.values(CHARTS)) {
                for (const n of [4, 6, 8, 10, 16]) {
                    const timeline = counted(chart, n);
                    const means = chorusMeans(timeline, plan(timeline, JAM, false, style));
                    const peak = loudest(means);
                    for (let c = 1; c <= peak; c++) {
                        expect(means[c]).toBeGreaterThan(means[c - 1]);
                    }
                    expect(means[0]).toBeLessThan(means[peak]);
                    expect(means[n - 2]).toBeLessThan(means[peak]);
                    expect(means[n - 1]).toBeGreaterThan(means[n - 2]);
                }
            }
        });

        it(`${id}: the climax and the last chorus lean in phrase on phrase, not flat on the line`, () => {
            // The depth's job: the arc moves under the line at its own scale, so the ceiling
            // stays a guard. A full arc would press the climax flat against it.
            for (const chart of [plain, blues]) {
                for (const n of [4, 8, 16]) {
                    const timeline = counted(chart, n);
                    const plans = plan(timeline, JAM, false, style);
                    const peak = loudest(chorusMeans(timeline, plans));
                    for (const chorus of [peak, n - 1]) {
                        const tops = timeline.bars.filter(
                            (bar) => bar.visit.chorus === chorus && bar.phrase.bar === 0,
                        );
                        for (let k = 1; k < tops.length; k++) {
                            expect(
                                plans[tops[k].index].energy,
                                `n=${n} chorus ${chorus} phrase ${k}`,
                            ).toBeGreaterThan(plans[tops[k - 1].index].energy);
                        }
                    }
                }
            }
        });

        it(`${id}: outside song mode only the line moves: a bar the pass lift would carry over it sits just under it (#1794)`, () => {
            const held = (a: BarPlan[], b: BarPlan[], at: string) => {
                let crossed = 0;
                for (const [i, mine] of a.entries()) {
                    const plain = b[i];
                    if (!mine) {
                        continue;
                    }
                    // Everything but the energy is the plan's own.
                    expect({ ...mine, energy: 0 }, `${at} bar ${i}`).toEqual({
                        ...plain,
                        energy: 0,
                    });
                    expect(isHigh(mine) && !isHigh(plain), `${at} bar ${i}`).toBe(false);
                    // (A float's last digit is not a move: 0.6 + 0.09 is a hair over 0.69.)
                    if (Math.abs(mine.energy - plain.energy) > 1e-9) {
                        // Only a bar the lift took over the ceiling (0.69, a hair under the
                        // line), and only down to it.
                        expect(plain.energy, `${at} bar ${i}`).toBeGreaterThan(0.69);
                        expect(mine.energy, `${at} bar ${i}`).toBeCloseTo(0.69, 10);
                        crossed += isHigh(plain) ? 1 : 0;
                    }
                }
                return crossed;
            };
            let crossed = 0;
            for (const [name, chart] of Object.entries(charts)) {
                const timeline = counted(chart, 5);
                for (const settings of [
                    { ...DEFAULT_SETTINGS, arc: null },
                    DEFAULT_SETTINGS,
                    { ...JAM, intensity: 0.55 },
                    { ...JAM, intensity: 0.9 },
                ]) {
                    crossed += held(
                        plan(timeline, settings, false, style),
                        plan(timeline, settings),
                        `${name} counted`,
                    );
                }
                const once = compileTimeline(chart);
                for (let pass = 0; pass <= 5; pass++) {
                    crossed += held(
                        plan(once, JAM, true, style, pass),
                        plan(once, JAM, true, {}, pass),
                        `${name} pass ${pass}`,
                    );
                }
            }
            // Not vacuous: without the guard, the pass lift does take bars over the line.
            expect(crossed).toBeGreaterThan(0);
        });

        it(`${id}: a looping song keeps every bar on its section's side of the line, every time round (#1794)`, () => {
            // The oracle is the chart's, not the engine's: a section's own tier is its first
            // bar's on the first pass, where nothing has lifted it yet (no pass lift on the first
            // time round, no build but in a section's last bar).
            let tempting = 0;
            for (const [name, chart] of Object.entries(loopCharts)) {
                const once = compileTimeline(chart);
                for (const settings of [
                    DEFAULT_SETTINGS,
                    { ...DEFAULT_SETTINGS, intensity: 0.62 },
                    { ...DEFAULT_SETTINGS, intensity: 0.68 },
                ]) {
                    const first = plan(once, settings, true, style, 0);
                    const sectionTier = (index: number) => {
                        const bar = once.bars[index];
                        return energyTier(first[index - bar.barInVisit].energy);
                    };
                    for (let pass = 0; pass <= 5; pass++) {
                        const held = plan(once, settings, true, style, pass);
                        const free = plan(once, settings, true, {}, pass);
                        for (const bar of once.bars) {
                            const at = `${name} @${settings.intensity} pass ${pass} bar ${bar.index}`;
                            expect(energyTier(held[bar.index].energy), at).toBe(
                                sectionTier(bar.index),
                            );
                            if (energyTier(free[bar.index].energy) !== sectionTier(bar.index)) {
                                tempting++;
                            }
                        }
                    }
                }
            }
            // Not vacuous: unguarded, the build and the pass lift do carry bars over the line.
            expect(tempting).toBeGreaterThan(0);
        });

        it(`${id}: the pass lift still raises a looping song under the line`, () => {
            const once = compileTimeline(preChorus);
            const mean = (plans: BarPlan[]) =>
                plans.reduce((sum, p) => sum + p.energy, 0) / plans.length;
            expect(mean(plan(once, DEFAULT_SETTINGS, true, style, 3))).toBeGreaterThan(
                mean(plan(once, DEFAULT_SETTINGS, true, style, 0)) + 0.03,
            );
        });
    }

    it('every other style plans a song-mode take exactly as the full arc does', () => {
        for (const id of STYLE_IDS.filter((id) => !(id in HOLDING))) {
            for (const chart of Object.values(charts)) {
                for (const n of [1, 3, 4, 8]) {
                    const timeline = counted(chart, n);
                    const full = plan(timeline, JAM, false, { jamArc: { depth: 1 } });
                    expect(plan(timeline, JAM, false, STYLES[id])).toEqual(full);
                    expect(plan(timeline, JAM)).toEqual(full);
                }
            }
        }
    });

    it('the performance reads the style: a song-mode bossa take never reaches for the ride', () => {
        const timeline = counted(plain, 8);
        const rides = (settings: BandSettings) =>
            performPass(
                timeline,
                { ...settings, style: 'bossa' },
                { pass: 0, looping: false },
            ).events.filter((event) => event.lane === 'drums' && event.piece === 'ride').length;
        expect(rides(JAM)).toBe(0);
        // Not vacuous: the same take pinned in the high tier rides.
        expect(rides({ ...JAM, intensity: 0.85 })).toBeGreaterThan(0);
    });

    it('a looping bossa song rides where the chart does, however many times round (#1794)', () => {
        // The chorus is high on its own (0.75) and rides from the first time through; the
        // pre-chorus's build bar is just under the line and must stay on the hat.
        const once = compileTimeline(preChorus);
        const ridden = (pass: number) =>
            [
                ...new Set(
                    performPass(
                        once,
                        { ...DEFAULT_SETTINGS, style: 'bossa' },
                        { pass, looping: true },
                    )
                        .events.filter((event) => event.lane === 'drums' && event.piece === 'ride')
                        .map((event) => event.bar),
                ),
            ].sort((a, b) => a - b);
        const first = ridden(0);
        expect(first.length).toBeGreaterThan(0);
        for (let pass = 1; pass <= 5; pass++) {
            expect(ridden(pass), `pass ${pass}`).toEqual(first);
        }
    });
});

describe('a manual intensity holds its level every time round (#1796)', () => {
    const PINS = [0.3, 0.55, 0.68];

    it('a looping song plans every bar at the same energy on passes 0–5', () => {
        for (const [name, chart] of Object.entries(CHARTS)) {
            const timeline = compileTimeline(chart);
            for (const intensity of PINS) {
                const settings = { ...DEFAULT_SETTINGS, intensity };
                const first = plan(timeline, settings, true).map((p) => p.energy);
                for (let pass = 1; pass <= 5; pass++) {
                    const energies = plan(timeline, settings, true, {}, pass).map((p) => p.energy);
                    expect(energies, `${name} at ${intensity}, pass ${pass}`).toEqual(first);
                }
            }
        }
    });

    it("a counted chart's choruses plan each bar of the chorus alike", () => {
        for (const [name, chart] of Object.entries(CHARTS)) {
            const timeline = counted(chart, 4);
            const perChorus = timeline.bars.filter((bar) => bar.visit.chorus === 0).length;
            for (const intensity of PINS) {
                for (const settings of [
                    { ...DEFAULT_SETTINGS, intensity },
                    { ...JAM, intensity },
                ]) {
                    const energies = plan(timeline, settings).map((p) => p.energy);
                    for (const bar of timeline.bars) {
                        expect(
                            energies[bar.index],
                            `${name} at ${intensity}, bar ${bar.index}`,
                        ).toBeCloseTo(energies[bar.index % perChorus], 9);
                    }
                }
            }
        }
    });

    it('Auto still lifts a looping song each time round', () => {
        const timeline = compileTimeline(plain);
        const mean = (pass: number) =>
            plan(timeline, DEFAULT_SETTINGS, true, {}, pass).reduce((s, p) => s + p.energy, 0) /
            timeline.bars.length;
        expect(mean(3)).toBeGreaterThan(mean(0) + 0.05);
    });
});
