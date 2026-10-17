import { useEffect, useRef, useState } from 'react';
import { framePace } from '../lib/playlist-import';
import {
    leftoverKey,
    planUpgrade,
    runUpgrade,
    type UpgradeLeftover,
    type UpgradeOutcome,
    type UpgradePace,
    type UpgradePlan,
    UpgradeScanCancelled,
    type UpgradeStore,
    type UpgradeStoreKind,
    upgradeBackup,
    upgradeCount,
} from '../lib/upgrade';
import type { UpgradeCard, UpgradeOffer } from './upgrade-card';

export interface UpgradeDeps {
    /** The songbook home is on screen and knows which library it is. */
    active: boolean;
    signedIn: boolean;
    /** The stores to read and upgrade, built fresh per call (`lib/upgrade-stores.ts`). */
    stores: (pace?: UpgradePace) => UpgradeStore[];
    /**
     * What makes a fresh scan worth its read: which stores there are, and their song counts. The
     * scan is LATCHED on it — coming back to the home with the same key does not read again — and
     * not on every Save: a scan reads and validates every song, and the home reads only what it
     * shows (#1441). A song that becomes old-format some other way waits for the next key or a
     * reload; pressing Upgrade always re-reads.
     */
    scanKey: string;
    /** Unsaved text this TAB holds for a song that no store has yet. */
    unsavedHere: (store: UpgradeStoreKind, documentId: string) => boolean;
    /** The shell's one-action lock (`run`), so the upgrade never overlaps another action. */
    run: (task: () => Promise<void>) => Promise<void>;
    /** After a run: send the account's queue once, re-read the songbooks. */
    afterRun: (outcome: UpgradeOutcome) => Promise<void>;
    /** Open one song in its editor, on the section a refusal names. */
    open: (documentId: string, sectionIndex?: number) => void;
}

/** Write one file to this device, from inside the click that asked for it. */
function download(name: string, text: string) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * `framePace`, stopped: a scan that a newer one has superseded throws out of its next yield
 * instead of reading the rest of the songbook for nothing.
 */
function cancellablePace(signal: AbortSignal): UpgradePace {
    const pace = framePace();
    const check = () => {
        if (signal.aborted) {
            throw new UpgradeScanCancelled();
        }
    };
    return {
        shouldYield: () => signal.aborted || pace.shouldYield(),
        yieldNow: async () => {
            check();
            await pace.yieldNow();
            check();
        },
    };
}

const REMOVAL_MESSAGES = {
    removed: 'Removed.',
    changed: 'It changed since your backup, so it was left as it is.',
    gone: 'It was already gone.',
    live: 'It is unsaved work on a song here now, so it was left as it is. Open the song instead.',
    held: 'Your account holds it on the server, so removing it here would not remove it. It was left as it is.',
} as const;

/**
 * "Upgrade old songs" (#1738): the card's state and its steps — offer, backup, run, outcome —
 * and the musician's own removal of what the upgrade cannot fix. The shell supplies the stores
 * and its own lock; everything that decides what is written is `lib/upgrade.ts`.
 */
export function useUpgrade(deps: UpgradeDeps): {
    offer: UpgradeOffer | null;
    /** The latest scan has landed — published for checks that assert the card did not appear. */
    settled: boolean;
    actions: Omit<Parameters<typeof UpgradeCard>[0], 'offer' | 'busy'>;
} {
    const latest = useRef(deps);
    latest.current = deps;
    const [plan, setPlan] = useState<UpgradePlan | null>(null);
    const [phase, setPhase] = useState<UpgradeOffer['phase']>('idle');
    // The plan a backup file was written from — exactly what the run then touches — and the scan
    // key the backup step was opened under.
    const [backup, setBackup] = useState<{ plan: UpgradePlan } | null>(null);
    const [backupKey, setBackupKey] = useState<string | null>(null);
    // Leftovers a backup file holds, by identity, with the exact bytes it holds them as: Remove is
    // offered only for these, and only while the row still holds those bytes.
    const [inBackup, setInBackup] = useState<ReadonlyMap<string, string>>(new Map());
    const [progress, setProgress] = useState<UpgradeOffer['progress']>(null);
    const [outcome, setOutcome] = useState<UpgradeOutcome | null>(null);
    const [notice, setNotice] = useState('');
    // The key the plan on screen was read for: the same key is not read again.
    const [scannedKey, setScannedKey] = useState<string | null>(null);

    useEffect(() => {
        if (!deps.active || phase !== 'idle' || scannedKey === deps.scanKey) {
            return;
        }
        const key = deps.scanKey;
        const control = new AbortController();
        // Paced: it runs behind the home page and must not freeze it. Superseded, it stops.
        planUpgrade(
            latest.current.stores(cancellablePace(control.signal)),
            cancellablePace(control.signal),
        ).then(
            (next) => {
                if (!control.signal.aborted) {
                    setPlan(next);
                    setScannedKey(key);
                }
            },
            () => {
                // A superseded scan is simply over; a failed one shows no card until the next key.
                if (!control.signal.aborted) {
                    setScannedKey(key);
                }
            },
        );
        return () => control.abort();
    }, [deps.active, deps.scanKey, phase, scannedKey]);

    // A backup step is for the songbook as the backup read it: opening a song, or the songbooks
    // changing under the step, ends it — the file on disk then speaks for a plan no run will use.
    useEffect(() => {
        if (phase === 'backup' && (!deps.active || deps.scanKey !== backupKey)) {
            setBackup(null);
            setPhase('idle');
        }
    }, [phase, deps.active, deps.scanKey, backupKey]);

    const rescan = async () => {
        setPlan(await planUpgrade(latest.current.stores()));
        setScannedKey(latest.current.scanKey);
    };

    // Only a leftover with bytes, held in a backup file as exactly those bytes. A row with none
    // (`raw` null) is never removable: nothing on disk could say what was removed.
    const heldInBackup = (leftover: UpgradeLeftover) => {
        const key = leftoverKey(leftover);
        return (
            typeof leftover.raw === 'string' &&
            inBackup.has(key) &&
            inBackup.get(key) === leftover.raw
        );
    };

    const count = plan ? upgradeCount(plan) : 0;
    const offer: UpgradeOffer | null =
        phase === 'idle' && count === 0
            ? null
            : {
                  phase,
                  songs: plan?.songs.length ?? 0,
                  drafts: plan?.drafts.length ?? 0,
                  leftovers: (plan?.leftovers ?? []).map((leftover) => ({
                      leftover,
                      removable: !leftover.serverHeld && heldInBackup(leftover),
                  })),
                  failures: plan?.failures ?? [],
                  account: deps.signedIn,
                  backedUp: backup !== null,
                  progress,
                  outcome,
                  notice,
                  openable: deps.signedIn ? 'account' : 'guest',
              };

    const holdInBackup = (leftovers: readonly UpgradeLeftover[]) =>
        setInBackup((held) => {
            const next = new Map(held);
            for (const leftover of leftovers) {
                if (!leftover.serverHeld && typeof leftover.raw === 'string') {
                    next.set(leftoverKey(leftover), leftover.raw);
                }
            }
            return next;
        });

    return {
        offer,
        settled: scannedKey === deps.scanKey,
        actions: {
            onStart: () =>
                void latest.current.run(async () => {
                    // Fresh, not the card's count: the backup and the run are this plan.
                    const fresh = await planUpgrade(latest.current.stores());
                    setPlan(fresh);
                    setScannedKey(latest.current.scanKey);
                    setBackup(null);
                    setOutcome(null);
                    setNotice('');
                    setBackupKey(latest.current.scanKey);
                    setPhase(fresh.songs.length + fresh.drafts.length ? 'backup' : 'idle');
                }),
            onBackup: () => {
                // ONE file, synchronously inside the click, before anything is touched: exactly
                // what this plan will change, and what it cannot (DECISION 2026-10-16).
                if (!plan) {
                    return;
                }
                const stamp = new Date().toISOString();
                download(
                    `ensemble-pre-upgrade-originals-${stamp.slice(0, 10)}.json`,
                    upgradeBackup(plan, stamp),
                );
                setBackup({ plan });
                holdInBackup(plan.leftovers);
            },
            onRun: () =>
                void latest.current.run(async () => {
                    const backedUp = backup;
                    setPhase('running');
                    setProgress(null);
                    try {
                        // With a backup: exactly the plan the file was written from. Without one:
                        // a plan made now, at the musician's confirm.
                        const target =
                            backedUp?.plan ?? (await planUpgrade(latest.current.stores()));
                        const result = await runUpgrade(latest.current.stores(), target, {
                            backedUp: backedUp !== null,
                            unsavedHere: latest.current.unsavedHere,
                            onProgress: (done, total) => setProgress({ done, total }),
                            yieldNow: () => new Promise((resolve) => setTimeout(resolve, 0)),
                        });
                        setOutcome(result);
                        await latest.current.afterRun(result);
                        await rescan();
                    } finally {
                        setBackup(null);
                        setPhase('done');
                    }
                }),
            onCancel: () => {
                setBackup(null);
                setPhase('idle');
            },
            onDownloadLeftovers: () => {
                if (!plan) {
                    return;
                }
                const stamp = new Date().toISOString();
                download(
                    `ensemble-old-leftovers-${stamp.slice(0, 10)}.json`,
                    upgradeBackup(plan, stamp, true),
                );
                holdInBackup(plan.leftovers);
            },
            onRemove: (leftover) =>
                void latest.current.run(async () => {
                    // Only what a backup file holds, byte for byte — checked here, and again by
                    // the store against the row as it is now.
                    if (leftover.serverHeld || !heldInBackup(leftover)) {
                        throw new Error('Download it first: it is not in a backup file yet.');
                    }
                    const store = latest.current
                        .stores()
                        .find((candidate) => candidate.kind === leftover.store);
                    if (!store) {
                        throw new Error('That songbook is not available right now.');
                    }
                    const result = await store.remove(leftover);
                    setNotice(`${leftover.title}: ${REMOVAL_MESSAGES[result]}`);
                    await rescan();
                }),
            onRetry: () =>
                void latest.current.run(async () => {
                    setNotice('');
                    await rescan();
                }),
            onOpen: (documentId, sectionIndex) => latest.current.open(documentId, sectionIndex),
            onDone: () => {
                setOutcome(null);
                setNotice('');
                setPhase('idle');
            },
        },
    };
}
