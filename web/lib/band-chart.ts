/**
 * The chart sheet's view of a score on the band engine.
 *
 * The display is read from the two things the band engine already trusts: the score for what is
 * written, and the band timeline for where each performed bar starts. So every chart the timeline compiles can be drawn, holds, N.C.,
 * fermatas and off-grid lengths included.
 *
 * Nothing here decides which chord sounds; the timeline's chord spans are the only authority
 * for that. A slot is a *written* event at its performed position, which is what the playhead
 * highlights: a musician reading a hold bar tracks the bar, not the chord ringing through it.
 */
import {
    type ChordFacts,
    eventBoundaries,
    notePc,
    PPQ,
    parseChord,
    type Timeline,
} from '@band/index';
import { INTERVAL_TO_NNS, INTERVAL_TO_ROMAN } from '@core/config';
import { spellPitchClass } from '@core/engine/note-spelling';
import { transposeChordText } from '@core/engine/transpose';
import { resolveScoreContext } from '@core/songbook/score-context';
import { compileScoreForm } from '@core/songbook/score-form';
import { resolveScoreMeasureEvents } from '@core/songbook/score-measure-events';
import type { SemanticScore } from '@core/songbook/score-types';
import type { ChordNamePart, FormattedChordNames } from '@core/types';
import { respellKeyForMode, transposeKeyName } from '@core/utils';
import { type ChartBlock, type ChartChord, type ChartMeasure, writtenBlocks } from './lead-sheet';

/** One sixteenth in band ticks: the unit the chart sheet speaks. */
const STEP_TICKS = PPQ / 4;

export interface BandChartChord extends ChartChord {
    kind: 'chord' | 'hold' | 'no-chord';
    fermata: boolean;
    /** What a tap auditions; null for a hold or N.C., which have nothing of their own to sound. */
    chord: ChordFacts | null;
}

/** One written event where the form performs it. */
export interface BandSlot {
    /** Song ticks, as `BandHost.songTick()` reports them (written time: a fermata is one slot). */
    from: number;
    to: number;
    /** The same range in sixteenth steps, for the chart sheet. */
    start: number;
    end: number;
    /** Index into `chords`: the written event this performs. */
    display: number;
    /**
     * Ordinal of the PERFORMED bar this slot belongs to — `form`/`timeline.bars`' own index.
     * Two chords sharing one written bar (#1458's next-bar cue, P1-1) share this too, so a
     * next-bar walk can skip both; two performed VISITS of the same written bar through a
     * repeat (P2-1) do NOT — each visit gets its own `bar`, so a one-bar `||: :||` correctly
     * points a pass's cue at the FOLLOWING performed bar, never back at itself.
     */
    bar: number;
}

export interface BandChart {
    blocks: ChartBlock[];
    /** Every written event in written order; a chord's `globalIndex` is its index here. */
    chords: BandChartChord[];
    /** Every performed event in performance order. */
    slots: BandSlot[];
    /**
     * Each section visit's step range, for "Start here", and which chorus of a counted
     * performance (`SemanticScore.choruses`) it belongs to — 0 throughout an uncounted chart.
     */
    sections: { id: string; start: number; end: number; chorus: number }[];
}

export function bandChart(score: SemanticScore, timeline: Timeline): BandChart {
    const form = compileScoreForm(score);
    if (form.length !== timeline.bars.length) {
        throw new Error('The band timeline does not match this chart.');
    }
    const events = resolveScoreMeasureEvents(score);
    const chords: BandChartChord[] = [];
    // Per written bar: its first event's index and each event's offset inside the bar, in ticks.
    const written = score.sections.map((section, s) => {
        let context = resolveScoreContext(score, section);
        return section.measures.map((measure, m) => {
            context = resolveScoreContext(context, measure);
            const key = { tonic: notePc(context.key), minor: context.isMinor };
            const first = chords.length;
            const offsets: number[] = [];
            // The timeline's own boundaries, so slots meet its spans exactly.
            const boundaries = eventBoundaries(events[s][m]);
            for (const [e, event] of events[s][m].entries()) {
                const at = boundaries[e];
                const length = boundaries[e + 1] - at;
                const named =
                    event.kind === 'chord'
                        ? chordNames(event.symbol, context.key, context.isMinor)
                        : { absName: event.kind === 'hold' ? '/' : 'N.C.' };
                chords.push({
                    globalIndex: chords.length,
                    // Bar-relative until a performance places it (below).
                    start: at / STEP_TICKS,
                    end: (at + length) / STEP_TICKS,
                    measureId: measure.id,
                    sectionId: section.id,
                    key: context.key,
                    keyIsMinor: context.isMinor,
                    timeSignature: context.meter,
                    kind: event.kind,
                    fermata: event.fermata === true,
                    chord: event.kind === 'chord' ? parseChord(event.symbol, key) : null,
                    ...named,
                });
                offsets.push(at);
            }
            return { first, offsets };
        });
    });

    const slots: BandSlot[] = [];
    const placed = new Set<number>();
    form.forEach((visit, i) => {
        const bar = timeline.bars[i];
        const { first, offsets } = written[visit.sectionIndex][visit.measureIndex];
        offsets.forEach((offset, j) => {
            const from = bar.start + offset;
            // The last event runs to the barline, which absorbs the timeline's rounding too.
            const to =
                j + 1 < offsets.length
                    ? bar.start + offsets[j + 1]
                    : bar.start + bar.meter.barTicks;
            const slot = {
                from,
                to,
                start: from / STEP_TICKS,
                end: to / STEP_TICKS,
                display: first + j,
                bar: i,
            };
            slots.push(slot);
            // A chord shows where it is first played, as the old sheet's steps did.
            if (!placed.has(slot.display)) {
                placed.add(slot.display);
                chords[slot.display].start = slot.start;
                chords[slot.display].end = slot.end;
            }
        });
    });

    const measures = new Map<string, ChartMeasure>();
    for (const chord of chords) {
        const measure = measures.get(chord.measureId!);
        if (measure) {
            measure.chords.push(chord);
        } else {
            measures.set(chord.measureId!, {
                chords: [chord],
                sectionId: chord.sectionId,
                sectionLabel: score.sections.find((section) => section.id === chord.sectionId)
                    ?.label,
                startsSection: false,
                isSeamlessStart: false,
            });
        }
    }

    return {
        blocks: writtenBlocks(score, (id) => measures.get(id)),
        chords,
        slots,
        sections: timeline.visits.map((visit) => {
            const last = timeline.bars[visit.firstBar + visit.barCount - 1];
            return {
                id: visit.id,
                start: timeline.bars[visit.firstBar].start / STEP_TICKS,
                end: (last.start + last.meter.barTicks) / STEP_TICKS,
                chorus: visit.chorus,
            };
        }),
    };
}

/** The performed slot under a song tick, or -1 past the end. */
export function slotAt(chart: BandChart, tick: number): number {
    let lo = 0;
    let hi = chart.slots.length - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const slot = chart.slots[mid];
        if (tick < slot.from) {
            hi = mid - 1;
        } else if (tick >= slot.to) {
            lo = mid + 1;
        } else {
            return mid;
        }
    }
    return -1;
}

/**
 * A section's whole span in steps, every visit collapsed into one window. A counted chart
 * (#1475) performs its form once per chorus, so only the visits of the FIRST chorus that plays
 * the section count: "Start here" begins at its first performed bar there, never at a window
 * stretched from chorus 1 to chorus N. That first chorus is chorus 0
 * for the form, and the last for a last-chorus coda or an outro (#1483), which only it plays.
 */
export function sectionSteps(chart: BandChart, id: string): { start: number; end: number } | null {
    const all = chart.sections.filter((section) => section.id === id);
    if (!all.length) {
        return null;
    }
    const first = Math.min(...all.map((visit) => visit.chorus));
    const visits = all.filter((visit) => visit.chorus === first);
    return {
        start: Math.min(...visits.map((visit) => visit.start)),
        end: Math.max(...visits.map((visit) => visit.end)),
    };
}

/**
 * A tapped chord's notes: close position in the keys' register slot (52–84), the root lowest
 * unless the chart names another bass, which goes under it.
 */
export function auditionMidis(chord: ChordFacts): number[] {
    const root = 52 + ((chord.root - 52 + 120) % 12);
    const tones = chord.intervals.map((interval) => root + interval);
    return chord.bass === chord.root
        ? tones
        : [root - 12 + ((chord.bass - chord.root + 12) % 12), ...tones];
}

// ------------------------------------------------------------------ chord names

// The codec's root grammar (`ROOT` in `core/songbook/score-text.ts`), with the parts captured:
// roman numeral, Nashville number, or letter name, each with its own accidental.
const ROOT =
    /^(?:([#b]?)(III|II|IV|I|VII|VI|V|iii|ii|iv|i|vii|vi|v)|([#b]?)([1-7])|([A-Ga-g])([#b]?))/;
/**
 * A written minor third: `m`, `min` or `-`, but not the `ma`/`maj` of a major seventh. The `m` of
 * `madd9` is one: `add` is the only thing after `ma` that is not a major seventh.
 */
const MINOR_MARK = /^(?:min|m(?!a(?!dd))|-)/;
/** Diminished spellings carry their own third. */
const DIMINISHED_MARK = /^(?:o|°|dim|h|ø)/;

/**
 * A written chord symbol in all three notations the chart sheet offers. The quality is kept as
 * written (`C^7` stays `C^7`: that is how the chart reads); only the root and bass move between
 * letter names, roman numerals and Nashville numbers, and the minor third moves between a
 * lowercase numeral and a written `m`/`-`, since each notation spells it differently.
 * An unreadable symbol is shown verbatim.
 */
export function chordNames(
    symbol: string,
    key: string,
    isMinor: boolean,
): { absName: string; display: FormattedChordNames } {
    const text = symbol.replaceAll('♭', 'b').replaceAll('♯', '#');
    const tonic = notePc(key);
    const facts = parseChord(text, { tonic, minor: isMinor });
    const root = ROOT.exec(text);
    if (!facts || !root) {
        const part = () => ({ root: symbol, suffix: '' });
        return { absName: symbol, display: { name: part(), nns: part(), roman: part() } };
    }
    let quality = text.slice(root[0].length);
    let bass: RegExpExecArray | null = null;
    const slash = quality.lastIndexOf('/');
    if (slash >= 0) {
        const over = ROOT.exec(quality.slice(slash + 1));
        // `6/9` is a quality, not a slash chord: 9 is no root.
        if (over && over[0].length === quality.length - slash - 1) {
            bass = over;
            quality = quality.slice(0, slash);
        }
    }
    const degree = (pc: number) => ((pc - tonic + 12) % 12) as keyof typeof INTERVAL_TO_ROMAN;
    const minorThird = facts.third === 3;
    const marked = MINOR_MARK.test(quality);
    const bare = quality.replace(MINOR_MARK, '');
    // `ii7` names its minor third by case alone; spelled in letters it needs the `m`.
    const implied =
        !!root[2] &&
        root[2] === root[2].toLowerCase() &&
        minorThird &&
        !marked &&
        !DIMINISHED_MARK.test(quality);
    const numeral = (pc: number, lower: boolean) =>
        lower ? INTERVAL_TO_ROMAN[degree(pc)].toLowerCase() : INTERVAL_TO_ROMAN[degree(pc)];
    const letter = (match: RegExpExecArray, pc: number) =>
        match[5]
            ? match[5].toUpperCase() + match[6]
            : spellPitchClass(pc, key, match[1] || match[3] || '', '', isMinor);

    const name: ChordNamePart = {
        root: letter(root, facts.root),
        // A minor chord with a major seventh is written `mMaj7`, never `mmaj7`.
        suffix: implied ? `m${quality.replace(/^maj/, 'Maj')}` : quality,
    };
    const nns: ChordNamePart = {
        root: root[4] ? root[3] + root[4] : INTERVAL_TO_NNS[degree(facts.root)],
        suffix: root[4] ? quality : implied ? `-${quality}` : marked ? `-${bare}` : quality,
    };
    const roman: ChordNamePart = {
        root: root[2] ? root[1] + root[2] : numeral(facts.root, minorThird),
        suffix: root[2] ? quality : minorThird ? bare : quality,
    };
    if (bass) {
        name.bass = letter(bass, facts.bass);
        nns.bass = bass[4] ? bass[3] + bass[4] : INTERVAL_TO_NNS[degree(facts.bass)];
        roman.bass = bass[2] ? bass[1] + bass[2] : numeral(facts.bass, false);
    }
    return {
        absName: `${name.root}${name.suffix}${name.bass ? `/${name.bass}` : ''}`,
        display: { name, nns, roman },
    };
}

/**
 * The key a transposing instrument reads in (#1992): `key` moved up `shift` semitones, spelled as
 * that key is usually written in its mode (`F#` minor, `Db` major), so its chords take the
 * sharps or flats a part in that key would.
 */
export function shiftedKey(key: string, isMinor: boolean, shift: number): string {
    return respellKeyForMode(transposeKeyName(key, shift), isMinor);
}

/**
 * One chord as a transposing instrument reads it (#1992): its letter name moved up `shift`
 * semitones and spelled from the key it lands in (`transposeChordText`, the Key popover's own
 * path, #1977). Display only — the score, the band and every stored chord stay in concert.
 * Roman numerals and Nashville numbers name degrees of the key, so they read the same in any
 * transposition and are left as they are. A hold, an N.C. or a symbol that won't read is
 * returned unchanged.
 */
export function shiftedChord<C extends ChartChord>(chord: C, shift: number): C {
    if (
        shift % 12 === 0 ||
        (chord.kind !== undefined && chord.kind !== 'chord') ||
        !chord.display
    ) {
        return chord;
    }
    const minor = chord.keyIsMinor === true;
    const key = shiftedKey(chord.key, minor, shift);
    const named = chordNames(
        transposeChordText(chord.absName, shift, { key, isMinor: minor }),
        key,
        minor,
    );
    return {
        ...chord,
        key,
        absName: named.absName,
        display: { ...chord.display, name: named.display.name },
    };
}

/** The chart sheet's blocks with every chord read for a transposing instrument (#1992). */
export function shiftedBlocks<B extends ChartBlock>(blocks: B[], shift: number): B[] {
    if (shift % 12 === 0) {
        return blocks;
    }
    return blocks.map((block) => ({
        ...block,
        measures: block.measures.map((measure) => ({
            ...measure,
            chords: measure.chords.map((chord) => shiftedChord(chord, shift)),
        })),
    }));
}
