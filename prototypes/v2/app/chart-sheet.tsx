import type { SemanticScore } from '@engine/songbook/score-types';
import type { ChartNotation } from '@engine/songbook/types';
import {
    type KeyboardEvent as ReactKeyboardEvent,
    type MouseEvent as ReactMouseEvent,
    type ReactNode,
    useEffect,
    useRef,
    useState,
} from 'react';
import { arrangementOf } from '../lib/documents';
import type { ChartBlock, ChartChord } from '../lib/lead-sheet';
import type { ChartDocument } from '../lib/runtime';
import { directionLabel } from '../lib/score-labels';

type WrittenSection = SemanticScore['sections'][number];
type WrittenBar = WrittenSection['measures'][number];

/**
 * The counts the footer's form-length menu offers (#1511): a short list of the Edit panel's
 * 1–16 (`CHORUS_COUNTS` in `edit-panel.tsx`), plus the chart's own count when it is not listed.
 */
const STAND_CHORUS_COUNTS = [1, 2, 3, 4, 6, 8, 12, 16];
/** The popover's width (`.popover` in `style.css`), for placing it inside the viewport. */
const POPOVER_WIDTH = 260;
/** Room kept between the popover and the viewport's edges. */
const VIEWPORT_MARGIN = 8;

/** What the footer says the band does with the form: the count, or the loop when there is none. */
function formLengthText(choruses: number | undefined): string {
    if (choruses === undefined) {
        return 'repeats continuously';
    }
    return choruses === 1 ? 'plays once, then ends' : `plays ${choruses} times, then ends`;
}

function chorusChoice(choruses: number | undefined): string {
    if (choruses === undefined) {
        return 'Repeats continuously';
    }
    return choruses === 1 ? 'Plays once' : `Plays ${choruses} times`;
}

/**
 * The visible chord symbol in the chart's current notation (#1276). `chord.display`
 * (`FormattedChordNames`) is precomputed for all three notations by
 * `chords-engine.validateProgression()` regardless of which one is selected — the
 * same shared field v1's `ChordVisualizer.tsx` read — so switching notation is a
 * pure read-time choice, never a re-analysis of the chord.
 */
function chordSymbol(chord: ChartChord, notation: ChartNotation): ReactNode {
    const disp = chord.display?.[notation];
    if (!disp) {
        return chord.absName;
    }
    // Set the way a real book sets it (#1700): the root full size, the quality small and raised
    // beside it, a slash bass after. Read at a distance, the root is the fact that matters; the
    // quality qualifies it. Spans with no space between them, so the text is still "Cmaj7/E".
    return (
        <>
            <span className="chord-root">{disp.root}</span>
            {disp.suffix && <span className="chord-quality">{disp.suffix}</span>}
            {disp.bass && <span className="chord-bass">/{disp.bass}</span>}
        </>
    );
}

/**
 * How a written event reads on the stand. A hold is the slash the bar editor takes for it (the
 * chord before it rings on), N.C. is printed as charts print it, and a fermata sits over the
 * symbol it holds. Only the band engine can open charts with these (`lib/band-chart.ts`).
 */
function eventText(chord: ChartChord, notation: ChartNotation): ReactNode {
    return chord.kind === 'hold'
        ? '/'
        : chord.kind === 'no-chord'
          ? 'N.C.'
          : chordSymbol(chord, notation);
}

/** `audition` false while editing: a chord there opens its bar's field instead of sounding. */
function eventLabel(chord: ChartChord, audition = true): string {
    const what =
        chord.kind === 'hold'
            ? 'Hold the chord before'
            : chord.kind === 'no-chord'
              ? 'No chord'
              : audition
                ? `Audition ${chord.absName}`
                : chord.absName;
    return chord.fermata ? `${what}, with a fermata` : what;
}

/** The bar whose chords are being typed on the chart (#1723), and where its caret starts: at the
 * end (a click), or over the whole text (Tab/Enter from the bar before, so typing replaces it).
 * A new object per opening — what a leave or a focus is matched against. */
export interface OpenBar {
    id: string;
    select: 'end' | 'all';
}

/**
 * Typing chords straight into a bar (#1723), while editing a measure chart. The shell owns the
 * drafts (`useBarDrafts`) and what a leave applies; the sheet draws the field and reads its keys.
 */
export interface BarEditing {
    open: OpenBar | null;
    /** What the bar's field holds — its draft, else its chords — or null where the quick editor
     * cannot edit the bar (a measure repeat, or a fermata off the last chord): no field there. */
    text: (measureId: string) => string | null;
    /** Why the bar's pending chords cannot be read ("Can't read “X”"), or null. */
    problem: (measureId: string) => string | null;
    /** Changed since the chart was last saved, or pending: the dot by the bar number. */
    edited: (measureId: string) => boolean;
    /** A click or tap on the bar: select it, and open its field where it has one. */
    onOpen: (measureId: string) => void;
    onText: (measureId: string, text: string) => void;
    /** Leaving `from`: apply its chords if they read, then move a bar (Tab/Enter) or close. */
    /** Leaves the bar, and for ±1 moves to the next one; false when there was none to move to. */
    onLeave: (from: OpenBar, step: -1 | 0 | 1) => boolean;
    /** Esc: the bar's chords back as last applied, and the field closed. */
    onRevert: (from: OpenBar) => void;
}

interface ChartSheetProps {
    current: ChartDocument;
    blocks: ChartBlock[];
    /** Display index of the sounding chord, or null while stopped. */
    displayActive: number | null;
    /** Display index of the next performed bar (#1458), wrapping across a repeat and the form's
     * own loop — see `useChartView`'s `displayNext`. Null while
     * stopped, or when the chart has nothing after `displayActive` to point at. */
    displayNext: number | null;
    /** Following's look-ahead scroll (`app/ensemble.tsx`) is in the playing bar's last beat —
     * strengthens the next-bar cue from a quiet outline to a stronger one. */
    nextSoon: boolean;
    /** The performed event under the playhead, in steps. */
    activeEvent: { start: number; end: number } | null;
    writtenBars: Map<string, WrittenBar>;
    writtenSections: Map<string, WrittenSection>;
    editing: boolean;
    /** The bar the measure editor holds while editing (#1700) — ringed on the chart, so the
     * musician can see which bar the panel is changing. Null when not editing a measure chart. */
    selectedMeasureId: string | null;
    busy: boolean;
    playing: boolean;
    playbackActive: boolean;
    totalBars: number;
    /** Section tap menu's "Start here" (#1422) — jumps playback to the section's first
     * performed bar, starting it if stopped. */
    onStartHere: (sectionId: string | undefined) => void;
    onEditSection: (block: ChartBlock) => void;
    /** Set while editing a measure chart (#1723); null otherwise. */
    barEdit: BarEditing | null;
    onAudition: (globalIndex: number) => void;
    /** How many times the band plays the form, then stops (#1511, the footer's menu);
     * `undefined` repeats it continuously. On a text chart the shell makes the measure copy
     * first, as "Try the bar editor · keep original" does. */
    onChoruses: (choruses: number | undefined) => void;
}

/** A bar holding more than one chord sets them smaller, as a real book does (#1712). */
function splitClass(chords: number): string {
    return chords > 2 ? ' split split-3' : chords > 1 ? ' split' : '';
}

export function ChartSheet({
    current,
    blocks,
    displayActive,
    displayNext,
    nextSoon,
    activeEvent,
    writtenBars,
    writtenSections,
    editing,
    selectedMeasureId,
    busy,
    playing,
    playbackActive,
    totalBars,
    onStartHere,
    onEditSection,
    barEdit,
    onAudition,
    onChoruses,
}: ChartSheetProps) {
    // A tap on a section letter opens this small menu (#1422). One menu for the whole
    // sheet, not one per section: cheaper, and only one can be open at a time anyway.
    const [sectionMenu, setSectionMenu] = useState<{
        id: string;
        label: string;
        top: number;
        left: number;
    } | null>(null);
    const sectionMenuRef = useRef<HTMLDivElement>(null);
    const sectionMenuTrigger = useRef<HTMLButtonElement | null>(null);

    // Keyed on WHICH menu is open, not its object: the effect focuses the item and arms the
    // listeners once per opening.
    const sectionMenuId = sectionMenu?.id ?? null;
    useEffect(() => {
        if (sectionMenuId === null) {
            return;
        }
        const first = sectionMenuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
        first?.focus();
        function closeOnOutsideClick(event: PointerEvent) {
            if (!sectionMenuRef.current?.contains(event.target as Node)) {
                setSectionMenu(null);
            }
        }
        function closeOnEscape(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                event.preventDefault();
                setSectionMenu(null);
                sectionMenuTrigger.current?.focus();
            }
        }
        // The menu is fixed at the letter's position when it opened; a scroll — the musician's,
        // or Following's own while the band plays — moves the letter, so the menu follows it
        // rather than floating over some other bar (#1700). Written straight to the menu's own
        // style, not to state: Following scrolls on the paint path, and a state write would
        // re-render the whole sheet every frame of it. Once the letter has left the screen the
        // menu closes rather than follow it off.
        function followTrigger() {
            const rect = sectionMenuTrigger.current?.getBoundingClientRect();
            const menu = sectionMenuRef.current;
            if (!rect || !menu) {
                return;
            }
            if (rect.bottom < 0 || rect.top > window.innerHeight) {
                setSectionMenu(null);
                return;
            }
            menu.style.top = `${rect.bottom + 6}px`;
            menu.style.left = `${rect.left}px`;
        }
        document.addEventListener('pointerdown', closeOnOutsideClick);
        document.addEventListener('keydown', closeOnEscape);
        document.addEventListener('scroll', followTrigger, true);
        window.addEventListener('resize', followTrigger);
        return () => {
            document.removeEventListener('pointerdown', closeOnOutsideClick);
            document.removeEventListener('keydown', closeOnEscape);
            document.removeEventListener('scroll', followTrigger, true);
            window.removeEventListener('resize', followTrigger);
        };
    }, [sectionMenuId]);

    function openSectionMenu(event: ReactMouseEvent<HTMLButtonElement>, block: ChartBlock) {
        if (!block.id) {
            return;
        }
        const rect = event.currentTarget.getBoundingClientRect();
        sectionMenuTrigger.current = event.currentTarget;
        setSectionMenu({
            id: block.id,
            label: block.label || 'A',
            top: rect.bottom + 6,
            left: rect.left,
        });
    }
    function closeSectionMenu() {
        setSectionMenu(null);
        sectionMenuTrigger.current?.focus();
    }

    // The footer's form-length menu (#1511): how many times the band plays the form. Opened
    // above or below the footer button, whichever has more room, and never wider than the
    // viewport; only that computed placement is inline, as the section menu's is.
    const choruses = current.schemaVersion === 2 ? current.chart.score.choruses : undefined;
    const [formMenu, setFormMenu] = useState<{
        top?: number;
        bottom?: number;
        left: number;
        maxHeight: number;
    } | null>(null);
    const formMenuRef = useRef<HTMLDivElement>(null);
    const formMenuTrigger = useRef<HTMLButtonElement>(null);
    // The menu closes with the footer: playback hides it, and so does a busy shell.
    const formMenuOpen = formMenu !== null && !playbackActive && !busy;
    useEffect(() => {
        if (playbackActive || busy) {
            setFormMenu(null);
        }
    }, [playbackActive, busy]);

    useEffect(() => {
        if (!formMenuOpen) {
            return;
        }
        const items = () =>
            Array.from(
                formMenuRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [],
            );
        (
            items().find((item) => item.getAttribute('aria-checked') === 'true') ?? items()[0]
        )?.focus();
        function closeOnOutsidePress(event: PointerEvent) {
            const target = event.target as Node;
            // The button's own click toggles the menu; closing here first would reopen it.
            if (
                !formMenuRef.current?.contains(target) &&
                !formMenuTrigger.current?.contains(target)
            ) {
                setFormMenu(null);
            }
        }
        // Escape with focus somewhere outside the menu; inside it, `onFormMenuKey` answers and
        // stops the event before it reaches the document.
        function closeOnEscape(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                event.preventDefault();
                setFormMenu(null);
                formMenuTrigger.current?.focus();
            }
        }
        // Placed against the footer button when it opened; a scroll of the chart (or a resize)
        // moves the button out from under it, so the menu closes rather than floating (#1700).
        // It only opens while stopped, so nothing scrolls the chart but the musician. Its own
        // list scrolls too, when it is taller than the room — that one is the menu, not the page.
        function closeOnScroll(event: Event) {
            if (!formMenuRef.current?.contains(event.target as Node)) {
                setFormMenu(null);
            }
        }
        function closeOnResize() {
            setFormMenu(null);
        }
        document.addEventListener('pointerdown', closeOnOutsidePress);
        document.addEventListener('keydown', closeOnEscape);
        document.addEventListener('scroll', closeOnScroll, true);
        window.addEventListener('resize', closeOnResize);
        return () => {
            document.removeEventListener('pointerdown', closeOnOutsidePress);
            document.removeEventListener('keydown', closeOnEscape);
            document.removeEventListener('scroll', closeOnScroll, true);
            window.removeEventListener('resize', closeOnResize);
        };
    }, [formMenuOpen]);

    /**
     * The menu's own keys. They stop here, because the chart around the sheet reads an arrow
     * as browsing away from Following.
     */
    function onFormMenuKey(event: ReactKeyboardEvent<HTMLDivElement>) {
        const all = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitemradio"]'),
        );
        const at = all.indexOf(document.activeElement as HTMLElement);
        const moves: Record<string, number> = {
            ArrowDown: at + 1,
            ArrowUp: at - 1,
            Home: 0,
            End: all.length - 1,
        };
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            setFormMenu(null);
            formMenuTrigger.current?.focus();
        } else if (Object.hasOwn(moves, event.key)) {
            event.preventDefault();
            event.stopPropagation();
            all[(moves[event.key] + all.length) % all.length]?.focus();
        }
    }

    function toggleFormMenu(event: ReactMouseEvent<HTMLButtonElement>) {
        if (formMenu) {
            setFormMenu(null);
            return;
        }
        const rect = event.currentTarget.getBoundingClientRect();
        const left = Math.max(
            VIEWPORT_MARGIN,
            Math.min(
                rect.right - POPOVER_WIDTH,
                window.innerWidth - POPOVER_WIDTH - VIEWPORT_MARGIN,
            ),
        );
        const below = window.innerHeight - rect.bottom - 6 - VIEWPORT_MARGIN;
        const above = rect.top - 6 - VIEWPORT_MARGIN;
        setFormMenu(
            below >= above
                ? { top: rect.bottom + 6, left, maxHeight: below }
                : { bottom: window.innerHeight - rect.top + 6, left, maxHeight: above },
        );
    }
    function pickChoruses(next: number | undefined) {
        setFormMenu(null);
        formMenuTrigger.current?.focus();
        if (next !== choruses) {
            onChoruses(next);
        }
    }
    const chorusChoices: Array<number | undefined> = [
        undefined,
        ...[...new Set([...STAND_CHORUS_COUNTS, ...(choruses ? [choruses] : [])])].sort(
            (a, b) => a - b,
        ),
    ];
    // The in-bar field (#1723). Focused, with its caret placed, once per opening; focused again
    // if a re-render remounts it while it had focus (a bar's key moves when an edit before it
    // changes how many chords come first), but never pulled back once focus has gone elsewhere.
    const open = barEdit?.open ?? null;
    const placedFor = useRef<OpenBar | null>(null);
    const fieldNode = useRef<HTMLInputElement | null>(null);
    const sheet = useRef<HTMLElement>(null);
    const refocusBar = useRef<string | null>(null);
    function fieldRef(node: HTMLInputElement | null) {
        if (!node || !open) {
            return;
        }
        const fresh = placedFor.current !== open;
        const dropped =
            fieldNode.current !== node &&
            (document.activeElement === null || document.activeElement === document.body);
        fieldNode.current = node;
        placedFor.current = open;
        if (fresh || dropped) {
            node.focus();
        }
        if (fresh) {
            if (open.select === 'all') {
                node.select();
            } else {
                node.setSelectionRange(node.value.length, node.value.length);
            }
        }
    }
    // Esc closes the field; focus lands on the bar's own number, so the keyboard stays there.
    useEffect(() => {
        if (open || !refocusBar.current) {
            return;
        }
        const id = refocusBar.current;
        refocusBar.current = null;
        sheet.current
            ?.querySelector<HTMLElement>(`[data-measure-id="${CSS.escape(id)}"] .bar-number`)
            ?.focus();
    }, [open]);
    function onFieldKey(event: ReactKeyboardEvent<HTMLInputElement>, from: OpenBar) {
        if (!barEdit || event.nativeEvent.isComposing) {
            return;
        }
        // The chart's own keys (an arrow browsing away from Following) are not the field's.
        event.stopPropagation();
        if (event.key === 'Tab' || event.key === 'Enter') {
            const moved = barEdit.onLeave(from, event.key === 'Tab' && event.shiftKey ? -1 : 1);
            // Tab past the first or last bar is the page's again; within the chart it is ours.
            if (moved || event.key === 'Enter') {
                event.preventDefault();
            }
        } else if (event.key === 'Escape') {
            event.preventDefault();
            refocusBar.current = from.id;
            barEdit.onRevert(from);
        }
    }
    function onFieldBlur(from: OpenBar) {
        // Focus going elsewhere on the page is leaving the bar; the window losing focus (another
        // app, another tab) is not. A press on another bar never gets here: it keeps focus off
        // the way (`onMouseDown`) and leaves through `onOpen`. Matched on the opening, not the
        // bar, so a newer opening of the same bar (Save landing on it) is not closed by this.
        if (document.hasFocus()) {
            barEdit?.onLeave(from, 0);
        }
    }
    const notation = arrangementOf(current).notation;
    let barNumber = 0;
    let lastContext: string | null = null;
    return (
        <article className="sheet" ref={sheet}>
            {blocks.map((block) => (
                <section className="section" key={block.measures[0]?.chords[0]?.globalIndex}>
                    <div className="section-head">
                        <button
                            type="button"
                            className="section-letter"
                            aria-label={`Section ${block.label || 'A'}`}
                            aria-haspopup="menu"
                            aria-expanded={sectionMenu?.id === block.id}
                            // Enter/Space reach the same handler (native button semantics).
                            onClick={(event) => openSectionMenu(event, block)}
                        >
                            {block.label || 'A'}
                        </button>
                        {/* A bare key beside the section letter read as a second letter ("A  C").
                            A measure chart already prints key · meter on the section's first bar
                            (`.bar-context`), so only a text chart says it here, in words (#1700). */}
                        {current.schemaVersion === 1 && (
                            <span className="section-name">
                                Key of{' '}
                                {arrangementOf(current).sections.find((s) => s.id === block.id)
                                    ?.key || arrangementOf(current).key}
                                {arrangementOf(current).isMinor ? ' minor' : ''}
                            </span>
                        )}
                        {current.schemaVersion === 2 &&
                            (current.chart.score.sections.find((s) => s.id === block.id)?.repeat ??
                                1) > 1 && (
                                <span className="section-repeat">
                                    Section ×
                                    {
                                        current.chart.score.sections.find((s) => s.id === block.id)
                                            ?.repeat
                                    }
                                </span>
                            )}
                        {editing && (
                            <button
                                className="section-edit"
                                disabled={busy}
                                onClick={() => onEditSection(block)}
                            >
                                Edit section
                            </button>
                        )}
                    </div>
                    <div className="bars">
                        {block.measures.map((measure, i) => {
                            barNumber++;
                            const writtenBar = writtenBars.get(measure.chords[0]?.measureId ?? '');
                            const notes = writtenBar?.annotations ?? [];
                            const measureRepeat =
                                writtenBar?.content.kind === 'repeat' ? writtenBar.content : null;
                            // A last-chorus coda (#1472) is navigation too: "To Coda, last
                            // chorus" tells the musician where the final chorus goes.
                            const navigation = [
                                ...(writtenBar?.start ?? []),
                                ...(writtenBar?.end ?? []),
                            ].filter((mark) =>
                                ['segno', 'coda', 'fine', 'jump', 'last-chorus'].includes(
                                    mark.kind,
                                ),
                            );
                            const owningSection = writtenSections.get(measure.sectionId ?? '');
                            const sectionSeam =
                                measure.isSeamlessStart && measure.sectionId !== block.id;
                            // Key and meter are marked at the chart's first bar and then only
                            // where they change, across sections too: a tune that never leaves
                            // Gm · 4/4 says so once, not at every section (UI audit).
                            const first = measure.chords[0];
                            const context = `${first?.key}${first?.keyIsMinor ? 'm' : ''} ${first?.timeSignature}`;
                            const previousContext = lastContext;
                            lastContext = context;
                            const repeatStart = writtenBar?.start?.some(
                                (mark) => mark.kind === 'repeat-start',
                            );
                            const repeatEnd = writtenBar?.end?.find(
                                (mark) => mark.kind === 'repeat-end',
                            );
                            const endingStart = writtenBar?.start?.find(
                                (mark) => mark.kind === 'ending-start',
                            );
                            const endingEnd = writtenBar?.end?.some(
                                (mark) => mark.kind === 'ending-end',
                            );
                            const endingEndBefore = writtenBar?.start?.some(
                                (mark) => mark.kind === 'ending-end',
                            );
                            const isNext = measure.chords.some(
                                (c) => c.globalIndex === displayNext,
                            );
                            // Typing on the chart (#1723): the bar is the target while editing a
                            // measure chart, and the selected one holds the field once opened.
                            const measureId = measure.chords[0]?.measureId ?? '';
                            const selected =
                                selectedMeasureId !== null && measureId === selectedMeasureId;
                            const typeable = barEdit !== null && barEdit.text(measureId) !== null;
                            const typing =
                                open !== null && selected && open.id === measureId && typeable;
                            const problem = barEdit?.problem(measureId) ?? null;
                            const edited = barEdit?.edited(measureId) ?? false;
                            return (
                                <div
                                    className={`bar ${measure.chords.some((c) => c.globalIndex === displayActive) ? 'active' : ''} ${i === block.measures.length - 1 ? 'end' : ''} ${repeatStart ? 'repeat-start' : ''} ${repeatEnd ? 'repeat-end' : ''} ${endingStart ? 'ending-start' : ''} ${endingEnd ? 'ending-end' : ''} ${selected ? 'selected' : ''}${typing ? ' typing' : ''}${problem ? ' unreadable' : ''}${edited ? ' edited' : ''}${measureRepeat ? '' : splitClass(measure.chords.length)}`}
                                    data-measure-id={writtenBar?.id}
                                    data-active={measure.chords.some(
                                        (c) => c.globalIndex === displayActive,
                                    )}
                                    data-next={isNext ? (nextSoon ? 'soon' : 'true') : undefined}
                                    key={measure.chords[0]?.globalIndex}
                                    // While editing a measure chart the whole bar is the target
                                    // (#1700, #1723): a press anywhere on it selects it and opens
                                    // its field, on the press, so focus never passes through
                                    // anything else on the way (no blur, no stray apply) — and
                                    // never stopping the band or pulling a phone's view up to
                                    // the panel. A press inside the open field is the caret's.
                                    // The click covers a keyboard press of the bar's number.
                                    onMouseDown={
                                        barEdit && !busy
                                            ? (event) => {
                                                  if (
                                                      event.button !== 0 ||
                                                      (event.target as Element).closest(
                                                          '.bar-input',
                                                      )
                                                  ) {
                                                      return;
                                                  }
                                                  if (typeable) {
                                                      event.preventDefault();
                                                  }
                                                  barEdit.onOpen(measureId);
                                              }
                                            : undefined
                                    }
                                    onClick={
                                        barEdit && !busy
                                            ? (event) => {
                                                  if (
                                                      !(event.target as Element).closest(
                                                          '.bar-input',
                                                      ) &&
                                                      (typeable ||
                                                          !(event.target as Element).closest(
                                                              '.chord-button',
                                                          ))
                                                  ) {
                                                      barEdit.onOpen(measureId);
                                                  }
                                              }
                                            : undefined
                                    }
                                >
                                    {barEdit ? (
                                        // The keyboard's way to a bar, one stop per bar.
                                        <button
                                            type="button"
                                            className="bar-number"
                                            disabled={busy}
                                            aria-label={`Edit bar ${barNumber}`}
                                        >
                                            {barNumber}
                                        </button>
                                    ) : (
                                        <span className="bar-number">{barNumber}</span>
                                    )}
                                    {navigation.length > 0 && (
                                        <span className="bar-navigation">
                                            {navigation.map(directionLabel).join(' · ')}
                                        </span>
                                    )}
                                    {endingStart && (
                                        <span
                                            className="ending-label"
                                            aria-label={`Ending passes ${endingStart.passes.join(', ')}`}
                                            title={`Ending passes ${endingStart.passes.join(', ')}`}
                                        >
                                            {endingStart.passes.join(', ')}.
                                        </span>
                                    )}
                                    {endingEnd && !endingStart && (
                                        <span
                                            className="ending-close"
                                            aria-label="End ending after this bar"
                                        />
                                    )}
                                    {endingEndBefore && (
                                        <span
                                            className="ending-close ending-close-before"
                                            aria-label="End previous ending before this bar"
                                        />
                                    )}
                                    {repeatStart && (
                                        <span
                                            className="repeat-sign repeat-sign-start"
                                            aria-label="Start repeat"
                                        >
                                            𝄆
                                        </span>
                                    )}
                                    {repeatEnd && (
                                        <span
                                            className="repeat-sign repeat-sign-end"
                                            aria-label={`End repeat, ${repeatEnd.times} total passes`}
                                        >
                                            𝄇
                                            {repeatEnd.times !== 2 && (
                                                <small>×{repeatEnd.times}</small>
                                            )}
                                        </span>
                                    )}
                                    {current.schemaVersion === 2 &&
                                        (sectionSeam || context !== previousContext) && (
                                            <span className="bar-context">
                                                {sectionSeam && owningSection && (
                                                    <b
                                                        aria-label={`Section ${owningSection.label}, ${owningSection.repeat} total passes`}
                                                        title={`Section ${owningSection.label}, ${owningSection.repeat} total passes`}
                                                    >
                                                        {owningSection.label} · ×
                                                        {owningSection.repeat} ·{' '}
                                                    </b>
                                                )}
                                                {measure.chords[0]?.key}
                                                {measure.chords[0]?.keyIsMinor ? 'm' : ''} ·{' '}
                                                {measure.chords[0]?.timeSignature}
                                            </span>
                                        )}
                                    {notes
                                        .filter((note) => note.placement === 'above')
                                        .map((note, index) => (
                                            <span
                                                className="bar-note"
                                                // biome-ignore lint/suspicious/noArrayIndexKey: Authored annotations have no IDs; these display-only spans hold no local state.
                                                key={`${note.at.join('/')}-${index}`}
                                            >
                                                {note.text}
                                            </span>
                                        ))}
                                    {typing && open && (
                                        <input
                                            ref={fieldRef}
                                            className="bar-input"
                                            aria-label={`Chords in bar ${barNumber}`}
                                            aria-invalid={problem ? true : undefined}
                                            value={barEdit?.text(measureId) ?? ''}
                                            maxLength={4000}
                                            readOnly={busy}
                                            spellCheck={false}
                                            autoCapitalize="off"
                                            autoCorrect="off"
                                            autoComplete="off"
                                            enterKeyHint="next"
                                            onChange={(event) =>
                                                barEdit?.onText(measureId, event.target.value)
                                            }
                                            onKeyDown={(event) => onFieldKey(event, open)}
                                            onBlur={() => onFieldBlur(open)}
                                        />
                                    )}
                                    {problem && <span className="bar-problem">{problem}</span>}
                                    {measure.chords
                                        .filter(
                                            (_, index) =>
                                                !typing && (!measureRepeat || index === 0),
                                        )
                                        .map((c) => (
                                            <button
                                                className={`chord chord-button${c.kind && c.kind !== 'chord' ? ` ${c.kind}` : ''}${c.fermata ? ' has-fermata' : ''}`}
                                                aria-current={
                                                    (
                                                        measureRepeat
                                                            ? measure.chords.some(
                                                                  (event) =>
                                                                      event.globalIndex ===
                                                                      displayActive,
                                                              )
                                                            : displayActive === c.globalIndex
                                                    )
                                                        ? 'true'
                                                        : undefined
                                                }
                                                data-start-step={
                                                    (measureRepeat
                                                        ? measure.chords.some(
                                                              (event) =>
                                                                  event.globalIndex ===
                                                                  displayActive,
                                                          )
                                                        : displayActive === c.globalIndex) &&
                                                    activeEvent
                                                        ? activeEvent.start
                                                        : c.start
                                                }
                                                data-end-step={
                                                    (measureRepeat
                                                        ? measure.chords.some(
                                                              (event) =>
                                                                  event.globalIndex ===
                                                                  displayActive,
                                                          )
                                                        : displayActive === c.globalIndex) &&
                                                    activeEvent
                                                        ? activeEvent.end
                                                        : c.end
                                                }
                                                style={
                                                    current.schemaVersion === 2
                                                        ? {
                                                              flex: c.end - c.start,
                                                          }
                                                        : undefined
                                                }
                                                key={c.globalIndex}
                                                // An editable bar's chords open its field while
                                                // editing (#1723): not a stop of their own (the
                                                // bar number is), and live while the band plays.
                                                tabIndex={typeable ? -1 : undefined}
                                                disabled={
                                                    !typeable &&
                                                    (playing ||
                                                        busy ||
                                                        c.globalIndex < 0 ||
                                                        // A hold or N.C. has no chord of its own to audition.
                                                        (!!c.kind && c.kind !== 'chord'))
                                                }
                                                aria-label={
                                                    measureRepeat
                                                        ? `Repeated bar: ${measure.chords.map((event) => event.absName).join(', ')}`
                                                        : eventLabel(c, !typeable)
                                                }
                                                title={
                                                    measureRepeat
                                                        ? measure.chords
                                                              .map((event) => event.absName)
                                                              .join(' · ')
                                                        : undefined
                                                }
                                                onClick={
                                                    typeable
                                                        ? undefined
                                                        : () => onAudition(c.globalIndex)
                                                }
                                            >
                                                {c.fermata && !measureRepeat && (
                                                    <span className="fermata" aria-hidden="true">
                                                        𝄐
                                                    </span>
                                                )}
                                                {measureRepeat
                                                    ? measureRepeat.display === 'one-bar'
                                                        ? '%'
                                                        : measureRepeat.display === 'two-bar-start'
                                                          ? '𝄎 1'
                                                          : '𝄎 2'
                                                    : eventText(c, notation)}
                                            </button>
                                        ))}
                                    {notes
                                        .filter((note) => note.placement === 'below')
                                        .map((note, index) => (
                                            <span
                                                className="bar-note"
                                                // biome-ignore lint/suspicious/noArrayIndexKey: Authored annotations have no IDs; these display-only spans hold no local state.
                                                key={`${note.at.join('/')}-${index}`}
                                            >
                                                {note.text}
                                            </span>
                                        ))}
                                </div>
                            );
                        })}
                    </div>
                </section>
            ))}
            {/* The form's first line again, faded, after its last (#1713): reading ahead into
                the next time through. Shown by CSS only when the chart scrolls; never a bar —
                not counted, focused, selected or read out. */}
            {blocks[0] && (
                <div className="next-chorus" aria-hidden="true" inert>
                    <div className="next-chorus-head">
                        <span className="next-chorus-letter">{blocks[0].label || 'A'}</span>
                    </div>
                    <div className="next-chorus-bars">
                        {blocks[0].measures.slice(0, 4).map((measure) => (
                            <div className="next-chorus-bar" key={measure.chords[0]?.globalIndex}>
                                {measure.chords.map((c) => (
                                    <span className="next-chorus-chord" key={c.globalIndex}>
                                        {eventText(c, notation)}
                                    </span>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            )}
            <div className="chart-bottom" hidden={playbackActive}>
                <span>Tap a chord to hear it while stopped.</span>
                <button
                    ref={formMenuTrigger}
                    type="button"
                    className="form-length"
                    aria-haspopup="menu"
                    aria-expanded={formMenuOpen}
                    disabled={busy}
                    onClick={toggleFormMenu}
                >
                    {totalBars} bars · {formLengthText(choruses)}
                </button>
            </div>
            {formMenuOpen && (
                <div
                    ref={formMenuRef}
                    className="popover form-length-menu"
                    style={{
                        top: formMenu.top,
                        bottom: formMenu.bottom,
                        left: formMenu.left,
                        maxHeight: formMenu.maxHeight,
                    }}
                >
                    {current.schemaVersion === 1 && (
                        <p className="form-length-note" id="form-length-note">
                            Counting choruses turns this chart into bars; the original is kept.
                        </p>
                    )}
                    <div
                        role="menu"
                        aria-label="How many times the form plays"
                        onKeyDown={onFormMenuKey}
                        aria-describedby={
                            current.schemaVersion === 1 ? 'form-length-note' : undefined
                        }
                    >
                        {chorusChoices.map((count) => (
                            <button
                                key={count ?? 'loop'}
                                type="button"
                                role="menuitemradio"
                                aria-checked={count === choruses}
                                className={`option${count === choruses ? ' active' : ''}`}
                                onClick={() => pickChoruses(count)}
                            >
                                {chorusChoice(count)}
                            </button>
                        ))}
                    </div>
                </div>
            )}
            {sectionMenu && (
                <div
                    ref={sectionMenuRef}
                    role="menu"
                    aria-label={`Section ${sectionMenu.label}`}
                    className="popover section-menu"
                    style={{ position: 'fixed', top: sectionMenu.top, left: sectionMenu.left }}
                >
                    <button
                        type="button"
                        role="menuitem"
                        className="option"
                        onClick={() => {
                            onStartHere(sectionMenu.id);
                            closeSectionMenu();
                        }}
                    >
                        Start here
                    </button>
                </div>
            )}
        </article>
    );
}
