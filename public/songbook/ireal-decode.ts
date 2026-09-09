type IRealFormat = 'irealbook' | 'irealb';

const MAX_SOURCE_BYTES = 1_048_576;
const MAX_SONGS = 64;
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
            if (links.length > MAX_SONGS) {
                throw new Error('Import at most 64 songs at a time.');
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

function entriesFromPayload(payload: string, format: IRealFormat): string[][] {
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
        if (entries.length > MAX_SONGS) {
            throw new Error('Import at most 64 songs at a time.');
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
        // Optional terminal playlist title is not another song. All musical entries are returned.
        if (fields.length - index === 1) {
            break;
        }
    }
    return entries;
}

export function decodeIRealInput(input: string): { format: IRealFormat; entries: string[][] } {
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
        entries.push(...entriesFromPayload(payload, current));
        if (entries.length > MAX_SONGS) {
            throw new Error('Import at most 64 songs at a time.');
        }
    }
    if (!format) {
        throw new Error('No supported iReal chart was found.');
    }
    return { format, entries };
}
