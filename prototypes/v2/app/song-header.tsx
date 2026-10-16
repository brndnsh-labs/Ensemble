import { arrangementOf } from '../lib/documents';
import type { ChartDocument } from '../lib/runtime';

interface SongHeaderProps {
    current: ChartDocument;
    busy: boolean;
    dirty: boolean;
    hasPendingText: boolean;
    sharedDraft: boolean;
    /** The draft came from the standards catalog, not a shared link (#1700). */
    standardDraft: boolean;
    /** The draft is a brand-new song, kept on its first change (#1707). */
    newSongDraft: boolean;
    /** Only practice settings (tempo, style, energy, mix) differ from the saved version (#1706). */
    practiceOnly: boolean;
    recoveryHealthy: boolean;
    totalBars: number;
    stage: boolean;
    playbackActive: boolean;
    focused: boolean;
    editing: boolean;
    /** The remembered stand mode is Neck (#1587); the neck shows while not `editing`. */
    neck: boolean;
    onHome: () => void;
    onToggleTheme: () => void;
    onToggleControls: () => void;
    onShowChart: () => void;
    onShowNeck: () => void;
    onEditChart: () => void;
    onSave: () => void;
    onMenu: () => void;
    /** The title typed in the header while editing (#1726): an unsaved change, kept by Save. */
    onTitle: (title: string) => void;
}

export function SongHeader({
    current,
    busy,
    dirty,
    hasPendingText,
    sharedDraft,
    standardDraft,
    newSongDraft,
    practiceOnly,
    recoveryHealthy,
    totalBars,
    stage,
    playbackActive,
    focused,
    editing,
    neck,
    onHome,
    onToggleTheme,
    onToggleControls,
    onShowChart,
    onShowNeck,
    onEditChart,
    onSave,
    onMenu,
    onTitle,
}: SongHeaderProps) {
    return (
        <div className="song-header">
            <div className="song-heading">
                <button
                    className="icon-button back-btn"
                    aria-label="Back to songbook"
                    disabled={busy}
                    onClick={onHome}
                >
                    ←
                </button>
                <div>
                    {/* Editing, the title is typed where it is read (#1726), as the edit
                        panel's "Song title" field was: each keystroke an unsaved change, Save
                        the commit. */}
                    <h1 className="song-title">
                        {editing ? (
                            <input
                                id="title"
                                className="song-title-input"
                                aria-label="Song title"
                                maxLength={160}
                                disabled={busy}
                                value={current.title}
                                spellCheck={false}
                                autoComplete="off"
                                onChange={(event) => onTitle(event.target.value)}
                            />
                        ) : (
                            current.title
                        )}
                    </h1>
                    <div className="song-subtitle">
                        <span
                            className={practiceOnly ? 'practice-changed' : dirty ? 'unsaved' : ''}
                        >
                            {hasPendingText
                                ? 'Unsaved chord text · this tab only'
                                : newSongDraft
                                  ? 'New song · kept once you change it'
                                  : sharedDraft
                                    ? standardDraft
                                        ? 'From the standards · not saved'
                                        : 'Opened from a shared link · not saved'
                                    : practiceOnly
                                      ? recoveryHealthy
                                          ? 'Practice settings changed · Save to keep'
                                          : 'Practice settings changed · this tab only'
                                      : dirty
                                        ? recoveryHealthy
                                            ? 'Unsaved changes · locally recovered'
                                            : 'Unsaved changes · this tab only'
                                        : 'Saved on this device'}
                        </span>
                        <span>{totalBars} bars</span>
                        <span>{arrangementOf(current).timeSignature}</span>
                    </div>
                </div>
            </div>
            <div className="song-actions">
                <button
                    className="btn theme-toggle"
                    aria-pressed={stage}
                    // One name in every layout: the phone shows only the moon (#1700).
                    aria-label="Stage"
                    title={stage ? 'Switch to day mode' : 'Switch to stage mode'}
                    onClick={onToggleTheme}
                >
                    <span className="theme-glyph" aria-hidden="true">
                        ☾
                    </span>
                    <span className="theme-label">Stage</span>
                </button>
                {playbackActive && (
                    <button
                        className="btn focus-toggle"
                        aria-pressed={focused}
                        onClick={onToggleControls}
                    >
                        {focused ? 'Show controls' : 'Focus chart'}
                    </button>
                )}
                <div className="mode-switch">
                    <button className={!editing && !neck ? 'active' : ''} onClick={onShowChart}>
                        Chart
                    </button>
                    <button className={neck && !editing ? 'active' : ''} onClick={onShowNeck}>
                        Neck
                    </button>
                    <button
                        className={editing ? 'active' : ''}
                        disabled={busy}
                        // The phone shows "Edit" (three modes share its header row); the name stays whole.
                        aria-label="Edit chart"
                        onClick={onEditChart}
                    >
                        Edit<span className="mode-label-long"> chart</span>
                    </button>
                </div>
                <button className="btn primary save-btn" disabled={busy || !dirty} onClick={onSave}>
                    {sharedDraft && !newSongDraft ? 'Keep a copy' : 'Save'}
                </button>
                <button
                    className="icon-button menu-btn"
                    aria-label="Song actions"
                    disabled={busy}
                    onClick={onMenu}
                >
                    •••
                </button>
            </div>
        </div>
    );
}
