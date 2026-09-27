import { validateSemanticScore } from './score-codec.js';
import { scoreDuration, scoreMeter } from './score-duration.js';
import { compileScoreForm } from './score-form.js';
import { isScoreChord } from './score-text.js';
import type {
    ScoreDirection,
    ScoreDuration,
    ScoreEvent,
    ScoreMeasure,
    SemanticScore,
} from './score-types.js';

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

// Per-meter "weight" of one written iReal grid cell, in beats of that meter (#1453). Established
// from infojunkie/ireal-musicxml converter.js's `Converter.mapTime` (`beatUnit`): iReal's editor
// always draws a bar 4 cells wide regardless of the time signature, so a written cell is worth
// exactly 1 beat only when 4 cells naturally fill the bar's own beat count. It's worth HALF a beat
// in 3/4 and 3/2 (4 cells span what is actually a 3-beat bar) and THREE beats — one dotted-quarter
// each — in 12/8 (4 cells span a 12-eighth-note bar). Every other supported meter maps 1:1 and is
// omitted here (the lookup below defaults to 1).
const CELL_BEATS = new Map([
    ['3/4', 0.5],
    ['3/2', 0.5],
    ['12/8', 3],
]);

// Meters this importer will actually SPLIT a multi-chord bar for (#1453 scope decision, not a
// technical limitation — `multiChordDurations` below implements the cited algorithm generally).
// A whole-playlist measurement found real evidence for 5/4 (Take Five's own Ebm(3)+Bbm7(2) vamp)
// and 6/4 (West Coast Blues); 12/8's beatUnit of 3 (one written cell = one whole dotted-quarter
// beat) has no split-the-beat ambiguity either. 3/4 and 3/2 are held back: their beatUnit of 0.5
// means a plain two-chord bar splits 1.5+1.5 beats, landing on the "and" of beat 2 — measured
// across the whole playlist at 168 of 181 such bars (43 songs), and the reference converter's own
// comment calls this specific algorithm "unknown" — not an established rule under #1171 without
// an explicit by-ear check against iReal Pro's own playback. 6/8 has zero real-playlist evidence
// either way (its one 6/8 chart has no multi-chord bar). A bar in an excluded meter still refuses
// with the existing message; a single-chord bar in one is unaffected, since that path (see
// `timedEvents`) never consults this set at all.
const SHIPPED_MULTI_CHORD_METERS = new Set(['4/4', '5/4', '6/4', '12/8']);

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

// Text that reads as playback-relevant even though this importer never applies it — worth a
// note so the musician knows it was seen and set aside, not silently dropped.
const PLAYBACK_TEXT = /D\.[CS]\.|\b(?:break|stop|hold|fine|coda|segno|repeat|ending|rit|tempo)\b/i;
// Text that specifically references a Fine/Coda/Segno marker or a numbered-ending jump. Only
// this narrower class may relax mapNavigation's unpaired-marker check: a "Bass break" or "rit."
// annotation must never silence a genuinely orphaned coda/segno/fine sign elsewhere in the chart
// just because unrelated playback-flavored text happened to appear somewhere too (#1447 review).
const NAVIGATION_REFERENCE =
    /D\.[CS]\.|\b(?:coda|segno|fine)\b|\bal\s+\d+(?:st|nd|rd|th)\s+ending\b/i;

const MAX_NOTES = 20;
/** Bounds a diagnostics list so a pathological chart (thousands of ownerless alternates or
 * orphaned markers) cannot produce an unbounded number of warnings. */
function boundedNotes(notes: string[]): string[] {
    if (notes.length <= MAX_NOTES) {
        return notes;
    }
    const kept = notes.slice(0, MAX_NOTES - 1);
    return [...kept, `…and ${notes.length - kept.length} more.`];
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

interface ParseSignals {
    /** A genuine navigation reference (D.C./D.S., coda/segno/fine, "al Nth ending") was left
     * unmapped, so an otherwise-orphaned Fine/Coda/Segno marker should be tolerated rather than
     * treated as a hard error. Never set by ordinary playback-flavored prose ("Bass break",
     * "rit.") — see NAVIGATION_REFERENCE. */
    unmappedNavigation: boolean;
    droppedAlternates: number;
    lastDroppedAlternate: string;
    notedEndMark: boolean;
}

function readBars(
    body: string,
    modern: boolean,
    notes: string[],
    signals: ParseSignals,
): WrittenBar[] {
    const bars: WrittenBar[] = [];
    // iReal defaults an unmarked chart to common time until a T-token overrides it (established:
    // infojunkie/ireal-musicxml src/lib/converter.js initializes `this.time = { beats: 4,
    // beatType: 4, beatUnit: 1 }` before any explicit time-signature token is read). Scoped to
    // the modern export this importer decodes from a Jazz 1460-style playlist.
    let activeMeter = modern ? '4/4' : '';
    let nextMeter: string | undefined;
    let pendingMeter = false;
    let current = newBar(activeMeter);
    let inside = false;
    let offset = 0;
    let segnos = 0;
    let codas = 0;
    let fines = 0;
    // A fermata's target, established from infojunkie/ireal-musicxml's own tokenizer+converter
    // (cited fully at the 'f' branch below), is resolved per-cell, in raw token order, against
    // whichever chord is "last pushed" at the moment the 'f'-holding cell is processed:
    // - A prefix 'f' immediately touching a following chord token (no space, bar or other
    //   cell-advancing character between them) shares that chord's SAME cell — parser.js's
    //   `case 'f': obj.annots.push(cell); cell = null;` does not advance, so the chord token right
    //   after it lands in the still-open cell too — and since converter.js pushes a cell's own
    //   chord before applying that cell's annotations, the fermata lands on that following chord.
    // - A BLANK/rest cell (a space, its own advancing token — parser.js's `chordRegex2` matches a
    //   space as a chord token, so it ALSO joins the still-open 'f' cell and immediately closes
    //   it) is decided the instant it arrives, not deferred: converter.js's "Chords." section
    //   handles a blank chord's `case ' ':` as a no-op (nothing pushed), so when "Other
    //   attributes." then reads `this.measure.chords[length-1]` for that same cell's 'f'
    //   annotation, it finds whatever was already there — the PRECEDING chord — and resolves
    //   there and then. A repeat marker ('x'/'r') is treated the same way here for the same
    //   reason (a rest with no symbol of its own); the reference's own repeat handling for this
    //   exact combination is a measure-clone edge case this importer's own repeat model (a
    //   `{kind:'repeat', measureId}` reference, not a literal clone at parse time) has no
    //   faithful analogue for, so it is scoped out rather than guessed.
    // - A bar-boundary character (`|`, `[`, `{`, `]`, `}`, `Z`) is TRANSPARENT to a pending
    //   fermata: parser.js's cases for all six either leave the currently-open cell untouched
    //   (`|`/`[`/`{` set `cell = null`, no advance) or only touch the PREVIOUS (already-closed)
    //   cell's `.bars` (`]`/`}`/`Z`) — none of them force or interrupt resolution. A fermata can
    //   therefore carry across a bar line and land on the FIRST chord of the next bar (matching
    //   #1452's own implicit-reopen citation: real content with no open bar starts one anyway).
    // - `this.measure.chords` is a fresh array per measure, so the backward-fallback case above
    //   cannot reach into an earlier bar — a fermata with nothing before it in the same bar, and
    //   nothing chord-shaped immediately after it either, would index `[-1]` and crash the
    //   reference converter (also true at the very end of the chart, with nothing following at
    //   all), so this importer refuses both rather than inventing a target the reference itself
    //   does not support.
    let pendingFermata = false;
    // Implicit reopen after `]`/`}`/`Z` (#1452), established from infojunkie/ireal-musicxml
    // converter.js's `convertMeasures()`: a new measure starts when `cell.bars` carries an
    // explicit opening mark OR — regardless of `.bars` — `!this.measure && (cell.chord ||
    // cell.annots.length || cell.comments.length)`, i.e. real content with no open measure starts
    // one anyway. parser.js's tokenizer never assigns an opening mark to the cell right after a
    // close (`]`/`}`/`Z` only appends the closing character to the PREVIOUS cell's `.bars`; see
    // the '|[]{}Z' branch below — the cell that follows gets none), so this is the common way the
    // rule fires. `addCell` is where every event-bearing/blank/repeat cell is created, so setting
    // `inside` unconditionally here is exactly that rule: real content always has somewhere to
    // land. It is deliberately lazy — nothing forces a reopen at the moment `]`/`}`/`Z` is read —
    // so a bar explicitly reopened by a following `|`/`[`/`{` (e.g. this importer's own
    // `{C |N1F }|N2G7 Z` repeat/ending test) is untouched: `inside` is already true by the time
    // any cell is added.
    function addCell(cell: Cell | null) {
        inside = true;
        if (current.cells.length >= 64) {
            fail(bars.length, 'The bar has too many rhythm cells.');
        }
        if (pendingFermata) {
            const target = cell?.event ? cell : [...current.cells].reverse().find((c) => c?.event);
            if (!target?.event) {
                fail(bars.length, 'A fermata must immediately precede its event.');
            }
            target.event.fermata = true;
            pendingFermata = false;
        }
        current.cells.push(cell);
    }
    function closeBar(edge: string) {
        if (!current.cells.length) {
            const bare = !(
                current.start.length ||
                current.end.length ||
                current.notes.length ||
                current.jump ||
                current.repeatTimes
            );
            // Two plain barlines back to back with nothing written between them (including one
            // expanded from a compressed "LZ" immediately followed by a bare "|") are the
            // documented manuscript line-break convention: pianosnake/ireal-reader's Parser.js
            // `createNewMeasure()` only inserts a new blank measure "unless the last measure is
            // a blank" — i.e. a second consecutive barline is always a no-op, never a lost bar.
            // Scoped to a plain continuing '|' specifically: a terminal, double-bar or
            // repeat-end edge keeps its own stricter check below, since silently dropping an
            // empty measure at one of those boundaries could hide a truncated or corrupted chart.
            if (inside && edge === '|' && bars.length && bare) {
                return;
            }
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
        } else if (modern && body.startsWith('Kcl', offset)) {
            // Compressed barline + blank cell + same-bar repeat-previous-measure cell.
            // Established mapping: infojunkie/ireal-musicxml src/lib/parser.js `unscramble()`:
            // `r.replace(/Kcl/g, '| x').replace(/LZ/g, ' |').replace(/XyQ/g, '   ')`. Expanded to
            // the exact three literal characters "| x" (not just "|x") so cell positions match
            // the reference: a barline closes this measure, then the space and the repeat cell
            // both land in the next one (#1447 review).
            closeBar('|');
            inside = true;
            addCell(null);
            addCell({ repeat: 'one' });
            offset += 3;
        } else if (modern && body.startsWith('LZ', offset)) {
            // Compressed blank cell + barline: the " |" half of the same established mapping
            // above.
            if (inside) {
                addCell(null);
            }
            closeBar('|');
            inside = true;
            offset += 2;
        } else if (char === ' ') {
            if (inside) {
                addCell(null);
            }
            offset++;
        } else if (char === ',') {
            // A comma clears the pending cell rather than emitting one of its own (established:
            // infojunkie/ireal-musicxml src/lib/parser.js's cell-annotation switch, `case ',':
            // cell = null;` — unlike a space, which always advances to a new cell). Ensemble
            // additionally uses one following a chord to mark a sub-cell boundary narrower than
            // a blank cell (see the exact-spacing tests); with nothing before it in this bar it
            // carries no such meaning and is pure alignment padding, so it is always safe to
            // skip rather than reject (#1447 review).
            offset++;
        } else if (char === 'U') {
            // "U" marks the end of the performance on the final chorus (established: infojunkie/
            // ireal-musicxml src/lib/converter.js's `case 'U': // END, treated as Fine`;
            // pianosnake/ireal-reader's Parser.js calls it "Ending measure for player"; ironss/
            // accompaniser's irealb_parser.lua lists it in its `unknown` production alongside
            // 's'/'l'). Kept as an annotation rather than a synthesized jump — the band still
            // loops the written form — with one note per song, not one per occurrence
            // (#1447 review).
            if (!signals.notedEndMark) {
                notes.push('An end-of-performance mark is kept as text; the band loops the form.');
                signals.notedEndMark = true;
            }
            current.notes.push({ text: 'U', cell: current.cells.length, above: false });
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
            // Rehearsal-mark charset per the established grammar (ironss/accompaniser
            // irealb_parser.lua: `labelchar <- [ABCDvi]`) — section letters A-D plus lowercase
            // 'i' (intro) and 'v'. 'V' is kept too for backward compatibility with any prior
            // acceptance of it here.
            if (!mark || !'ABCDVvi'.includes(mark) || current.cells.some(Boolean)) {
                fail(bars.length, 'This rehearsal-mark placement is not supported.');
            }
            current.notes.push({ text: mark, cell: 0, above: true });
            offset += 2;
        } else if (char === 'Y' || char === 's' || char === 'l') {
            // Officially visual-only, both established in ironss/accompaniser's irealb_parser.lua:
            // 'Y' is vertical spacing, its own `vspace` production; 's'/'l' (chord glyph size) are
            // in the separate `unknown` production. Neither adds a cell.
            // Known divergence from infojunkie/ireal-musicxml converter.js (review, #1453): there
            // 's' also sets `chord.short = true`, forcing that chord's `beats()` to exactly 1
            // regardless of trailing blanks/round-robin padding — a real duration effect this
            // importer doesn't model. Left as a visual no-op: long-standing (predates #1453) and
            // fails safe (produces a plausible, if occasionally non-reference-exact, duration
            // rather than a wrong one silently).
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
            // The compressed empty-cell token can appear inside staff text too — the established
            // substitution (infojunkie/ireal-musicxml's unscramble()) is a blind string replace
            // over the whole body, not cell-scoped — and iReal's own writers are loose about case
            // and surrounding whitespace in this free-text field. Normalize before classifying,
            // so "XyQ Fine"/"XyQFine" (Moon Rays, The Chicken) and " D.S. al coda "/"D.C. al CODA"
            // read as the plain instruction they display once rendered (#1447 review).
            const normalized = (modern ? text.replace(/XyQ/g, '   ') : text).trim();
            const jump = /^D\.([CS])\. al (fine|coda)$/i.exec(normalized);
            if (jump) {
                if (current.jump) {
                    fail(bars.length, 'The bar has more than one jump.');
                }
                current.jump = {
                    from: jump[1].toUpperCase() === 'C' ? 'start' : 'segno',
                    destination: jump[2].toLowerCase() === 'fine' ? 'fine' : 'coda',
                };
            } else if (normalized === 'Fine') {
                current.end.push({ kind: 'fine', label: `fine-${++fines}` });
            } else if (/^\d+x$/.test(normalized)) {
                const times = Number(normalized.slice(0, -1));
                if (times < 2 || times > 64 || current.repeatTimes) {
                    fail(bars.length, 'Use one repeat count from 2x to 64x.');
                }
                current.repeatTimes = times;
            } else {
                // Any other bounded staff text — a navigation phrase this importer doesn't map
                // ("D.C. al Nth ending": documented iReal vocabulary, but jumping to a specific
                // earlier repeat pass is not modeled by ScoreDestination's 'ending' kind yet —
                // score-form.ts's navigation() explicitly rejects it as unimplemented), or a
                // free-text performance note ("Original takes Coda every time") — is kept as
                // inert annotation. #1171's honest boundary is satisfied by never guessing a
                // jump for it (so the performed order is never silently wrong) plus a warning
                // through the import diagnostics when the text reads as playback-relevant,
                // rather than refusing the whole chart over text safe to leave unapplied (#1447).
                // Only a text that genuinely REFERENCES a Fine/Coda/Segno marker or a numbered
                // ending may relax the unpaired-marker check below — ordinary playback prose
                // ("Bass break", "rit.") must never silence a genuinely orphaned marker elsewhere.
                if (PLAYBACK_TEXT.test(normalized)) {
                    notes.push(
                        `A staff-text instruction ("${normalized}") is preserved as text only; it is not applied to the performed order.`,
                    );
                    if (NAVIGATION_REFERENCE.test(normalized)) {
                        signals.unmappedNavigation = true;
                    }
                }
                // A raised editorial tag with nothing but whitespace inside it (e.g. "<*66  >")
                // normalizes to an empty string, which the score's display-text validator
                // rejects outright (`text().length > 0`) — unlike the original untrimmed
                // whitespace, which passed harmlessly. There is nothing to display or invent
                // here, so skip the annotation rather than fail the whole chart over it.
                if (normalized) {
                    current.notes.push({
                        text: normalized,
                        cell: current.cells.length,
                        above: !!raised && Number(raised[1]) >= 36,
                    });
                }
            }
            offset = end + 1;
        } else if (char === '(') {
            const alternate = chordAt(body, offset + 1);
            if (!alternate || body[offset + alternate.length + 1] !== ')') {
                fail(bars.length, 'An alternate must immediately follow its owning chord.');
            }
            const previous = current.cells.at(-1)?.event;
            if (previous?.kind !== 'chord') {
                // ScoreEvent only carries `alternates` on a chord event; there is nowhere to put
                // one following a blank cell, a repeat cell or N.C./hold. Keep the chart
                // importable per #1447: drop the alternate rather than failing the whole song
                // over data the semantic score has no slot for. Counted, not noted individually
                // — a pathological chart could repeat this token thousands of times — and
                // summarized into one bounded note in scoreFromIRealBody (#1447 review).
                signals.droppedAlternates++;
                signals.lastDroppedAlternate = canonicalChord(alternate);
            } else {
                previous.alternates = [...(previous.alternates ?? []), canonicalChord(alternate)];
                if (previous.alternates.length > 8) {
                    fail(bars.length, 'Too many alternate chords.');
                }
            }
            offset += alternate.length + 2;
        } else if (char === 'f') {
            // Fermata (#1451): see `pendingFermata`'s declaration above for the full citation
            // (infojunkie/ireal-musicxml src/lib/parser.js + converter.js; pianosnake/ireal-reader's
            // Parser.js has the identical cell-grouping switch, since infojunkie's is explicitly
            // derived from it — both agree, so #1451's "stop if the sources disagree" doesn't apply).
            if (pendingFermata) {
                fail(bars.length, 'A fermata must immediately precede its event.');
            }
            pendingFermata = true;
            offset++;
        } else if (char === 'x' || char === 'r') {
            addCell({ repeat: char === 'x' ? 'one' : 'two' });
            offset++;
        } else if (char === 'n' || char === 'p') {
            // Known divergence from infojunkie/ireal-musicxml converter.js (review, #1453): 'p'
            // there is a pause/space filler (a slash with no root), and doubles as a W-alias when
            // it's the first token in a measure — not a sustained "hold" the way this importer
            // treats it. Left as-is: long-standing (predates #1453) and fails safe (an audibly
            // held chord, not a wrong pitch or a dropped beat).
            addCell({ event: { kind: char === 'n' ? 'no-chord' : 'hold', duration: [1, 1] } });
            offset++;
        } else if (char === 'W') {
            // Invisible-root placeholder (#1452), established from infojunkie/ireal-musicxml
            // converter.js's `case 'W':`: it copies the previous chord's root+quality — searching
            // the current measure first, then reverse-searching earlier measures for the nearest
            // one with a chord (`measures.slice().reverse().find(m => m.chords.length)`) — then
            // OVERWRITES the copy's slash bass with W's own (`chord.over = cell.chord.over`, which
            // is absent/undefined when W has none, dropping any slash the copied chord had) and
            // its own alternate (`chord.alternate = cell.chord.alternate`). parser.js's
            // `chordRegex2` gives W's own grammar: `/^([ Wp])()()(\/[A-G][#b]?)?(\(.*?\))?/` — an
            // optional slash bass, then an optional alternate in parens; the alternate needs no
            // special handling here, since a following "(...)" is already picked up by this
            // importer's own '(' branch once the synthesized chord below is on the cell stack.
            // Scoped to a preceding CHORD specifically (not N.C./hold, which the reference's own
            // `this.measure.chords` conflates with real chords in a way this importer's typed
            // events don't model): find the NEAREST preceding event — skipping only cell-less
            // blanks/repeats, which never carry an event in either model — and refuse unless that
            // nearest one is itself a chord. Reaching PAST a non-chord event (e.g. "C |n |W")
            // to copy an older chord instead would invent a target the reference doesn't support
            // either: converter.js's `case 'n':` pushes N.C. into `this.measure.chords` like any
            // other chord, so W's own `measures.slice().reverse().find(m => m.chords.length)`
            // search stops right there too — it would try to copy the N.C. entry, not skip it.
            const nearest = [...bars.flatMap((bar) => bar.cells), ...current.cells]
                .reverse()
                .map((cell) => cell?.event)
                .find((event) => event !== undefined);
            const rootQuality =
                nearest?.kind === 'chord'
                    ? /^([A-G][#b]?)(.*?)(?:\/[A-G][#b]?)?$/.exec(nearest.symbol)
                    : null;
            if (!rootQuality) {
                fail(bars.length, 'A slash-root placeholder needs an earlier chord to copy.');
            }
            const slash = /^\/([A-G][#b]?)/.exec(body.slice(offset + 1));
            addCell({
                event: {
                    kind: 'chord',
                    symbol: rootQuality[1] + rootQuality[2] + (slash ? `/${slash[1]}` : ''),
                    duration: [1, 1],
                },
            });
            offset += 1 + (slash ? slash[0].length : 0);
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
    // A fermata still pending at the very end of the chart has nothing left to attach to —
    // the reference converter would crash the same way it would on one with nothing preceding it
    // in an otherwise-empty bar (see `pendingFermata`'s declaration). Checked ahead of the
    // generic incomplete-bar failure below for a clearer reason.
    if (pendingFermata) {
        fail(bars.length, 'A fermata must immediately precede its event.');
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

/**
 * Multi-chord cell → duration mapping (#1453), established from infojunkie/ireal-musicxml
 * converter.js's `adjustChordsDuration()`. Each occupied cell's raw span (1 for itself, plus any
 * trailing blank cells — exactly `Converter.Chord.beats()`'s `1 + spaces`) is trimmed or padded,
 * round-robin from the first chord, until the total times the meter's own `CELL_BEATS` weight
 * exactly equals the meter's own beat count (`this.time.beats`/`measure.chords.length >
 * this.time.beats` is refused up front — too many chords for the meter to hold). This is
 * INDEPENDENT of the bar's raw total cell count, unlike a single-event bar (below), because iReal's
 * editor always draws 4 cells per bar regardless of meter — the raw count is a layout habit, not a
 * musical fact, and scaling proportionally against it (as a single-event bar safely can, since
 * there's only one span to normalize) would silently invent a wrong split whenever a chart's raw
 * layout departs from 4 cells, e.g. via this importer's own compressed "Kcl"/"LZ" tokens.
 *
 * Gated by `SHIPPED_MULTI_CHORD_METERS`: a meter not in that set refuses here even though the
 * algorithm above is general — see that set's own comment for which meters and why.
 */
function multiChordDurations(
    cellCounts: readonly number[],
    meter: string,
    index: number,
): ScoreDuration[] {
    const { counts, unit } = scoreMeter(meter);
    if (cellCounts.length > counts || !SHIPPED_MULTI_CHORD_METERS.has(meter)) {
        fail(index, 'Multi-chord cell timing in this meter needs a verified import mapping.');
    }
    const cellBeats = CELL_BEATS.get(meter) ?? 1;
    const adjusted = [...cellCounts];
    const total = () => adjusted.reduce((sum, cells) => sum + cells, 0) * cellBeats;
    // Bounded defensively: real iReal data always converges in well under this many steps (each
    // step moves the total by exactly one meter-beat), since `cellCounts.length <= counts` is
    // already enforced above. A chart that somehow can't converge (e.g. every cell already at the
    // 1-cell floor with more total beats still to trim) is refused rather than looped forever.
    for (let guard = 0; total() > counts; guard++) {
        if (guard > 4096) {
            fail(
                index,
                'These rhythm cells need iReal rounding; choose explicit chord lengths instead.',
            );
        }
        const i = guard % adjusted.length;
        if (adjusted[i] > 1) {
            adjusted[i]--;
        }
    }
    for (let guard = 0; total() < counts; guard++) {
        if (guard > 4096) {
            fail(
                index,
                'These rhythm cells need iReal rounding; choose explicit chord lengths instead.',
            );
        }
        adjusted[guard % adjusted.length]++;
    }
    return adjusted.map((cells) => scoreDuration(cells * cellBeats * 4, unit));
}

function timedEvents(bar: WrittenBar, index: number): ScoreEvent[] {
    const positions = bar.cells.flatMap((cell, at) => (cell ? [at] : []));
    if (!positions.length) {
        fail(index, 'Empty bars are not imported as silence or silently removed.');
    }
    const events = positions.map((at) => bar.cells[at]?.event);
    if (events.some((event) => !event)) {
        fail(index, 'A measure-repeat sign cannot share a bar with chords.');
    }
    if (positions.length === 1) {
        // Leading blanks do not delay the sole chord in iReal — its duration is the bar's own
        // full length, regardless of exactly how many raw cells the chart happened to write
        // (a proportional single-span scale-up always cancels back to the meter's own length).
        return [{ ...events[0]!, duration: scoreMeter(bar.meter).length }];
    }
    const cellCounts = positions.map((at, i) => (positions[i + 1] ?? bar.cells.length) - at);
    const durations = multiChordDurations(cellCounts, bar.meter, index);
    return events.map((event, i) => ({ ...event!, duration: durations[i] }));
}

function mapNavigation(
    bars: WrittenBar[],
    notes: string[],
    tolerateUnpairedMarkers: boolean,
): void {
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
    if (!jumps.length) {
        const orphaned = markers.filter(({ direction }) =>
            ['coda', 'fine', 'segno'].includes(direction.kind),
        );
        if (orphaned.length) {
            if (!tolerateUnpairedMarkers) {
                fail(0, 'Unpaired navigation symbols need an explicit supported jump.');
            }
            // The text that earned this tolerance is already noted; also name each marker left
            // dangling, so the musician sees exactly what got ignored (#1447 review).
            for (const { direction, index } of orphaned) {
                notes.push(
                    `The ${direction.kind} sign in bar ${index + 1} has no supported jump and is ignored.`,
                );
            }
        }
    }
}

/** Original parser of the documented open token grammar, not an upstream tolerant parser. */
export function scoreFromIRealBody(
    body: string,
    key: string,
    index: number,
    modern: boolean,
): { score: SemanticScore; notes: string[] } {
    if (!/^[A-G][#b]?-?$/.test(key)) {
        throw new Error('The stored key signature is unsupported.');
    }
    const notes: string[] = [];
    const signals: ParseSignals = {
        unmappedNavigation: false,
        droppedAlternates: 0,
        lastDroppedAlternate: '',
        notedEndMark: false,
    };
    const bars = readBars(body, modern, notes, signals);
    // An unmapped navigation reference (e.g. "al Nth ending") is imported as inert annotation
    // only, so a Fine/Coda/Segno marker it would otherwise have paired with is expected to be
    // unpaired here; mapNavigation notes each one by name rather than hard-failing.
    mapNavigation(bars, notes, signals.unmappedNavigation);
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
    // Dropped alternates are aggregated into one note (never one per occurrence — a pathological
    // chart could repeat "(D)" thousands of times), placed first, then the whole list is bounded
    // so no chart can produce an unbounded diagnostics list (#1447 review).
    const allNotes: string[] = [];
    if (signals.droppedAlternates === 1) {
        allNotes.push(
            `An alternate chord ("${signals.lastDroppedAlternate}") with no owning chord was dropped from the import.`,
        );
    } else if (signals.droppedAlternates > 1) {
        allNotes.push(
            `${signals.droppedAlternates} alternate chords with nothing to attach to were dropped from the import.`,
        );
    }
    allNotes.push(...notes);
    return { score: checked.value, notes: boundedNotes(allNotes) };
}
