import { validateSemanticScore } from '@core/songbook/score-codec';
import { resolveScoreContext } from '@core/songbook/score-context';
import {
    type BarSplit,
    offGridBarSplit,
    parseChordBar,
    printChordBar,
} from '@core/songbook/score-text';
import type {
    ScoreContext,
    ScoreEvent,
    ScoreMeasure,
    SemanticScore,
} from '@core/songbook/score-types';
import { useEffect, useRef, useState } from 'react';
import { applyMeasureForm, type FormDraft, readMeasureForm } from '../lib/form-editing';

/**
 * What one bar has been changed to but not yet applied to the chart: its chord text and its
 * per-bar settings. One draft per bar, shared by the bar's own field on the chart (or the phone's
 * dock, #1724) and its bar menu (#1725) — a change in either is a change in both.
 */
export interface BarDraft {
    text: string;
    context: ScoreContext;
    form: FormDraft | null;
    /** Whether the bar's last chord holds (a fermata). */
    fermata: boolean;
}

type EffectiveContext = ReturnType<typeof resolveScoreContext>;
export interface BarEntry {
    measure: ScoreMeasure;
    label: string;
    inherited: EffectiveContext;
    effective: EffectiveContext;
}

/** A pending bar that cannot be applied: the message, and the bar to take the musician to.
 * `inForm`: its repeat and ending settings are what is wrong, not its chords. */
export class BarDraftError extends Error {
    constructor(
        message: string,
        readonly measureId?: string,
        readonly inForm = false,
    ) {
        super(message);
    }
}

const NO_DRAFTS: ReadonlyMap<string, BarDraft> = new Map();

function writtenContext(measure: ScoreMeasure): ScoreContext {
    const context: ScoreContext = {};
    if (measure.key !== undefined) {
        context.key = measure.key;
    }
    if (measure.isMinor !== undefined) {
        context.isMinor = measure.isMinor;
    }
    if (measure.meter !== undefined) {
        context.meter = measure.meter;
    }
    if (measure.grouping !== undefined) {
        context.grouping = measure.grouping;
    }
    return context;
}

export function entriesFor(
    score: SemanticScore,
    drafts: ReadonlyMap<string, BarDraft>,
): BarEntry[] {
    return score.sections.flatMap((section) => {
        let inherited = resolveScoreContext(score, section);
        return section.measures.map((measure, index) => {
            const effective = resolveScoreContext(
                inherited,
                drafts.get(measure.id)?.context ?? measure,
            );
            const entry = {
                measure,
                label: `${section.label} · bar ${index + 1}`,
                inherited,
                effective,
            };
            inherited = effective;
            return entry;
        });
    });
}

/**
 * Whether a bar reads in a different key or meter once the OTHER pending bars are counted: an
 * earlier bar's unapplied meter change, say. Such a bar cannot be applied alone without being
 * parsed in the wrong meter (#1723 review P1), so leaving it applies every pending bar instead.
 */
export function dependsOnPending(
    score: SemanticScore,
    drafts: ReadonlyMap<string, BarDraft>,
    measureId: string,
): boolean {
    const own = drafts.get(measureId);
    const alone = new Map(own ? [[measureId, own]] : []);
    const withAll = entriesFor(score, drafts).find((entry) => entry.measure.id === measureId);
    const withOwn = entriesFor(score, alone).find((entry) => entry.measure.id === measureId);
    return JSON.stringify(withAll?.effective) !== JSON.stringify(withOwn?.effective);
}

/** Band engine only — the one placement the fermata toggle can express (see `printableEvents`). */
function lastEventFermata(measure: ScoreMeasure): boolean {
    return measure.content.kind === 'events'
        ? Boolean(measure.content.events.at(-1)?.fermata)
        : false;
}

function stripFermata(event: ScoreEvent): ScoreEvent {
    const { fermata: _fermata, ...rest } = event;
    return rest as ScoreEvent;
}

/**
 * `printChordBar` (score-text.ts) refuses to print any event that carries a `fermata` key at
 * all, by design: the flag is editor state, not text. Strip it from the LAST
 * event so the bar's chords stay editable text — `commitBarDrafts`'s `withFermata` reapplies it
 * once the text is re-parsed, so a text edit can never silently drop it. A fermata anywhere but
 * the last event is a placement the toggle cannot represent (iReal import is the only source of
 * one), so that bar is left for `printChordBar` to refuse, same as default mode.
 */
function printableEvents(events: readonly ScoreEvent[]): ScoreEvent[] {
    const last = events.length - 1;
    if (last < 0 || !events[last].fermata) {
        return events as ScoreEvent[];
    }
    return [...events.slice(0, last), stripFermata(events[last])];
}

/** A bar's chords as the quick editor types them, or null where it cannot edit the bar (a
 * measure repeat, or a fermata off the last chord). */
export function editableText(measure: ScoreMeasure, meter: string): string | null {
    if (measure.content.kind !== 'events') {
        return null;
    }
    try {
        const events = printableEvents(measure.content.events);
        const printed = printChordBar(events, meter);
        const durations = measure.content.events.map((event) => event.duration.join('/'));
        // Most bars need no duration syntax. Unequal lengths remain visible and lossless.
        return new Set(durations).size === 1 ? printed.replace(/:[^\s]+/g, '') : printed;
    } catch {
        return null;
    }
}

/**
 * Whether a bar says nothing yet: only rests and holds (`N.C.`, `/`), the blank a spilled line
 * (`Dm7 | G7`, #2006) is typed over. A bar with a chord, or a measure repeat, is music and is
 * never overwritten.
 */
export function isBlankBar(measure: ScoreMeasure): boolean {
    return (
        measure.content.kind === 'events' &&
        measure.content.events.every((event) => event.kind !== 'chord')
    );
}

/** Reapply the toggle's flag to the freshly re-parsed last event (`printableEvents` stripped it
 * for printing) — `parseChordBar` never emits `fermata` itself, so `false` needs no cleanup. */
function withFermata(events: readonly ScoreEvent[], fermata: boolean): ScoreEvent[] {
    const last = events.length - 1;
    if (!fermata || last < 0) {
        return events as ScoreEvent[];
    }
    return events.map((event, index) => (index === last ? { ...event, fermata: true } : event));
}

/** The draft a bar starts from: the bar exactly as the chart has it. */
export function initialDraft(entry: BarEntry): BarDraft {
    let form: FormDraft | null = null;
    try {
        form = readMeasureForm(entry.measure);
    } catch {
        // Keep unusual but valid source boundaries intact while allowing chord edits.
        // The compact controls cannot represent every future form without losing notation.
    }
    return {
        text: editableText(entry.measure, entry.effective.meter) ?? '',
        context: writtenContext(entry.measure),
        form,
        fermata: lastEventFermata(entry.measure),
    };
}

/**
 * One bar as an editor shows it: its draft (or the bar as applied), and null for `text` where
 * the quick editor cannot edit it. Read-only is judged on the bar as applied, never on a draft.
 */
export function barField(
    score: SemanticScore,
    drafts: ReadonlyMap<string, BarDraft>,
    measureId: string,
): { entry: BarEntry; original: BarEntry; draft: BarDraft; text: string | null } | null {
    const entry = entriesFor(score, drafts).find((e) => e.measure.id === measureId);
    const original = entriesFor(score, NO_DRAFTS).find((e) => e.measure.id === measureId);
    if (!entry || !original) {
        return null;
    }
    const applied = editableText(original.measure, original.effective.meter);
    const draft = drafts.get(measureId) ?? initialDraft(original);
    return { entry, original, draft, text: applied === null ? null : draft.text };
}

/** `next` as the draft to keep, or null when it is just the bar as applied (nothing pending). */
export function draftChange(original: BarEntry, next: BarDraft): BarDraft | null {
    return JSON.stringify(next) === JSON.stringify(initialDraft(original)) ? null : next;
}

/**
 * Why a bar's pending chords cannot be read, said on the bar itself (#1723): "Can't read “X”"
 * for a spelling the parser does not know, otherwise the parser's own sentence. Null when they
 * read.
 */
function problemOf(text: string, meter: string, applied: string | null): string | null {
    const parsed = parseChordBar(text, meter);
    if (parsed.kind === 'ok') {
        return splitProblem(text, meter, applied);
    }
    const message = parsed.kind === 'invalid' ? parsed.issues[0].message : 'Cannot read this bar.';
    const spelling = /^Unsupported chord spelling “(.*)”\.(?: Try (.*)\.)?$/.exec(message);
    return spelling
        ? `Can’t read “${spelling[1]}”${spelling[2] ? `, try ${spelling[2]}` : ''}`
        : message;
}

/**
 * Chords typed with no lengths that do not divide the bar onto the grid wait for the musician to
 * choose their lengths (#1980): until then they are the bar's problem, so nothing is applied or
 * saved as triplets. The bar field draws the choices; this is the sentence for everywhere else.
 * Chords the bar already holds (`applied`, its text as the chart has it) are not asked again: a
 * saved triplet bar whose repeat, key or fermata alone changed keeps its music.
 */
function splitProblem(text: string, meter: string, applied: string | null): string | null {
    const split = text === applied ? null : offGridBarSplit(text, meter);
    if (!split) {
        return null;
    }
    return split.choices.length > 0
        ? `Choose how the ${split.chords} chords share the bar`
        : `${split.chords} chords don’t share ${split.counts} counts evenly: give each a length, like ${text.trim().split(/\s+/)[0]}:1`;
}

/** The ways to share a pending bar's chords when they need choosing (#1980), else null. */
function splitsOf(text: string, meter: string, applied: string | null): BarSplit[] | null {
    const split = text === applied ? null : offGridBarSplit(text, meter);
    return split && split.choices.length > 0 ? split.choices : null;
}

/** `problemOf` a pending bar; null when the bar has no draft. */
export function barProblem(
    score: SemanticScore,
    drafts: ReadonlyMap<string, BarDraft>,
    measureId: string,
): string | null {
    const draft = drafts.get(measureId);
    const entry = draft && entriesFor(score, drafts).find((e) => e.measure.id === measureId);
    const original = entry && entriesFor(score, NO_DRAFTS).find((e) => e.measure.id === measureId);
    return draft && entry && original
        ? problemOf(
              draft.text,
              entry.effective.meter,
              editableText(original.measure, original.effective.meter),
          )
        : null;
}

/** Every bar's field text and problem (`barField`, `barProblem`) in one pass, for the chart. */
export function barFields(
    score: SemanticScore,
    drafts: ReadonlyMap<string, BarDraft>,
): Map<string, { text: string | null; problem: string | null; splits: BarSplit[] | null }> {
    const entries = entriesFor(score, drafts);
    return new Map(
        entriesFor(score, NO_DRAFTS).map((original, index) => {
            const applied = editableText(original.measure, original.effective.meter);
            const draft = drafts.get(original.measure.id);
            return [
                original.measure.id,
                {
                    text: applied === null ? null : (draft?.text ?? applied),
                    problem: draft
                        ? problemOf(draft.text, entries[index].effective.meter, applied)
                        : null,
                    splits: draft
                        ? splitsOf(draft.text, entries[index].effective.meter, applied)
                        : null,
                },
            ];
        }),
    );
}

/**
 * The chart with pending bars folded in, validated as a whole. `only` folds in that one bar's
 * draft and leaves the rest pending — what leaving a bar on the chart applies (#1723), so an
 * unreadable bar elsewhere never blocks, or yanks the musician back from, the one just typed.
 * Without `only` every pending bar goes in: Save, and every other commit (`updateChart`).
 */
export function commitBarDrafts(
    score: SemanticScore,
    drafts: ReadonlyMap<string, BarDraft>,
    only?: string,
): SemanticScore {
    const pending =
        only === undefined
            ? drafts
            : new Map([...drafts].filter(([measureId]) => measureId === only));
    const resolved = new Map(entriesFor(score, pending).map((entry) => [entry.measure.id, entry]));
    const candidate: SemanticScore = {
        ...score,
        sections: score.sections.map((section) => ({
            ...section,
            measures: section.measures.map((measure) => {
                const buffer = pending.get(measure.id);
                if (!buffer) {
                    return measure;
                }
                const entry = resolved.get(measure.id)!;
                const parsedBar = parseChordBar(buffer.text, entry.effective.meter);
                if (parsedBar.kind !== 'ok') {
                    throw new BarDraftError(
                        `${entry.label}: ${parsedBar.kind === 'invalid' ? parsedBar.issues[0].message : 'Cannot read this bar.'}`,
                        measure.id,
                    );
                }
                const unsplit = splitProblem(
                    buffer.text,
                    entry.effective.meter,
                    editableText(measure, entry.effective.meter),
                );
                if (unsplit) {
                    throw new BarDraftError(`${entry.label}: ${unsplit}.`, measure.id);
                }
                let next: ScoreMeasure;
                try {
                    next = buffer.form ? applyMeasureForm(measure, buffer.form) : { ...measure };
                } catch (reason) {
                    throw new BarDraftError(
                        `${entry.label}: ${reason instanceof Error ? reason.message : 'Check the repeat and ending settings.'}`,
                        measure.id,
                        true,
                    );
                }
                delete next.key;
                delete next.isMinor;
                delete next.meter;
                delete next.grouping;
                return {
                    ...next,
                    ...buffer.context,
                    content: {
                        kind: 'events' as const,
                        events: withFermata(parsedBar.value, buffer.fermata),
                    },
                };
            }),
        })),
    };
    const validated = validateSemanticScore(candidate);
    if (validated.kind !== 'ok') {
        const issue = validated.kind === 'invalid' ? validated.issues[0] : null;
        const location = issue?.path.match(/sections\[(\d+)\]\.measures\[(\d+)\]/);
        const section = location ? candidate.sections[Number(location[1])] : null;
        const measure = section?.measures[Number(location?.[2])];
        const label =
            section && location ? `${section.label} · bar ${Number(location[2]) + 1}: ` : '';
        // A refusal about a bar's repeat, ending or jump marks (its `start`/`end`) is for the
        // bar's settings, not its chords: the field is not reopened over them (#1724 review).
        const inForm = /\.(?:start|end)\b/.test(issue?.path ?? '');
        throw new BarDraftError(
            `${label}${issue?.message ?? 'Cannot apply this chart.'} Check later bars after a meter change.`,
            measure?.id,
            inForm,
        );
    }
    return validated.value;
}

export interface BarDrafts {
    /** This render's pending bars, for the open document. */
    drafts: ReadonlyMap<string, BarDraft>;
    /** The pending bars as of now, ahead of the next render: what a same-turn Save must see. */
    latest(): ReadonlyMap<string, BarDraft>;
    /** Keep `draft` as the bar's pending change; null drops it. */
    put(measureId: string, draft: BarDraft | null): void;
    /** Retire what an adoption folded in: every pending bar, or only the ones named. */
    retire(measureIds?: readonly string[]): void;
    /** Put back a set of pending bars taken earlier with `latest()` (a delete's Undo, #1758). */
    restore(drafts: ReadonlyMap<string, BarDraft>): void;
}

/**
 * The pending bars of the open document, owned by the shell so the chart's in-bar field, the
 * phone's dock and the bar menu read and write one draft per bar (#1723). Drafts belong to
 * `documentId`: another document starts with none.
 * `onPendingChange` hears every change synchronously, so a same-turn Save or navigation sees it.
 */
export function useBarDrafts(
    documentId: string,
    onPendingChange: (pending: boolean) => void,
): BarDrafts {
    const [state, setState] = useState(() => ({
        owner: documentId,
        drafts: NO_DRAFTS as ReadonlyMap<string, BarDraft>,
    }));
    const latest = useRef(state);
    const notify = useRef(onPendingChange);
    notify.current = onPendingChange;

    useEffect(() => {
        if (latest.current.owner !== documentId) {
            latest.current = { owner: documentId, drafts: NO_DRAFTS };
            setState(latest.current);
        }
    }, [documentId]);

    function current(): ReadonlyMap<string, BarDraft> {
        return latest.current.owner === documentId ? latest.current.drafts : NO_DRAFTS;
    }
    function write(drafts: ReadonlyMap<string, BarDraft>) {
        latest.current = { owner: documentId, drafts };
        setState(latest.current);
        notify.current(drafts.size > 0);
    }
    return {
        drafts: state.owner === documentId ? state.drafts : NO_DRAFTS,
        latest: current,
        put(measureId, draft) {
            const next = new Map(current());
            if (draft) {
                next.set(measureId, draft);
            } else {
                next.delete(measureId);
            }
            write(next);
        },
        retire(measureIds) {
            if (!measureIds) {
                write(NO_DRAFTS);
                return;
            }
            const next = new Map(current());
            for (const measureId of measureIds) {
                next.delete(measureId);
            }
            write(next);
        },
        restore(drafts) {
            write(drafts.size > 0 ? drafts : NO_DRAFTS);
        },
    };
}
