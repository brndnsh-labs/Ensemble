import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
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
 * The playing bar is `.bar.active`: a `--green` fill under `--paper` (checked below, #1991); the
 * `--green-light` pair is an "on" chip's fill and text, so `--green` is held as text on it. The accent is text on its own tint as well (the conflict banner, the toasts' actions).
 * `--primary` fills the main controls under `--on-primary`, and is a selected tab's label on
 * `--surface`.
 * (`--bar-current` is not checked: its one rule, `.bar.current`, is set by no component.)
 */
const PAIRS: [fg: string, bg: string][] = [
    ['ink', 'paper'],
    ['ink', 'surface'],
    ['muted', 'paper'],
    ['muted', 'surface'],
    ['on-ink', 'ink'],
    ['on-primary', 'primary'],
    ['primary', 'surface'],
    ['accent', 'paper'],
    ['accent', 'surface'],
    ['accent', 'accent-light'],
    ['ink', 'green-light'],
    ['green', 'green-light'],
];

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
                    expect(ratio, `${id} ${mode}: --${fg} on --${bg}`).toBeGreaterThanOrEqual(4.5);
                }
            });
        }
    }

    it('a filled main control stands off the page it sits on (3:1, WCAG non-text)', () => {
        for (const id of PALETTES) {
            for (const mode of ['day', 'stage'] as const) {
                const t = palettes[id];
                for (const bg of ['paper', 'surface']) {
                    expect(
                        contrast(t.primary[mode], t[bg][mode]),
                        `${id} ${mode}: --primary on --${bg}`,
                    ).toBeGreaterThanOrEqual(3);
                }
            }
        }
    });

    it('every palette sets its own --primary: Warm and High contrast fill with their ink, the rest with their hue', () => {
        for (const id of PALETTES) {
            const own = id === 'warm' ? root : tokens(block(css, `[data-palette="${id}"]`));
            expect(own, id).toHaveProperty('primary');
            expect(own, id).toHaveProperty('on-primary');
        }
        expect(palettes.warm.primary).toEqual(palettes.warm.ink);
        expect(palettes.contrast.primary).toEqual(palettes.contrast.ink);
    });

    it('colours live in the token blocks: no rule outside them names a raw colour', () => {
        // A raw colour outside `:root` and the palette blocks follows no palette (the songbook's
        // old glyph tints, the menu's dim, a checkbox left on the browser's blue). Faint black
        // shadows are the one exception: they read the same on every paper.
        const shadowBlack = /^#000(?:[0-9a-f]|000[0-9a-f]{2})$/i;
        const found: string[] = [];
        for (const name of readdirSync(new URL('.', import.meta.url)).filter((n) =>
            n.endsWith('.css'),
        )) {
            const source = readFileSync(new URL(`./${name}`, import.meta.url), 'utf8')
                .replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(
                    /(?::root|\[data-palette="[a-z]+"\]|\.palette-swatch\[data-palette="warm"\])\s*\{[^}]*\}/g,
                    '',
                );
            for (const [match] of source.matchAll(
                /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(|\b(?:white|black)\b(?!-)/gi,
            )) {
                if (!shadowBlack.test(match)) {
                    found.push(`${name}: ${match}`);
                }
            }
        }
        expect(found).toEqual([]);
    });

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

    it('Warm: bar numbers, inactive mode tabs and the focus ring clear their floors (#1983)', () => {
        // Bar numbers and the inactive Chart/Neck/Edit and band tabs (`--muted` on the `--hover`
        // track) are text, 4.5:1; the focus ring is a non-text indicator, 3:1 (WCAG 1.4.11)
        // against every surface it lands on, and opaque so the page never thins it.
        const t = palettes.warm;
        for (const mode of ['day', 'stage'] as const) {
            for (const bg of ['paper', 'surface', 'paper-raised']) {
                expect(
                    contrast(t['bar-number'][mode], t[bg][mode]),
                    `${mode}: --bar-number on --${bg}`,
                ).toBeGreaterThanOrEqual(4.5);
                expect(
                    contrast(t['focus-ring'][mode], t[bg][mode]),
                    `${mode}: --focus-ring on --${bg}`,
                ).toBeGreaterThanOrEqual(3);
            }
            expect(
                contrast(t.muted[mode], t.hover[mode]),
                `${mode}: --muted on --hover`,
            ).toBeGreaterThanOrEqual(4.5);
        }
    });

    it('the playing bar is a solid fill the page can see, and louder than the next-bar cue (#1991)', () => {
        // `--bar-playing` / `--on-bar-playing` alias `--green` / `--paper` on the root, so each
        // palette's own green is the fill; the aliases are pinned here, the ratios below.
        expect(block(css, ':root')).toContain('--bar-playing: var(--green);');
        expect(block(css, ':root')).toContain('--on-bar-playing: var(--paper);');
        for (const id of PALETTES) {
            for (const mode of ['day', 'stage'] as const) {
                const t = palettes[id];
                const fill = t.green[mode];
                for (const bg of ['paper', 'surface']) {
                    expect(
                        contrast(fill, t[bg][mode]),
                        `${id} ${mode}: playing fill on --${bg}`,
                    ).toBeGreaterThanOrEqual(3);
                }
                expect(
                    contrast(t.paper[mode], fill),
                    `${id} ${mode}: bar text on the playing fill`,
                ).toBeGreaterThanOrEqual(4.5);
                // The next bar's outline (its darkest, "soon" state) stays under the fill's.
                expect(
                    contrast(t['bar-next-soon'][mode], t.paper[mode]),
                    `${id} ${mode}: next cue louder than the playing fill`,
                ).toBeLessThan(contrast(fill, t.paper[mode]));
            }
        }
    });

    it('the next-bar cue is a 1px outline (#1991)', () => {
        const sheet = readFileSync(new URL('./chart-sheet.css', import.meta.url), 'utf8');
        expect(block(sheet, '.bar[data-next]')).toContain('inset 0 0 0 1px var(--bar-next)');
        expect(block(sheet, '.bar[data-next="soon"]')).toContain(
            'inset 0 0 0 1px var(--bar-next-soon)',
        );
    });

    it('bar numbers scale with the chord size, never under 11px (#1983)', () => {
        const rule = block(
            readFileSync(new URL('./chart-sheet.css', import.meta.url), 'utf8'),
            '.bar-number',
        );
        expect(rule).toContain('font-size: max(11px, calc(var(--chord-size, 30px) * 0.3));');
    });
});
