import { readFileSync } from 'node:fs';
import { PALETTES, type Palette } from '../lib/session';

/**
 * #1280 — every colour palette, in Day and in Stage, clears WCAG AA. The tokens are read out of
 * the real `style.css` (`:root` is Warm, each other palette its `[data-palette]` block), so this
 * tests what ships, not a copy.
 */
const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8');
const sheetCss = readFileSync(new URL('./settings-sheet.css', import.meta.url), 'utf8');
const layout = readFileSync(new URL('./layout.tsx', import.meta.url), 'utf8');

type Mode = 'day' | 'stage';
type Tokens = Record<string, Record<Mode, string>>;

/** The body of the first rule whose selector is exactly `selector`. */
function block(source: string, selector: string): string {
    const start = source.indexOf(`${selector} {`);
    if (start < 0) {
        throw new Error(`no ${selector} rule`);
    }
    const open = source.indexOf('{', start);
    return source.slice(open + 1, source.indexOf('}', open));
}

/** Its `--token: light-dark(day, stage)` declarations, both sides. */
function tokens(body: string): Tokens {
    const out: Tokens = {};
    for (const [, name, day, stage] of body.matchAll(
        /--([a-z0-9-]+):\s*light-dark\(\s*(#[0-9a-f]+)\s*,\s*(#[0-9a-f]+)\s*\);/gi,
    )) {
        out[name] = { day: day.toLowerCase(), stage: stage.toLowerCase() };
    }
    return out;
}

const root = tokens(block(css, ':root'));
const palettes = Object.fromEntries(
    PALETTES.map((id) => [
        id,
        id === 'warm' ? root : { ...root, ...tokens(block(css, `[data-palette="${id}"]`)) },
    ]),
) as Record<Palette, Tokens>;

function luminance(hex: string): number {
    const value = hex.slice(1);
    if (value.length !== 6) {
        throw new Error(`${hex} is not an opaque six-digit hex colour`);
    }
    const [r, g, b] = [0, 2, 4].map((i) => {
        const c = Number.parseInt(value.slice(i, i + 2), 16) / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

/**
 * Foreground on background, at 4.5:1 (AA body text) unless noted. `--accent` is text across
 * the app (`color: var(--accent)`: links, badges, the conflict banner), so it is held as text.
 * The playing bar is `.bar.active`: `--green-light` under the chord's `--ink`, with a `--green`
 * underline; the same two greens are an "on" chip's text and fill, so `--green` is held as text
 * on it. The accent is text on its own tint as well (the conflict banner, the toasts' actions).
 * (`--bar-current` is not checked: its one rule, `.bar.current`, is set by no component.)
 */
const PAIRS: [fg: string, bg: string][] = [
    ['ink', 'paper'],
    ['ink', 'surface'],
    ['muted', 'paper'],
    ['muted', 'surface'],
    ['on-ink', 'ink'],
    ['accent', 'paper'],
    ['accent', 'surface'],
    ['accent', 'accent-light'],
    ['ink', 'green-light'],
    ['green', 'green-light'],
];

/**
 * Warm's tokens are today's look and #1280 does not change them; a pair of them under AA is
 * recorded here at its measured ratio instead. Remove an entry when Warm is fixed — the test
 * fails once the pair passes, so a stale exception cannot linger.
 */
const WARM_GAPS: Record<string, number> = {
    'day muted/paper': 4.26,
    'day accent/accent-light': 4.21,
};

describe('colour palettes (#1280)', () => {
    it('defines a block for every palette but Warm, using only tokens :root defines', () => {
        for (const id of PALETTES) {
            if (id === 'warm') {
                expect(css).not.toContain('[data-palette="warm"] {');
                continue;
            }
            const own = tokens(block(css, `[data-palette="${id}"]`));
            expect(Object.keys(own).length).toBeGreaterThan(20);
            for (const name of Object.keys(own)) {
                expect(root, `${id} redefines --${name}`).toHaveProperty(name);
            }
        }
    });

    it('applies the same palette ids before hydration that lib/session reads', () => {
        const script = layout.match(/const applyStoredTheme = `([^`]+)`/)?.[1] ?? '';
        const named = [...script.matchAll(/p==='([a-z]+)'/g)].map((m) => m[1]);
        expect(named).toEqual(PALETTES.filter((id) => id !== 'warm'));
    });

    it("the Warm swatch restates :root's own paper, ink and accent", () => {
        const swatch = tokens(block(sheetCss, '.palette-swatch[data-palette="warm"]'));
        for (const name of ['paper', 'ink', 'accent']) {
            expect(swatch[name], name).toEqual(root[name]);
        }
    });

    for (const id of PALETTES) {
        for (const mode of ['day', 'stage'] as const) {
            it(`${id} in ${mode} clears AA for text on its surfaces`, () => {
                const t = palettes[id];
                for (const [fg, bg] of PAIRS) {
                    const ratio = contrast(t[fg][mode], t[bg][mode]);
                    const gap = id === 'warm' ? WARM_GAPS[`${mode} ${fg}/${bg}`] : undefined;
                    if (gap !== undefined) {
                        expect(
                            ratio,
                            `Warm ${mode} ${fg}/${bg} is fixed: drop it from WARM_GAPS`,
                        ).toBeLessThan(4.5);
                        expect(ratio).toBeCloseTo(gap, 2);
                        continue;
                    }
                    expect(ratio, `${id} ${mode}: --${fg} on --${bg}`).toBeGreaterThanOrEqual(4.5);
                }
            });
        }
    }

    it('High contrast holds body and muted text to AAA (7:1)', () => {
        const t = palettes.contrast;
        for (const mode of ['day', 'stage'] as const) {
            for (const [fg, bg] of PAIRS) {
                expect(
                    contrast(t[fg][mode], t[bg][mode]),
                    `${mode} ${fg}/${bg}`,
                ).toBeGreaterThanOrEqual(7);
            }
        }
    });
});
