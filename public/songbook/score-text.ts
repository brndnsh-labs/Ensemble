import { addScoreDurations, scoreDuration, scoreMeter } from './score-duration.js';
import type { ScoreDuration, ScoreEvent } from './score-types.js';
import type { CodecDecodeResult } from './types.js';

// Spelling vocabulary, not voicings. The official iReal grammar and Ensemble's existing
// spellings belong here independently of octave, genre, instrument or generated intervals.
// https://www.irealpro.com/ireal-pro-custom-chord-chart-protocol/
const QUALITIES = new Set([
    '',
    '5',
    '2',
    'add9',
    '+',
    'o',
    'h',
    'sus',
    '^',
    '-',
    '^7',
    '-7',
    '7',
    '7sus',
    'h7',
    'o7',
    '^9',
    '^13',
    '6',
    '69',
    '^7#11',
    '^9#11',
    '^7#5',
    '-6',
    '-69',
    '-^7',
    '-^9',
    '-9',
    '-11',
    '-7b5',
    'h9',
    '-b6',
    '-#5',
    '9',
    '7b9',
    '7#9',
    '7#11',
    '7b5',
    '7#5',
    '9#11',
    '9b5',
    '9#5',
    '7b13',
    '7#9#5',
    '7#9b5',
    '7#9#11',
    '7b9#11',
    '7b9b5',
    '7b9#5',
    '7b9#9',
    '7b9b13',
    '7alt',
    '13',
    '13#11',
    '13b9',
    '13#9',
    '7b9sus',
    '7susadd3',
    '9sus',
    '13sus',
    '7b13sus',
    '11',
    'min13',
    'min^11',
    'min^13',
    'maj13#11',
    'maj7b5',
    'maj7#9',
    'min7b6',
    'min9b6',
    'maj(add4)',
    'min(add4)',
    '7(add13)',
    'maj7#11',
    'maj7#5',
    'maj7+',
    'maj7',
    'maj9',
    'maj11',
    'maj13',
    'maj',
    'ma13',
    'ma11',
    'ma9',
    'ma7',
    'ma',
    'M7#5',
    'M7+',
    'M7',
    '△9',
    '△7',
    '△',
    'Δ',
    'Δ7',
    'm13',
    'm11',
    'm9',
    'm7b5',
    'm7',
    'm6',
    'min',
    'm',
    'dim7',
    'dim',
    '°7',
    '°',
    '7+',
    '7aug',
    'aug7',
    'aug',
    '+7',
    'ø7',
    'ø',
    '7sus4',
    'sus4',
    'sus2',
    'add2',
    'alt',
    '6/9',
]);
const ROOT = /^(?:[#b]?(?:III|II|IV|I|VII|VI|V|iii|ii|iv|i|vii|vi|v)|[#b]?[1-7]|[A-Ga-g][#b]?)/;

/** Whole-token recognition only. Unknown qualities must not become plausible major chords. */
export function isScoreChord(symbol: string): boolean {
    if (typeof symbol !== 'string' || symbol.length > 80) {
        return false;
    }
    const normalized = symbol.replaceAll('♭', 'b').replaceAll('♯', '#');
    const root = normalized.match(ROOT)?.[0];
    if (!root) {
        return false;
    }
    const tail = normalized.slice(root.length);
    if (QUALITIES.has(tail)) {
        return true;
    }
    const slash = tail.lastIndexOf('/');
    if (slash < 0 || !QUALITIES.has(tail.slice(0, slash))) {
        return false;
    }
    const bass = tail.slice(slash + 1);
    return bass.length > 0 && bass.match(ROOT)?.[0] === bass;
}

function countsFromText(text: string): ScoreDuration {
    if (/^\d{1,6}\/\d{1,6}$/.test(text)) {
        const [n, d] = text.split('/').map(Number);
        return scoreDuration(n, d);
    }
    if (!/^\d{1,6}(?:\.\d{1,6})?$/.test(text)) {
        throw new Error('Use a positive count, decimal or fraction after the colon.');
    }
    const [whole, fraction = ''] = text.split('.');
    const denominator = 10 ** fraction.length;
    return scoreDuration(Number(whole) * denominator + Number(fraction), denominator);
}

/** Parse one complete bar. Meter-denominator counts are converted to exact quarter units. */
export function parseChordBar(text: string, meter: string): CodecDecodeResult<ScoreEvent[]> {
    try {
        if (typeof text !== 'string' || text.length > 4000 || !text.trim()) {
            throw new Error('Add chords to the bar (maximum 4,000 characters).');
        }
        const config = scoreMeter(meter);
        const tokens = text.trim().split(/\s+/);
        if (tokens.length > 64) {
            throw new Error('A bar can contain at most 64 events.');
        }
        const explicit = tokens.some((token) => token.includes(':'));
        const events: ScoreEvent[] = tokens.map((token) => {
            const parts = token.split(':');
            if (parts.length !== (explicit ? 2 : 1)) {
                throw new Error('Give every chord in this bar a length, or leave all lengths out.');
            }
            const counts = explicit
                ? countsFromText(parts[1])
                : scoreDuration(config.counts, tokens.length);
            const duration = scoreDuration(counts[0] * 4, counts[1] * config.unit);
            if (!duration[0]) {
                throw new Error('Chord lengths must be positive.');
            }
            const written = parts[0];
            if (written === 'N.C.' || written === '/') {
                return { kind: written === '/' ? 'hold' : 'no-chord', duration };
            }
            // Alternate chords use square brackets, leaving qualities such as maj(add4) intact.
            const match = /^([^[\]]+)(?:\[([^[\]]+)\])?$/.exec(written);
            const symbol = match?.[1];
            const alternates = match?.[2]?.split(',');
            if (
                !symbol ||
                !isScoreChord(symbol) ||
                (alternates && (alternates.length > 8 || !alternates.every(isScoreChord)))
            ) {
                throw new Error(`Unsupported chord spelling “${written.slice(0, 80)}”.`);
            }
            return { kind: 'chord', symbol, duration, ...(alternates ? { alternates } : {}) };
        });
        const total = events.reduce((sum, event) => addScoreDurations(sum, event.duration), [
            0, 1,
        ] as ScoreDuration);
        if (total[0] !== config.length[0] || total[1] !== config.length[1]) {
            throw new Error(`Chord lengths must fill exactly ${config.counts} counts in ${meter}.`);
        }
        return { kind: 'ok', value: events };
    } catch (error) {
        return {
            kind: 'invalid',
            issues: [{ path: '$.bar', code: 'invalid-value', message: (error as Error).message }],
        };
    }
}

/** Only the bar's event text, not section form or annotations. Callers retain those separately. */
export function printChordBar(events: readonly ScoreEvent[], meter: string): string {
    const config = scoreMeter(meter);
    if (events.some((event) => Object.hasOwn(event, 'fermata'))) {
        throw new Error('A fermata needs the chart editor; plain event text cannot preserve it.');
    }
    const text = events
        .map((event) => {
            const counts = scoreDuration(event.duration[0] * config.unit, event.duration[1] * 4);
            const length = counts[1] === 1 ? `${counts[0]}` : `${counts[0]}/${counts[1]}`;
            const chord =
                event.kind === 'chord'
                    ? event.symbol + (event.alternates ? `[${event.alternates.join(',')}]` : '')
                    : event.kind === 'hold'
                      ? '/'
                      : 'N.C.';
            return `${chord}:${length}`;
        })
        .join(' ');
    const checked = parseChordBar(text, meter);
    if (checked.kind !== 'ok') {
        throw new Error('Cannot print an invalid or incomplete chord bar.');
    }
    return text;
}
