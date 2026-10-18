import type { RefObject } from 'react';
import type { ThemeChoice } from '../lib/session';
import { dialogRule } from './dialog-close';
import './settings-sheet.css';

const APPEARANCE: { id: 'system' | ThemeChoice; label: string; hint: string }[] = [
    { id: 'system', label: 'System', hint: 'Follows this device, light or dark' },
    { id: 'day', label: 'Day', hint: 'Paper white' },
    { id: 'stage', label: 'Stage', hint: 'Dark, for a dim room' },
];

interface SettingsSheetProps {
    /** Owned by the shell, which drives `showModal()`/`close()` from its `settingsOpen` state. */
    dialogRef: RefObject<HTMLDialogElement | null>;
    /** The stored choice; null is System. */
    theme: ThemeChoice | null;
    onTheme: (theme: ThemeChoice | null) => void;
    onClose: () => void;
}

/**
 * Per-device settings (#1783) — never a document field. Appearance is the first section: System
 * hands the theme back to the OS, which the header's Stage quick-toggle cannot (it always sets an
 * explicit Day or Stage). Both read and write the one `useStageTheme` state.
 */
export function SettingsSheet({ dialogRef, theme, onTheme, onClose }: SettingsSheetProps) {
    const chosen = theme ?? 'system';
    return (
        <dialog
            className="feel-panel settings-panel"
            ref={dialogRef}
            aria-labelledby="settings-title"
            {...dialogRule({ onClose })}
        >
            <div className="feel-heading">
                <h2 id="settings-title">Settings</h2>
                <button className="icon-button" aria-label="Close settings" onClick={onClose}>
                    ✕
                </button>
            </div>
            <fieldset className="settings-group">
                <legend>Appearance</legend>
                {APPEARANCE.map((entry) => (
                    <label key={entry.id} className="settings-choice">
                        <input
                            type="radio"
                            name="appearance"
                            value={entry.id}
                            checked={chosen === entry.id}
                            onChange={() => onTheme(entry.id === 'system' ? null : entry.id)}
                        />
                        <span>
                            {entry.label}
                            <span className="muted settings-hint"> · {entry.hint}</span>
                        </span>
                    </label>
                ))}
            </fieldset>
            <p className="muted settings-note">Saved on this device only.</p>
        </dialog>
    );
}
