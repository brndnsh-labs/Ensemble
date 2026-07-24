import { setMode, setPalette } from '../controllers/app-controller.js';
import type { Palette, ThemeMode } from '../types.js';
import { useEnsembleState } from '../ui-bridge.js';

interface PaletteOption {
    key: Palette;
    label: string;
    /** Literal preview colors (the palette's dark signature) — these must show
     *  the real palette regardless of the active theme, so they can't use CSS
     *  vars. Order: background, accent, [chords, bass, soloist] dots. */
    bg: string;
    accent: string;
    dots: [string, string, string];
}

const PALETTE_OPTIONS: PaletteOption[] = [
    {
        key: 'after-hours',
        label: 'After Hours',
        bg: '#14110d',
        accent: '#d9a441',
        dots: ['#4a9fd4', '#9ab33a', '#e0568f'],
    },
    {
        key: 'midnight',
        label: 'Midnight',
        bg: '#0c141d',
        accent: '#46b4d6',
        dots: ['#5ab0e8', '#6fc06a', '#e069a4'],
    },
    {
        key: 'forest',
        label: 'Forest',
        bg: '#0d1512',
        accent: '#3fb59a',
        dots: ['#4aa6c4', '#7fc04a', '#e06aa0'],
    },
    {
        key: 'sunset',
        label: 'Sunset',
        bg: '#1a1210',
        accent: '#f0843c',
        dots: ['#5aa6c4', '#c0b04a', '#e85c7a'],
    },
    {
        key: 'synthwave',
        label: 'Synthwave',
        bg: '#0e0a1a',
        accent: '#e85cc0',
        dots: ['#4ad0e8', '#5ce8a0', '#f06cd0'],
    },
    {
        key: 'high-contrast',
        label: 'High Contrast',
        bg: '#000000',
        accent: '#ffd24a',
        dots: ['#5cc2ff', '#86e23f', '#ff6fb0'],
    },
];

/**
 * Color-palette selector — a radiogroup of swatch cards, each previewing a
 * palette's dark signature (background/accent/instrument colors). The chosen
 * light/dark variant is governed separately by {@link ModeToggle}. Dispatches
 * through setPalette so persistence + the App-level [data-palette] resolver
 * handle the rest.
 */
export function PalettePicker() {
    const palette = useEnsembleState((s) => s.playback.palette);

    return (
        <div class="theme-picker" role="radiogroup" aria-label="Color palette">
            {PALETTE_OPTIONS.map((opt) => {
                const selected = palette === opt.key;
                return (
                    <button
                        key={opt.key}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        class={`theme-swatch${selected ? ' is-selected' : ''}`}
                        onClick={() => setPalette(opt.key)}
                    >
                        <span
                            class="theme-swatch__preview"
                            aria-hidden="true"
                            style={{ background: opt.bg }}
                        >
                            <span class="theme-swatch__accent" style={{ background: opt.accent }} />
                            <span class="theme-swatch__dots">
                                {opt.dots.map((d) => (
                                    <span key={d} style={{ background: d }} />
                                ))}
                            </span>
                        </span>
                        <span class="theme-swatch__label">{opt.label}</span>
                    </button>
                );
            })}
        </div>
    );
}

const MODE_OPTIONS: { key: ThemeMode; label: string }[] = [
    { key: 'auto', label: 'Auto' },
    { key: 'light', label: 'Light' },
    { key: 'dark', label: 'Dark' },
];

/**
 * Light/dark mode toggle — a segmented control. 'Auto' follows the OS
 * (prefers-color-scheme); Light/Dark force a variant of the chosen palette.
 */
export function ModeToggle() {
    const mode = useEnsembleState((s) => s.playback.mode);

    return (
        <div class="mode-toggle" role="radiogroup" aria-label="Light or dark mode">
            {MODE_OPTIONS.map((opt) => {
                const selected = mode === opt.key;
                return (
                    <button
                        key={opt.key}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        class={`mode-toggle__option${selected ? ' is-selected' : ''}`}
                        onClick={() => setMode(opt.key)}
                    >
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}
