/**
 * Every style's critique claims, one file per style (`claims/<id>.ts`), so genres are written
 * side by side without touching each other. The runner is `critique.test.ts`.
 */
import type { StyleId } from '../../core/types.js';
import type { StyleClaims } from '../critique/harness.js';
import { acoustic } from './acoustic.js';
import { blues } from './blues.js';
import { bossa } from './bossa.js';
import { country } from './country.js';
import { disco } from './disco.js';
import { funk } from './funk.js';
import { hiphop } from './hiphop.js';
import { jazz } from './jazz.js';
import { neosoul } from './neosoul.js';
import { reggae } from './reggae.js';
import { rock } from './rock.js';

export const CLAIMS: Record<StyleId, StyleClaims> = {
    blues,
    bossa,
    country,
    disco,
    funk,
    hiphop,
    jazz,
    neosoul,
    reggae,
    rock,
    acoustic,
};
