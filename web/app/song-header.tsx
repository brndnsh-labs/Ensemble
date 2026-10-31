import type { RefObject } from 'react';
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
    /** An account song's cloud fact when it is a routine one (`headerCloudLabel`), else null. */
    cloudSaved: string | null;
    stage: boolean;
    editing: boolean;
    /** The remembered stand mode is Neck (#1587); the neck shows while not `editing`. */
    neck: boolean;
    onHome: () => void;
    onToggleTheme: () => void;
    onOpenSettings: () => void;
    settingsOpen: boolean;
    onShowChart: () => void;
    onShowNeck: () => void;
    onEditChart: () => void;
    onSave: () => void;
    /** The •••, which the Song menu opens at (#1756). */
    menuButtonRef: RefObject<HTMLButtonElement | null>;
    /** Opens the Song menu, or closes it when it is open; ignored while busy. */
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
    cloudSaved,
    stage,
    editing,
    neck,
    onHome,
    onToggleTheme,
    onOpenSettings,
    settingsOpen,
    onShowChart,
    onShowNeck,
    onEditChart,
    onSave,
    menuButtonRef,
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
                                        : (cloudSaved ?? 'Saved on this device')}
                        </span>
                        <span>{totalBars} bars</span>
                        <span>{current.chart.score.meter}</span>
                    </div>
                </div>
            </div>
            <div className="song-actions">
                <button
                    className="icon-button settings-btn"
                    aria-label="Settings"
                    aria-haspopup="dialog"
                    aria-expanded={settingsOpen}
                    onClick={onOpenSettings}
                >
                    <span aria-hidden="true">{'⚙\uFE0E'}</span>
                </button>
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
                {/* The current mode is said with `aria-pressed`, not colour alone (#1760). */}
                <div className="mode-switch" role="group" aria-label="Stand mode">
                    <button aria-pressed={!editing && !neck} onClick={onShowChart}>
                        Chart
                    </button>
                    <button aria-pressed={neck && !editing} onClick={onShowNeck}>
                        Neck
                    </button>
                    <button
                        aria-pressed={editing}
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
                    ref={menuButtonRef}
                    className="icon-button menu-btn"
                    aria-label="Song actions"
                    aria-haspopup="menu"
                    aria-expanded={false}
                    // `aria-disabled`, not `disabled`: the Song menu hands focus back here as a
                    // choice starts, and a disabled button would drop it (#1755).
                    aria-disabled={busy || undefined}
                    onClick={onMenu}
                >
                    •••
                </button>
            </div>
        </div>
    );
}
