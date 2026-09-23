/**
 * The chart sheet's view of a score on the band engine (`?engine=next`).
 *
 * The old engine's display is its playback plan (`arranger.progression`/`stepMap`), so a chart
 * it cannot plan cannot even be drawn. Here the display is read from the two things the band
 * engine already trusts: the score for what is written, and the band timeline for where each
 * performed bar starts. So every chart the timeline compiles can be drawn, holds, N.C.,
 * fermatas and off-grid lengths included.
 *
 * Nothing here decides which chord sounds; the timeline's chord spans are the only authority
 * for that. A slot is a *written* event at its performed position, which is what the playhead
 * highlights: a musician reading a hold bar tracks the bar, not the chord ringing through it.
 */
import { type ChordFacts, notePc, PPQ, parseChord, type Timeline } from '@band/index';
import { INTERVAL_TO_NNS, INTERVAL_TO_ROMAN } from '@engine/config';
import { spellPitchClass } from '@engine/engine/note-spelling';
import { resolveScoreContext } from '@engine/songbook/score-context';
import { compileScoreForm } from '@engine/songbook/score-form';
import { resolveScoreMeasureEvents } from '@engine/songbook/score-measure-events';
import type { ScoreDuration, SemanticScore } from '@engine/songbook/score-types';
import type { ChordNamePart, FormattedChordNames } from '@engine/types';
import { type ChartBlock, type ChartChord, type ChartMeasure, writtenBlocks } from './lead-sheet';

/** One sixteenth in band ticks: the unit the chart sheet and the practice loop speak. */
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
}

export interface BandChart {
    blocks: ChartBlock[];
    /** Every written event in written order; a chord's `globalIndex` is its index here. */
    chords: BandChartChord[];
    /** Every performed event in performance order. */
    slots: BandSlot[];
    /** Each section visit's step range, for practice loops. */
    sections: { id: string; start: number; end: number }[];
}

/** The timeline's own rounding (`durationTicks` in `band/form/timeline.ts`), so slots meet its spans exactly. */
function durationTicks([n, d]: Readonly<ScoreDuration>): number {
    return Math.round((n * PPQ) / d);
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
            let at = 0;
            for (const event of events[s][m]) {
                const length = durationTicks(event.duration);
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
                at += length;
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
 * A section's whole span in steps, every visit collapsed into one window — the same rule as
 * `getSectionStepBounds`, which reads the old engine's section map instead.
 */
export function sectionSteps(chart: BandChart, id: string): { start: number; end: number } | null {
    const visits = chart.sections.filter((section) => section.id === id);
    if (!visits.length) {
        return null;
    }
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

// The codec's root grammar (`ROOT` in `public/songbook/score-text.ts`), with the parts captured:
// roman numeral, Nashville number, or letter name, each with its own accidental.
const ROOT =
    /^(?:([#b]?)(III|II|IV|I|VII|VI|V|iii|ii|iv|i|vii|vi|v)|([#b]?)([1-7])|([A-Ga-g])([#b]?))/;
/** A written minor third: `m`, `min` or `-`, but not the `ma`/`maj` of a major seventh. */
const MINOR_MARK = /^(?:min|m(?!a)|-)/;
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
        suffix: implied ? `m${quality}` : quality,
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
