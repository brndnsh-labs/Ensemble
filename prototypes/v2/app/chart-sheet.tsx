import type { SemanticScore } from '@engine/songbook/score-types';
import type { ChartNotation } from '@engine/songbook/types';
import { type MouseEvent as ReactMouseEvent, useEffect, useRef, useState } from 'react';
import { arrangementOf } from '../lib/documents';
import type { ChartBlock, ChartChord, ChartMeasure } from '../lib/lead-sheet';
import type { ChartDocument } from '../lib/runtime';
import { directionLabel } from '../lib/score-labels';

type WrittenSection = SemanticScore['sections'][number];
type WrittenBar = WrittenSection['measures'][number];

/**
 * The visible chord symbol in the chart's current notation (#1276). `chord.display`
 * (`FormattedChordNames`) is precomputed for all three notations by
 * `chords-engine.validateProgression()` regardless of which one is selected — the
 * same shared field `ChordVisualizer.tsx` reads in v1 — so switching notation is a
 * pure read-time choice, never a re-analysis of the chord.
 */
function chordSymbol(chord: ChartChord, notation: ChartNotation): string {
    const disp = chord.display?.[notation];
    if (!disp) {
        return chord.absName;
    }
    return `${disp.root}${disp.suffix}${disp.bass ? `/${disp.bass}` : ''}`;
}

/**
 * How a written event reads on the stand. A hold is the slash the bar editor takes for it (the
 * chord before it rings on), N.C. is printed as charts print it, and a fermata sits over the
 * symbol it holds. Only the band engine can open charts with these (`lib/band-chart.ts`).
 */
function eventText(chord: ChartChord, notation: ChartNotation): string {
    return chord.kind === 'hold'
        ? '/'
        : chord.kind === 'no-chord'
          ? 'N.C.'
          : chordSymbol(chord, notation);
}

function eventLabel(chord: ChartChord): string {
    const what =
        chord.kind === 'hold'
            ? 'Hold the chord before'
            : chord.kind === 'no-chord'
              ? 'No chord'
              : `Audition ${chord.absName}`;
    return chord.fermata ? `${what}, with a fermata` : what;
}

interface ChartSheetProps {
    current: ChartDocument;
    blocks: ChartBlock[];
    /** Display index of the sounding chord, or null while stopped. */
    displayActive: number | null;
    /** The performed event under the playhead, in steps. */
    activeEvent: { start: number; end: number } | null;
    writtenBars: Map<string, WrittenBar>;
    writtenSections: Map<string, WrittenSection>;
    loopedSectionId: string | null;
    editing: boolean;
    busy: boolean;
    playing: boolean;
    playbackActive: boolean;
    totalBars: number;
    onToggleLoop: (sectionId: string | undefined) => void;
    /** Section tap menu's "Start here" (#1422) — jumps playback to the section's first
     * performed bar, starting it if stopped. */
    onStartHere: (sectionId: string | undefined) => void;
    onEditSection: (block: ChartBlock) => void;
    onEditBar: (measure: ChartMeasure) => void;
    onAudition: (globalIndex: number) => void;
}

export function ChartSheet({
    current,
    blocks,
    displayActive,
    activeEvent,
    writtenBars,
    writtenSections,
    loopedSectionId,
    editing,
    busy,
    playing,
    playbackActive,
    totalBars,
    onToggleLoop,
    onStartHere,
    onEditSection,
    onEditBar,
    onAudition,
}: ChartSheetProps) {
    // Long-press bookkeeping for the section-letter loop gesture: the pending
    // timer so pointerup/leave/cancel can cancel it, and a suppression flag so
    // the click that follows a fired long-press doesn't also fire the plain-tap
    // handler below (the section menu, #1422).
    const sectionLoopPress = useRef<number | null>(null);
    const suppressSectionTap = useRef(false);
    // A plain tap opens this small menu (#1422) instead of the long-press/'L' loop
    // toggle above, which it leaves untouched. One menu for the whole sheet, not
    // one per section: cheaper, and only one can be open at a time anyway.
    const [sectionMenu, setSectionMenu] = useState<{
        id: string;
        label: string;
        top: number;
        left: number;
    } | null>(null);
    const sectionMenuRef = useRef<HTMLDivElement>(null);
    const sectionMenuTrigger = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
        if (!sectionMenu) {
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
        document.addEventListener('pointerdown', closeOnOutsideClick);
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('pointerdown', closeOnOutsideClick);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, [sectionMenu]);

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
    const notation = arrangementOf(current).notation;
    let barNumber = 0;
    return (
        <article className="sheet">
            {blocks.map((block) => (
                <section className="section" key={block.measures[0]?.chords[0]?.globalIndex}>
                    <div className="section-head">
                        <button
                            type="button"
                            className="section-letter"
                            aria-pressed={loopedSectionId === block.id}
                            aria-label={`Section ${block.label || 'A'} · hold to practice-loop`}
                            aria-keyshortcuts="L"
                            aria-haspopup="menu"
                            aria-expanded={sectionMenu?.id === block.id}
                            onPointerDown={() => {
                                // A long-press whose click never arrived (a
                                // touch released off-target) must not leave
                                // the flag set and swallow the NEXT tap, which
                                // opens the section menu below.
                                suppressSectionTap.current = false;
                                if (sectionLoopPress.current !== null) {
                                    window.clearTimeout(sectionLoopPress.current);
                                }
                                sectionLoopPress.current = window.setTimeout(() => {
                                    sectionLoopPress.current = null;
                                    suppressSectionTap.current = true;
                                    onToggleLoop(block.id);
                                }, 500);
                            }}
                            onPointerUp={() => {
                                if (sectionLoopPress.current !== null) {
                                    window.clearTimeout(sectionLoopPress.current);
                                    sectionLoopPress.current = null;
                                }
                            }}
                            onPointerLeave={() => {
                                if (sectionLoopPress.current !== null) {
                                    window.clearTimeout(sectionLoopPress.current);
                                    sectionLoopPress.current = null;
                                }
                            }}
                            onPointerCancel={() => {
                                if (sectionLoopPress.current !== null) {
                                    window.clearTimeout(sectionLoopPress.current);
                                    sectionLoopPress.current = null;
                                }
                            }}
                            onClick={(event) => {
                                // A long-press above already acted and set
                                // this flag; swallow the click that follows
                                // it so it doesn't ALSO open the menu.
                                if (suppressSectionTap.current) {
                                    suppressSectionTap.current = false;
                                    return;
                                }
                                // A plain tap opens the section menu (#1422):
                                // "Loop this section"/"Start here". Enter/Space
                                // reach the same handler (native button
                                // semantics), so no separate key handling here.
                                openSectionMenu(event, block);
                            }}
                            onKeyDown={(e) => {
                                // Long-press has no keyboard equivalent, so
                                // 'l'/'L' stays the keyboard path straight to
                                // the loop toggle, bypassing the menu.
                                if (e.key === 'l' || e.key === 'L') {
                                    e.preventDefault();
                                    onToggleLoop(block.id);
                                }
                            }}
                        >
                            {block.label || 'A'}
                        </button>
                        <span className="section-name">
                            {arrangementOf(current).sections.find((s) => s.id === block.id)?.key ||
                                arrangementOf(current).key}
                        </span>
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
                        {loopedSectionId === block.id && (
                            <span className="section-loop active">Looping</span>
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
                            const navigation = [
                                ...(writtenBar?.start ?? []),
                                ...(writtenBar?.end ?? []),
                            ].filter((mark) =>
                                ['segno', 'coda', 'fine', 'jump'].includes(mark.kind),
                            );
                            const owningSection = writtenSections.get(measure.sectionId ?? '');
                            const sectionSeam =
                                measure.isSeamlessStart && measure.sectionId !== block.id;
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
                            return (
                                <div
                                    className={`bar ${measure.chords.some((c) => c.globalIndex === displayActive) ? 'active' : ''} ${i === block.measures.length - 1 ? 'end' : ''} ${repeatStart ? 'repeat-start' : ''} ${repeatEnd ? 'repeat-end' : ''} ${endingStart ? 'ending-start' : ''} ${endingEnd ? 'ending-end' : ''}`}
                                    data-measure-id={writtenBar?.id}
                                    data-active={measure.chords.some(
                                        (c) => c.globalIndex === displayActive,
                                    )}
                                    key={measure.chords[0]?.globalIndex}
                                >
                                    <span className="bar-number">{barNumber}</span>
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
                                    {current.schemaVersion === 2 && editing && (
                                        <button
                                            className="bar-edit"
                                            disabled={busy}
                                            aria-label={`Edit bar ${barNumber}`}
                                            onClick={() => onEditBar(measure)}
                                        >
                                            Edit
                                        </button>
                                    )}
                                    {current.schemaVersion === 2 &&
                                        (i === 0 ||
                                            sectionSeam ||
                                            measure.chords[0]?.key !==
                                                block.measures[i - 1]?.chords[0]?.key ||
                                            measure.chords[0]?.keyIsMinor !==
                                                block.measures[i - 1]?.chords[0]?.keyIsMinor ||
                                            measure.chords[0]?.timeSignature !==
                                                block.measures[i - 1]?.chords[0]
                                                    ?.timeSignature) && (
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
                                    {measure.chords
                                        .filter((_, index) => !measureRepeat || index === 0)
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
                                                disabled={
                                                    playing ||
                                                    busy ||
                                                    c.globalIndex < 0 ||
                                                    // A hold or N.C. has no chord of its own to audition.
                                                    (!!c.kind && c.kind !== 'chord')
                                                }
                                                aria-label={
                                                    measureRepeat
                                                        ? `Repeated bar: ${measure.chords.map((event) => event.absName).join(', ')}`
                                                        : eventLabel(c)
                                                }
                                                title={
                                                    measureRepeat
                                                        ? measure.chords
                                                              .map((event) => event.absName)
                                                              .join(' · ')
                                                        : undefined
                                                }
                                                onClick={() => onAudition(c.globalIndex)}
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
            <div className="chart-bottom" hidden={playbackActive}>
                <span>Tap a chord to hear it while stopped.</span>
                <span>{totalBars} bars · repeats continuously</span>
            </div>
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
                            onToggleLoop(sectionMenu.id);
                            closeSectionMenu();
                        }}
                    >
                        {loopedSectionId === sectionMenu.id ? 'Stop looping' : 'Loop this section'}
                    </button>
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
