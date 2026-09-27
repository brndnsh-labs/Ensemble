import { useEffect, useRef, useState } from 'react';
import {
    firstBarsPreview,
    STANDARD_SHELF_LABELS,
    STANDARDS,
    type StandardShelf,
} from '../lib/standards';

interface StandardsBrowserProps {
    onBack: () => void;
    onOpen: (id: string) => void;
}

const SHELVES: Array<StandardShelf | 'all'> = ['all', 'blues', 'jazz', 'grooves'];

// cspell:ignore artboard
/**
 * The standards catalog browse surface (#1439) — the "A · Standards" mockup artboard: shelf
 * filter chips, then every entry's title, first bars, genre and tempo, with an Open button that
 * lands it on the stand as an unsaved draft (`app/ensemble.tsx`'s `openStandard`). Read-only:
 * nothing here ever writes storage. Its home-page entry point is the songbook's own aside
 * (`app/songbook.tsx`); the full home-page layout is `#1441`'s to redesign.
 */
export function StandardsBrowser({ onBack, onOpen }: StandardsBrowserProps) {
    const [shelf, setShelf] = useState<StandardShelf | 'all'>('all');
    const entries = STANDARDS.filter((entry) => shelf === 'all' || entry.shelf === shelf);
    const heading = useRef<HTMLHeadingElement>(null);
    // A view switch, not a dialog, but it earns the same courtesy: opening it moves focus onto
    // its own heading (never left behind on whatever button was clicked), and leaving it gives
    // focus back to that button rather than dropping it on `<body>`. `document.activeElement` at
    // mount time is the button that opened this — captured once, restored on unmount.
    useEffect(() => {
        const opener = document.activeElement as HTMLElement | null;
        heading.current?.focus();
        return () => {
            opener?.focus?.();
        };
    }, []);
    return (
        <main className="home standards-browser">
            <div className="home-intro">
                <div>
                    <span className="eyebrow">Read-only, never saved</span>
                    <h1 ref={heading} tabIndex={-1}>
                        Standards.
                    </h1>
                    <p>
                        Blues forms, jazz standards and genre grooves. Opening one puts it on the
                        stand as an unsaved draft — Save keeps your own copy.
                    </p>
                </div>
                <div className="home-actions">
                    <button className="btn" onClick={onBack}>
                        ← Back to songbook
                    </button>
                </div>
            </div>
            <div className="shelf-chips" role="group" aria-label="Filter standards by shelf">
                {SHELVES.map((option) => (
                    <button
                        key={option}
                        className="shelf-chip"
                        aria-pressed={shelf === option}
                        onClick={() => setShelf(option)}
                    >
                        {option === 'all' ? 'All' : STANDARD_SHELF_LABELS[option]}
                    </button>
                ))}
            </div>
            <table className="song-table standards-table">
                <thead>
                    <tr>
                        <th>Title</th>
                        <th className="hide-mobile">First bars</th>
                        <th>Genre</th>
                        <th className="hide-mobile">Tempo</th>
                        <th>
                            <span className="sr">Open</span>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {entries.map((entry) => (
                        <tr className="song-row" key={entry.id}>
                            <td>
                                <span className="song-name">{entry.title}</span>
                                <span className="song-detail">
                                    {entry.key}
                                    {entry.isMinor ? 'm' : ''} ·{' '}
                                    {STANDARD_SHELF_LABELS[entry.shelf]}
                                </span>
                            </td>
                            <td className="hide-mobile standards-preview">
                                {firstBarsPreview(entry)}
                            </td>
                            <td>{entry.genre}</td>
                            <td className="hide-mobile">{entry.bpm}</td>
                            <td>
                                <button
                                    className="btn"
                                    aria-label={`Open ${entry.title}`}
                                    onClick={() => onOpen(entry.id)}
                                >
                                    Open
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </main>
    );
}
