import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    SOUND_LICENSES,
    type SoundLicenseId,
    shortCredit,
} from '../../../core/data/sound-credits.js';
import { SOUND_PACKS, type SoundPack } from '../../../core/data/sound-packs.js';

/**
 * #2113 — every pack's credit is complete, its licence is one we have approved, and the pack
 * folder ships a `CREDITS.txt` that says the same thing as the catalog, so a downloaded file
 * carries its notice. The catalog is the source of truth: after changing a credit, rewrite the
 * files with `UPDATE_PACK_CREDITS=1 npm run test:vitest -- sound-credits` and commit them.
 */
const PACKS_DIR = path.resolve(__dirname, '../../../core/packs');
const UPDATE = process.env.UPDATE_PACK_CREDITS === '1';

/** Approved 2026-11-07: CC0 and CC BY, the Rhodes' NC-SA, and GeneralUser GS's own licence. */
const ALLOWED: readonly SoundLicenseId[] = [
    'CC0-1.0',
    'CC-BY-3.0',
    'CC-BY-4.0',
    'CC-BY-NC-SA-4.0',
    'GeneralUser-GS',
];
/** The licences whose terms require credit (and, for CC BY, that changes are indicated). */
const ATTRIBUTION: readonly SoundLicenseId[] = ['CC-BY-3.0', 'CC-BY-4.0', 'CC-BY-NC-SA-4.0'];

/** The text of a pack folder's `CREDITS.txt`, written from the catalog alone. */
function creditsText(pack: SoundPack): string {
    const lines = [`${pack.name} — an Ensemble sound pack (${pack.id})`, '', 'Made from:'];
    for (const source of pack.credit.sources) {
        lines.push(
            '',
            `  ${source.work}`,
            `  by ${source.author}`,
            `  Source: ${source.source}`,
            `  Licence: ${source.license.name} — ${source.license.url}`,
        );
        if (source.license.terms) {
            lines.push(`  ${source.license.terms}`);
        }
    }
    lines.push('', `Changed for Ensemble: ${pack.credit.changes}.`);
    // ShareAlike: the files in this folder are an adaptation, and they carry the same licence.
    const shareAlike = pack.credit.sources.find((s) => s.license.id === 'CC-BY-NC-SA-4.0');
    if (shareAlike) {
        lines.push(
            '',
            `The files in this folder are adapted from the work above and are licensed under ${shareAlike.license.name} (${shareAlike.license.url}). Non-commercial use only.`,
        );
    }
    return `${lines.join('\n')}\n`;
}

describe('sound credits (#2113)', () => {
    it('every pack has a work, author, https source, licence and changes for each source', () => {
        for (const pack of SOUND_PACKS) {
            expect(pack.credit.sources.length, pack.id).toBeGreaterThan(0);
            expect(pack.credit.changes, pack.id).toMatch(/\S/);
            for (const source of pack.credit.sources) {
                expect(source.work, pack.id).toMatch(/\S/);
                expect(source.author, pack.id).toMatch(/\S/);
                expect(source.source, pack.id).toMatch(/^https:\/\/\S+$/);
                expect(source.license.name, pack.id).toMatch(/\S/);
                expect(source.license.url, pack.id).toMatch(/^https:\/\/\S+$/);
            }
        }
    });

    it('every licence is on the allow-list and is the canonical entry, deed link and all', () => {
        for (const pack of SOUND_PACKS) {
            for (const { license } of pack.credit.sources) {
                expect(ALLOWED, pack.id).toContain(license.id);
                expect(license, pack.id).toEqual(SOUND_LICENSES[license.id]);
            }
        }
    });

    it('every attribution-licensed pack names its author, its source and what was changed', () => {
        const attributed = SOUND_PACKS.filter((pack) =>
            pack.credit.sources.some((s) => ATTRIBUTION.includes(s.license.id)),
        );
        // The grand (CC BY 3.0) and the Rhodes (CC BY-NC-SA 4.0) today.
        expect(attributed.map((p) => p.id)).toEqual(expect.arrayContaining(['grand', 'rhodes']));
        for (const pack of attributed) {
            for (const source of pack.credit.sources) {
                expect(source.author, pack.id).not.toMatch(/unknown/i);
                expect(source.source, pack.id).toMatch(/^https:\/\//);
            }
            expect(pack.credit.changes, pack.id).toMatch(/converted to AAC/);
        }
    });

    it('the short credit names every work and its licence', () => {
        const kit = SOUND_PACKS.find((p) => p.id === 'acoustic-kit')!;
        expect(shortCredit(kit)).toBe(
            'VCSL (Versilian Community Sample Library) by Versilian Studios; Virtuosity Drums by Versilian Studios and Karoryfer Samples — CC0 1.0 (public domain)',
        );
        const rhodes = SOUND_PACKS.find((p) => p.id === 'rhodes')!;
        expect(shortCredit(rhodes)).toBe('jRhodes3c by Jeff Learman — CC BY-NC-SA 4.0');
    });

    it('every pack folder is in the catalog, and every catalog pack has a folder', () => {
        const folders = readdirSync(PACKS_DIR, { withFileTypes: true })
            .filter((e) => e.isDirectory())
            .map((e) => e.name)
            .sort();
        expect(folders).toEqual(SOUND_PACKS.map((p) => p.id).sort());
    });

    it.each(SOUND_PACKS.map((pack) => [pack.id, pack] as const))(
        '%s ships a CREDITS.txt that matches the catalog',
        (id, pack) => {
            const file = path.join(PACKS_DIR, id, 'CREDITS.txt');
            const expected = creditsText(pack);
            if (UPDATE) {
                writeFileSync(file, expected);
            }
            expect(readFileSync(file, 'utf8')).toBe(expected);
        },
    );

    it('the Rhodes credits say the derived files are under CC BY-NC-SA 4.0', () => {
        const text = readFileSync(path.join(PACKS_DIR, 'rhodes', 'CREDITS.txt'), 'utf8');
        expect(text).toContain(
            'The files in this folder are adapted from the work above and are licensed under CC BY-NC-SA 4.0 (https://creativecommons.org/licenses/by-nc-sa/4.0/).',
        );
    });
});
