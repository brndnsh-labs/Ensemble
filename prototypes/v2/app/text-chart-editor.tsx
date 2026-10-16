import type { RefObject } from 'react';
import { arrangementOf } from '../lib/documents';
import type { ChartDocument } from '../lib/runtime';

interface TextChartEditorProps {
    /** Owned by the shell, whose reveal effect focuses and scrolls to this editor. */
    panelRef: RefObject<HTMLElement | null>;
    /** A text chart (schemaVersion 1): a measure chart is typed on the chart itself (#1726). */
    current: ChartDocument & { schemaVersion: 1 };
    editing: boolean;
    busy: boolean;
    sectionId: string;
    /** Unchecked chord text per section id. */
    buffers: Map<string, string>;
    text: string;
    onUpgrade: () => void;
    onSelectSection: (id: string) => void;
    onEditText: (value: string) => void;
    onUpdateChart: () => void;
    onAddSection: () => void;
}

/**
 * The editor for a text chart, the one kind of chart still edited beside the stand (#1726): a
 * measure chart has no panel at all — its bars are typed on the chart, its sections set from the
 * section letter and the whole song from the Song menu. A text chart is one section of chord text
 * at a time, so it keeps this small panel, and "Try the bar editor" is the way onto the chart.
 */
export function TextChartEditor({
    panelRef,
    current,
    editing,
    busy,
    sectionId,
    buffers,
    text,
    onUpgrade,
    onSelectSection,
    onEditText,
    onUpdateChart,
    onAddSection,
}: TextChartEditorProps) {
    return (
        <aside className="edit-panel" ref={panelRef} hidden={!editing}>
            <h2>Edit your chart</h2>
            <p>Separate bars with |. Chords in the same bar share its beats equally.</p>
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
                Unchecked text stays in this tab only; playback and returning to your songbook check
                it first.
            </p>
        </aside>
    );
}
