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
    onSounds: () => void;
    onToggleControls: () => void;
    onShowChart: () => void;
    onShowNeck: () => void;
    onEditChart: () => void;
    onSave: () => void;
    onMenu: () => void;
}

export function SongHeader({
    current,
    busy,
    dirty,
    hasPendingText,
    sharedDraft,
    standardDraft,
    recoveryHealthy,
    totalBars,
    stage,
    playbackActive,
    focused,
    editing,
    neck,
    onHome,
    onToggleTheme,
    onSounds,
    onToggleControls,
    onShowChart,
    onShowNeck,
    onEditChart,
    onSave,
    onMenu,
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
                    <h1 className="song-title">{current.title}</h1>
                    <div className="song-subtitle">
                        <span className={dirty ? 'unsaved' : ''}>
                            {hasPendingText
                                ? 'Unsaved chord text · this tab only'
                                : sharedDraft
                                  ? standardDraft
                                      ? 'From the standards · not saved'
                                      : 'Opened from a shared link · not saved'
                                  : dirty
                                    ? recoveryHealthy
                                        ? 'Unsaved setup · locally recovered'
                                        : 'Unsaved setup · this tab only'
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
                    title={stage ? 'Switch to day mode' : 'Switch to stage mode'}
                    onClick={onToggleTheme}
                >
                    Stage
                </button>
                <button className="btn sounds-button" onClick={onSounds}>
                    Sounds
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
                    {sharedDraft ? 'Keep a copy' : 'Save'}
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
