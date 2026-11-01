/**
 * A fill is sized by where the music is going (#2009), checked on a real verse -> chorus chart
 * through each style's own drum book.
 */
import { energyTier, fullWindow, planBars } from '../arrange/plan.js';
import { DEFAULT_SETTINGS } from '../core/types.js';
import { compileTimeline } from '../form/timeline.js';
import { STYLE_IDS, STYLES } from '../styles/index.js';
import type { BarContext } from '../styles/types.js';
import { FIXTURES } from './scores.js';

const rank = { low: 0, mid: 1, high: 2 } as const;
let strictlyLonger = 0;

describe.each(STYLE_IDS)('%s: popSong fill sizes', (style) => {
    const timeline = compileTimeline(FIXTURES.popSong);
    const settings = { ...DEFAULT_SETTINGS, style, seed: 'size' };
    const plans = planBars(timeline, settings, {
        pass: 0,
        looping: true,
        window: fullWindow(timeline),
    });
    const length = (i: number, hereEnergy: number, thereEnergy: number | null) => {
        const bar = timeline.bars[i];
        const steps = 16;
        const start = STYLES[style].drums.fillStart({
            bar,
            plan: { ...plans[i], energy: hereEnergy },
            next: thereEnergy === null ? null : { plan: { ...plans[i + 1], energy: thereEnergy } },
        } as unknown as BarContext);
        return start === null ? 0 : steps - start;
    };

    it('the fill into a higher tier is at least as long as the fill out of it', () => {
        let checked = 0;
        for (let i = 0; i < plans.length - 1; i++) {
            const [here, there] = [plans[i].energy, plans[i + 1].energy];
            if (plans[i].fill === 'none' || rank[energyTier(there)] <= rank[energyTier(here)]) {
                continue;
            }
            checked++;
            const into = length(i, here, there);
            // Out of the higher bar into the lower one, and the lower bar's own size.
            expect(into).toBeGreaterThanOrEqual(length(i, there, here));
            expect(into).toBeGreaterThanOrEqual(length(i, here, null));
            strictlyLonger += into > length(i, here, null) ? 1 : 0;
        }
        expect(checked).toBeGreaterThan(0);
    });
});

it('somewhere the fill into the chorus is longer than the verse alone would play', () => {
    expect(strictlyLonger).toBeGreaterThan(0);
});
