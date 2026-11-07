import type { RefObject } from 'react';
import { INSTRUMENT_ROLES, PLAYER_INSTRUMENTS, type PlayerInstrument } from '../lib/instrument';
import type { Palette, ThemeChoice } from '../lib/session';
import { SOUND_PACKS } from '../lib/sounds';
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
                    Your part starts muted and the band leaves room for it. Turn it on any time; it
                    stays on for your next songs on this device.
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
            <SoundCredits />
        </dialog>
    );
}

/** Opens off the app: a credit's links are the publisher's pages and the licence deeds. */
const EXTERNAL = { target: '_blank', rel: 'noopener noreferrer' } as const;

/**
 * Sound credits (#2113): every pack in the catalog, downloaded or not, with each recording's
 * work, author, source and licence, and what we changed. All of it is the catalog's `credit`
 * (`core/data/sound-packs.ts`), the same record each pack folder's `CREDITS.txt` carries.
 */
function SoundCredits() {
    return (
        <section className="settings-group" aria-labelledby="sound-credits-title">
            <h3 id="sound-credits-title" className="settings-group-title">
                Sound credits
            </h3>
            <p className="muted settings-hint">
                The recordings behind every sound you can download, whether or not it is on this
                device.
            </p>
            <ul className="sound-credits-list">
                {SOUND_PACKS.map((pack) => (
                    <li key={pack.id} className="sound-credit">
                        <strong>{pack.name}</strong>
                        {pack.credit.sources.map((source) => (
                            <p key={source.work} className="sound-credit-line">
                                {source.work} by {source.author} ·{' '}
                                <a
                                    href={source.source}
                                    aria-label={`Source: ${source.work}`}
                                    {...EXTERNAL}
                                >
                                    Source
                                </a>{' '}
                                ·{' '}
                                <a href={source.license.url} {...EXTERNAL}>
                                    {source.license.name}
                                </a>
                                {source.license.terms && (
                                    <span className="muted"> · {source.license.terms}</span>
                                )}
                            </p>
                        ))}
                        <p className="muted sound-credit-line">Changed: {pack.credit.changes}.</p>
                    </li>
                ))}
            </ul>
        </section>
    );
}
