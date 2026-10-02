/**
 * #1472 before/after differential: a chart with no chorus count and no last-chorus coda compiles
 * to exactly the visits it did before the chorus model existed. #1473 narrows it further: a chart
 * with a "D.C./D.S. al Nth ending" jump changes on purpose (the frozen compiler refuses every
 * one), so it is left out; every other chart is still compared. Not a snapshot of new output —
 * every chart is compiled twice, by the live `compileScoreForm` and by the frozen pre-#1472
 * compiler (`tests/fixtures/score-form-pre-1472.ts`), and the two must agree: the same visits
 * (the live ones each carrying `chorus: 0`), or the same refusal.
 *
 * Which charts: the module mock below wraps every `compileScoreForm` call made while this file
 * runs. Importing the score-form, navigation and iReal-import suites re-runs their tests here, so
 * every chart they compile (refused ones included) goes through the comparison, and so does every
 * chart the iReal importer proves while importing. On top of those: every iReal fixture under
 * `tests/fixtures/ireal/` and the band's fixture charts.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { FIXTURES } from '../../../band/test/scores.js';
import { parseIRealImport } from '../../../public/songbook/ireal-import.js';
import { compileScoreForm } from '../../../public/songbook/score-form.js';
import './score-form.test.js';
import './score-navigation.test.js';
import './ireal-import.test.js';

const ledger = vi.hoisted(() => ({
    compared: 0,
    mismatches: [] as { candidate: string; before: unknown; after: unknown }[],
}));

vi.mock('../../../public/songbook/score-form.js', async (importOriginal) => {
    const live = await importOriginal<typeof import('../../../public/songbook/score-form.js')>();
    const { compileScoreForm: before } = await import('../../fixtures/score-form-pre-1472.js');

    type Outcome = { visits: unknown[] } | { error: unknown };
    const run = (compile: () => unknown[]): Outcome => {
        try {
            return { visits: compile() };
        } catch (error) {
            return { error };
        }
    };
    const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

    /**
     * The model this differential speaks for: no chorus count, no last-chorus coda (#1472) and
     * no al-ending jump (#1473).
     */
    function inScope(candidate: unknown): boolean {
        try {
            const score = candidate as {
                choruses?: unknown;
                sections?: { measures?: { start?: unknown; end?: unknown }[] }[];
            };
            if (score === null || typeof score !== 'object') {
                return true;
            }
            if (Object.hasOwn(score, 'choruses')) {
                return false;
            }
            return !(Array.isArray(score.sections) ? score.sections : []).some((section) =>
                (Array.isArray(section?.measures) ? section.measures : []).some((measure) =>
                    [measure?.start, measure?.end].some(
                        (edge) =>
                            Array.isArray(edge) &&
                            edge.some(
                                (direction) =>
                                    direction?.kind === 'last-chorus' ||
                                    (direction?.kind === 'jump' &&
                                        direction?.destination?.kind === 'ending'),
                            ),
                    ),
                ),
            );
        } catch {
            // A hostile candidate (a throwing getter): both compilers must refuse it alike.
            return true;
        }
    }

    function compileScoreForm(candidate: unknown) {
        if (!inScope(candidate)) {
            return live.compileScoreForm(candidate);
        }
        const expected = run(() => before(candidate));
        const actual = run(() => live.compileScoreForm(candidate));
        ledger.compared++;
        const agree =
            'visits' in expected && 'visits' in actual
                ? (actual.visits as { chorus: number }[]).every((visit) => visit.chorus === 0) &&
                  JSON.stringify(
                      (actual.visits as { chorus: number }[]).map(
                          ({ chorus: _, ...visit }) => visit,
                      ),
                  ) === JSON.stringify(expected.visits)
                : 'error' in expected &&
                  'error' in actual &&
                  message(actual.error) === message(expected.error);
        if (!agree) {
            let shown: string;
            try {
                shown = JSON.stringify(candidate).slice(0, 2_000);
            } catch {
                shown = String(candidate);
            }
            ledger.mismatches.push({
                candidate: shown,
                before: 'error' in expected ? message(expected.error) : expected.visits.length,
                after: 'error' in actual ? message(actual.error) : actual.visits.length,
            });
        }
        if ('error' in actual) {
            throw actual.error;
        }
        return actual.visits;
    }
    return { ...live, compileScoreForm };
});

const fixtureDir = new URL('../../fixtures/ireal/', import.meta.url);

describe('#1472 differential: uncounted charts compile as they did before the chorus model', () => {
    it.each(readdirSync(fixtureDir).filter((name) => name.endsWith('.txt')))(
        'iReal fixture %s',
        (name) => {
            const result = parseIRealImport(readFileSync(new URL(name, fixtureDir), 'utf8').trim());
            for (const song of result.songs) {
                if (song.score) {
                    compileScoreForm(song.score);
                }
            }
        },
    );

    it.each(Object.keys(FIXTURES))('band fixture %s', (name) => {
        compileScoreForm(FIXTURES[name]);
    });

    // Registered last, so it runs after every imported suite above has compiled its charts.
    it('agrees with the pre-#1472 compiler on every chart compiled in this file', () => {
        expect(ledger.mismatches).toEqual([]);
        // Not vacuous: the imported suites and fixtures compile hundreds of charts.
        expect(ledger.compared).toBeGreaterThan(200);
    });
});
