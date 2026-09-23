/**
 * The style registry. A style is a feel plus one idiom per lane (the comp's per instrument
 * family); this file is the whole of what makes "rock" rock. To add a genre, compose idioms here (writing a new idiom only
 * when the vocabulary lacks one) and add its claims to `test/critique.test.ts`.
 */
import type { StyleId } from '../core/types.js';
import { bossaBass, funkBass, rockBass, walkingBass } from '../players/bass/books.js';
import {
    bossaGuitar,
    bossaKeys,
    funkGuitar,
    funkKeys,
    jazzGuitar,
    jazzKeys,
    rockGuitar,
    rockKeys,
} from '../players/comp/books.js';
import { bossaDrums, funkDrums, jazzDrums, rockDrums } from '../players/drums/books.js';
import type { Style } from './types.js';

export const STYLES: Record<StyleId, Style> = {
    rock: {
        id: 'rock',
        name: 'Rock',
        // Straight eighths, the band right on the drummer; keys a hair behind so the
        // chords sit under the backbeat rather than on top of it.
        feel: { swing: 0, swingGrid: 8, lean: { bass: 0, comp: 3 }, humanize: 35 },
        drums: rockDrums,
        bass: rockBass,
        comp: { keyboard: rockKeys, guitar: rockGuitar },
        prefers: 'piano',
    },
    jazz: {
        id: 'jazz',
        name: 'Jazz',
        // Medium swing (offbeat at ~62% of the beat, not a hard triplet). The walking bass
        // sits on top of the ride (a hair ahead drives the time); the comping lays back.
        feel: { swing: 72, swingGrid: 8, lean: { bass: -2, comp: 8 }, humanize: 40 },
        drums: jazzDrums,
        bass: walkingBass,
        comp: { keyboard: jazzKeys, guitar: jazzGuitar },
        prefers: 'piano',
    },
    funk: {
        id: 'funk',
        name: 'Funk',
        // Straight sixteenths, bass and keys a touch *ahead* — funk pushes on the One.
        feel: { swing: 0, swingGrid: 16, lean: { bass: -5, comp: -3 }, humanize: 25 },
        drums: funkDrums,
        bass: funkBass,
        comp: { keyboard: funkKeys, guitar: funkGuitar },
        prefers: 'clav',
    },
    bossa: {
        id: 'bossa',
        // Bossa nova *is* the nylon guitar; the piano comp is the alternative.
        name: 'Bossa',
        // Straight, light, slightly forward: bossa floats, it never drags.
        feel: { swing: 0, swingGrid: 16, lean: { bass: -3, comp: -3 }, humanize: 30 },
        drums: bossaDrums,
        bass: bossaBass,
        comp: { keyboard: bossaKeys, guitar: bossaGuitar },
        prefers: 'nylon',
    },
};

export const STYLE_IDS = Object.keys(STYLES) as StyleId[];
