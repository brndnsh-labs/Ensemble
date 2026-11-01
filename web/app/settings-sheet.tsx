import type { RefObject } from 'react';
import { INSTRUMENT_ROLES, PLAYER_INSTRUMENTS, type PlayerInstrument } from '../lib/instrument';
import type { Palette, ThemeChoice } from '../lib/session';
import { dialogRule } from './dialog-close';
import './settings-sheet.css';

const APPEARANCE: { id: 'system' | ThemeChoice; label: string; hint: string }[] = [
    { id: 'system', label: 'System', hint: 'Follows this device, light or dark' },
    { id: 'day', label: 'Day', hint: 'Paper white' },
    { id: 'stage', label: 'Stage', hint: 'Dark, for a dim room' },
];

/** The five palettes (#1280), Warm first: it is the default and today's look. */
const PALETTE_CHOICES: { id: Palette; label: string }[] = [
    { id: 'warm', label: 'Warm' },
    { id: 'cool', label: 'Cool' },
    { id: 'contrast', label: 'High contrast' },
    { id: 'forest', label: 'Forest' },
    { id: 'plum', label: 'Plum' },
];

interface SettingsSheetProps {
    /** Owned by the shell, which drives `showModal()`/`close()` from its `settingsOpen` state. */
    dialogRef: RefObject<HTMLDialogElement | null>;
    /** The stored choice; null is System. */
    theme: ThemeChoice | null;
    onTheme: (theme: ThemeChoice | null) => void;
    palette: Palette;
    onPalette: (palette: Palette) => void;
    /** What the musician plays (#1992); null until they have answered. */
    instrument: PlayerInstrument | null;
    onInstrument: (instrument: PlayerInstrument) => void;
    onClose: () => void;
}

/** What each answer does on the stand, said once beside it (#1992). */
const INSTRUMENT_HINTS: Record<PlayerInstrument, string> = {
    'guitar-rhythm': 'Band chords off for you · Neck view',
    'guitar-lead': 'Soloist off for you · Neck view',
    bass: 'Band bass off for you',
    keys: 'Band chords off for you',
    drums: 'Drums off for you',
    'horn-bb': 'Soloist off · chords shown a whole step up',
    'horn-eb': 'Soloist off · chords shown a major sixth up',
    voice: 'Soloist off for you',
    listening: 'Nothing changes',
};

/**
 * Per-device settings (#1783) — never a document field. Appearance is the first section: System
 * hands the theme back to the OS, which the header's Stage quick-toggle cannot (it always sets an
 * explicit Day or Stage). Both read and write the one `useStageTheme` state. Palette (#1280) is
 * the second, `usePalette`'s; each swatch is a scrap of chart in that palette's own tokens
 * (`data-palette` on the swatch), drawn in the current Day or Stage.
 */
export function SettingsSheet({
    dialogRef,
    theme,
    onTheme,
    palette,
    onPalette,
    instrument,
    onInstrument,
    onClose,
}: SettingsSheetProps) {
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
            {/* First: it changes what the band plays, not just how the page looks (#1992). */}
            <fieldset className="settings-group">
                <legend>What do you play?</legend>
                {PLAYER_INSTRUMENTS.map((id) => (
                    <label key={id} className="settings-choice">
                        <input
                            type="radio"
                            name="player-instrument"
                            value={id}
                            checked={instrument === id}
                            onChange={() => onInstrument(id)}
                        />
                        <span>
                            {INSTRUMENT_ROLES[id].label}
                            <span className="muted settings-hint"> · {INSTRUMENT_HINTS[id]}</span>
                        </span>
                    </label>
                ))}
                <p className="muted settings-hint settings-group-note">
                    Your part is muted when a song opens and the band leaves room for it. Turn it on
                    any time for that song.
                </p>
            </fieldset>
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
            <fieldset className="settings-group">
                <legend>Palette</legend>
                {PALETTE_CHOICES.map((entry) => (
                    <label key={entry.id} className="settings-choice">
                        <input
                            type="radio"
                            name="palette"
                            value={entry.id}
                            checked={palette === entry.id}
                            onChange={() => onPalette(entry.id)}
                        />
                        <span className="palette-swatch" data-palette={entry.id} aria-hidden="true">
                            <span className="palette-swatch-chord">C</span>
                            <span className="palette-swatch-accent" />
                        </span>
                        <span>{entry.label}</span>
                    </label>
                ))}
            </fieldset>
            <p className="muted settings-note">Saved on this device only.</p>
        </dialog>
    );
}
