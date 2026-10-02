type IRealFormat = 'irealbook' | 'irealb';

const MAX_SOURCE_BYTES = 1_048_576;
/**
 * The most songs one import may hold (#1478): the account's whole document cap
 * (`MAX_DOCUMENTS_PER_OWNER`, 2,000), since a playlist imports whole as a collection. iReal's own
 * big jazz playlists sit under it (Jazz 1460 is 1,460 tunes in 652 KB), and the 1 MiB source cap
 * above bounds the work long before this would at real tune sizes.
 */
export const MAX_IREAL_SONGS = 2_000;
const TOO_MANY_SONGS = 'Import at most 2,000 songs at a time.';
const MUSIC_PREFIX = '1r34LbKcu7';
const HTML_ENTITIES = new Map([
    ['amp', '&'],
    ['quot', '"'],
    ['apos', "'"],
    ['lt', '<'],
    ['gt', '>'],
]);

function htmlAttribute(value: string): string {
    return value.replace(/&([^;&\s]{1,32});/g, (_, entity: string) => {
        const known = HTML_ENTITIES.get(entity);
        if (known !== undefined) {
            return known;
        }
        const numeric = /^(?:#([0-9]+)|#x([0-9a-f]+))$/i.exec(entity);
        if (numeric) {
            const point = Number.parseInt(numeric[1] ?? numeric[2], numeric[1] ? 10 : 16);
            if (point > 0 && point <= 0x10ffff && (point < 0xd800 || point > 0xdfff)) {
                return String.fromCodePoint(point);
            }
        }
        throw new Error('The export contains an unsupported HTML character reference.');
    });
}

/** Read quoted anchor attributes without constructing a DOM or activating any HTML resources. */
function linksFromHtml(source: string): string[] {
    const links: string[] = [];
    const lower = source.toLowerCase();
    let cursor = 0;
    let tags = 0;
    while (cursor < source.length) {
        const begin = source.indexOf('<', cursor);
        if (begin < 0) {
            break;
        }
        if (++tags > 16_384) {
            throw new Error('The export contains too many HTML tags.');
        }
        if (source.startsWith('<!--', begin)) {
            const end = source.indexOf('-->', begin + 4);
            if (end < 0) {
                throw new Error('The export contains an unclosed HTML comment.');
            }
            cursor = end + 3;
            continue;
        }
        let quote = '';
        let end = begin + 1;
        for (; end < source.length; end++) {
            const char = source[end];
            if (quote) {
                if (char === quote) {
                    quote = '';
                }
            } else if (char === '"' || char === "'") {
                quote = char;
            } else if (char === '>') {
                break;
            } else if (char === '<') {
                throw new Error('The export contains malformed HTML tags.');
            }
        }
        if (end === source.length) {
            throw new Error('The export contains an unclosed HTML tag.');
        }
        const tag = source.slice(begin + 1, end);
        cursor = end + 1;
        const name = /^([a-z][a-z0-9:-]*)(?=\s|\/|$)/i.exec(tag)?.[1]?.toLowerCase();
        if (!name) {
            continue;
        }
        if (name === 'template') {
            throw new Error('HTML templates are not supported in chart exports.');
        }
        if (['script', 'style', 'textarea', 'title'].includes(name)) {
            let close = lower.indexOf(`</${name}`, cursor);
            while (close >= 0 && !/[\s/>]/.test(lower[close + name.length + 2] ?? '')) {
                close = lower.indexOf(`</${name}`, close + name.length + 2);
            }
            if (close < 0) {
                throw new Error('The export contains an unclosed text element.');
            }
            cursor = close;
            continue;
        }
        if (name !== 'a') {
            continue;
        }
        const attributes = tag.slice(1);
        // Only quoted hrefs are accepted. Other attributes are inert, never interpreted.
        const attribute = /\s+([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
        let href: string | undefined;
        for (const match of attributes.matchAll(attribute)) {
            if (match[1].toLowerCase() !== 'href') {
                continue;
            }
            if (href !== undefined) {
                throw new Error('An export link has duplicate href attributes.');
            }
            const value = match[2] ?? match[3];
            if (value === undefined) {
                throw new Error('Export links must use quoted href attributes.');
            }
            href = htmlAttribute(value);
        }
        if (href && /^ireal(?:book|b):\/\//i.test(href)) {
            links.push(href);
            if (links.length > MAX_IREAL_SONGS) {
                throw new Error(TOO_MANY_SONGS);
            }
        }
    }
    if (!links.length) {
        throw new Error('No supported iReal song links were found in this export.');
    }
    return links;
}

/**
 * Independent index-map implementation of the reversible 50-character permutation.
 * Algorithm evidence: pianosnake/ireal-reader (MIT, package.json/README), unscramble.js;
 * original specification in ironss/accompaniser/irealb_parser.lua (Stephen Irons, MIT).
 * https://github.com/pianosnake/ireal-reader/blob/master/unscramble.js
 * https://github.com/ironss/accompaniser/blob/master/irealb_parser.lua
 * No upstream implementation or parser is bundled. A final 50/51-character tail is unchanged.
 */
export function decodeIRealMusic(value: string): string {
    if (!value.startsWith(MUSIC_PREFIX)) {
        throw new Error('This modern iReal music encoding is not supported.');
    }
    const encoded = value.slice(MUSIC_PREFIX.length);
    const decoded: string[] = [];
    for (let offset = 0; offset < encoded.length; offset += 50) {
        const width = Math.min(50, encoded.length - offset);
        const permuted = encoded.length - offset >= 52;
        for (let index = 0; index < width; index++) {
            const reflected =
                index < 5 ||
                index >= 45 ||
                (index >= 10 && index < 24) ||
                (index >= 26 && index < 40);
            decoded.push(encoded[offset + (permuted && reflected ? 49 - index : index)]);
        }
    }
    return decoded.join('');
}

function entriesFromPayload(
    payload: string,
    format: IRealFormat,
): { entries: string[][]; playlistName?: string } {
    // Fixed positional widths retain empty metadata. Never split /=+/ or discard blank fields.
    const fields = payload.split('=');
    const width = format === 'irealb' ? 10 : 6;
    const entries: string[][] = [];
    let index = 0;
    while (index < fields.length) {
        if (fields.length - index < width) {
            throw new Error('The iReal song header or playlist is incomplete or unsupported.');
        }
        entries.push(fields.slice(index, index + width));
        if (entries.length > MAX_IREAL_SONGS) {
            throw new Error(TOO_MANY_SONGS);
        }
        index += width;
        if (index === fields.length) {
            break;
        }
        if (format === 'irealb') {
            if (fields[index] !== '' || fields[index + 1] !== '') {
                throw new Error('This modern iReal playlist envelope is not supported.');
            }
            index += 2;
        }
        // An optional terminal playlist title is not another song (#1478 keeps it: an imported
        // playlist becomes a collection named after it). All musical entries are returned.
        if (fields.length - index === 1) {
            return fields[index] ? { entries, playlistName: fields[index] } : { entries };
        }
    }
    return { entries };
}

export interface DecodedIReal {
    format: IRealFormat;
    entries: string[][];
    /**
     * The playlist's own title, raw and unvalidated (the importer checks it as display text), when
     * the export carries one — the first link's that does, for an HTML export of several links.
     */
    playlistName?: string;
}

export function decodeIRealInput(input: string): DecodedIReal {
    if (
        typeof input !== 'string' ||
        input.length > MAX_SOURCE_BYTES ||
        new TextEncoder().encode(input).byteLength > MAX_SOURCE_BYTES
    ) {
        throw new Error('Choose an iReal export no larger than 1 MiB.');
    }
    const text = input.trim();
    const links = /^ireal(?:book|b):\/\//i.test(text) ? [text] : linksFromHtml(text);
    let format: IRealFormat | undefined;
    let playlistName: string | undefined;
    const entries: string[][] = [];
    for (const link of links) {
        const scheme = /^(irealbook|irealb):\/\//i.exec(link);
        if (!scheme) {
            throw new Error('This iReal link scheme is not supported.');
        }
        const current = scheme[1].toLowerCase() as IRealFormat;
        if (format && current !== format) {
            throw new Error('Import the two iReal formats separately.');
        }
        format = current;
        let payload: string;
        try {
            payload = decodeURIComponent(link.slice(scheme[0].length));
        } catch {
            throw new Error('The iReal link contains malformed percent encoding.');
        }
        if (/^search\?/i.test(payload)) {
            throw new Error('An iReal search link is not a chart export.');
        }
        const decoded = entriesFromPayload(payload, current);
        // A loop, not a spread: `push(...entries)` puts every entry on the call stack at once.
        for (const entry of decoded.entries) {
            entries.push(entry);
        }
        playlistName ??= decoded.playlistName;
        if (entries.length > MAX_IREAL_SONGS) {
            throw new Error(TOO_MANY_SONGS);
        }
    }
    if (!format) {
        throw new Error('No supported iReal chart was found.');
    }
    return playlistName === undefined ? { format, entries } : { format, entries, playlistName };
}

/**
 * One song's own iReal link, rebuilt from its positional header fields exactly as the export held
 * them (#1478) — what a song imported from a whole playlist keeps as its `importSource`, so 1,350
 * documents do not each carry the whole 650 KB playlist (which alone would pass the account's
 * 256 MiB storage cap). `decodeIRealInput` reads it back to the same fields: a percent-encoded
 * field cannot contain the `=` separator.
 */
export function songSourceLink(format: IRealFormat, fields: readonly string[]): string {
    return `${format}://${fields.map(encodeURIComponent).join('=')}`;
}
