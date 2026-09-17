import type { LeadSheetMeasure, LeadSheetSectionBlock } from '@engine/song/lead-sheet-model';
import type { SemanticScore } from '@engine/songbook/score-types';
import type { EnsembleState } from '@engine/types';
import { useRef } from 'react';
import { arrangementOf } from '../lib/documents';
import type { ChartDocument } from '../lib/runtime';
import { directionLabel } from '../lib/score-labels';

type WrittenSection = SemanticScore['sections'][number];
type WrittenBar = WrittenSection['measures'][number];

interface ChartSheetProps {
    current: ChartDocument;
    blocks: LeadSheetSectionBlock[];
    /** Display index of the sounding chord, or null while stopped. */
    displayActive: number | null;
    activeEvent: EnsembleState['arranger']['stepMap'][number] | null;
    writtenBars: Map<string, WrittenBar>;
    writtenSections: Map<string, WrittenSection>;
    loopedSectionId: string | null;
    editing: boolean;
    busy: boolean;
    playing: boolean;
    playbackActive: boolean;
    totalBars: number;
    onToggleLoop: (sectionId: string | undefined) => void;
    onEditSection: (block: LeadSheetSectionBlock) => void;
    onEditBar: (measure: LeadSheetMeasure) => void;
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
    onEditSection,
    onEditBar,
    onAudition,
}: ChartSheetProps) {
    // Long-press bookkeeping for the section-letter loop gesture: the pending
    // timer so pointerup/leave/cancel can cancel it, and a suppression flag so
    // the click that follows a fired long-press doesn't also fire the (reserved
    // for #937) plain-tap handler.
    const sectionLoopPress = useRef<number | null>(null);
    const suppressSectionTap = useRef(false);
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
                            onPointerDown={() => {
                                // A long-press whose click never arrived (a
                                // touch released off-target) must not leave
                                // the flag set and swallow the NEXT tap —
                                // which #937 will make meaningful.
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
                            onClick={() => {
                                // A long-press above already acted and set
                                // this flag; swallow the click that follows
                                // it so the plain tap stays a no-op.
                                if (suppressSectionTap.current) {
                                    suppressSectionTap.current = false;
                                    return;
                                }
                                // Plain tap is intentionally a no-op: this
                                // gesture is reserved for the banked #937
                                // conductor lens ("lead, don't play"). Don't
                                // wire a handler here for anything else.
                            }}
                            onKeyDown={(e) => {
                                // Long-press has no keyboard equivalent, so
                                // 'l'/'L' is the keyboard path to the same
                                // toggle. Enter/Space stay reserved for #937.
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
                                                className="chord chord-button"
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
                                                disabled={playing || busy || c.globalIndex < 0}
                                                aria-label={
                                                    measureRepeat
                                                        ? `Repeated bar: ${measure.chords.map((event) => event.absName).join(', ')}`
                                                        : `Audition ${c.absName}`
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
                                                {measureRepeat
                                                    ? measureRepeat.display === 'one-bar'
                                                        ? '%'
                                                        : measureRepeat.display === 'two-bar-start'
                                                          ? '𝄎 1'
                                                          : '𝄎 2'
                                                    : c.absName}
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
        </article>
    );
}
