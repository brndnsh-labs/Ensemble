import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../core/types.js';
import { compileTimeline } from '../form/timeline.js';
import { score } from '../test/scores.js';
import { fullWindow, planBars, SECTION_ROLES, sectionRoleOf } from './plan.js';

/** #2021 — the names the stand offers are the band's own: each one reads back as itself. */
describe('section roles', () => {
    it('reads each offered name back as its own role', () => {
        for (const { name } of SECTION_ROLES) {
            expect(sectionRoleOf(name)).toBe(name);
            expect(sectionRoleOf(`${name} 2`)).toBe(name);
        }
    });

    it('reads aliases and gives a plain letter no role', () => {
        expect(sectionRoleOf('Hook')).toBe('Chorus');
        expect(sectionRoleOf(' coda ')).toBe('Outro');
        expect(sectionRoleOf('A')).toBeNull();
        expect(sectionRoleOf('Head')).toBeNull();
    });
});

/**
 * #2018 — the rhythm section's form roles, per section (its first bar's `BarPlan.form`), for a
 * chart of these labels, each section two bars of C, played `choruses` times (one uncounted
 * pass when absent, its head). The lead is off: the plan knows the head without it.
 */
function formRoles(labels: string[], choruses?: number): string[][] {
    const timeline = compileTimeline({
        ...score(labels.map((label) => ({ label, bars: 'C | C' }))),
        ...(choruses ? { choruses } : {}),
    });
    const settings = { ...DEFAULT_SETTINGS, lanes: { ...DEFAULT_SETTINGS.lanes, lead: false } };
    const plans = planBars(timeline, settings, {
        pass: 0,
        looping: !choruses,
        window: fullWindow(timeline),
    });
    return Array.from({ length: choruses ?? 1 }, (_, chorus) =>
        timeline.visits.filter((v) => v.chorus === chorus).map((v) => plans[v.firstBar].form),
    );
}

describe('form roles (#2018)', () => {
    it('finds the bridge as the contrast before the last A', () => {
        // A A B A (rhythm changes), A A B C (Autumn Leaves), A B C D (All The Things You Are,
        // whose B is its second A and whose C is the bridge), all by their rehearsal letters.
        expect(formRoles(['A', 'A', 'B', 'A'])).toEqual([['head', 'head', 'bridge', 'head']]);
        expect(formRoles(['A', 'A', 'B', 'C'])).toEqual([['head', 'head', 'bridge', 'head']]);
        expect(formRoles(['A', 'B', 'C', 'D'])).toEqual([['head', 'head', 'bridge', 'head']]);
    });

    it('gives an A B A C tune, a two-part tune and a blues no bridge', () => {
        expect(formRoles(['A', 'B', 'A2', 'C'])).toEqual([['head', 'head', 'head', 'head']]);
        expect(formRoles(['A', 'B'])).toEqual([['head', 'head']]);
        expect(formRoles(['A'])).toEqual([['head']]);
    });

    it('takes a section labelled Bridge as the bridge, and leaves an intro to the band', () => {
        expect(formRoles(['Intro', 'Verse', 'Bridge', 'Verse', 'Outro'])).toEqual([
            ['band', 'head', 'bridge', 'head', 'head'],
        ]);
    });

    it('solos after the head, and the out-head is a head again', () => {
        expect(formRoles(['A', 'A', 'B', 'A'], 3)).toEqual([
            ['head', 'head', 'bridge', 'head'],
            ['solo', 'solo', 'solo', 'solo'],
            ['head', 'head', 'bridge', 'head'],
        ]);
    });
});
