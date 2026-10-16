import { useEffect, useRef, useState } from 'react';
import type { ChartDocument } from '../lib/documents';
import { framePace } from '../lib/playlist-import';
import {
    draftBackupKey,
    planUpgrade,
    runUpgrade,
    songBackupKey,
    type UpgradeBackup,
    type UpgradeOutcome,
    type UpgradePlan,
    type UpgradeStore,
    type UpgradeStoreKind,
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
     * What makes a fresh scan worth its read: which stores there are, and their song counts. Not
     * every Save — a scan reads and validates every song, and the home reads only what it shows
     * (#1441). A song that becomes old-format some other way waits for the next of these, or a
     * reload; the run itself always re-reads.
     */
    scanKey: string;
    /** Unsaved text this TAB holds for a song that no store has yet. */
    unsavedHere: (store: UpgradeStoreKind, documentId: string) => boolean;
    /** The shell's one-action lock (`run`), so the upgrade never overlaps another action. */
    run: (task: () => Promise<void>) => Promise<void>;
    /** The app's own export of one chart to a file (`exportDocument`). */
    exportDocument: (document: ChartDocument) => void;
    /** After a run: send the account's queue once, re-read the songbooks. */
    afterRun: (outcome: UpgradeOutcome) => Promise<void>;
    /** Open one song in its editor, on the section a refusal names. */
    open: (documentId: string, sectionIndex?: number) => void;
}

/**
 * "Upgrade old songs" (#1738): the card's state and its four steps — offer, backup, run, outcome.
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
    const [backup, setBackup] = useState<UpgradeBackup | null>(null);
    const [backedUp, setBackedUp] = useState<number | null>(null);
    const [progress, setProgress] = useState<UpgradeOffer['progress']>(null);
    const [outcome, setOutcome] = useState<UpgradeOutcome | null>(null);
    const [settled, setSettled] = useState(false);

    // biome-ignore lint/correctness/useExhaustiveDependencies: `scanKey` is the re-scan trigger.
    useEffect(() => {
        if (!deps.active || phase !== 'idle') {
            return;
        }
        let alive = true;
        setSettled(false);
        // Paced: it runs behind the home page and must not freeze it.
        planUpgrade(latest.current.stores(), framePace()).then(
            (next) => {
                if (alive) {
                    setPlan(next);
                    setSettled(true);
                }
            },
            () => {
                // A failed scan shows no card; the next trigger asks again.
                if (alive) {
                    setSettled(true);
                }
            },
        );
        return () => {
            alive = false;
        };
    }, [deps.active, deps.scanKey, phase]);

    const count = plan ? upgradeCount(plan) : 0;
    const offer: UpgradeOffer | null =
        phase === 'idle' && count === 0
            ? null
            : {
                  phase,
                  songs: plan?.songs.length ?? 0,
                  drafts: plan?.drafts.length ?? 0,
                  account: deps.signedIn,
                  backedUp,
                  backupFiles: (plan?.all.length ?? 0) + (plan?.drafts.length ?? 0),
                  progress,
                  outcome,
                  openable: deps.signedIn ? 'account' : 'guest',
              };

    return {
        offer,
        settled,
        actions: {
            onStart: () =>
                void latest.current.run(async () => {
                    // Fresh, not the card's count: what the backup writes and the run checks.
                    const fresh = await planUpgrade(latest.current.stores());
                    setPlan(fresh);
                    setBackup(null);
                    setBackedUp(null);
                    setOutcome(null);
                    setPhase(upgradeCount(fresh) ? 'backup' : 'idle');
                }),
            onBackup: () => {
                // Synchronous, inside the click: an await between two downloads is how a browser
                // starts dropping the later ones. Only what was written counts as backed up.
                if (!plan) {
                    return;
                }
                const songs = new Set<string>();
                const drafts = new Set<string>();
                for (const { store, document } of plan.all) {
                    try {
                        latest.current.exportDocument(document);
                        songs.add(songBackupKey(store, document));
                    } catch {
                        /* Not in the backup, so the run leaves it alone. */
                    }
                }
                for (const { store, draft, title } of plan.drafts) {
                    try {
                        latest.current.exportDocument({
                            ...draft.document,
                            title: `${title.slice(0, 120)} — unsaved draft`,
                        });
                        drafts.add(draftBackupKey(store, draft));
                    } catch {
                        /* Not in the backup, so it is never retired. */
                    }
                }
                setBackup({ songs, drafts });
                setBackedUp(songs.size + drafts.size);
            },
            onRun: () =>
                void latest.current.run(async () => {
                    setPhase('running');
                    setProgress(null);
                    try {
                        const result = await runUpgrade(latest.current.stores(), {
                            backup,
                            unsavedHere: latest.current.unsavedHere,
                            onProgress: (done, total) => setProgress({ done, total }),
                            yieldNow: () => new Promise((resolve) => setTimeout(resolve, 0)),
                        });
                        setOutcome(result);
                        await latest.current.afterRun(result);
                        setPlan(await planUpgrade(latest.current.stores()));
                    } finally {
                        setBackup(null);
                        setPhase('done');
                    }
                }),
            onCancel: () => {
                setBackup(null);
                setBackedUp(null);
                setPhase('idle');
            },
            onOpen: (documentId, sectionIndex) => latest.current.open(documentId, sectionIndex),
            onDone: () => {
                setOutcome(null);
                setBackedUp(null);
                setPhase('idle');
            },
        },
    };
}
