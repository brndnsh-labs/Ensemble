/**
 * The critique: each style's musical claims, as numbers over whole performances. One runner,
 * one metric library (`critique/harness.ts`), one claims file per style (`claims/<id>.ts`).
 * A failing claim prints the measured value; each take prints its report.
 */
import type { StyleId } from '../core/types.js';
import { CLAIMS } from './claims/index.js';
import { METRICS, type Metric, perform, type TakeSpec } from './critique/harness.js';

function label({ comp, intensity, bass, lead }: TakeSpec): string {
    const parts = [
        lead ? `lead ${lead}` : '',
        comp ? `on ${comp}` : '',
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
