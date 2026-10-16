import { useEffect, useRef, useState } from 'react';
import { framePace } from '../lib/playlist-import';
import {
    planUpgrade,
    runUpgrade,
    type UpgradeOutcome,
    type UpgradePlan,
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
    stores: () => UpgradeStore[];
    /**
     * What makes a fresh scan worth its read: which stores there are, and their song counts. The
     * scan is LATCHED on it — coming back to the home with the same key does not read again — and
     * not on every Save: a scan reads and validates every song, and the home reads only what it
     * shows (#1441). A song that becomes old-format some other way waits for the next key or a
     * reload; a run always re-reads.
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
 * "Upgrade old songs" (#1738): the card's state and its steps — offer, backup, run, outcome.
 * The shell supplies the stores and its own lock; everything that decides what is written is
 * `lib/upgrade.ts`.
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
    const [backedUp, setBackedUp] = useState(false);
    const [progress, setProgress] = useState<UpgradeOffer['progress']>(null);
    const [outcome, setOutcome] = useState<UpgradeOutcome | null>(null);
    // The key the plan on screen was read for: the same key is not read again.
    const [scannedKey, setScannedKey] = useState<string | null>(null);

    useEffect(() => {
        if (!deps.active || phase !== 'idle' || scannedKey === deps.scanKey) {
            return;
        }
        let alive = true;
        const key = deps.scanKey;
        // Paced: it runs behind the home page and must not freeze it.
        planUpgrade(latest.current.stores(), framePace()).then(
            (next) => {
                if (alive) {
                    setPlan(next);
                    setScannedKey(key);
                }
            },
            () => {
                // A failed scan shows no card; the next key asks again.
                if (alive) {
                    setScannedKey(key);
                }
            },
        );
        return () => {
            alive = false;
        };
    }, [deps.active, deps.scanKey, phase, scannedKey]);

    const count = plan ? upgradeCount(plan) : 0;
    const offer: UpgradeOffer | null =
        phase === 'idle' && count === 0
            ? null
            : {
                  phase,
                  songs: plan?.songs.length ?? 0,
                  drafts: plan?.drafts.length ?? 0,
                  unreadable: plan?.unreadable ?? [],
                  failures: plan?.failures ?? [],
                  account: deps.signedIn,
                  backedUp,
                  progress,
                  outcome,
                  openable: deps.signedIn ? 'account' : 'guest',
              };

    const start = () =>
        void latest.current.run(async () => {
            // Fresh, not the card's count: what the backup writes is what the run then finds.
            const fresh = await planUpgrade(latest.current.stores());
            setPlan(fresh);
            setBackedUp(false);
            setOutcome(null);
            setPhase(fresh.songs.length + fresh.drafts.length ? 'backup' : 'idle');
        });

    return {
        offer,
        settled: scannedKey === deps.scanKey,
        actions: {
            onStart: start,
            onBackup: () => {
                // ONE file, synchronously inside the click, before anything is touched: every
                // song and draft this run may change, each as it is stored (DECISION 2026-10-16).
                if (!plan) {
                    return;
                }
                const stamp = new Date().toISOString();
                download(
                    `ensemble-pre-upgrade-originals-${stamp.slice(0, 10)}.json`,
                    upgradeBackup(plan, stamp),
                );
                setBackedUp(true);
            },
            onRun: () =>
                void latest.current.run(async () => {
                    setPhase('running');
                    setProgress(null);
                    try {
                        const result = await runUpgrade(latest.current.stores(), {
                            unsavedHere: latest.current.unsavedHere,
                            onProgress: (done, total) => setProgress({ done, total }),
                            yieldNow: () => new Promise((resolve) => setTimeout(resolve, 0)),
                        });
                        setOutcome(result);
                        await latest.current.afterRun(result);
                        setPlan(await planUpgrade(latest.current.stores()));
                        setScannedKey(latest.current.scanKey);
                    } finally {
                        setBackedUp(false);
                        setPhase('done');
                    }
                }),
            onCancel: () => {
                setBackedUp(false);
                setPhase('idle');
            },
            onOpen: (documentId, sectionIndex) => latest.current.open(documentId, sectionIndex),
            onDone: () => {
                setOutcome(null);
                setPhase('idle');
            },
        },
    };
}
