import { useEffect, useRef } from 'react';
import {
    leftoverKey,
    type UpgradeLeftover,
    type UpgradeNote,
    type UpgradeOutcome,
    type UpgradePlan,
    type UpgradeStoreKind,
} from '../lib/upgrade';

/**
 * "Upgrade old songs" (#1738) as the songbook home shows it. Counts and copy only; the shell owns
 * the plan, the backup and the run (`app/ensemble.tsx`, `app/use-upgrade.ts`, `lib/upgrade.ts`).
 * It is on the page while ANYTHING old is stored on this device — upgradable or not — so its
 * absence means there is nothing old left here.
 */
export interface UpgradeOffer {
    /** `idle` offers the upgrade; `backup` is the step before it; `done` shows the outcome. */
    phase: 'idle' | 'backup' | 'running' | 'done';
    /** Songs still in the old format, here. */
    songs: number;
    /** Old-format drafts on songs here — dead ones to rewrite, live ones to leave. */
    drafts: number;
    /** What the upgrade cannot fix; `removable` once a backup file holds it, byte for byte. */
    leftovers: Array<{ leftover: UpgradeLeftover; removable: boolean }>;
    /** Songbooks that could not be read at all. */
    failures: UpgradePlan['failures'];
    /** Signed in: the account's songs upload as each is upgraded. */
    account: boolean;
    /** The backup file was written in this backup step. */
    backedUp: boolean;
    progress: { done: number; total: number } | null;
    outcome: UpgradeOutcome | null;
    /** What the last removal or retry did. */
    notice: string;
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

function Notes({ notes }: { notes: readonly UpgradeNote[] }) {
    return (
        <ul>
            {keyed(notes, noteKey).map(([key, note]) => (
                <li key={key}>
                    {where(note)}
                    {note.message}
                </li>
            ))}
        </ul>
    );
}

const songbookName = (store: UpgradeStoreKind) => (store === 'account' ? 'account' : 'guest');

export function UpgradeCard({
    offer,
    busy,
    onStart,
    onBackup,
    onRun,
    onCancel,
    onOpen,
    onDone,
    onDownloadLeftovers,
    onRemove,
    onRetry,
}: {
    offer: UpgradeOffer;
    busy: boolean;
    onStart: () => void;
    onBackup: () => void;
    onRun: () => void;
    onCancel: () => void;
    onOpen: (id: string, sectionIndex?: number) => void;
    onDone: () => void;
    onDownloadLeftovers: () => void;
    onRemove: (leftover: UpgradeLeftover) => void;
    onRetry: () => void;
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
    const upgradable = offer.songs + offer.drafts;
    const count = upgradable + offer.leftovers.length + offer.failures.length;
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
                (in this device’s {songbookName(store)} songbook: switch to it to open it)
            </span>
        );
    const headingText =
        offer.phase === 'backup'
            ? 'First, a backup'
            : offer.phase === 'running'
              ? 'Upgrading old songs…'
              : offer.phase === 'done' && count === 0
                ? outcome?.upgraded.length
                    ? `Upgraded ${plural(outcome.upgraded.length, 'song')}`
                    : 'Nothing old is left here'
                : upgradable > 0
                  ? offer.phase === 'done'
                      ? `${plural(count, 'item')} left in the old format — open each to fix`
                      : `Upgrade old songs (${count})`
                  : `${plural(count, 'old item')} here the upgrade can’t fix`;
    const pendingDownload = offer.leftovers.some(
        ({ leftover, removable }) => !removable && !leftover.serverHeld,
    );
    const leftoverList = offer.leftovers.length > 0 && (
        <div data-testid="upgrade-leftovers">
            <h3>Can’t be upgraded here</h3>
            <p>
                Each is left exactly as it is. Remove one only once it is in a backup file; nothing
                is removed unless you press Remove.
            </p>
            {pendingDownload && (
                <div className="import-actions">
                    <button className="btn" disabled={busy} onClick={onDownloadLeftovers}>
                        Download these first
                    </button>
                </div>
            )}
            <ul className="import-problems">
                {keyed(offer.leftovers, ({ leftover }) => leftoverKey(leftover)).map(
                    ([key, { leftover, removable }]) => (
                        <li key={key} data-leftover={leftoverKey(leftover)}>
                            <strong>{leftover.title}</strong>{' '}
                            {leftover.kind === 'draft' ? '(unsaved draft' : '(song'}
                            {leftover.title === leftover.id ? '' : ` ${leftover.id}`},{' '}
                            {songbookName(leftover.store)} songbook) — {leftover.reason}
                            {leftover.reasons && <Notes notes={leftover.reasons} />}{' '}
                            {leftover.serverHeld ? (
                                <span>
                                    Your account holds it on the server, so removing it here would
                                    not remove it.
                                </span>
                            ) : (
                                removable && (
                                    <button
                                        className="btn"
                                        disabled={busy}
                                        aria-label={`Remove ${leftover.title} — it’s in your backup`}
                                        onClick={() => onRemove(leftover)}
                                    >
                                        Remove — it’s in your backup
                                    </button>
                                )
                            )}
                        </li>
                    ),
                )}
            </ul>
        </div>
    );
    const failureList = offer.failures.map((failure) => (
        <p key={failure.store} className="library-notice" role="alert">
            {`Couldn’t read the ${songbookName(failure.store)} songbook: ${failure.message}`}{' '}
            <button className="btn" disabled={busy} onClick={onRetry}>
                Try again
            </button>
        </p>
    ));
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
            {offer.phase === 'idle' && upgradable > 0 && (
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
                        with the same last-edited date, saved as a new version
                        {offer.account ? ' and uploaded to your account' : ''}. A song that can’t be
                        converted, or has unsaved changes, is left exactly as it is and listed.
                        Nothing is deleted. You’re offered a backup file first.
                    </p>
                    <p>
                        <strong>Close Ensemble in other tabs first.</strong>
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
                        {offer.backedUp
                            ? 'Check the backup file is in your downloads before going on: it is the only copy of these songs as they are now.'
                            : `One file, before anything is touched: an archive of the ${plural(offer.songs, 'song')}${offer.drafts ? ` and ${plural(offer.drafts, 'unsaved draft')}` : ''} this will change, and of what it can’t, each exactly as stored now. It is readable JSON. Only what the file holds is upgraded; anything changed after it is left alone.`}
                    </p>
                    <div className="import-actions">
                        {offer.backedUp ? (
                            <button className="btn primary" disabled={busy} onClick={onRun}>
                                I have the file — upgrade now
                            </button>
                        ) : (
                            <>
                                <button className="btn primary" disabled={busy} onClick={onBackup}>
                                    Download backup
                                </button>
                                <button className="btn" disabled={busy} onClick={onRun}>
                                    Upgrade without a backup
                                </button>
                            </>
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
                    : offer.notice}
            </p>
            {offer.phase === 'done' && outcome && (
                <>
                    {outcome.upgraded.length > 0 && count > 0 && (
                        <p data-testid="upgrade-done-count">{`Upgraded ${plural(outcome.upgraded.length, 'song')}.`}</p>
                    )}
                    {outcome.changed.length > 0 && (
                        <div data-testid="upgrade-changed">
                            <h3>Upgraded with changes</h3>
                            <ul className="import-problems">
                                {keyed(
                                    outcome.changed,
                                    (entry) => `${entry.store}:${entry.id}:${entry.draft}`,
                                ).map(([key, entry]) => (
                                    <li key={key}>
                                        <strong>{entry.title}</strong>
                                        {entry.draft ? ' (unsaved draft)' : ''}
                                        <Notes notes={entry.notes} />
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
                                        <Notes notes={entry.reasons} />
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
                    {(outcome.draftsConverted > 0 || outcome.draftsKept.length > 0) && (
                        <div data-testid="upgrade-drafts">
                            {outcome.draftsConverted > 0 && (
                                <p>{`${plural(outcome.draftsConverted, 'old unsaved draft')} converted in place.`}</p>
                            )}
                            {outcome.draftsKept.length > 0 && (
                                <ul className="import-problems">
                                    {keyed(
                                        outcome.draftsKept,
                                        (entry) => `${entry.store}:${entry.id}:${entry.reason}`,
                                    ).map(([key, entry]) => (
                                        <li key={key}>
                                            <strong>{entry.title}</strong> (unsaved draft) —{' '}
                                            {entry.reason}{' '}
                                            {entry.openable &&
                                                openButton(entry.store, entry.id, entry.title)}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                </>
            )}
            {offer.phase !== 'backup' && offer.phase !== 'running' && (
                <>
                    {failureList}
                    {leftoverList}
                </>
            )}
            {offer.phase === 'done' && (
                <div className="import-actions">
                    {count > 0 ? (
                        upgradable > 0 && (
                            <button className="btn" disabled={busy} onClick={onStart}>
                                Upgrade again…
                            </button>
                        )
                    ) : (
                        <button className="btn" disabled={busy} onClick={onDone}>
                            Done
                        </button>
                    )}
                </div>
            )}
        </section>
    );
}
