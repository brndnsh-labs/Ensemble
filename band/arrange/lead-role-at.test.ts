/**
 * `leadRoleAt` (#1990) is what a host reads to show whose turn it is. It must give the plan's own
 * answer: the same `leadRole`, with the trade only where the band can really take it.
 */

import { DEFAULT_SETTINGS } from '../core/types.js';
import { compileTimeline } from '../form/timeline.js';
import { FIXTURES } from '../test/scores.js';
import { leadRole } from './cycle.js';
import { leadRoleAt } from './plan.js';

const timeline = compileTimeline(Object.values(FIXTURES)[0]);
const lanes = { drums: true, bass: true, comp: true, lead: true };

describe('leadRoleAt', () => {
    it("is the plan's leadRole where the trade is live", () => {
        const trade = { with: 'drums', bars: 2, choruses: null } as const;
        const settings = { ...DEFAULT_SETTINGS, lanes, trade };
        for (let pass = 0; pass < 3; pass++) {
            for (const bar of timeline.bars) {
                expect(leadRoleAt(timeline, settings, true, bar.index, pass)).toEqual(
                    leadRole(timeline, bar.index, pass, trade),
                );
            }
        }
    });

    it('sees no trade with a drummer who does not solo, or a soloist who is off', () => {
        const drums = {
            ...DEFAULT_SETTINGS,
            lanes,
            trade: { with: 'drums', bars: 2, choruses: null },
        } as const;
        const lead = {
            ...DEFAULT_SETTINGS,
            lanes: { ...lanes, lead: false },
            trade: { with: 'lead', bars: 2, choruses: null },
        } as const;
        for (const [settings, drumSolos] of [
            [drums, false],
            [lead, true],
        ] as const) {
            for (const bar of timeline.bars) {
                expect(leadRoleAt(timeline, settings, drumSolos, bar.index, 1)).toEqual(
                    leadRole(timeline, bar.index, 1, null),
                );
            }
        }
    });
});
