/**
 * The style registry. A style is a feel plus one idiom per lane (the comp's per instrument
 * family); each lives in its own file (`styles/<id>.ts`) — the whole of what makes "rock"
 * rock. To add a genre, write its file (composing `players/` machinery, and writing a new
 * idiom only when the vocabulary lacks one), register it here, and add its claims to
 * `test/critique.test.ts`.
 */
import type { StyleId } from '../core/types.js';
import { bossa } from './bossa.js';
import { funk } from './funk.js';
import { jazz } from './jazz.js';
import { reggae } from './reggae.js';
import { rock } from './rock.js';
import type { Feel, Style } from './types.js';

export const STYLES: Record<StyleId, Style> = { rock, jazz, funk, bossa, reggae };

export const STYLE_IDS = Object.keys(STYLES) as StyleId[];

/** The feel a style plays with on a given comp family (its comp lean may differ). */
export function feelFor(style: Style, family: 'keyboard' | 'guitar'): Feel {
    const comp = style.feel.compLean?.[family];
    return comp === undefined ? style.feel : { ...style.feel, lean: { ...style.feel.lean, comp } };
}
