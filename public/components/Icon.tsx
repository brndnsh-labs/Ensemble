import type { JSX } from 'preact';
import { ICON_PATHS, type IconName } from './icons.jsx';

export type { IconName };

interface IconProps {
    name: IconName;
    /** Any CSS length. Defaults to 1em so the glyph tracks the font-size. */
    size?: number | string;
    class?: string;
    /**
     * Decorative by default (aria-hidden) — the surrounding control owns the
     * accessible label. Pass `title` only for a standalone, label-less icon.
     */
    title?: string;
    'stroke-width'?: number | string;
}

/**
 * Inline SVG icon. Renders a glyph from the Ensemble icon set (see icons.tsx),
 * tinted with `currentColor` and sized via `size` (default 1em). Decorative by
 * default; the host button/label carries the accessible name.
 */
export function Icon({
    name,
    size = '1em',
    class: className,
    title,
    'stroke-width': strokeWidth = 1.75,
}: IconProps): JSX.Element {
    const draw = ICON_PATHS[name];
    return (
        <svg
            class={className ? `icon icon--${name} ${className}` : `icon icon--${name}`}
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width={strokeWidth}
            stroke-linecap="round"
            stroke-linejoin="round"
            role={title ? 'img' : undefined}
            aria-hidden={title ? undefined : 'true'}
            aria-label={title}
        >
            {title ? <title>{title}</title> : null}
            {draw()}
        </svg>
    );
}
