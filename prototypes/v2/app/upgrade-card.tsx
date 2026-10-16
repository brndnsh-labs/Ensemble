import { useEffect, useRef } from 'react';
import {
    UPGRADE_SKIPS,
    type UpgradeNote,
    type UpgradeOutcome,
    type UpgradeStoreKind,
} from '../lib/upgrade';

/**
 * "Upgrade old songs" (#1738) as the songbook home shows it. Counts and copy only; the shell owns
 * the plan, the backup and the run (`app/ensemble.tsx`, `lib/upgrade.ts`).
 */
export interface UpgradeOffer {
    /** `idle` offers the upgrade; `backup` is the step before it; `done` shows the outcome. */
    phase: 'idle' | 'backup' | 'running' | 'done';
    /** Songs still in the old format, here. */
    songs: number;
    /** Old-format unsaved drafts, here. */
    drafts: number;
    /** Signed in: the account's songs upload as each is upgraded. */
    account: boolean;
    /** How many files the backup wrote, once it has; null before. */
    backedUp: number | null;
    /** How many files the backup would write. */
    backupFiles: number;
    progress: { done: number; total: number } | null;
    outcome: UpgradeOutcome | null;
    /** Which store "Open" can reach: the live songbook's. */
    openable: UpgradeStoreKind;
}

const plural = (count: number, word: string, many = `${word}s`) =>
    `${count} ${count === 1 ? word : many}`;

/** Stable keys for a list whose items can repeat: the content, then which occurrence of it. */
function keyed<T>(items: readonly T[], keyOf: (item: T) => string): Array<[string, T]> {
    const seen = new Map<string, number>();
    return items.map((item) => {
        const base = keyOf(item);
        const count = seen.get(base) ?? 0;
        seen.set(base, count + 1);
        return [`${base}#${count}`, item];
    });
}

const noteKey = (note: UpgradeNote) => `${note.sectionIndex}:${note.bar}:${note.message}`;

function where(note: UpgradeNote): string {
    const parts = [
        note.bar !== undefined ? `bar ${note.bar}` : null,
        note.section ? `section ${note.section}` : null,
    ].filter(Boolean);
    const place = parts.length ? `${parts.join(', ')}` : '';
    const text = note.text ? ` “${note.text}”` : '';
    return place || text ? `${place}${text}: ` : '';
}

export function UpgradeCard({
    offer,
    busy,
    onStart,
    onBackup,
    onRun,
    onCancel,
    onOpen,
    onDone,
}: {
    offer: UpgradeOffer;
    busy: boolean;
    onStart: () => void;
    onBackup: () => void;
    onRun: () => void;
    onCancel: () => void;
    onOpen: (id: string, sectionIndex?: number) => void;
    onDone: () => void;
}) {
    const heading = useRef<HTMLHeadingElement>(null);
    const phase = useRef(offer.phase);
    useEffect(() => {
        // The heading, as the v1 import card does: where someone lands to read what happened.
        if (phase.current !== offer.phase && offer.phase !== 'running') {
            heading.current?.focus();
        }
        phase.current = offer.phase;
    }, [offer.phase]);
    const count = offer.songs + offer.drafts;
    const { outcome } = offer;
    const openButton = (store: UpgradeStoreKind, id: string, label: string, section?: number) =>
        store === offer.openable ? (
            <button
                className="btn"
                disabled={busy}
                aria-label={`Open ${label}`}
                onClick={() => onOpen(id, section)}
            >
                Open
            </button>
        ) : (
            <span className="upgrade-elsewhere">
                {' '}
                (in this device’s guest songbook: sign out to open it)
            </span>
        );
    const headingText =
        offer.phase === 'done'
            ? outcome?.upgraded.length
                ? `Upgraded ${plural(outcome.upgraded.length, 'song')}`
                : 'Nothing was upgraded'
            : offer.phase === 'backup'
              ? 'First, a backup'
              : offer.phase === 'running'
                ? 'Upgrading old songs…'
                : `Upgrade old songs (${count})`;
    return (
        <section
            className="home-card import-card upgrade-card"
            data-testid="upgrade-old-songs"
            data-phase={offer.phase}
            aria-labelledby="upgrade-heading"
        >
            <span className="eyebrow">Old-format songs</span>
            <h2 id="upgrade-heading" ref={heading} tabIndex={-1}>
                {headingText}
            </h2>
            {offer.phase === 'idle' && (
                <>
                    <p>
                        {offer.songs > 0
                            ? `${plural(offer.songs, 'song')} here ${offer.songs === 1 ? 'is' : 'are'} saved in the old format`
                            : 'No songs here are in the old format'}
                        {offer.drafts > 0
                            ? `, ${offer.songs > 0 ? 'and ' : 'but '}${plural(offer.drafts, 'unsaved draft')} ${offer.drafts === 1 ? 'is' : 'are'}`
                            : ''}
                        .
                    </p>
                    <p>
                        Upgrading rewrites each one in place as a bar-by-bar chart: the same song,
                        saved as a new version
                        {offer.account ? ' and uploaded to your account' : ''}. A song that can’t be
                        converted, or has unsaved changes, is left exactly as it is and listed.
                        You’re offered a backup first.
                    </p>
                    <div className="import-actions">
                        <button className="btn primary" disabled={busy} onClick={onStart}>
                            Upgrade old songs…
                        </button>
                    </div>
                </>
            )}
            {offer.phase === 'backup' && (
                <>
                    <p>
                        {offer.backedUp === null
                            ? `Download every song in ${offer.account ? 'these songbooks' : 'this songbook'}, and the old drafts, as ${plural(offer.backupFiles, 'file')} on this device, as they are now — before anything is rewritten.`
                            : `Downloaded ${plural(offer.backedUp, 'file')}. Check they’re in your downloads, then upgrade.`}
                    </p>
                    <div className="import-actions">
                        {offer.backedUp === null ? (
                            <>
                                <button className="btn primary" disabled={busy} onClick={onBackup}>
                                    Download backup
                                </button>
                                <button className="btn" disabled={busy} onClick={onRun}>
                                    Upgrade without a backup
                                </button>
                            </>
                        ) : (
                            <button className="btn primary" disabled={busy} onClick={onRun}>
                                Upgrade now
                            </button>
                        )}
                        <button className="btn" disabled={busy} onClick={onCancel}>
                            Cancel
                        </button>
                    </div>
                </>
            )}
            <p className="import-result" role="status" data-testid="upgrade-progress">
                {offer.phase === 'running' && offer.progress
                    ? `Upgraded ${offer.progress.done} of ${offer.progress.total}`
                    : ''}
            </p>
            {offer.phase === 'done' && outcome && (
                <>
                    {outcome.failures.map((failure) => (
                        <p key={failure.store} className="library-notice">
                            {`Couldn’t read the ${failure.store === 'account' ? 'account' : 'guest'} songbook: ${failure.message}`}
                        </p>
                    ))}
                    {outcome.changed.length > 0 && (
                        <div data-testid="upgrade-changed">
                            <h3>Upgraded with changes</h3>
                            <ul className="import-problems">
                                {outcome.changed.map((entry) => (
                                    <li key={`${entry.store}:${entry.id}`}>
                                        <strong>{entry.title}</strong>
                                        <ul>
                                            {keyed(entry.notes, noteKey).map(([key, note]) => (
                                                <li key={key}>
                                                    {where(note)}
                                                    {note.message}
                                                </li>
                                            ))}
                                        </ul>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {outcome.refused.length > 0 && (
                        <div data-testid="upgrade-refused">
                            <h3>Couldn’t be upgraded — fix the chart, then upgrade again</h3>
                            <ul className="import-problems">
                                {outcome.refused.map((entry) => (
                                    <li key={`${entry.store}:${entry.id}`}>
                                        <strong>{entry.title}</strong>{' '}
                                        {openButton(
                                            entry.store,
                                            entry.id,
                                            entry.title,
                                            entry.reasons.find(
                                                (reason) => reason.sectionIndex !== undefined,
                                            )?.sectionIndex,
                                        )}
                                        <ul>
                                            {keyed(entry.reasons, noteKey).map(([key, reason]) => (
                                                <li key={key}>
                                                    {where(reason)}
                                                    {reason.message}
                                                </li>
                                            ))}
                                        </ul>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {outcome.skipped.length > 0 && (
                        <div data-testid="upgrade-skipped">
                            <h3>Left as they are</h3>
                            <ul className="import-problems">
                                {outcome.skipped.map((entry) => (
                                    <li key={`${entry.store}:${entry.id}`}>
                                        <strong>{entry.title}</strong> — {entry.reason}{' '}
                                        {openButton(entry.store, entry.id, entry.title)}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {(outcome.draftsConverted > 0 ||
                        outcome.draftsRetired > 0 ||
                        outcome.draftsKept.length > 0) && (
                        <div data-testid="upgrade-drafts">
                            <p>
                                {[
                                    outcome.draftsConverted
                                        ? `${plural(outcome.draftsConverted, 'old draft')} converted`
                                        : null,
                                    outcome.draftsRetired
                                        ? `${plural(outcome.draftsRetired, 'old draft')} that couldn’t be converted removed (they’re in your backup)`
                                        : null,
                                ]
                                    .filter(Boolean)
                                    .join('; ')}
                            </p>
                            {outcome.draftsKept.length > 0 && (
                                <ul className="import-problems">
                                    {keyed(
                                        outcome.draftsKept,
                                        (entry) => `${entry.store}:${entry.id}:${entry.reason}`,
                                    ).map(([key, entry]) => (
                                        <li key={key}>
                                            <strong>{entry.title}</strong> (draft) — {entry.reason}
                                            {entry.reason === UPGRADE_SKIPS.draftLive && (
                                                <>
                                                    {' '}
                                                    {openButton(entry.store, entry.id, entry.title)}
                                                </>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                    {count > 0 && (
                        <p data-testid="upgrade-remaining">
                            {`${plural(count, 'item')} still in the old format.`}
                        </p>
                    )}
                    <div className="import-actions">
                        <button className="btn" disabled={busy} onClick={onDone}>
                            Done
                        </button>
                    </div>
                </>
            )}
        </section>
    );
}
