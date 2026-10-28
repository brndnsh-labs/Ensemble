import { writtenSettings } from '@core/songbook/codec';
import { isRetiredSchema, validateChartDocumentV2 } from '@core/songbook/document-v2';
import { validateSemanticScore } from '@core/songbook/score-codec';
import { resolveScoreContext } from '@core/songbook/score-context';
import { scoreMeter } from '@core/songbook/score-duration';
import type {
    ChartDocumentV2,
    ScoreMeasure,
    ScoreSection,
    SemanticScore,
} from '@core/songbook/score-types';
import type { ChartSettings } from '@core/songbook/types';
import { withSectionMeter } from './song-meter';
import type { SavedSong } from './sync/protocol';

/** The chart the app stores, opens, plays and edits: a measure chart (schemaVersion 2), the only kind. */
export type ChartDocument = ChartDocumentV2;
export type DocumentContent = ChartDocument['chart'];

/** The chart's genre, by name (`GENRE_NAMES`). */
export function genreOf(document: ChartDocument): string {
    return document.chart.band.groove.genre;
}

/** The chart's composer, when known (#1440): an iReal import's own metadata; `''` when none. */
export function composerOf(document: ChartDocument): string {
    return document.metadata?.composer ?? '';
}

/**
 * What the app says about a text chart (schemaVersion 1, retired in #1740) it is asked to open:
 * an old file or `#chart=` link. The format itself is not read any more.
 */
export const OLD_FORMAT_REFUSAL =
    'This song is in the old text-chart format, which this app no longer opens. Nothing was changed.';

/**
 * A chart the app can open, or a sentence saying why not: a text chart (schema 1) is refused
 * with `OLD_FORMAT_REFUSAL`, anything else that will not validate with its issues.
 */
export function validateDocument(candidate: unknown): ChartDocument {
    if (isRetiredSchema(candidate)) {
        throw new Error(OLD_FORMAT_REFUSAL);
    }
    const result = validateChartDocumentV2(candidate);
    if (result.kind !== 'ok') {
        const reason =
            result.kind === 'future-version'
                ? 'a newer document version'
                : result.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ');
        throw new Error(`Cannot open this chart: ${reason}. The source has not been changed.`);
    }
    return result.value;
}

/**
 * `band` with every lane on Follow feel (#1405): a new song plays whatever this device has
 * installed, never a sound the song it borrowed its setup from happened to pin.
 */
export function followingFeel<T extends ChartSettings['band']>(band: T): T {
    return Object.fromEntries(
        Object.entries(band).map(([lane, mix]) => [lane, { ...mix, autoSound: true }]),
    ) as T;
}

/** A fresh four-bar measure chart that borrows `base`'s band and performance setup. Not yet validated. */
export function blankSong(base: { chart: ChartSettings }) {
    // As a chart is written today (`writtenSettings`): energy stored, trade settings only while trading.
    const setup = writtenSettings(base.chart);
    return {
        schemaVersion: 2,
        id: crypto.randomUUID(),
        title: 'Untitled song',
        revision: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        chart: {
            performance: setup.performance,
            band: followingFeel(setup.band),
            score: {
                key: 'C',
                isMinor: false,
                notation: 'name',
                meter: '4/4',
                grouping: null,
                sections: [
                    {
                        id: crypto.randomUUID(),
                        label: 'A',
                        repeat: 1,
                        measures: ['C', 'G', 'Am', 'F'].map((symbol) => ({
                            id: crypto.randomUUID(),
                            content: {
                                kind: 'events',
                                events: [{ kind: 'chord', symbol, duration: [4, 1] }],
                            },
                        })),
                    },
                ],
            },
        },
    };
}

/**
 * Adds a section straight after `sectionId` (the section letter's "Add section after", #1726),
 * holding one bar of the song's tonic — a section starts from the song's key and meter. Named
 * with the first letter no section has yet (`nextSectionLabel`). Refused where the result does not
 * validate (a repeat or ending running across the seam). A refusal changes nothing.
 */
export function withSectionAfter(source: SemanticScore, sectionId: string): RemovalResult {
    const score = structuredClone(source);
    const index = score.sections.findIndex((s) => s.id === sectionId);
    if (index < 0) {
        return { kind: 'blocked', message: 'Pick a section to add one after.' };
    }
    const section: ScoreSection = {
        id: crypto.randomUUID(),
        label: nextSectionLabel(score),
        repeat: 1,
        measures: [],
    };
    section.measures.push(tonicBar(score, section, 0));
    score.sections.splice(index + 1, 0, section);
    if (validateSemanticScore(score).kind !== 'ok') {
        return {
            kind: 'blocked',
            message:
                'A section here would break the repeats and endings around it. Change them first with Repeat or ending…',
        };
    }
    return { kind: 'ok', score, measureId: section.measures[0].id, sectionId: section.id };
}

/** The first of A–Z no section is named yet; past Z, the new section's number. */
function nextSectionLabel(score: SemanticScore): string {
    const used = new Set(score.sections.map((section) => section.label));
    for (let code = 65; code < 91; code++) {
        const letter = String.fromCharCode(code);
        if (!used.has(letter)) {
            return letter;
        }
    }
    return String(score.sections.length + 1);
}

/** A new bar holding the tonic for the key and meter in force before `section.measures[at]`. */
function tonicBar(score: SemanticScore, section: ScoreSection, at: number): ScoreMeasure {
    let context = resolveScoreContext(score, section);
    for (const measure of section.measures.slice(0, at)) {
        context = resolveScoreContext(context, measure);
    }
    return {
        id: crypto.randomUUID(),
        content: {
            kind: 'events',
            events: [
                {
                    kind: 'chord',
                    symbol: context.key + (context.isMinor ? 'm' : ''),
                    duration: scoreMeter(context.meter).length,
                },
            ],
        },
    };
}

/**
 * Inserts one bar straight after `measureId`, in its section (the bar menu's "Insert bar after",
 * #1725), filled as `withSectionAfter` fills a new section's: the tonic, in the key and meter
 * that bar leaves in force. It writes no key or meter of its own, so every later bar sounds as it
 * did. Its form is the bars' around it: a mark sits on a bar's start or end, so a bar inserted
 * inside a repeat or an ending lengthens it.
 *
 * After a section's LAST bar it goes after everything that bar closes — outside the repeat or
 * ending — as the old ＋ Bar appended (#1726 review). Refused after any other bar that ENDS a
 * repeat or an ending: whether the new bar belongs inside it or after it is the musician's call,
 * and after a one-bar first ending it would land between the endings, which no chart can play
 * (#1725 review). Refused too, as a backstop, wherever the result does not validate. A refusal
 * changes nothing.
 */
export function withBarAfter(source: SemanticScore, measureId: string): RemovalResult {
    const score = structuredClone(source);
    const section = score.sections.find((s) => s.measures.some((m) => m.id === measureId));
    if (!section) {
        return { kind: 'blocked', message: 'Select a bar to add one after.' };
    }
    const at = section.measures.findIndex((m) => m.id === measureId) + 1;
    if (
        at < section.measures.length &&
        section.measures[at - 1].end?.some(
            (mark) => mark.kind === 'repeat-end' || mark.kind === 'ending-end',
        )
    ) {
        return {
            kind: 'blocked',
            message:
                'This bar ends a repeat or an ending. Insert after an earlier bar, then use Repeat or ending… to move the repeat.',
        };
    }
    const added = tonicBar(score, section, at);
    section.measures.splice(at, 0, added);
    if (validateSemanticScore(score).kind !== 'ok') {
        return {
            kind: 'blocked',
            message:
                'A bar here would break the repeats and endings around it. Change them first with Repeat or ending…',
        };
    }
    return { kind: 'ok', score, measureId: added.id, sectionId: section.id };
}

export type RemovalResult =
    | { kind: 'ok'; score: SemanticScore; measureId: string; sectionId: string }
    /** Nothing was changed; `message` says what the musician has to change first. */
    | { kind: 'blocked'; message: string };

/** The first bar outside `removed` whose content repeats a bar inside it, as "A · bar 3". */
function repeatOfRemoved(score: SemanticScore, removed: Set<string>): string | undefined {
    for (const section of score.sections) {
        for (const [index, measure] of section.measures.entries()) {
            if (
                !removed.has(measure.id) &&
                measure.content.kind === 'repeat' &&
                removed.has(measure.content.measureId)
            ) {
                return `${section.label} · bar ${index + 1}`;
            }
        }
    }
    return undefined;
}

function repeatRefusal(score: SemanticScore, removed: ScoreMeasure[]): string | undefined {
    const repeatedBy = repeatOfRemoved(score, new Set(removed.map((m) => m.id)));
    return repeatedBy ? `${repeatedBy} repeats this music. Change that bar first.` : undefined;
}

/**
 * Removes one bar. A bar that WROTE a key, mode, meter or grouping change hands it to the next
 * bar in its section (context never crosses a section boundary), so everything after it keeps
 * sounding as it did — unless that bar writes the same field itself. A written meter resets
 * grouping, so a handed-down grouping would re-divide a meter the next bar chose: it is only
 * handed over when the next bar writes no meter of its own.
 *
 * The only bar of a section takes the section with it; the only bar of the chart is refused.
 */
export function withoutMeasure(source: SemanticScore, measureId: string): RemovalResult {
    const sectionIndex = source.sections.findIndex((s) =>
        s.measures.some((m) => m.id === measureId),
    );
    if (sectionIndex < 0) {
        return { kind: 'blocked', message: 'Select a bar to remove.' };
    }
    const section = source.sections[sectionIndex];
    if (section.measures.length === 1) {
        return source.sections.length === 1
            ? {
                  kind: 'blocked',
                  message: 'A chart needs at least one bar. Change its chords instead.',
              }
            : withoutSection(source, section.id);
    }
    const index = section.measures.findIndex((m) => m.id === measureId);
    const target = section.measures[index];
    const blocked = repeatRefusal(source, [target]);
    if (blocked) {
        return { kind: 'blocked', message: blocked };
    }
    // Repeats pair up within a section, a repeat-start may be implicit and an ending-end is
    // optional (`score-form.ts`), so dropping one marked bar can leave a form that still
    // validates but plays differently — a lost repeat-start silently repeats from the top of
    // the section. Refusing any marked bar is stricter than "still plays"; a refusal changes
    // nothing. A whole section can go with its marks: sections are independent forms, and the
    // codec rejects a jump left pointing at a removed segno/coda/fine.
    if (target.content.kind === 'repeat' && target.content.display !== 'one-bar') {
        return {
            kind: 'blocked',
            message: 'This bar is half of a two-bar repeat. Change it to chords first.',
        };
    }
    if (target.start?.length || target.end?.length) {
        return {
            kind: 'blocked',
            message:
                'This bar carries repeat or navigation marks. Remove them first, or remove the whole section.',
        };
    }
    const score = structuredClone(source);
    const measures = score.sections[sectionIndex].measures;
    const [removed] = measures.splice(index, 1);
    const next = measures[index];
    if (next) {
        const nextWroteMeter = next.meter !== undefined;
        for (const field of ['key', 'isMinor', 'meter'] as const) {
            if (removed[field] !== undefined && next[field] === undefined) {
                Object.assign(next, { [field]: removed[field] });
            }
        }
        if (removed.grouping !== undefined && next.grouping === undefined && !nextWroteMeter) {
            next.grouping = removed.grouping;
        }
    }
    // The previous bar, or the next one when the first bar went.
    const selected = measures[Math.max(0, index - 1)];
    return { kind: 'ok', score, measureId: selected.id, sectionId: section.id };
}

/** Removes a whole section. The last section of a chart is refused. */
export function withoutSection(source: SemanticScore, sectionId: string): RemovalResult {
    const index = source.sections.findIndex((s) => s.id === sectionId);
    if (index < 0) {
        return { kind: 'blocked', message: 'Select a bar in the section to remove.' };
    }
    if (source.sections.length === 1) {
        return {
            kind: 'blocked',
            message: 'A chart needs at least one section. Change its bars instead.',
        };
    }
    const blocked = repeatRefusal(source, source.sections[index].measures);
    if (blocked) {
        return { kind: 'blocked', message: blocked };
    }
    const score = structuredClone(source);
    score.sections.splice(index, 1);
    // The previous section's last bar, or the next section's first when the first section went.
    const selected = index > 0 ? score.sections[index - 1] : score.sections[0];
    const measure =
        index > 0 ? selected.measures[selected.measures.length - 1] : selected.measures[0];
    return { kind: 'ok', score, measureId: measure.id, sectionId: selected.id };
}

/** The longest section name the settings accept — the codec allows 100; the stand's badge fits this. */
export const SECTION_NAME_MAX = 24;

/** One section-settings edit (#1374). `null` returns an override to the song's own value. */
export type SectionChange =
    | { label: string }
    | { repeat: number }
    | { key: string | null }
    | { isMinor: boolean | null }
    | { meter: string | null }
    | { grouping: number[] | null };

export type SectionChangeResult =
    | { kind: 'ok'; score: SemanticScore }
    /** Nothing was changed. `measureId`, when present, is the bar that needs a decision. */
    | { kind: 'blocked'; message: string; measureId?: string };

/**
 * Applies one section-settings edit and returns a changed copy. A meter change re-fits the
 * section's bars by `withSongMeter`'s rule (`withSectionMeter`); key and mode never rewrite chord
 * names, the same rule as the bar editor. Bars that wrote their own override keep it.
 */
export function withSectionSettings(
    source: SemanticScore,
    sectionId: string,
    change: SectionChange,
): SectionChangeResult {
    const index = source.sections.findIndex((s) => s.id === sectionId);
    if (index < 0) {
        return { kind: 'blocked', message: 'Select a bar in the section to change.' };
    }
    if ('meter' in change) {
        return withSectionMeter(source, sectionId, change.meter);
    }
    const score = structuredClone(source);
    const section = score.sections[index];
    if ('label' in change) {
        const label = change.label.trim();
        if (!label || label.length > SECTION_NAME_MAX) {
            return {
                kind: 'blocked',
                message: `A section name needs 1 to ${SECTION_NAME_MAX} characters. Nothing was changed.`,
            };
        }
        section.label = label;
    } else if ('repeat' in change) {
        if (!Number.isInteger(change.repeat) || change.repeat < 1 || change.repeat > 64) {
            return {
                kind: 'blocked',
                message: 'A section plays 1 to 64 times. Nothing was changed.',
            };
        }
        section.repeat = change.repeat;
    } else if ('key' in change) {
        if (change.key === null) {
            delete section.key;
        } else {
            section.key = change.key;
        }
    } else if ('grouping' in change) {
        // Offered only from `groupingsFor` the section's meter; the codec re-checks the sum.
        if (change.grouping === null) {
            delete section.grouping;
        } else {
            section.grouping = [...change.grouping];
        }
    } else if (change.isMinor === null) {
        delete section.isMinor;
    } else {
        section.isMinor = change.isMinor;
    }
    return { kind: 'ok', score };
}

/**
 * The account library in the order the songbook already reads in (#1266): most recently updated
 * first, exactly as `lib/repository.ts`'s guest `list()` returns it. `AccountSongbook.list` pages
 * in document-ID order instead — the right choice for a resumable cursor, and an arbitrary one to
 * a musician — so the ordering a person sees is the shell's to apply, not storage's to change.
 */
export function libraryDocuments(library: SavedSong[]): ChartDocument[] {
    return library
        .map((song) => song.document)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
