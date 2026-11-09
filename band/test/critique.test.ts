/**
 * The critique: each style's musical claims, as numbers over whole performances. One runner,
 * one metric library (`critique/harness.ts`), one claims file per style (`claims/<id>.ts`).
 * A failing claim prints the measured value; each take prints its report. One claim compares
 * the styles with each other (their fill vocabularies), so it lives here, not in a style's file.
 */
import type { StyleId } from '../core/types.js';
import { CLAIMS } from './claims/index.js';
import {
    fillVocabulary,
    METRICS,
    type Metric,
    perform,
    type TakeSpec,
} from './critique/harness.js';

function label({ comp, intensity, bass, lead, trade, colour, leadInstrument }: TakeSpec): string {
    const parts = [
        lead ? `lead ${lead}` : '',
        leadInstrument ? `on a ${leadInstrument} lead` : '',
        trade ? `trading ${trade.bars}s with the ${trade.with}` : '',
        comp ? `on ${comp}` : '',
        colour ? 'on the written-colour chart' : '',
        intensity === undefined ? '' : `at energy ${intensity}`,
        bass === false ? 'without bass' : '',
    ].filter(Boolean);
    return parts.length ? ` ${parts.join(', ')}` : '';
}

for (const style of Object.keys(CLAIMS) as StyleId[]) {
    const { metrics, takes } = CLAIMS[style];
    for (const { take, claims } of takes) {
        describe(`${style} critique${label(take)}`, () => {
            const performed = perform(
                style,
                take.intensity ?? null,
                take.comp,
                take.bass,
                take.lead,
                take.trade,
                take.colour,
                take.leadInstrument,
            );
            const report: string[] = [];
            it.each(claims)('%s in [%d, %d] — %s', (metric, min, max) => {
                const measure: Metric | undefined =
                    metrics[metric] ?? (METRICS as Record<string, Metric>)[metric];
                if (!measure) {
                    throw new Error(`unknown metric ${metric}`);
                }
                const value = measure(performed);
                report.push(`${metric.padEnd(26)} ${value.toFixed(3)}  [${min}, ${max}]`);
                expect(value, `${style} ${metric} = ${value.toFixed(3)}`).toBeGreaterThanOrEqual(
                    min,
                );
                expect(value, `${style} ${metric} = ${value.toFixed(3)}`).toBeLessThanOrEqual(max);
            });
            afterAll(() => {
                console.log(`\n${style} critique${label(take)}\n  ${report.join('\n  ')}`);
            });
        });
    }
}

/**
 * Every style fills in its own words (#2022): of every two styles, the share of their fills
 * (`fillVocabulary`, the union of both) that the two share. Measured 0.200 at most (rock and
 * metal: an eighth-note tom run each), against 1.000 before, when seven styles played the one
 * descending tom run (reggae's and neo-soul's sets were the same set). The ceiling sits midway.
 */
describe('the fill vocabularies', () => {
    it('no two styles share their fills: shared fills at most 0.6 of either pair', () => {
        const styles = Object.keys(CLAIMS) as StyleId[];
        const sets = new Map(styles.map((style) => [style, fillVocabulary(style)]));
        const report: string[] = [];
        let most = 0;
        styles.forEach((a, i) => {
            for (const b of styles.slice(i + 1)) {
                const [x, y] = [sets.get(a)!, sets.get(b)!];
                const shared = [...x].filter((shape) => y.has(shape)).length;
                const overlap = shared / new Set([...x, ...y]).size;
                most = Math.max(most, overlap);
                if (overlap > 0.1) {
                    report.push(`${a}/${b} ${overlap.toFixed(3)}`);
                }
            }
        });
        console.log(
            `\nfill vocabularies: most shared ${most.toFixed(3)}\n  ${report.join('\n  ')}`,
        );
        for (const style of styles) {
            expect(sets.get(style)!.size, `${style} plays fills`).toBeGreaterThan(0);
        }
        expect(most).toBeLessThanOrEqual(0.6);
    });
});
