import { applyTheme } from '../app-controller.js';
import { useEnsembleState } from '../ui-bridge.js';

interface ThemeOption {
    key: string;
    label: string;
    /** Literal preview colors — these must show each theme's real palette
     *  regardless of the active theme, so they can't use CSS vars. */
    bg?: string;
    accent?: string;
    dots?: [string, string, string];
    light?: boolean;
}

const THEME_OPTIONS: ThemeOption[] = [
    { key: 'auto', label: 'Auto' },
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
        key: 'lead-sheet',
        label: 'Lead Sheet',
        bg: '#f6efe1',
        accent: '#b07d1f',
        dots: ['#1f6f9e', '#5e7d12', '#b02468'],
        light: true,
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
 * Visual theme selector — a radiogroup of swatch cards, each previewing a
 * theme's actual background/accent/instrument colors. Dispatches through
 * applyTheme so persistence + the App-level [data-theme] resolver handle the
 * rest (including 'auto' → system).
 */
export function ThemePicker() {
    const theme = useEnsembleState((s) => s.playback.theme);

    return (
        <div class="theme-picker" role="radiogroup" aria-label="Theme">
            {THEME_OPTIONS.map((opt) => {
                const selected = theme === opt.key;
                return (
                    <button
                        key={opt.key}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        class={`theme-swatch${selected ? ' is-selected' : ''}${
                            opt.key === 'auto' ? ' theme-swatch--auto' : ''
                        }${opt.light ? ' theme-swatch--light' : ''}`}
                        onClick={() => applyTheme(opt.key)}
                    >
                        <span
                            class="theme-swatch__preview"
                            aria-hidden="true"
                            style={opt.bg ? { background: opt.bg } : undefined}
                        >
                            {opt.key === 'auto' ? (
                                <span class="theme-swatch__auto-label">Auto</span>
                            ) : (
                                <>
                                    <span
                                        class="theme-swatch__accent"
                                        style={{ background: opt.accent }}
                                    />
                                    <span class="theme-swatch__dots">
                                        {opt.dots?.map((d) => (
                                            <span key={d} style={{ background: d }} />
                                        ))}
                                    </span>
                                </>
                            )}
                        </span>
                        <span class="theme-swatch__label">{opt.label}</span>
                    </button>
                );
            })}
        </div>
    );
}
