import { validateSemanticScore } from './score-codec.js';
import { scoreDuration, scoreMeter } from './score-duration.js';
import { compileScoreForm } from './score-form.js';
import { isScoreChord } from './score-text.js';
import type { ScoreDirection, ScoreEvent, ScoreMeasure, SemanticScore } from './score-types.js';

interface Cell {
    event?: ScoreEvent;
    repeat?: 'one' | 'two';
}
interface StaffText {
    text: string;
    cell: number;
    above: boolean;
}
interface WrittenBar {
    cells: (Cell | null)[];
    meter: string;
    start: ScoreDirection[];
    end: ScoreDirection[];
    notes: StaffText[];
    close: string;
    jump?: { from: 'start' | 'segno'; destination: 'fine' | 'coda' };
    repeatTimes?: number;
}

const METERS = new Map([
    ['44', '4/4'],
    ['34', '3/4'],
    ['24', '2/4'],
    ['54', '5/4'],
    ['64', '6/4'],
    ['74', '7/4'],
    ['22', '2/2'],
    ['32', '3/2'],
    ['58', '5/8'],
    ['68', '6/8'],
    ['78', '7/8'],
    ['98', '9/8'],
    ['12', '12/8'],
]);

// Equivalent spellings only, not approximated voicings or dropped extensions.
// https://www.irealpro.com/learn/chord-symbols/ (official shorthand table)
const CHORD_ALIASES = new Map([
    ['-', 'm'],
    ['-6', 'm6'],
    ['-7', 'm7'],
    ['-9', 'm9'],
    ['-11', 'm11'],
    ['min13', 'm13'],
    ['^', 'maj7'],
    ['^7', 'maj7'],
    ['h', 'm7b5'],
    ['h7', 'm7b5'],
    ['-7b5', 'm7b5'],
    ['o', 'dim'],
    ['o7', 'dim7'],
    ['2', 'sus2'],
    ['sus', 'sus4'],
]);

function canonicalChord(symbol: string): string {
    const parts = /^([A-G][#b]?)(.*?)(\/[A-G][#b]?)?$/.exec(symbol);
    if (!parts) {
        return symbol;
    }
    return parts[1] + (CHORD_ALIASES.get(parts[2]) ?? parts[2]) + (parts[3] ?? '');
}

function fail(bar: number, message: string): never {
    throw new Error(`Bar ${bar + 1}: ${message}`);
}

function newBar(meter: string): WrittenBar {
    return { cells: [], meter, start: [], end: [], notes: [], close: '' };
}

/** Chords are full tokens; a quality containing parentheses must not become an alternate. */
function chordAt(body: string, offset: number): string | undefined {
    if (!/[A-G]/.test(body[offset])) {
        return;
    }
    let best: string | undefined;
    for (let end = offset + 1; end <= Math.min(offset + 80, body.length); end++) {
        const candidate = body.slice(offset, end);
        if (isScoreChord(candidate)) {
            best = candidate;
        }
        // Delimiters cannot occur inside any supported chord spelling.
        if (/[\s,|{}[\]<>]/.test(body[end - 1])) {
            break;
        }
    }
    return best;
}

function readBars(body: string, modern: boolean): WrittenBar[] {
    const bars: WrittenBar[] = [];
    let activeMeter = '';
    let nextMeter: string | undefined;
    let pendingMeter = false;
    let current = newBar(activeMeter);
    let inside = false;
    let offset = 0;
    let segnos = 0;
    let codas = 0;
    let fines = 0;
    function addCell(cell: Cell | null) {
        if (!inside) {
            fail(bars.length, 'Music needs an opening barline.');
        }
        if (current.cells.length >= 64) {
            fail(bars.length, 'The bar has too many rhythm cells.');
        }
        current.cells.push(cell);
    }
    function closeBar(edge: string) {
        if (!current.cells.length) {
            if (inside && '|}]Z'.includes(edge) && bars.length) {
                fail(bars.length, 'An empty interior measure must not disappear during import.');
            }
            if (
                '}]Z'.includes(edge) &&
                (current.start.length ||
                    current.end.length ||
                    current.notes.length ||
                    current.jump ||
                    current.repeatTimes)
            ) {
                fail(bars.length, 'A marked bar has no music.');
            }
            return;
        }
        if (!current.meter) {
            fail(bars.length, 'An explicit time signature is required.');
        }
        current.close = edge;
        if (edge === '}') {
            current.end.push({ kind: 'repeat-end', times: current.repeatTimes ?? 2 });
        } else if (current.repeatTimes) {
            fail(bars.length, 'A repeat count needs a closing repeat barline.');
        }
        bars.push(current);
        pendingMeter = nextMeter !== undefined;
        if (bars.length > 4096) {
            fail(bars.length, 'Import at most 4,096 measures per song.');
        }
        if (nextMeter) {
            activeMeter = nextMeter;
        }
        nextMeter = undefined;
        current = newBar(activeMeter);
    }
    while (offset < body.length) {
        const char = body[offset];
        // Three empty cells are compressed in the supplied modern export. They are rhythm,
        // not ignorable padding. Other undocumented compression tokens remain blocked.
        if (modern && body.startsWith('XyQ', offset)) {
            if (inside) {
                for (let i = 0; i < 3; i++) {
                    addCell(null);
                }
            }
            offset += 3;
        } else if (char === ' ') {
            if (inside) {
                addCell(null);
            }
            offset++;
        } else if (char === ',') {
            if (!inside || !current.cells.length) {
                fail(bars.length, 'A divider needs a preceding cell.');
            }
            offset++;
        } else if ('|[]{}Z'.includes(char)) {
            closeBar(char);
            inside = '|[{'.includes(char);
            if (char === '{') {
                current.start.push({ kind: 'repeat-start' });
            }
            offset++;
        } else if (char === 'T') {
            const meter = METERS.get(body.slice(offset + 1, offset + 3));
            if (!meter) {
                fail(bars.length, 'This time-signature token is not supported.');
            }
            if (current.cells.some(Boolean)) {
                nextMeter = meter;
            } else {
                activeMeter = meter;
                current.meter = meter;
            }
            pendingMeter = true;
            offset += 3;
        } else if (char === '*') {
            const mark = body[offset + 1];
            if (!mark || !'ABCDVi'.includes(mark) || current.cells.some(Boolean)) {
                fail(bars.length, 'This rehearsal-mark placement is not supported.');
            }
            current.notes.push({ text: mark, cell: 0, above: true });
            offset += 2;
        } else if (char === 'Y' || char === 's' || char === 'l') {
            // Officially visual-only: vertical spacing and chord glyph size do not add cells.
            offset++;
        } else if (char === 'N') {
            const pass = Number(body[offset + 1]);
            if (pass < 1 || pass > 3 || current.cells.some(Boolean)) {
                fail(bars.length, 'Only numbered endings at the start of a bar are mapped.');
            }
            current.start.push({ kind: 'ending-start', passes: [pass] });
            offset += 2;
        } else if (char === 'S' || char === 'Q') {
            const afterMusic = current.cells.some(Boolean);
            if (char === 'S' && afterMusic) {
                fail(bars.length, 'Place the segno before the bar music.');
            }
            const label = char === 'S' ? `segno-${++segnos}` : `coda-${++codas}`;
            (afterMusic ? current.end : current.start).push({
                kind: char === 'S' ? 'segno' : 'coda',
                label,
            });
            offset++;
        } else if (char === '<') {
            const end = body.indexOf('>', offset + 1);
            if (end < 0 || end - offset > 504) {
                fail(bars.length, 'The staff text is incomplete or too long.');
            }
            const raw = body.slice(offset + 1, end);
            const raised = /^\*(\d{2})/.exec(raw);
            const text = raised ? raw.slice(3) : raw;
            if (!text || text.includes('<') || /[\r\n\t]/.test(text)) {
                fail(bars.length, 'Staff text must be bounded plain text.');
            }
            const jump = /^D\.([CS])\. al (Fine|Coda)$/.exec(text);
            if (jump) {
                if (current.jump) {
                    fail(bars.length, 'The bar has more than one jump.');
                }
                current.jump = {
                    from: jump[1] === 'C' ? 'start' : 'segno',
                    destination: jump[2] === 'Fine' ? 'fine' : 'coda',
                };
            } else if (text === 'Fine') {
                current.end.push({ kind: 'fine', label: `fine-${++fines}` });
            } else if (/^\d+x$/.test(text)) {
                const times = Number(text.slice(0, -1));
                if (times < 2 || times > 64 || current.repeatTimes) {
                    fail(bars.length, 'Use one repeat count from 2x to 64x.');
                }
                current.repeatTimes = times;
            } else {
                if (
                    /D\.[CS]\.|\b(?:break|stop|hold|fine|coda|segno|repeat|ending|rit|tempo)\b/i.test(
                        text,
                    )
                ) {
                    fail(
                        bars.length,
                        'This playback text command needs a supported musical mapping.',
                    );
                }
                current.notes.push({
                    text,
                    cell: current.cells.length,
                    above: !!raised && Number(raised[1]) >= 36,
                });
            }
            offset = end + 1;
        } else if (char === '(') {
            const alternate = chordAt(body, offset + 1);
            const previous = current.cells.at(-1)?.event;
            if (
                !alternate ||
                body[offset + alternate.length + 1] !== ')' ||
                previous?.kind !== 'chord'
            ) {
                fail(bars.length, 'An alternate must immediately follow its owning chord.');
            }
            previous.alternates = [...(previous.alternates ?? []), canonicalChord(alternate)];
            if (previous.alternates.length > 8) {
                fail(bars.length, 'Too many alternate chords.');
            }
            offset += alternate.length + 2;
        } else if (char === 'f') {
            const event = current.cells.at(-1)?.event;
            if (!event || event.fermata) {
                fail(bars.length, 'A fermata must immediately follow its event.');
            }
            event.fermata = true;
            offset++;
        } else if (char === 'x' || char === 'r') {
            addCell({ repeat: char === 'x' ? 'one' : 'two' });
            offset++;
        } else if (char === 'n' || char === 'p') {
            addCell({ event: { kind: char === 'n' ? 'no-chord' : 'hold', duration: [1, 1] } });
            offset++;
        } else {
            const chord = chordAt(body, offset);
            if (!chord) {
                fail(
                    bars.length,
                    `Unrecognized musical token at character ${offset + 1}; the chart was not shortened.`,
                );
            }
            addCell({ event: { kind: 'chord', symbol: canonicalChord(chord), duration: [1, 1] } });
            offset += chord.length;
        }
    }
    if (
        current.cells.length ||
        current.start.length ||
        current.end.length ||
        current.notes.length ||
        current.jump ||
        current.repeatTimes ||
        pendingMeter
    ) {
        fail(bars.length, 'The chart ends without a complete closing barline.');
    }
    if (!bars.length) {
        fail(0, 'The chart has no complete measures.');
    }
    return bars;
}

function timedEvents(bar: WrittenBar, index: number): ScoreEvent[] {
    const positions = bar.cells.flatMap((cell, at) => (cell ? [at] : []));
    const length = scoreMeter(bar.meter).length;
    if (!positions.length) {
        fail(index, 'Empty bars are not imported as silence or silently removed.');
    }
    if (positions.length > 1 && bar.meter !== '4/4') {
        fail(index, 'Multi-chord cell timing in this meter needs a verified import mapping.');
    }
    // Leading blanks do not delay the first chord in iReal; normalize only the occupied span.
    const start = positions[0];
    const width = bar.cells.length - start;
    return positions.map((at, i) => {
        const event = bar.cells[at]?.event;
        if (!event) {
            fail(index, 'A measure-repeat sign cannot share a bar with chords.');
        }
        const cells = (positions[i + 1] ?? bar.cells.length) - at;
        const duration = scoreDuration(length[0] * cells, length[1] * width);
        if (positions.length > 1 && (duration[1] !== 1 || duration[0] < 1 || duration[0] > 4)) {
            fail(
                index,
                'These rhythm cells need iReal rounding; choose explicit chord lengths instead.',
            );
        }
        return { ...event, duration };
    });
}

function mapNavigation(bars: WrittenBar[]): void {
    const markers = bars.flatMap((bar, index) => [
        ...bar.start.map((direction) => ({ direction, index, edge: 'start' })),
        ...bar.end.map((direction) => ({ direction, index, edge: 'end' })),
    ]);
    const jumps = bars.flatMap((bar, index) => (bar.jump ? [{ bar, index, jump: bar.jump }] : []));
    if (jumps.length > 1) {
        fail(jumps[1].index, 'Multiple navigation jumps need a verified import policy.');
    }
    for (const { bar, index, jump } of jumps) {
        if (!']Z'.includes(bar.close)) {
            fail(index, 'D.C./D.S. needs a final closing barline in iReal.');
        }
        if (
            markers.some(({ direction }) =>
                ['repeat-start', 'repeat-end', 'ending-start'].includes(direction.kind),
            )
        ) {
            fail(index, 'Repeats after an iReal jump need a verified playback policy.');
        }
        const signs = markers.filter(({ direction }) => direction.kind === 'segno');
        const fines = markers.filter(({ direction }) => direction.kind === 'fine');
        const codas = markers.filter(({ direction }) => direction.kind === 'coda');
        if (jump.from === 'segno' && (signs.length !== 1 || signs[0].index >= index)) {
            fail(index, 'D.S. requires exactly one earlier segno.');
        }
        const from = jump.from === 'segno' ? signs[0].index : 0;
        if (jump.destination === 'fine') {
            if (
                fines.length !== 1 ||
                fines[0].index < from ||
                fines[0].index >= index ||
                codas.length
            ) {
                fail(
                    index,
                    'D.C./D.S. al Fine requires one reachable earlier Fine and no ambiguous coda.',
                );
            }
        } else if (
            codas.length !== 2 ||
            codas[0].edge !== 'end' ||
            codas[1].edge !== 'start' ||
            codas[0].index < from ||
            codas[0].index >= index ||
            codas[1].index <= index ||
            fines.length
        ) {
            fail(
                index,
                'Al Coda requires an earlier end-of-bar departure and a later start-of-bar coda target.',
            );
        }
        bar.end.push({
            kind: 'jump',
            from: jump.from,
            ...(jump.from === 'segno' ? { segno: 'segno-1' } : {}),
            destination:
                jump.destination === 'fine'
                    ? { kind: 'fine', label: 'fine-1' }
                    : { kind: 'coda', via: 'coda-1', target: 'coda-2' },
            repeats: 'skip',
        });
    }
    if (
        !jumps.length &&
        markers.some(({ direction }) => ['coda', 'fine', 'segno'].includes(direction.kind))
    ) {
        fail(0, 'Unpaired navigation symbols need an explicit supported jump.');
    }
}

/** Original parser of the documented open token grammar, not an upstream tolerant parser. */
export function scoreFromIRealBody(
    body: string,
    key: string,
    index: number,
    modern: boolean,
): SemanticScore {
    if (!/^[A-G][#b]?-?$/.test(key)) {
        throw new Error('The stored key signature is unsupported.');
    }
    const bars = readBars(body, modern);
    mapNavigation(bars);
    const id = (bar: number) => `ireal-${index + 1}-bar-${bar + 1}`;
    const measures: ScoreMeasure[] = [];
    let pendingTwo = false;
    for (const [i, bar] of bars.entries()) {
        const occupied = bar.cells.filter((cell): cell is Cell => !!cell);
        let content: ScoreMeasure['content'];
        if (pendingTwo) {
            if (occupied.length) {
                fail(i, 'The second half of a two-bar repeat must be empty.');
            }
            content = { kind: 'repeat', measureId: id(i - 2), display: 'two-bar-end' };
            pendingTwo = false;
        } else if (occupied.length === 1 && occupied[0].repeat) {
            const two = occupied[0].repeat === 'two';
            if (i < (two ? 2 : 1)) {
                fail(i, 'The repeat sign has no earlier source measures.');
            }
            content = {
                kind: 'repeat',
                measureId: id(i - (two ? 2 : 1)),
                display: two ? 'two-bar-start' : 'one-bar',
            };
            pendingTwo = two;
        } else {
            content = { kind: 'events', events: timedEvents(bar, i) };
        }
        const length = scoreMeter(bar.meter).length;
        const annotations = bar.notes.map((note) => ({
            text: note.text,
            at:
                note.cell === 0
                    ? scoreDuration(0)
                    : scoreDuration(length[0] * note.cell, length[1] * bar.cells.length),
            placement: note.above ? ('above' as const) : ('below' as const),
        }));
        measures.push({
            id: id(i),
            content,
            ...(i && bars[i - 1].meter !== bar.meter ? { meter: bar.meter } : {}),
            ...(bar.start.length ? { start: bar.start } : {}),
            ...(bar.end.length ? { end: bar.end } : {}),
            ...(annotations.length ? { annotations } : {}),
        });
    }
    if (pendingTwo) {
        fail(bars.length - 1, 'The two-bar repeat is missing its second measure.');
    }
    const score: SemanticScore = {
        notation: 'name',
        key: key.replace(/-$/, ''),
        isMinor: key.endsWith('-'),
        meter: bars[0].meter,
        grouping: null,
        sections: [{ id: `ireal-${index + 1}-section`, label: 'Chart', repeat: 1, measures }],
    };
    const checked = validateSemanticScore(score);
    if (checked.kind !== 'ok') {
        throw new Error(
            checked.kind === 'invalid'
                ? checked.issues[0].message
                : 'The imported score exceeds its validation limits.',
        );
    }
    // Authored validity alone permits unresolved form. Import also proves a bounded route;
    // lane/quality/meter playback capability remains the host adapter's separate decision.
    compileScoreForm(checked.value);
    return checked.value;
}
