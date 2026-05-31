import type { JSX } from 'preact';

/**
 * The Ensemble icon language — one cohesive, hand-drawn SVG set that replaces
 * the ad-hoc emoji the UI used to render. Every glyph is authored on a 24×24
 * grid, draws with `currentColor`, and (for line glyphs) inherits the wrapper's
 * stroke settings, so a single `<Icon>` call sizes and tints from CSS.
 *
 * Solid glyphs (transport, note-heads, dots) override fill/stroke locally.
 * Instrument glyphs use a shared musical vocabulary — keys, note, chord-stack,
 * low waveform, drum — rather than literal photographic instruments, so they
 * stay legible at 1em.
 */
export type IconName =
    | 'lock'
    | 'upload'
    | 'visualizer'
    | 'mixer'
    | 'more'
    | 'power'
    | 'gear'
    | 'dice'
    | 'book'
    | 'copy'
    | 'edit'
    | 'trash'
    | 'duplicate'
    | 'link'
    | 'save'
    | 'sparkle'
    | 'check'
    | 'close'
    | 'star'
    | 'star-outline'
    | 'caret'
    | 'refresh'
    | 'undo'
    | 'install'
    | 'headphones'
    | 'lightbulb'
    | 'note'
    | 'plus'
    | 'warn'
    | 'success'
    | 'info'
    | 'drums'
    | 'bass'
    | 'chords'
    | 'harmony'
    | 'soloist';

const solid = { fill: 'currentColor', stroke: 'none' } as const;

export const ICON_PATHS: Record<IconName, () => JSX.Element> = {
    // ---- Actions (line) ----
    lock: () => (
        <>
            <rect x="4.75" y="10.5" width="14.5" height="9.5" rx="2.3" />
            <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
        </>
    ),
    upload: () => (
        <>
            <path d="M5 15v3.2A1.8 1.8 0 0 0 6.8 20h10.4a1.8 1.8 0 0 0 1.8-1.8V15" />
            <path d="M12 15V4.2" />
            <path d="m8.2 7.8 3.8-3.8 3.8 3.8" />
        </>
    ),
    // Organic waveform centered on the mid-axis — echoes the app icon's
    // gradient waveform (vertical lines of varying height = a captured signal).
    visualizer: () => (
        <path d="M3 7.7v8.6M6 5.6v12.8M9 6.4v11.2M12 5v14M15 6.4v11.2M18 5.6v12.8M21 7.7v8.6" />
    ),
    mixer: () => (
        <>
            <path d="M6 4v16M12 4v16M18 4v16" />
            <path d="M3.5 9h5M9.5 14.5h5M15.5 7.5h5" />
        </>
    ),
    more: () => (
        <>
            <circle {...solid} cx="12" cy="5.2" r="1.7" />
            <circle {...solid} cx="12" cy="12" r="1.7" />
            <circle {...solid} cx="12" cy="18.8" r="1.7" />
        </>
    ),
    power: () => (
        <>
            <path d="M12 3.5v8" />
            <path d="M7.3 7.3a7 7 0 1 0 9.4 0" />
        </>
    ),
    // A toothed cog (not a sun): notched outer body + hub. Lucide "settings".
    gear: () => (
        <>
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z" />
            <circle cx="12" cy="12" r="3" />
        </>
    ),
    dice: () => (
        <>
            <rect x="4" y="4" width="16" height="16" rx="3.4" />
            <circle {...solid} cx="8.8" cy="8.8" r="1.35" />
            <circle {...solid} cx="15.2" cy="8.8" r="1.35" />
            <circle {...solid} cx="12" cy="12" r="1.35" />
            <circle {...solid} cx="8.8" cy="15.2" r="1.35" />
            <circle {...solid} cx="15.2" cy="15.2" r="1.35" />
        </>
    ),
    book: () => (
        <>
            <path d="M12 6.4C10.4 5 7.6 4.4 4.8 4.4v13.2c2.8 0 5.6.6 7.2 2 1.6-1.4 4.4-2 7.2-2V4.4c-2.8 0-5.6.6-7.2 2Z" />
            <path d="M12 6.4v13.2" />
        </>
    ),
    copy: () => (
        <>
            <rect x="8.5" y="8.5" width="10.5" height="10.5" rx="2.2" />
            <path d="M5 15.2V6.7a2 2 0 0 1 2-2h8.3" />
        </>
    ),
    edit: () => (
        <>
            <path d="M4.5 19.5h3.2l9.7-9.7-3.2-3.2-9.7 9.7Z" />
            <path d="m13.2 7.1 3.2 3.2" />
        </>
    ),
    trash: () => (
        <>
            <path d="M4.5 7h15" />
            <path d="M9 7V5.3A1.3 1.3 0 0 1 10.3 4h3.4A1.3 1.3 0 0 1 15 5.3V7" />
            <path d="m6.5 7 .9 11.6A1.6 1.6 0 0 0 9 20.1h6a1.6 1.6 0 0 0 1.6-1.5L17.5 7" />
            <path d="M10 10.7v5.6M14 10.7v5.6" />
        </>
    ),
    duplicate: () => (
        <>
            <rect x="8.5" y="3.5" width="10.5" height="10.5" rx="2.2" />
            <rect x="5" y="10" width="10.5" height="10.5" rx="2.2" />
        </>
    ),
    link: () => (
        <>
            <path d="m9.2 14.8 5.6-5.6" />
            <path d="M10.8 7.3 12.6 5.5a3.6 3.6 0 0 1 5.1 5.1l-1.8 1.8" />
            <path d="m13.2 16.7-1.8 1.8a3.6 3.6 0 0 1-5.1-5.1l1.8-1.8" />
        </>
    ),
    save: () => (
        <>
            <path d="M5.5 4.5h10l4 4v11a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1Z" />
            <path d="M8 4.5v5h7v-5" />
            <rect x="8" y="13" width="8" height="6" rx="0.8" />
        </>
    ),
    sparkle: () => (
        <>
            <path
                {...solid}
                d="M12 3c.5 3.6 1.9 5 5.5 5.5C13.9 9 12.5 10.4 12 14c-.5-3.6-1.9-5-5.5-5.5C10.1 8 11.5 6.6 12 3Z"
            />
            <path
                {...solid}
                d="M18 13.5c.25 1.8.95 2.5 2.75 2.75C18.95 16.5 18.25 17.2 18 19c-.25-1.8-.95-2.5-2.75-2.75C17.05 16 17.75 15.3 18 13.5Z"
            />
        </>
    ),
    check: () => <path d="m5 12.5 4.5 4.5L19 7" />,
    close: () => <path d="m6.5 6.5 11 11M17.5 6.5l-11 11" />,
    star: () => (
        <path
            {...solid}
            d="M12 3.2l2.65 5.37 5.93.86-4.29 4.18 1.01 5.9L12 16.6l-5.31 2.79 1.01-5.9-4.29-4.18 5.93-.86Z"
        />
    ),
    'star-outline': () => (
        <path d="M12 3.8l2.5 5.06 5.6.82-4.05 3.94.96 5.56L12 16.55l-5.01 2.63.96-5.56L3.9 9.68l5.6-.82Z" />
    ),
    caret: () => <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />,
    refresh: () => (
        <>
            <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
            <path d="M19.8 4v4.2h-4.2" />
        </>
    ),
    undo: () => (
        <>
            <path d="M4.5 8.5h9a5.5 5.5 0 0 1 0 11H8" />
            <path d="m8 4.5-3.5 4 3.5 4" />
        </>
    ),
    install: () => (
        <>
            <rect x="6.5" y="3" width="11" height="18" rx="2.4" />
            <path d="M12 8v6" />
            <path d="m9.3 11.3 2.7 2.7 2.7-2.7" />
        </>
    ),
    headphones: () => (
        <>
            <path d="M5 13.5v-1.5a7 7 0 0 1 14 0v1.5" />
            <rect x="3.3" y="13" width="3.7" height="6.5" rx="1.8" />
            <rect x="17" y="13" width="3.7" height="6.5" rx="1.8" />
        </>
    ),
    lightbulb: () => (
        <>
            <path d="M12 3a6 6 0 0 0-3.8 10.6c.7.6 1.1 1.2 1.2 2.4h5.2c.1-1.2.5-1.8 1.2-2.4A6 6 0 0 0 12 3Z" />
            <path d="M9.5 19h5M10.5 21.2h3" />
        </>
    ),
    note: () => (
        <>
            <path d="M9 17.5V5.2l10-2v12" />
            <circle {...solid} cx="6.3" cy="17.6" r="2.7" />
            <circle {...solid} cx="16.3" cy="15.2" r="2.7" />
        </>
    ),
    plus: () => <path d="M12 5v14M5 12h14" />,
    warn: () => (
        <>
            <path d="M12 3.8 21 19.5a1 1 0 0 1-.87 1.5H3.87A1 1 0 0 1 3 19.5Z" />
            <path d="M12 9.5v4.2" />
            <path d="M12 17.2h.01" />
        </>
    ),
    success: () => (
        <>
            <circle cx="12" cy="12" r="8.6" />
            <path d="m8.3 12.3 2.6 2.6 4.8-5.4" />
        </>
    ),
    info: () => (
        <>
            <circle cx="12" cy="12" r="8.6" />
            <path d="M12 11.2v5" />
            <path d="M12 7.9h.01" />
        </>
    ),

    // ---- Instruments (shared musical vocabulary) ----
    drums: () => (
        <>
            <path d="M4 10.5c0-1.8 3.6-3 8-3s8 1.2 8 3v3c0 1.8-3.6 3-8 3s-8-1.2-8-3Z" />
            <path d="M4 10.5c0 1.8 3.6 3 8 3s8-1.2 8-3" />
            <path d="m9 6.5-3.5-3M15 6.5l3.5-3" />
        </>
    ),
    bass: () => <path d="M3 12c2.5-6 5-6 7.5 0s5 6 7.5 0" stroke-width="2.4" />,
    chords: () => (
        <>
            <rect x="4" y="6.5" width="16" height="11" rx="2" />
            <path d="M9 6.5v11M14 6.5v11" />
            <rect {...solid} x="7.4" y="6.5" width="2.5" height="6" rx="0.6" />
            <rect {...solid} x="13.4" y="6.5" width="2.5" height="6" rx="0.6" />
        </>
    ),
    // A stacked triad — three note-heads sharing one stem, i.e. a chord. Reads
    // as "many pitches at once" = harmony, distinct from the single soloist
    // note and the bass waveform.
    harmony: () => (
        <>
            <circle {...solid} cx="11.5" cy="16.8" r="2.4" />
            <circle {...solid} cx="11.5" cy="13" r="2.4" />
            <circle {...solid} cx="11.5" cy="9.2" r="2.4" />
            <path d="M13.7 16.8V5" />
        </>
    ),
    soloist: () => (
        <>
            <path d="M9.5 16V4.5" />
            <path d="M9.5 4.5c3 .5 5.3 2.3 5.3 5.2" />
            <circle {...solid} cx="6.8" cy="16" r="2.7" />
        </>
    ),
};
