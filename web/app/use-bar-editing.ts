import { compileScoreForm } from '@core/songbook/score-form';
import type { BarSplit } from '@core/songbook/score-text';
import type { SemanticScore } from '@core/songbook/score-types';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import {
    type SectionChange,
    withBarAfter,
    withoutMeasure,
    withoutSection,
    withSectionAfter,
    withSectionSettings,
} from '../lib/documents';
import type { ChartDocument } from '../lib/runtime';
import { withSongMeter } from '../lib/song-meter';
import type { BarEditing, OpenBar, SectionEditing } from './chart-sheet';
import type { BarMarkers } from './guided-form';
import {
    type BarDraft,
    BarDraftError,
    type BarDrafts,
    barField,
    barProblem,
    commitBarDrafts,
    dependsOnPending,
    draftChange,
    initialDraft,
} from './use-bar-drafts';
import type { DeleteUndo } from './use-delete-undo';

/** The Repeats and endings dialog's request (#1725, #1758), as the shell's `barForm` holds it. */
interface BarForm {
    score: SemanticScore;
    measureId: string;
    blocked?: string;
}

/** What the shell hands `useBarEditing`. */
interface BarEditingOptions {
    /** The chart on the stand, as this render saw it. */
    current: ChartDocument | null;
    /** The chart as of now, for an action that waited its turn (`run`). */
    currentNow: RefObject<ChartDocument | null>;
    /** The shell is running an action: a bar's draft is not written meanwhile. */
    busy: boolean;
    /** Edit chart is open on a chart: bars are typed in place (#1723). */
    typeOnChart: boolean;
    /** The bar whose field is open on the chart, or null. */
    openBar: OpenBar | null;
    /** Every bar's field text and problem (`barFields`), for the chart. */
    chartFields: ReadonlyMap<
        string,
        { text: string | null; problem: string | null; splits: BarSplit[] | null }
    >;
    /** Each bar as the chart was last kept, for the changed-bar dot. */
    keptBars: ReadonlyMap<string, string>;
    /** Each bar as it now stands. */
    liveBars: ReadonlyMap<string, string>;
    /** The pending bars (`useBarDrafts`). */
    barDrafts: BarDrafts;
    setOpenBar: Dispatch<SetStateAction<OpenBar | null>>;
    setMeasureId: Dispatch<SetStateAction<string>>;
    setBarForm: Dispatch<SetStateAction<BarForm | null>>;
    /** The shell's error line. */
    setError: Dispatch<SetStateAction<string>>;
    /** The selected bar as of now, for a delete that waited its turn (`run`). */
    measureIdNow: RefObject<string>;
    /** Set while the shell runs an action. */
    working: RefObject<boolean>;
    /** The shell's one-action lock. */
    run: (task: () => void | Promise<void>, quiet?: boolean) => Promise<void>;
    /** Adopts a score as the chart (`onlyBar`: the one pending bar it folded in). */
    applyScore: (score: SemanticScore, onlyBar?: string) => ChartDocument;
    /** The chart with every pending bar committed; throws on one that does not read. */
    updateChart: () => ChartDocument;
    /** The section menu's "Start here" (#1422). */
    startHereSection: (id: string | undefined, pending?: readonly SectionChange[]) => void;
    /** Closes the Song menu, Export… and the Key popover. */
    closeSongMenus: () => void;
    /** Offers Undo for the delete just made (`useDeleteUndo`, #1758). */
    offerUndo: (undo: Omit<DeleteUndo, 'after' | 'token'>) => void;
}

/** What the shell's render and handlers read back. */
interface BarEditingHandlers {
    /** What the chart's in-bar field asks of the shell (#1723); null unless it can be used. */
    barEditing: () => BarEditing | null;
    /** What the section letter's menu asks of the shell (#1726); null unless editing bars. */
    sectionEditing: () => SectionEditing | null;
    /** The opening bar's own repeat and ending markers, for the Repeats and endings dialog. */
    barMarkers: (measureId: string) => BarMarkers | null;
    /** Opens the Repeats and endings dialog on `measureId` (#1725); false if it did not open. */
    openBarForm: (measureId: string) => boolean;
    /** The Repeats and endings dialog's Apply. */
    applyForm: (score: SemanticScore) => void;
    /** `changes` to section `id`, one after another; a refusal throws and selects its bar. */
    withSectionChanges: (
        source: SemanticScore,
        id: string,
        changes: readonly SectionChange[],
    ) => SemanticScore;
    /** The Key popover's Meter (#1757): the song's own meter. */
    changeSongMeter: (meter: string) => void;
}

/**
 * Bar and section editing on the chart (#1723, #1725, #1726): typing a bar where it is read,
 * the bar menu's and the section letter's menu's actions, and the Repeats and endings dialog's
 * per-bar markers. The pending bars stay in `useBarDrafts`; the shell keeps the state these
 * handlers set (`openBar`, `barForm`, `measureId`), `applyScore`/`updateChart` and the delete's
 * Undo. These read this render's `current`; `applyScore`/`updateChart` read `currentNow`. No
 * effects and nothing memoized: `barEditing`'s closures are fresh every render. Call it after
 * `useDeleteUndo`, for `offerUndo`.
 */
export function useBarEditing({
    current,
    currentNow,
    busy,
    typeOnChart,
    openBar,
    chartFields,
    keptBars,
    liveBars,
    barDrafts,
    setOpenBar,
    setMeasureId,
    setBarForm,
    setError,
    measureIdNow,
    working,
    run,
    applyScore,
    updateChart,
    startHereSection,
    closeSongMenus,
    offerUndo,
}: BarEditingOptions): BarEditingHandlers {
    /**
     * Whether `measureId`'s draft, applied alone, is refused for its repeat or ending markers
     * alone: the codec's form refusal, or the form check the chart is loaded through
     * (`compileScoreForm`) — not a chord or a meter that does not fit.
     */
    function formRefusal(
        score: SemanticScore,
        pending: ReadonlyMap<string, BarDraft>,
        measureId: string,
    ): boolean {
        try {
            compileScoreForm(commitBarDrafts(score, pending, measureId));
            return false;
        } catch (reason) {
            return !(reason instanceof BarDraftError) || reason.inForm;
        }
    }
    /**
     * Leaving a bar on the chart applies it (#1723), as an unsaved change. A bar whose chords do
     * not read stays pending — tinted on the chart, and Save refuses it — and so does any bar
     * while another change is in flight.
     *
     * Usually the bar goes alone, so an unreadable bar elsewhere never blocks it. But other
     * pending bars that read are applied with it whenever the chart takes them all (#1726): they
     * are halves of one change — a repeat built bar by bar with the bar menu's Advanced markers,
     * or a key or meter change a later bar reads in. A bar whose own repeat or ending markers
     * make no form yet (the other half still to come) stays pending without a word: Save says
     * what is missing, as it always has.
     */
    function applyBar(measureId: string) {
        const current = currentNow.current;
        if (!current || working.current) {
            return;
        }
        const pending = barDrafts.latest();
        const score = current.chart.score;
        if (!pending.has(measureId) || barProblem(score, pending, measureId)) {
            return;
        }
        const others = [...pending.keys()].some(
            (id) => id !== measureId && !barProblem(score, pending, id),
        );
        // A bar that reads differently once another pending bar's key or meter change counts can
        // only be applied together with it, never alone (#1723 review P1).
        const depends = dependsOnPending(score, pending, measureId);
        if (others || depends) {
            try {
                applyScore(commitBarDrafts(score, pending));
                setError('');
                return;
            } catch (reason) {
                if (depends) {
                    setError(reason instanceof Error ? reason.message : String(reason));
                    return;
                }
            }
        }
        try {
            applyScore(commitBarDrafts(score, pending, measureId), measureId);
            setError('');
        } catch (reason) {
            // Its repeat or ending markers make no form yet: kept pending, quietly.
            if (formRefusal(score, pending, measureId)) {
                return;
            }
            // Its chords read, but the chart does not (a meter change a later bar no longer
            // fits): kept pending, and said where the shell says a refused change.
            setError(reason instanceof Error ? reason.message : String(reason));
        }
    }
    /** Select a bar and, where the quick editor can edit it, open its field on the chart. */
    function openBarField(measureId: string, select: OpenBar['select'] = 'end') {
        if (!current) {
            return;
        }
        if (openBar?.id === measureId) {
            return;
        }
        if (openBar) {
            applyBar(openBar.id);
        }
        setMeasureId(measureId);
        const field = barField(current.chart.score, barDrafts.latest(), measureId);
        setOpenBar(field && field.text !== null ? { id: measureId, select } : null);
    }
    /** What the chart's in-bar field asks of the shell (#1723); null unless it can be used. */
    function barEditing(): BarEditing | null {
        if (!typeOnChart || !current) {
            return null;
        }
        const score = current.chart.score;
        const drafts = barDrafts.drafts;
        // The bar Tab/Enter (or the phone's ‹ ›) go to from `id`, passing over a bar the quick
        // editor cannot edit; null at either end.
        const stepFrom = (id: string, step: -1 | 1): string | null => {
            const ids = score.sections.flatMap((section) => section.measures.map((m) => m.id));
            const pending = barDrafts.latest();
            let at = ids.indexOf(id) + step;
            while (at >= 0 && at < ids.length && barField(score, pending, ids[at])?.text == null) {
                at += step;
            }
            return at < 0 || at >= ids.length ? null : ids[at];
        };
        return {
            open: openBar,
            text: (id) => chartFields.get(id)?.text ?? null,
            problem: (id) => chartFields.get(id)?.problem ?? null,
            splits: (id) => chartFields.get(id)?.splits ?? null,
            edited: (id) =>
                drafts.has(id) || (keptBars.size > 0 && keptBars.get(id) !== liveBars.get(id)),
            pending: (id) => drafts.has(id),
            onOpen: (id) => openBarField(id),
            onText(id, text) {
                const field = barField(score, barDrafts.latest(), id);
                if (field && field.text !== null && !busy) {
                    barDrafts.put(id, draftChange(field.original, { ...field.draft, text }));
                }
            },
            onLeave(from, step) {
                applyBar(from.id);
                if (step === 0) {
                    setOpenBar((open) => (open === from ? null : open));
                    return false;
                }
                const to = stepFrom(from.id, step);
                if (to === null) {
                    // Past either end there is no bar to go to: the field closes, and Tab carries
                    // on through the page's own focus order (review P2).
                    setOpenBar((open) => (open === from ? null : open));
                    return false;
                }
                setMeasureId(to);
                setOpenBar({ id: to, select: 'all' });
                return true;
            },
            canMove: (id, step) => stepFrom(id, step) !== null,
            menu(id) {
                const field = barField(score, drafts, id);
                const holding = score.sections.find((s) => s.measures.some((m) => m.id === id));
                return field && field.text !== null
                    ? {
                          draft: field.draft,
                          inherited: field.entry.inherited,
                          effective: field.entry.effective,
                          // `withoutMeasure` takes a section's only bar with the section.
                          wholeSection: holding?.measures.length === 1 && score.sections.length > 1,
                      }
                    : null;
            },
            onDraft(id, next) {
                const field = barField(score, barDrafts.latest(), id);
                if (field && field.text !== null && !busy) {
                    barDrafts.put(id, draftChange(field.original, next));
                }
            },
            onRepeats: (from) => openBarForm(from.id),
            onInsertAfter: (from) => insertBarAfter(from.id),
            onDelete: (from) => deleteBar(from.id),
            onRevert(from) {
                const pending = barDrafts.latest();
                const field = barField(score, pending, from.id);
                if (field && pending.has(from.id)) {
                    barDrafts.put(
                        from.id,
                        draftChange(field.original, {
                            ...field.draft,
                            text: initialDraft(field.original).text,
                        }),
                    );
                }
                setOpenBar((open) => (open === from ? null : open));
            },
        };
    }
    /** What the section letter's menu asks of the shell (#1726); null unless editing bars. */
    function sectionEditing(): SectionEditing | null {
        if (!typeOnChart || !current) {
            return null;
        }
        return {
            score: current.chart.score,
            onChange: changeSection,
            onAddAfter: addSectionAfter,
            onDelete: deleteSection,
            onStartHere: startHereSection,
        };
    }
    /**
     * The bar menu's "Repeat or ending…" (#1725): every pending bar checked first and reviewed
     * together, unapplied, so the dialog edits the chart as typed. A bar that does not read opens
     * instead, as Save opens it.
     */
    function openBarForm(measureId: string): boolean {
        if (!current || working.current) {
            return false;
        }
        try {
            setBarForm({
                score: commitBarDrafts(current.chart.score, barDrafts.latest()),
                measureId,
            });
            setError('');
            return true;
        } catch (reason) {
            // Repeat markers half-built bar by bar: the dialog opens on this bar's own markers,
            // which is where they are finished (#1758), the guide waiting until they make a form.
            // On the bar whose markers are at fault, which is where they are fixed.
            if (reason instanceof BarDraftError && reason.inForm) {
                setBarForm({
                    score: current.chart.score,
                    measureId: reason.measureId ?? measureId,
                    blocked: reason.message,
                });
                setError('');
                return true;
            }
            setError(reason instanceof Error ? reason.message : String(reason));
            if (reason instanceof BarDraftError && reason.measureId && !reason.inForm) {
                openBarField(reason.measureId);
            }
            return false;
        }
    }
    /** The opening bar's own repeat and ending markers, for the Repeats and endings dialog's
     * per-bar view (#1758): a draft change, as the bar menu's Advanced markers were. */
    function barMarkers(measureId: string): BarMarkers | null {
        if (!current) {
            return null;
        }
        const field = barField(current.chart.score, barDrafts.drafts, measureId);
        if (!field || field.text === null) {
            return null;
        }
        return {
            label: field.entry.label,
            value: field.draft.form,
            disabled: busy,
            onChange(form) {
                const latest = barField(current.chart.score, barDrafts.latest(), measureId);
                if (latest && latest.text !== null && !busy) {
                    barDrafts.put(
                        measureId,
                        draftChange(latest.original, { ...latest.draft, form }),
                    );
                }
            },
        };
    }
    /** The Repeats and endings dialog's Apply (the bar menu's "Repeat or ending…"). */
    function applyForm(score: SemanticScore) {
        if (working.current) {
            throw new Error('Wait for the current change, then Apply again.');
        }
        applyScore(score);
    }
    /**
     * The bar menu's "Insert bar after" (#1725): pending bars commit first, then a bar goes in
     * straight after this one, open for typing with its tonic selected.
     */
    function insertBarAfter(after: string) {
        void run(() => {
            const next = updateChart();
            const inserted = withBarAfter(next.chart.score, after);
            if (inserted.kind === 'blocked') {
                throw new Error(inserted.message);
            }
            applyScore(inserted.score);
            setMeasureId(inserted.measureId);
            setOpenBar({ id: inserted.measureId, select: 'all' });
        });
    }
    /**
     * The bar menu's "Delete bar" (#1725): `withoutMeasure`'s rules for this bar, after pending
     * bars commit; the bar before it (or after, for a first bar) opens for typing. Where
     * that bar has no field (a measure repeat), the nearest one that has opens instead, before
     * it first, so focus and the phone's dock never drop away (#1725 review).
     */
    function deleteBar(measureId: string) {
        void run(() => {
            // Taken before the pending bars commit, so Undo puts them back pending (#1758).
            const before = currentNow.current;
            const drafts = barDrafts.latest();
            const next = updateChart();
            const result = withoutMeasure(next.chart.score, measureId);
            if (result.kind === 'blocked') {
                throw new Error(result.message);
            }
            applyScore(result.score);
            setMeasureId(result.measureId);
            const ids = result.score.sections.flatMap((s) => s.measures.map((m) => m.id));
            const from = ids.indexOf(result.measureId);
            const nearest = [...ids.slice(0, from + 1).reverse(), ...ids.slice(from + 1)].find(
                (id) => barField(result.score, barDrafts.latest(), id)?.text != null,
            );
            if (nearest) {
                setMeasureId(nearest);
                setOpenBar({ id: nearest, select: 'end' });
            } else {
                setOpenBar(null);
            }
            if (before) {
                const bars = before.chart.score.sections;
                const holding = bars.find((s) => s.measures.some((m) => m.id === measureId));
                const number = bars.flatMap((s) => s.measures).findIndex((m) => m.id === measureId);
                offerUndo({
                    text:
                        holding && result.score.sections.every((s) => s.id !== holding.id)
                            ? `Section ${holding.label} deleted`
                            : `Bar ${number + 1} deleted`,
                    before,
                    drafts,
                    measureId,
                    sectionId: holding?.id ?? '',
                    reopen: measureId,
                });
            }
        });
    }
    /**
     * The section letter's "Add section after" (#1726): pending bars commit first, then a section
     * of one tonic bar goes in straight after this one, that bar open for typing.
     */
    function addSectionAfter(sectionId: string, pending: readonly SectionChange[]) {
        void run(() => {
            const next = updateChart();
            // A name or count still in its field goes in first, in the same action (#1726).
            const score = withSectionChanges(next.chart.score, sectionId, pending);
            const result = withSectionAfter(score, sectionId);
            if (result.kind === 'blocked') {
                if (pending.length > 0) {
                    applyScore(score);
                }
                throw new Error(result.message);
            }
            applyScore(result.score);
            setMeasureId(result.measureId);
            setOpenBar({ id: result.measureId, select: 'all' });
        });
    }
    /** The section letter's "Delete section" (#1726), by `withoutSection`'s rules. */
    function deleteSection(sectionId: string, pending: readonly SectionChange[]) {
        void run(() => {
            // Taken before the pending bars commit, so Undo puts them back pending (#1758). A
            // name still in the menu's field was never the chart's, and Undo does not bring it.
            const before = currentNow.current;
            const drafts = barDrafts.latest();
            const selected = measureIdNow.current;
            const next = updateChart();
            // A field's typing goes in first, so a refused delete keeps it (#1726).
            const score = withSectionChanges(next.chart.score, sectionId, pending);
            const result = withoutSection(score, sectionId);
            if (result.kind === 'blocked') {
                if (pending.length > 0) {
                    applyScore(score);
                }
                throw new Error(result.message);
            }
            applyScore(result.score);
            setMeasureId(result.measureId);
            const deleted = before;
            const section = deleted?.chart.score.sections.find((s) => s.id === sectionId);
            if (deleted && section) {
                offerUndo({
                    text: `Section ${section.label} deleted`,
                    before: deleted,
                    drafts,
                    measureId: selected,
                    sectionId,
                    reopen: null,
                });
            }
        });
    }
    /** `changes` to section `id`, one after another; a refusal throws and selects its bar. */
    function withSectionChanges(
        source: SemanticScore,
        id: string,
        changes: readonly SectionChange[],
    ): SemanticScore {
        let score = source;
        for (const change of changes) {
            const result = withSectionSettings(score, id, change);
            if (result.kind === 'blocked') {
                if (result.measureId) {
                    setMeasureId(result.measureId);
                }
                throw new Error(result.message);
            }
            score = result.score;
        }
        return score;
    }
    function changeSection(id: string, changes: readonly SectionChange[]) {
        void run(() => {
            // Pending bar edits are committed first, as for every other chart edit.
            const next = updateChart();
            applyScore(withSectionChanges(next.chart.score, id, changes));
        });
    }
    function changeSongMeter(meter: string) {
        void run(() => {
            // Pending bar edits are committed first, by the editor's own rules, so the change is
            // made to the one validated candidate rather than beside unchecked typing.
            const next = updateChart();
            const result = withSongMeter(next.chart.score, meter);
            if (result.kind === 'blocked') {
                // The Key popover closes onto the bar that would not fit, so the refusal (the
                // shell's error line) and the bar it names are both in view.
                closeSongMenus();
                setMeasureId(result.measureId);
                throw new Error(result.message);
            }
            applyScore(result.score);
        });
    }
    return {
        barEditing,
        sectionEditing,
        barMarkers,
        openBarForm,
        applyForm,
        withSectionChanges,
        changeSongMeter,
    };
}
