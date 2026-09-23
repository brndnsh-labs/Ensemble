import { TIME_SIGNATURES } from '@engine/config';
import type { SemanticScore } from '@engine/songbook/score-types';
import { type RefObject, useRef } from 'react';
import { arrangementOf, type SectionChange } from '../lib/documents';
import type { ChartDocument } from '../lib/runtime';
import { MeasureEditor, type MeasureEditorHandle } from './measure-editor';
import { SectionSettings } from './section-settings';

interface EditPanelProps {
    /** Owned by the shell, whose reveal effect focuses and scrolls to this panel. */
    panelRef: RefObject<HTMLElement | null>;
    measureEditorRef: RefObject<MeasureEditorHandle | null>;
    current: ChartDocument;
    editing: boolean;
    busy: boolean;
    measureId: string;
    sectionId: string;
    /** Unchecked chord text per section id (v1 text charts). */
    buffers: Map<string, string>;
    text: string;
    onTitle: (title: string) => void;
    /** The song's own meter (`score.meter`), not a bar's "Meter from this bar" override. */
    onSongMeter: (meter: string) => void;
    onSelectMeasure: (id: string) => void;
    onPendingChange: (pending: boolean) => void;
    onApply: (score: SemanticScore) => void;
    onApplyForm: (score: SemanticScore) => void;
    onExtend: (newSection: boolean) => void;
    /** One edit to the section holding the selected bar (#1374). */
    onSectionChange: (sectionId: string, change: SectionChange) => void;
    /** Removes the selected bar, or the whole section holding it (#1373). */
    onRemove: (wholeSection: boolean) => void;
    onUpgrade: () => void;
    onSelectSection: (id: string) => void;
    onEditText: (value: string) => void;
    onUpdateChart: () => void;
    onAddSection: () => void;
}

export function EditPanel({
    panelRef,
    measureEditorRef,
    current,
    editing,
    busy,
    measureId,
    sectionId,
    buffers,
    text,
    onTitle,
    onSongMeter,
    onSelectMeasure,
    onPendingChange,
    onApply,
    onApplyForm,
    onExtend,
    onSectionChange,
    onRemove,
    onUpgrade,
    onSelectSection,
    onEditText,
    onUpdateChart,
    onAddSection,
}: EditPanelProps) {
    const editor = useRef<HTMLTextAreaElement>(null);
    return (
        <aside className="edit-panel" ref={panelRef} hidden={!editing}>
            <h2>Edit your chart</h2>
            <p hidden={current.schemaVersion === 2}>
                Separate bars with |. Chords in the same bar share its beats equally.
            </p>
            <label className="panel-label" htmlFor="title">
                Song title
            </label>
            <input
                id="title"
                disabled={busy}
                className="section-text title-input"
                maxLength={160}
                value={current.title}
                onChange={(e) => onTitle(e.target.value)}
            />
            {current.schemaVersion === 2 ? (
                <>
                    <label className="panel-label" htmlFor="song-meter">
                        Song meter
                    </label>
                    <select
                        id="song-meter"
                        disabled={busy}
                        value={current.chart.score.meter}
                        onChange={(e) => onSongMeter(e.target.value)}
                    >
                        {[
                            ...new Set([
                                ...Object.keys(TIME_SIGNATURES),
                                current.chart.score.meter,
                            ]),
                        ].map((meter) => (
                            <option key={meter}>{meter}</option>
                        ))}
                    </select>
                    <p className="preview-note">
                        Chords keep their share of each bar. A section or bar with its own meter
                        keeps it.
                    </p>
                    <MeasureEditor
                        key={current.id}
                        ref={measureEditorRef}
                        score={current.chart.score}
                        selectedMeasureId={measureId}
                        onSelect={onSelectMeasure}
                        disabled={busy}
                        onPendingChange={onPendingChange}
                        onApply={onApply}
                        onApplyForm={onApplyForm}
                    />
                    {(() => {
                        const score = current.chart.score;
                        const section =
                            score.sections.find((s) =>
                                s.measures.some((m) => m.id === measureId),
                            ) ?? score.sections[0];
                        return (
                            <SectionSettings
                                score={score}
                                section={section}
                                disabled={busy}
                                onChange={(change) => onSectionChange(section.id, change)}
                            />
                        );
                    })()}
                    <div className="dialog-actions">
                        <button className="btn" disabled={busy} onClick={() => onExtend(false)}>
                            ＋ Bar
                        </button>
                        <button className="btn" disabled={busy} onClick={() => onExtend(true)}>
                            ＋ Section
                        </button>
                        <button className="btn" disabled={busy} onClick={() => onRemove(false)}>
                            − Bar
                        </button>
                        <button className="btn" disabled={busy} onClick={() => onRemove(true)}>
                            − Section
                        </button>
                    </div>
                    <p className="preview-note">
                        Save includes all edited bars. Unchecked typing stays in this tab until you
                        update or save.
                    </p>
                </>
            ) : (
                <>
                    <button className="btn" disabled={busy} onClick={onUpgrade}>
                        Try the bar editor · keep original
                    </button>
                    <label className="panel-label" htmlFor="section">
                        Section
                    </label>
                    <select
                        id="section"
                        disabled={busy}
                        value={sectionId}
                        onChange={(e) => onSelectSection(e.target.value)}
                    >
                        {arrangementOf(current).sections.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.label}
                                {buffers.has(s.id) ? ' · edited' : ''}
                            </option>
                        ))}
                    </select>
                    <label className="panel-label" htmlFor="chord-text">
                        Chord text
                    </label>
                    <textarea
                        id="chord-text"
                        ref={editor}
                        className="section-text"
                        disabled={busy}
                        aria-describedby="editor-help"
                        value={text}
                        onChange={(e) => onEditText(e.target.value)}
                    />
                    <div className="dialog-actions">
                        <button className="btn primary" disabled={busy} onClick={onUpdateChart}>
                            Update chart
                        </button>
                        <button className="btn" disabled={busy} onClick={onAddSection}>
                            ＋ Section
                        </button>
                    </div>
                    <p className="preview-note" id="editor-help">
                        Save includes your typed chords. Update chart previews them without saving.
                        Unchecked text stays in this tab only; playback and returning to your
                        songbook check it first.
                    </p>
                </>
            )}
        </aside>
    );
}
