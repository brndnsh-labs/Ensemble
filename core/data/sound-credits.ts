/**
 * Who made each sample pack's recordings, under what licence, and what we changed (#2113).
 *
 * The catalog's `credit` (`core/data/sound-packs.ts`) is the one source of truth: Settings →
 * Sound credits lists it for every pack, the lane's Mix panel shows `shortCredit`, and each pack
 * folder's `CREDITS.txt` is checked against it (`tests/unit/data/sound-credits.test.ts`, which
 * also writes them). Every licence here was read at its source; the record is in
 * `docs/guides/sample-pack-sourcing.md`.
 */

import type { SoundPack } from './sound-packs.js';

/** The licences a shipped pack may carry. A new one is a decision, not a catalog edit. */
export type SoundLicenseId =
    | 'CC0-1.0'
    | 'CC-BY-3.0'
    | 'CC-BY-4.0'
    | 'CC-BY-NC-SA-4.0'
    | 'GeneralUser-GS';

export interface SoundLicense {
    readonly id: SoundLicenseId;
    /** The licence's own short name. */
    readonly name: string;
    /** The canonical deed (Creative Commons) or the licence text itself. */
    readonly url: string;
    /** What the licence asks of us beyond credit, in plain words; shown beside the link. */
    readonly terms?: string;
}

export const SOUND_LICENSES: Readonly<Record<SoundLicenseId, SoundLicense>> = {
    'CC0-1.0': {
        id: 'CC0-1.0',
        name: 'CC0 1.0 (public domain)',
        url: 'https://creativecommons.org/publicdomain/zero/1.0/',
    },
    'CC-BY-3.0': {
        id: 'CC-BY-3.0',
        name: 'CC BY 3.0',
        url: 'https://creativecommons.org/licenses/by/3.0/',
    },
    'CC-BY-4.0': {
        id: 'CC-BY-4.0',
        name: 'CC BY 4.0',
        url: 'https://creativecommons.org/licenses/by/4.0/',
    },
    'CC-BY-NC-SA-4.0': {
        id: 'CC-BY-NC-SA-4.0',
        name: 'CC BY-NC-SA 4.0',
        url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
        // ShareAlike binds the files we derived; NonCommercial binds Ensemble itself, which may
        // ship this pack only while it stays non-commercial (the sourcing guide's Licences).
        terms: 'Non-commercial use only. The adapted files are shared under the same licence.',
    },
    'GeneralUser-GS': {
        id: 'GeneralUser-GS',
        name: 'GeneralUser GS License v2.0',
        url: 'https://github.com/mrbumpy409/GeneralUser-GS/blob/main/documentation/LICENSE.txt',
        // The licence lets software use, modify and repackage the bank, and asks a site that
        // features it to link to the author's website, never straight to his download files.
        terms: 'Free to use and modify in software. Get it from the author’s website.',
    },
};

/** One recorded work a pack is made from. */
export interface SoundSource {
    /** The source library's title. */
    readonly work: string;
    readonly author: string;
    /** Where the work is published: its page or repository. */
    readonly source: string;
    readonly license: SoundLicense;
}

export interface SoundCredit {
    /** Usually one; the drum kit is built from two libraries. */
    readonly sources: readonly [SoundSource, ...SoundSource[]];
    /** What we did to the recordings, in plain words (CC BY asks that changes be indicated). */
    readonly changes: string;
}

/** The one-line credit the lane's Mix panel shows: each work and author, then the licence. */
export function shortCredit(pack: Pick<SoundPack, 'credit'>): string {
    const { sources } = pack.credit;
    const works = sources.map((s) => `${s.work} by ${s.author}`).join('; ');
    const licenses = [...new Set(sources.map((s) => s.license.name))].join(', ');
    return `${works} — ${licenses}`;
}
