import { GENRE_NAMES, SMART_GENRES } from '@engine/data/smart-genres';
import { parseChordBar } from '@engine/songbook/score-text';
import type {
    ChartDocumentV2,
    ScoreMeasure,
    ScoreSection,
    SemanticScore,
} from '@engine/songbook/score-types';
import type { ChartBand } from '@engine/songbook/types';
import { validateDocument } from './documents';
import { checkPlayable } from './engine-mode';
import { genreSwing } from './genre-swing';

/**
 * The read-only standards catalog (#1439). Replaces `lib/starters.ts`'s old auto-seeded sample
 * songs: these never touch storage, are never "Saved locally", and are identical for a guest and
 * an account. Opening one (`app/ensemble.tsx`'s `openStandard`) lands it on the stand the same
 * way a shared `#chart=` link does — an unsaved draft; Save mints the musician's own copy under a
 * fresh id, and the catalog entry is untouched.
 *
 * v1 shipped this content as key-less Roman-numeral presets (`public/data/chord-presets.ts`,
 * deleted in #1415, still readable at `git show 6c06d39d^:public/data/chord-presets.ts`). The 17
 * blues/groove entries are ported from there — pick an idiomatic key, keep v1's tempo. The 11
 * jazz standards are authored fresh from their commonly published changes, full form, customary
 * key — NOT transposed from v1's data, which the #1439 issue calls out as approximate in places
 * (e.g. Night and Day's first section was a plain ii-V-I).
 *
 * The 11 jazz standards are verified bar by bar against the iReal Pro Jazz 1460 playlist
 * (decoded with this repo's own iReal reader) plus an independent source per tune (2026-09-26
 * re-check). An earlier from-memory theory-review pass was unreliable (it invented Night and
 * Day), so treat any future chart edit the same way: cite a source, don't recall.
 */

export type StandardShelf = 'blues' | 'jazz' | 'grooves';

export const STANDARD_SHELF_LABELS: Record<StandardShelf, string> = {
    blues: 'Blues',
    jazz: 'Jazz standards',
    grooves: 'Grooves',
};

export interface StandardSection {
    label: string;
    /** One string per bar, in `parseChordBar`'s space-separated chord-symbol syntax. */
    bars: string[];
    /** How many times this section plays. Omitted reads as 1. */
    repeat?: number;
}

export interface StandardEntry {
    /** Stable, catalog-only id. Never stored, so it never collides with a saved song's id. */
    id: string;
    title: string;
    shelf: StandardShelf;
    /** One of the 13 canonical genres — `GENRE_NAMES` (`public/data/smart-genres.ts`). */
    genre: string;
    bpm: number;
    key: string;
    isMinor: boolean;
    /** Omitted reads as '4/4'. */
    meter?: string;
    sections: StandardSection[];
}

// cspell:ignore Gmaj7 Fmaj7 Bbmaj7 Ebmaj7 Abmaj7 Dbmaj7 Emaj Bdim Pachelbel Radiohead tonicizes

export const STANDARDS: readonly StandardEntry[] = [
    // ── Blues (4) — v1's four blues forms, ported with an idiomatic key, v1's tempo kept. ──
    {
        id: 'standard-12-bar-blues',
        title: '12-Bar Blues',
        shelf: 'blues',
        genre: 'Blues',
        bpm: 100,
        key: 'C',
        isMinor: false,
        sections: [
            {
                label: 'Main',
                bars: ['C7', 'C7', 'C7', 'C7', 'F7', 'F7', 'C7', 'C7', 'G7', 'F7', 'C7', 'G7'],
            },
        ],
    },
    {
        id: 'standard-minor-blues',
        title: 'Minor Blues',
        shelf: 'blues',
        genre: 'Blues',
        bpm: 90,
        key: 'A',
        isMinor: true,
        sections: [
            {
                label: 'Main',
                bars: [
                    'Am7',
                    'Am7',
                    'Am7',
                    'Am7',
                    'Dm7',
                    'Dm7',
                    'Am7',
                    'Am7',
                    'F7',
                    'E7',
                    'Am7',
                    'E7',
                ],
            },
        ],
    },
    {
        id: 'standard-8-bar-blues',
        title: '8-Bar Blues',
        shelf: 'blues',
        genre: 'Blues',
        bpm: 110,
        key: 'G',
        isMinor: false,
        sections: [{ label: 'Main', bars: ['G7', 'D7', 'C7', 'C7', 'G7', 'D7', 'G7', 'D7'] }],
    },
    {
        id: 'standard-jazz-blues',
        title: 'Jazz Blues',
        shelf: 'blues',
        genre: 'Blues',
        bpm: 140,
        key: 'Bb',
        isMinor: false,
        // The standard bebop jazz-blues changes (as on "Now's the Time"/"Billie's Bounce", transposed from F) — the
        // canonical jam-session form, not v1's numerals (which this happens to match anyway).
        sections: [
            {
                label: 'Main',
                bars: [
                    'Bb7',
                    'Eb7',
                    'Bb7',
                    'Fm7 Bb7',
                    'Eb7',
                    'Eb7',
                    'Bb7',
                    'Dm7 G7',
                    'Cm7',
                    'F7',
                    'Bb7 G7',
                    'Cm7 F7',
                ],
            },
        ],
    },

    // ── Jazz standards (11) — authored from published changes; see file header. ──
    {
        id: 'standard-autumn-leaves',
        title: 'Autumn Leaves',
        shelf: 'jazz',
        genre: 'Jazz',
        bpm: 140,
        key: 'G',
        isMinor: true,
        // AABC, 32 bars, per iReal Jazz 1460 and the Real Book (C keeps the chromatic walk-down).
        sections: [
            { label: 'A', bars: ['Cm7', 'F7', 'Bbmaj7', 'Ebmaj7', 'Am7b5', 'D7', 'Gm7', 'Gm7'] },
            { label: 'A', bars: ['Cm7', 'F7', 'Bbmaj7', 'Ebmaj7', 'Am7b5', 'D7', 'Gm7', 'Gm7'] },
            { label: 'B', bars: ['Am7b5', 'D7', 'Gm7', 'Gm7', 'Cm7', 'F7', 'Bbmaj7', 'Ebmaj7'] },
            { label: 'C', bars: ['Am7b5', 'D7', 'Gm7 Gb7', 'Fm7 E7', 'Am7b5', 'D7', 'Gm7', 'Gm7'] },
        ],
    },
    {
        id: 'standard-blue-bossa',
        title: 'Blue Bossa',
        shelf: 'jazz',
        genre: 'Bossa',
        bpm: 140,
        key: 'C',
        isMinor: true,
        // The 16-bar Kenny Dorham form per iReal Jazz 1460 and published charts (i and iv two bars each).
        sections: [
            { label: 'A', bars: ['Cm7', 'Cm7', 'Fm7', 'Fm7', 'Dm7b5', 'G7b9', 'Cm7', 'Cm7'] },
            {
                label: 'B',
                bars: ['Ebm7', 'Ab7', 'Dbmaj7', 'Dbmaj7', 'Dm7b5', 'G7b9', 'Cm7', 'Dm7b5 G7b9'],
            },
        ],
    },
    {
        id: 'standard-all-the-things-you-are',
        title: 'All The Things You Are',
        shelf: 'jazz',
        genre: 'Jazz',
        bpm: 135,
        key: 'Ab',
        isMinor: false,
        // 36-bar AABA′; the ii chords before Cmaj7/Gmaj7 are plain m7 (iReal Jazz 1460; Wikipedia "simple ii–V–I").
        sections: [
            {
                label: 'A',
                bars: ['Fm7', 'Bbm7', 'Eb7', 'Abmaj7', 'Dbmaj7', 'Dm7 G7', 'Cmaj7', 'Cmaj7'],
            },
            {
                label: 'A2',
                bars: ['Cm7', 'Fm7', 'Bb7', 'Ebmaj7', 'Abmaj7', 'Am7 D7', 'Gmaj7', 'Gmaj7'],
            },
            { label: 'B', bars: ['Am7', 'D7', 'Gmaj7', 'Gmaj7', 'F#m7b5', 'B7', 'Emaj7', 'C7alt'] },
            {
                label: 'A3',
                bars: [
                    'Fm7',
                    'Bbm7',
                    'Eb7',
                    'Abmaj7',
                    'Dbmaj7',
                    'Dbm7',
                    'Cm7',
                    'Bdim7',
                    'Bbm7',
                    'Eb7',
                    'Abmaj7',
                    'Gm7b5 C7b9',
                ],
            },
        ],
    },
    {
        id: 'standard-rhythm-changes',
        title: 'Rhythm Changes',
        shelf: 'jazz',
        genre: 'Jazz',
        bpm: 180,
        key: 'Bb',
        isMinor: false,
        // 32-bar AABA in Bb (iReal "I Got Rhythm"/"Anthropology"): the first and last A turn back; the A before the bridge resolves.
        sections: [
            {
                label: 'A',
                bars: [
                    'Bbmaj7 Gm7',
                    'Cm7 F7',
                    'Bbmaj7 Gm7',
                    'Cm7 F7',
                    'Bbmaj7 Bb7',
                    'Ebmaj7 Ebm7',
                    'Bbmaj7 F7',
                    'Bbmaj7 F7',
                ],
            },
            {
                label: 'A',
                bars: [
                    'Bbmaj7 Gm7',
                    'Cm7 F7',
                    'Bbmaj7 Gm7',
                    'Cm7 F7',
                    'Bbmaj7 Bb7',
                    'Ebmaj7 Ebm7',
                    'Bbmaj7 F7',
                    'Bbmaj7',
                ],
            },
            { label: 'Bridge', bars: ['D7', 'D7', 'G7', 'G7', 'C7', 'C7', 'F7', 'F7'] },
            {
                label: 'A',
                bars: [
                    'Bbmaj7 Gm7',
                    'Cm7 F7',
                    'Bbmaj7 Gm7',
                    'Cm7 F7',
                    'Bbmaj7 Bb7',
                    'Ebmaj7 Ebm7',
                    'Bbmaj7 F7',
                    'Bbmaj7 F7',
                ],
            },
        ],
    },
    {
        id: 'standard-stella-by-starlight',
        title: 'Stella by Starlight',
        shelf: 'jazz',
        genre: 'Jazz',
        bpm: 120,
        key: 'Bb',
        isMinor: false,
        // Modern Real Book / iReal Jazz 1460 reading; bar 4 is a major ii–V (Cm7 F7).
        sections: [
            { label: 'A', bars: ['Em7b5', 'A7b9', 'Cm7', 'F7', 'Fm7', 'Bb7', 'Ebmaj7', 'Ab7'] },
            {
                label: 'B',
                bars: [
                    'Bbmaj7',
                    'Em7b5 A7b9',
                    'Dm7',
                    'Bbm7 Eb7',
                    'Fmaj7',
                    'Em7b5 A7',
                    'Am7b5',
                    'D7b9',
                ],
            },
            { label: 'C', bars: ['G7+', 'G7+', 'Cm7', 'Cm7', 'Ab7', 'Ab7', 'Bbmaj7', 'Bbmaj7'] },
            {
                label: 'D',
                bars: ['Em7b5', 'A7b9', 'Dm7b5', 'G7b9', 'Cm7b5', 'F7b9', 'Bbmaj7', 'Bbmaj7'],
            },
        ],
    },
    {
        id: 'standard-cherokee',
        title: 'Cherokee',
        shelf: 'jazz',
        genre: 'Jazz',
        bpm: 240,
        key: 'Bb',
        isMinor: false,
        sections: [
            {
                label: 'A',
                bars: [
                    'Bbmaj7',
                    'Bbmaj7',
                    'Fm7',
                    'Bb7',
                    'Ebmaj7',
                    'Ebmaj7',
                    'Ab7',
                    'Ab7',
                    'Bbmaj7',
                    'Bbmaj7',
                    'C7',
                    'C7',
                    'Cm7',
                    'G7',
                    'Cm7',
                    'F7+',
                ],
            },
            {
                label: 'A2',
                bars: [
                    'Bbmaj7',
                    'Bbmaj7',
                    'Fm7',
                    'Bb7',
                    'Ebmaj7',
                    'Ebmaj7',
                    'Ab7',
                    'Ab7',
                    'Bbmaj7',
                    'Bbmaj7',
                    'C7',
                    'C7',
                    'Cm7',
                    'F7',
                    'Bbmaj7',
                    'Bbmaj7',
                ],
            },
            {
                label: 'Bridge',
                bars: [
                    'C#m7',
                    'F#7',
                    'Bmaj7',
                    'Bmaj7',
                    'Bm7',
                    'E7',
                    'Amaj7',
                    'Amaj7',
                    'Am7',
                    'D7',
                    'Gmaj7',
                    'Gmaj7',
                    'Gm7',
                    'C7',
                    'Cm7',
                    'F7+',
                ],
            },
            {
                label: 'A3',
                bars: [
                    'Bbmaj7',
                    'Bbmaj7',
                    'Fm7',
                    'Bb7',
                    'Ebmaj7',
                    'Ebmaj7',
                    'Ab7',
                    'Ab7',
                    'Bbmaj7',
                    'Bbmaj7',
                    'C7',
                    'C7',
                    'Cm7',
                    'F7',
                    'Bbmaj7',
                    'Bbmaj7',
                ],
            },
        ],
    },
    {
        id: 'standard-giant-steps',
        title: 'Giant Steps',
        shelf: 'jazz',
        genre: 'Jazz',
        bpm: 220,
        key: 'B',
        isMinor: false,
        sections: [
            {
                label: 'Head',
                bars: [
                    'Bmaj7 D7',
                    'Gmaj7 Bb7',
                    'Ebmaj7',
                    'Am7 D7',
                    'Gmaj7 Bb7',
                    'Ebmaj7 F#7',
                    'Bmaj7',
                    'Fm7 Bb7',
                    'Ebmaj7',
                    'Am7 D7',
                    'Gmaj7',
                    'C#m7 F#7',
                    'Bmaj7',
                    'Fm7 Bb7',
                    'Ebmaj7',
                    'C#m7 F#7',
                ],
            },
        ],
    },
    {
        id: 'standard-ornithology',
        title: 'Ornithology',
        shelf: 'jazz',
        genre: 'Jazz',
        bpm: 160,
        key: 'G',
        isMinor: false,
        // ABAC, 32 bars, on "How High the Moon" (iReal Jazz 1460; standardrepertoire.com).
        sections: [
            { label: 'A', bars: ['Gmaj7', 'Gmaj7', 'Gm7', 'C7', 'Fmaj7', 'Fmaj7', 'Fm7', 'Bb7'] },
            {
                label: 'B',
                bars: ['Eb7', 'Am7b5 D7b9', 'Gm7', 'Am7b5 D7b9', 'Bm7', 'E7', 'Am7', 'D7'],
            },
            { label: 'A', bars: ['Gmaj7', 'Gmaj7', 'Gm7', 'C7', 'Fmaj7', 'Fmaj7', 'Fm7', 'Bb7'] },
            {
                label: 'C',
                bars: ['Eb7', 'Am7b5 D7b9', 'Gmaj7', 'Am7 D7', 'Bm7 E7', 'Am7 D7', 'G6', 'Am7 D7'],
            },
        ],
    },
    {
        id: 'standard-donna-lee',
        title: 'Donna Lee',
        shelf: 'jazz',
        genre: 'Jazz',
        bpm: 220,
        key: 'Ab',
        isMinor: false,
        // "Indiana" changes in Ab, per iReal Jazz 1460 and jazzleadsheet.com (bars 21–28: ii–V–i in F minor).
        sections: [
            {
                label: 'A',
                bars: ['Abmaj7', 'F7', 'Bb7', 'Bb7', 'Bbm7', 'Eb7', 'Abmaj7', 'Ebm7 Ab7'],
            },
            { label: 'B', bars: ['Dbmaj7', 'Gb7', 'Abmaj7', 'F7', 'Bb7', 'Bb7', 'Bbm7', 'Eb7'] },
            { label: 'A2', bars: ['Abmaj7', 'F7', 'Bb7', 'Bb7', 'Gm7b5', 'C7b9', 'Fm', 'C7b9'] },
            {
                label: 'C',
                bars: ['Fm', 'C7b9', 'Fm', 'Bdim7', 'Cm7 F7', 'Bbm7 Eb7', 'Abmaj7', 'Bbm7 Eb7'],
            },
        ],
    },
    {
        id: 'standard-night-and-day',
        title: 'Night and Day',
        shelf: 'jazz',
        genre: 'Jazz',
        bpm: 130,
        key: 'C',
        isMinor: false,
        // 48-bar ABABCB (Wikipedia; iReal Jazz 1460): bVImaj7–V7–I, a half-step descent from
        // F#m7b5 to Dm7, and a bridge that flips between Eb and C.
        sections: [
            {
                label: 'A',
                bars: ['Abmaj7', 'G7', 'Cmaj7', 'Cmaj7', 'Abmaj7', 'G7', 'Cmaj7', 'Cmaj7'],
            },
            { label: 'B', bars: ['F#m7b5', 'Fm7', 'Em7', 'Ebdim7', 'Dm7', 'G7', 'Cmaj7', 'Cmaj7'] },
            {
                label: 'A',
                bars: ['Abmaj7', 'G7', 'Cmaj7', 'Cmaj7', 'Abmaj7', 'G7', 'Cmaj7', 'Cmaj7'],
            },
            { label: 'B', bars: ['F#m7b5', 'Fm7', 'Em7', 'Ebdim7', 'Dm7', 'G7', 'Cmaj7', 'Bb7'] },
            {
                label: 'Bridge',
                bars: ['Ebmaj7', 'Ebmaj7', 'Cmaj7', 'Cmaj7', 'Ebmaj7', 'Ebmaj7', 'Cmaj7', 'Cmaj7'],
            },
            { label: 'B', bars: ['F#m7b5', 'Fm7', 'Em7', 'Ebdim7', 'Dm7', 'G7', 'C6', 'C6'] },
        ],
    },
    {
        id: 'standard-all-blues',
        title: 'All Blues',
        shelf: 'jazz',
        genre: 'Jazz',
        bpm: 90,
        key: 'G',
        isMinor: false,
        meter: '6/8',
        // 6/8 12-bar: V in bar 9, bVI then V in bar 10, tonic for bars 11–12 (iReal; Wikipedia).
        sections: [
            {
                label: 'Head',
                bars: [
                    'G7',
                    'G7',
                    'G7',
                    'G7',
                    'C7',
                    'C7',
                    'G7',
                    'G7',
                    'D7#9',
                    'Eb7#9 D7#9',
                    'G7',
                    'G7',
                ],
            },
            { label: 'Vamp', bars: ['G7', 'G7', 'G7', 'G7'], repeat: 2 },
        ],
    },

    // ── Grooves (13) — v1's genre grooves, ported with an idiomatic key, v1's tempo kept. ──
    {
        id: 'standard-pop-standard',
        title: 'Pop (Standard)',
        shelf: 'grooves',
        genre: 'Rock',
        bpm: 120,
        key: 'C',
        isMinor: false,
        sections: [{ label: 'Main', bars: ['C', 'G', 'Am', 'F'] }],
    },
    {
        id: 'standard-pop-ballad',
        title: 'Pop (Ballad)',
        shelf: 'grooves',
        genre: 'Rock',
        bpm: 85,
        key: 'C',
        isMinor: false,
        sections: [{ label: 'Main', bars: ['Am', 'F', 'C', 'G'] }],
    },
    {
        id: 'standard-country-standard',
        title: 'Country Standard',
        shelf: 'grooves',
        genre: 'Country',
        bpm: 100,
        key: 'G',
        isMinor: false,
        sections: [{ label: 'Main', bars: ['G', 'G', 'C', 'C', 'G', 'D', 'G', 'G'] }],
    },
    {
        id: 'standard-metal-core',
        title: 'Metal Core',
        shelf: 'grooves',
        genre: 'Metal',
        bpm: 160,
        key: 'E',
        isMinor: true,
        sections: [{ label: 'Main', bars: ['Em', 'C', 'D', 'Em'] }],
    },
    {
        id: 'standard-50s-rock',
        title: '50s Rock',
        shelf: 'grooves',
        genre: 'Rock',
        bpm: 140,
        key: 'C',
        isMinor: false,
        sections: [{ label: 'Main', bars: ['C', 'Am', 'F', 'G'] }],
    },
    {
        id: 'standard-royal-road',
        title: 'Royal Road',
        shelf: 'grooves',
        genre: 'Rock',
        bpm: 110,
        key: 'C',
        isMinor: false,
        sections: [{ label: 'Main', bars: ['Fmaj7', 'G7', 'Em7', 'Am7'] }],
    },
    {
        id: 'standard-canon',
        title: 'Canon',
        shelf: 'grooves',
        genre: 'Acoustic',
        bpm: 90,
        // Pachelbel's own key.
        key: 'D',
        isMinor: false,
        sections: [{ label: 'Main', bars: ['D', 'A', 'Bm', 'F#m', 'G', 'D', 'G', 'A'] }],
    },
    {
        id: 'standard-andalusian',
        title: 'Andalusian',
        shelf: 'grooves',
        // v1's style for this preset was 'ska-upstroke' — a direct, stronger signal than its
        // 'Classical/Trad' category.
        genre: 'Ska-Punk',
        bpm: 130,
        key: 'A',
        isMinor: true,
        sections: [{ label: 'Main', bars: ['Am', 'G', 'F', 'E'] }],
    },
    {
        id: 'standard-neo-soul-deep',
        title: 'Neo-Soul (Deep)',
        shelf: 'grooves',
        genre: 'Neo-Soul',
        bpm: 85,
        key: 'C',
        isMinor: false,
        sections: [
            { label: 'Verse', bars: ['Fmaj9', 'E7#9', 'Am11', 'G9sus'], repeat: 2 },
            { label: 'Chorus', bars: ['Dm9', 'Dbmaj7', 'Cmaj9', 'Am9'], repeat: 2 },
        ],
    },
    {
        id: 'standard-acid-jazz-london',
        title: 'Acid Jazz (London)',
        shelf: 'grooves',
        genre: 'Funk',
        bpm: 115,
        key: 'C',
        isMinor: true,
        sections: [
            {
                label: 'Loop',
                bars: ['Cm9', 'F13', 'Bbm9', 'Eb13', 'Abmaj7', 'Dbmaj7', 'Cm9', 'G7alt'],
            },
        ],
    },
    {
        id: 'standard-funk-i-iv',
        title: 'Funk (i-IV)',
        shelf: 'grooves',
        genre: 'Funk',
        bpm: 110,
        key: 'E',
        isMinor: true,
        sections: [{ label: 'Main', bars: ['Em7', 'A7', 'Em7', 'A7'] }],
    },
    {
        id: 'standard-funk-grand-groove',
        title: 'Funk (Grand Groove)',
        shelf: 'grooves',
        genre: 'Funk',
        bpm: 108,
        key: 'G',
        isMinor: true,
        sections: [
            { label: 'Verse', bars: ['Gm11', 'Gm11', 'C9', 'C13'], repeat: 2 },
            { label: 'Chorus', bars: ['F13', 'Ebmaj7', 'Dm11', 'G7#9'], repeat: 2 },
        ],
    },
    {
        id: 'standard-alternative-loop',
        title: 'Alternative Loop',
        shelf: 'grooves',
        genre: 'Rock',
        bpm: 120,
        // The exact "Creep" (Radiohead) I-III-IV-iv borrowed-chord loop.
        key: 'G',
        isMinor: false,
        sections: [{ label: 'Loop', bars: ['G', 'B', 'C', 'Cm'] }],
    },
] as const;

function measuresFromBars(bars: readonly string[], meter: string): ScoreMeasure[] {
    return bars.map((bar) => {
        const parsed = parseChordBar(bar, meter);
        if (parsed.kind !== 'ok') {
            const reason = parsed.kind === 'invalid' ? parsed.issues[0]?.message : parsed.kind;
            throw new Error(`Standards catalog bar "${bar}" (${meter}) is invalid: ${reason}`);
        }
        return { id: crypto.randomUUID(), content: { kind: 'events', events: parsed.value } };
    });
}

function sectionsOf(entry: StandardEntry, meter: string): ScoreSection[] {
    return entry.sections.map((section) => ({
        id: crypto.randomUUID(),
        label: section.label,
        repeat: section.repeat ?? 1,
        measures: measuresFromBars(section.bars, meter),
    }));
}

const LANE_REVERB = { chords: 0.3, bass: 0.05, soloist: 0.6, groove: 0.2 } as const;

/**
 * A genre-appropriate `ChartBand`, built from the same pure config tables `runtime.setGenre`
 * reads (`SMART_GENRES`, `genreSwing`) rather than the live runtime itself: the current band
 * engine plays entirely off `band.groove.genre` (`chartGenre`) at playback time, so nothing
 * genre-specific needs to be pre-resolved through a live dispatch. This keeps the catalog
 * buildable — and testable in plain Node — without booting audio or engine state. Every lane
 * follows the sounds this device has installed (`autoSound: true`, #1405); the soloist and
 * harmony lanes start off, matching the app's own defaults (`public/state/instruments.ts`).
 *
 * Exported for `checks/fixtures.ts`'s `seedStarters` too: many specs pre-date the standards
 * catalog and still open a genre-accurate fixture song by name (the old `lib/starters.ts` seeding
 * this replaced) — reusing this instead of hand-rolling a second copy keeps that fixture's band
 * genuinely genre-correct rather than an approximation nobody re-derives when a genre changes.
 */
export function bandForGenre(genre: string): ChartBand {
    const smart = SMART_GENRES[genre];
    const swing = genreSwing(genre);
    return {
        chords: {
            enabled: true,
            voice: 'synth',
            autoSound: true,
            volume: 1,
            reverb: LANE_REVERB.chords,
        },
        bass: {
            enabled: true,
            voice: 'synth',
            autoSound: true,
            volume: 1,
            reverb: LANE_REVERB.bass,
        },
        soloist: {
            enabled: false,
            voice: 'synth',
            autoSound: true,
            mode: smart.soloistMode ?? 'monophonic',
            autoMode: true,
            volume: 1,
            reverb: LANE_REVERB.soloist,
        },
        // No `harmony`: it's the old engine's lane (the band engine has nothing for it to
        // play — `feel-sheet.spec.ts`), and `writtenSettings` already omits it from a chart
        // written today. A catalog chart should look exactly like one, not carry a legacy field
        // nothing reads.
        groove: {
            enabled: true,
            voice: 'synth',
            autoSound: true,
            volume: 1,
            reverb: LANE_REVERB.groove,
            swing: swing?.swing ?? 0,
            swingSub: swing?.swingSub ?? '8th',
            humanize: 20,
            genre,
        },
    };
}

/**
 * Builds one catalog entry into a fresh, validated `ChartDocumentV2` — never persisted, never
 * cached: a new id-stable-but-otherwise-fresh document every call, so opening the same standard
 * twice never shares mutable state with an earlier draft. Throws if the entry's authored bars, or
 * its resulting score, don't pass the canonical codec — a bug in this file, not a runtime state.
 */
export function buildStandardDocument(entry: StandardEntry): ChartDocumentV2 {
    if (!Object.hasOwn(SMART_GENRES, entry.genre) || !GENRE_NAMES.includes(entry.genre)) {
        throw new Error(`Standards catalog entry "${entry.id}" has an unknown genre.`);
    }
    const meter = entry.meter ?? '4/4';
    const now = new Date().toISOString();
    const score: SemanticScore = {
        notation: 'name',
        key: entry.key,
        isMinor: entry.isMinor,
        meter,
        grouping: null,
        sections: sectionsOf(entry, meter),
    };
    checkPlayable(score);
    const document = {
        schemaVersion: 2 as const,
        id: entry.id,
        title: entry.title,
        createdAt: now,
        updatedAt: now,
        revision: 0,
        chart: {
            score,
            performance: { bpm: entry.bpm, seed: '', randomizeSeed: false },
            band: bandForGenre(entry.genre),
        },
    };
    return validateDocument(document) as ChartDocumentV2;
}

/** The catalog entry a document id came from, or `null` for an ordinary saved song. */
export function standardFor(id: string): StandardEntry | null {
    return STANDARDS.find((entry) => entry.id === id) ?? null;
}

/** Every bar of a section's chord text, joined for a browse-row preview. Never builds a document. */
export function firstBarsPreview(entry: StandardEntry, bars = 4): string {
    return entry.sections[0].bars.slice(0, bars).join(' | ');
}
