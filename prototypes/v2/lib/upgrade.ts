/**
 * "Upgrade old songs" (#1738): the one explicit action that rewrites stored songs into the current
 * format, so the schema-1 readers and the legacy band/performance fields can be deleted once
 * nothing stored uses them (DECISION 2026-10-16 in `docs/design/ensemble-v2-charts.md`).
 *
 * Two halves. The pure half says what a stored document would become (`needsUpgrade`,
 * `upgradeDocument`, `upgradeDraftDocument`). The run (`planUpgrade`, `runUpgrade`) walks a
 * songbook through its OWN ordinary write paths — the guest repository's `save`, the account
 * songbook's Save that queues an outbox operation — handed in as an `UpgradeStore`, so this file
 * has no storage of its own and no second way to write a song.
 *
 * The run's safety rules, each a test in `upgrade.test.ts`:
 * - Same id, a new revision, the SAME `updatedAt`: an upgrade is not an edit, so the songbook's
 *   order and "last edited" stay put. Each song is one store Save against the revision it was
 *   read at, so a song changed in the meantime is a refused compare-and-swap, reported.
 * - Never over unsaved work: a song with a LIVE draft (captured at or after its committed version,
 *   `liveDraft`'s rule), or with unsaved text in this tab, is skipped; the store re-checks that at
 *   write time. A draft is never deleted, and a live one — an orphan, or one whose song row does
 *   not read, counts as live — is never rewritten.
 * - Never through a stuck queue: the account Save refuses, inside its own transaction, a song whose
 *   outbox head is conflicted or refused, with an account version waiting, or with a frozen delete.
 * - Each document is one transaction, so an interrupted run leaves every song wholly old or wholly
 *   new, and the next run (which re-reads everything) finishes the rest. A second run is a no-op.
 */
import { writtenChart } from '@engine/songbook/codec';
import { type ConversionNote, proposeLegacyScoreConversion } from '@engine/songbook/legacy-score';
import type { CodecIssue } from '@engine/songbook/types';
import { type ChartDocument, validateDocument, withFollowFeel } from './documents';

/** One reason or change, about one bar where the converter could say which. */
export interface UpgradeNote {
    /** The section's label as written, when the note is about a section or bar. */
    section?: string;
    /** The section's position among the chart's sections (0-based), for opening it. */
    sectionIndex?: number;
    /** The bar's number within its section, from 1, as the sheet shows it. */
    bar?: number;
    /** The bar's text as written. */
    text?: string;
    message: string;
}

export type DocumentUpgrade =
    | { kind: 'current' }
    | { kind: 'upgraded'; document: ChartDocument; changes: UpgradeNote[] }
    | { kind: 'refused'; reasons: UpgradeNote[] };

/**
 * JSON with every object's keys sorted, `undefined` members dropped: "the same bytes as the
 * current writer would write" is a question about content, not about the key order a build
 * happened to construct an object in.
 */
function canonical(value: unknown): string {
    return JSON.stringify(value, (_key, member: unknown) => {
        if (member && typeof member === 'object' && !Array.isArray(member)) {
            const record = member as Record<string, unknown>;
            return Object.fromEntries(
                Object.keys(record)
                    .sort()
                    .map((key) => [key, record[key]]),
            );
        }
        return member;
    });
}

/** A document as the current writer would store it: Follow feel applied, legacy fields gone. */
function asWrittenToday<T extends ChartDocument>(document: T, writtenAt?: string): T {
    const followed = withFollowFeel(document, writtenAt ?? document.updatedAt);
    return { ...followed, chart: writtenChart(followed.chart) };
}

function isCollection(document: unknown): boolean {
    return (
        typeof document === 'object' &&
        document !== null &&
        typeof (document as { kind?: unknown }).kind === 'string'
    );
}

/**
 * Does this stored document need upgrading? A schema-1 (text) chart always does. A schema-2 one
 * does when its stored content differs from what today's writer would store: a legacy
 * band/performance field (`LEGACY_CHART_PATHS` in `prototypes/v2-api/src/db/admin-overview.ts`),
 * a groove with no `genre`, or an old built-in sound pin `withFollowFeel` would move. A collection
 * (`kind` set) never does.
 */
export function needsUpgrade(document: ChartDocument): boolean {
    if (isCollection(document)) {
        return false;
    }
    if (document.schemaVersion === 1) {
        return true;
    }
    return canonical(asWrittenToday(document)) !== canonical(document);
}

function noteOf(issue: CodecIssue | ConversionNote): UpgradeNote {
    const index = /\.sections\[(\d+)\]/.exec(issue.path);
    const note = issue as Partial<ConversionNote>;
    return {
        ...(note.section !== undefined ? { section: note.section } : {}),
        ...(index ? { sectionIndex: Number(index[1]) } : {}),
        ...(note.bar !== undefined ? { bar: note.bar } : {}),
        ...(note.text !== undefined ? { text: note.text } : {}),
        message: issue.message,
    };
}

/**
 * The upgraded document must itself be current, or a second run would rewrite it again. Checked
 * as it will be stored — restamped now, past `FOLLOW_FEEL_SINCE` — and through the full validator.
 */
/**
 * The upgraded document must itself be current, or a second run would rewrite it again. Checked
 * as it will be stored — with its own `updatedAt`, which the upgrade keeps — through the full
 * validator.
 */
function settles(document: ChartDocument, updatedAt: string): boolean {
    try {
        const stored = validateDocument({ ...document, updatedAt });
        return stored.schemaVersion === 2 && !needsUpgrade(stored);
    } catch {
        return false;
    }
}

const UNSETTLED: UpgradeNote = {
    message: 'The upgraded chart did not come out in the current format, so it was left as it is.',
};

function lossy(notes: readonly ConversionNote[]): UpgradeNote[] {
    return notes.filter((note) => note.code === 'tones-dropped').map(noteOf);
}

/**
 * What one stored song becomes. A text chart goes through `proposeLegacyScoreConversion` (#1737),
 * which converts what v1 played or refuses with a reason per bar; every upgraded document is then
 * written as today's writer writes it (`writtenChart`, `withFollowFeel` against the song's own
 * `updatedAt`). `changes` are the converter's `tones-dropped` notes: upgraded, but not tone for
 * tone. Same id and the same `updatedAt` — an upgrade is not an edit (DECISION 2026-10-16); the
 * revision is the Save's to advance.
 */
export function upgradeDocument(document: ChartDocument): DocumentUpgrade {
    if (!needsUpgrade(document)) {
        return { kind: 'current' };
    }
    if (document.schemaVersion === 2) {
        const next = { ...asWrittenToday(document), updatedAt: document.updatedAt };
        return settles(next, document.updatedAt)
            ? { kind: 'upgraded', document: next, changes: [] }
            : { kind: 'refused', reasons: [UNSETTLED] };
    }
    const proposal = proposeLegacyScoreConversion(JSON.stringify(document));
    if (proposal.kind === 'blocked') {
        return {
            kind: 'refused',
            reasons: proposal.issues.length
                ? proposal.issues.map(noteOf)
                : [{ message: 'The chart could not be converted.' }],
        };
    }
    const next = {
        ...asWrittenToday(proposal.value, document.updatedAt),
        updatedAt: document.updatedAt,
    };
    if (next.id !== document.id || !settles(next, document.updatedAt)) {
        return { kind: 'refused', reasons: [UNSETTLED] };
    }
    return { kind: 'upgraded', document: next, changes: lossy(proposal.notes) };
}

/** Does this retained draft hold anything the current writer would not write? */
export function draftNeedsUpgrade(document: ChartDocument): boolean {
    if (document.schemaVersion === 1) {
        return true;
    }
    return canonical({ ...document, chart: writtenChart(document.chart) }) !== canonical(document);
}

/**
 * What one retained DRAFT becomes, rewritten in place: a text chart converted, and either kind's
 * legacy fields left out (`writtenChart`). Not `withFollowFeel`: a draft's readers apply that
 * against its own `capturedAt`, which the rewrite keeps.
 */
export function upgradeDraftDocument(document: ChartDocument): DocumentUpgrade {
    if (!draftNeedsUpgrade(document)) {
        return { kind: 'current' };
    }
    let next: ChartDocument;
    let changes: UpgradeNote[] = [];
    if (document.schemaVersion === 1) {
        const proposal = proposeLegacyScoreConversion(JSON.stringify(document));
        if (proposal.kind === 'blocked') {
            return { kind: 'refused', reasons: proposal.issues.map(noteOf) };
        }
        next = { ...proposal.value, chart: writtenChart(proposal.value.chart) };
        changes = lossy(proposal.notes);
    } else {
        next = { ...document, chart: writtenChart(document.chart) };
    }
    try {
        validateDocument(next);
    } catch {
        return { kind: 'refused', reasons: [UNSETTLED] };
    }
    return { kind: 'upgraded', document: next, changes };
}

/**
 * Is a stored row that would not validate one of OURS to report — old format by its own raw
 * fields? A row from a NEWER app (a `schemaVersion` past 2) is not old and is left to it.
 */
export function unreadableLooksOld(stored: unknown): boolean {
    const version = (stored as { schemaVersion?: unknown } | null)?.schemaVersion;
    if (typeof version === 'number' && version > 2) {
        return false;
    }
    try {
        return needsUpgrade(stored as ChartDocument);
    } catch {
        return true;
    }
}

export type UpgradeStoreKind = 'guest' | 'account';

/** One retained unsaved experiment, as a store hands it to the run. `handle` is the store's own. */
export interface UpgradeDraft {
    documentId: string;
    writerId: string;
    capturedAt: string;
    document: ChartDocument;
    /** The draft exactly as stored, for the backup. */
    stored: unknown;
    handle: unknown;
}

export const UPGRADE_SKIPS = {
    unsaved: 'It has unsaved changes. Open it, then Save or discard them, and upgrade again.',
    refused:
        'Your account refused its last Save. Open it and resolve that first (Keep both), then upgrade again.',
    waiting:
        'Your account has a newer version of it waiting. Open it and choose which to keep first.',
    deleting: 'It is being deleted from your account. Let that finish first.',
    elsewhere: 'It was saved somewhere else while upgrading. Upgrade again.',
    draftLive: 'Unsaved changes in the old format. Open the song, then Save or discard them.',
    draftOrphan: 'Unsaved changes for a song this device no longer holds. Left as they are.',
    draftRefused: 'Unsaved changes that could not be converted. Left as they are.',
} as const;

/** Why a store's upgrade Save wrote nothing, decided at write time. */
export type UpgradeRefusalReason = 'unsaved' | 'refused' | 'waiting' | 'deleting' | 'elsewhere';

export class UpgradeRefusal extends Error {
    readonly reason: UpgradeRefusalReason;
    constructor(reason: UpgradeRefusalReason) {
        super(UPGRADE_SKIPS[reason]);
        this.reason = reason;
    }
}

/**
 * One songbook's ordinary paths, as the run needs them. Implemented by `lib/upgrade-stores.ts`
 * over the guest repository and `accountSync`; faked in the unit tests.
 */
export interface UpgradeStore {
    kind: UpgradeStoreKind;
    /** Every song, read fresh: each readable one with its row as stored; each other row by id. */
    songs(): Promise<{
        songs: Array<{ document: ChartDocument; stored: unknown }>;
        unreadable: Array<{ id: string; reason: string; stored: unknown }>;
    }>;
    /** Every retained draft, all writers, read fresh; a draft that does not read, by id. */
    drafts(): Promise<{
        drafts: UpgradeDraft[];
        unreadable: Array<{ id: string; reason: string }>;
    }>;
    /**
     * The store's upgrade Save: its ordinary Save, compare-and-swapped on `expected`, keeping the
     * document's `updatedAt`, never deleting a draft, and re-checking AT WRITE TIME that nothing
     * stands in the way (a live draft; for the account, a stuck outbox head, a waiting version,
     * a frozen delete). Throws `UpgradeRefusal` for those and for a lost compare-and-swap.
     */
    save(document: ChartDocument, expected: number): Promise<void>;
    /**
     * Rewrite one draft in place, only if it is still exactly the one read and still dead.
     * `gone` when it no longer exists (that writer saved or discarded it: nothing to do).
     */
    replaceDraft(
        draft: UpgradeDraft,
        next: ChartDocument,
    ): Promise<'replaced' | 'changed' | 'live' | 'gone'>;
}

export interface PlannedSong {
    store: UpgradeStoreKind;
    document: ChartDocument;
    stored: unknown;
}

export interface PlannedDraft {
    store: UpgradeStoreKind;
    draft: UpgradeDraft;
    /** The title of the song it is a draft of, else the draft's own. */
    title: string;
}

/** What an upgrade would touch, read fresh from every store. */
export interface UpgradePlan {
    /** The songs `needsUpgrade` picks. */
    songs: PlannedSong[];
    /** The drafts `draftNeedsUpgrade` picks, live or not. */
    drafts: PlannedDraft[];
    /** Rows that would not read and look old: left alone, listed, and counted. */
    unreadable: Array<{
        store: UpgradeStoreKind;
        id: string;
        reason: string;
        kind: 'song' | 'draft';
    }>;
    /** A store that could not be read, with why. */
    failures: Array<{ store: UpgradeStoreKind; message: string }>;
}

/**
 * The card's number: everything still old on this device — songs, drafts, unreadable old rows and
 * stores that could not be read. Zero means nothing old is stored here.
 */
export function upgradeCount(plan: UpgradePlan): number {
    return plan.songs.length + plan.drafts.length + plan.unreadable.length + plan.failures.length;
}

function message(failure: unknown): string {
    return failure instanceof Error ? failure.message : String(failure);
}

/** Hands the event loop back between slices of a long read (`framePace`). */
export interface UpgradePace {
    shouldYield: () => boolean;
    yieldNow: () => Promise<void>;
}

export async function planUpgrade(
    stores: readonly UpgradeStore[],
    pace?: UpgradePace,
): Promise<UpgradePlan> {
    const plan: UpgradePlan = { songs: [], drafts: [], unreadable: [], failures: [] };
    for (const store of stores) {
        try {
            const [songs, drafts] = await Promise.all([store.songs(), store.drafts()]);
            const titles = new Map(
                songs.songs.map(({ document }) => [document.id, document.title]),
            );
            for (const { document, stored } of songs.songs) {
                if (needsUpgrade(document)) {
                    plan.songs.push({ store: store.kind, document, stored });
                }
                if (pace?.shouldYield()) {
                    await pace.yieldNow();
                }
            }
            for (const row of songs.unreadable) {
                if (unreadableLooksOld(row.stored)) {
                    plan.unreadable.push({
                        store: store.kind,
                        id: row.id,
                        reason: row.reason,
                        kind: 'song',
                    });
                }
            }
            for (const row of drafts.unreadable) {
                plan.unreadable.push({ ...row, store: store.kind, kind: 'draft' });
            }
            for (const draft of drafts.drafts) {
                if (draftNeedsUpgrade(draft.document)) {
                    plan.drafts.push({
                        store: store.kind,
                        draft,
                        title: titles.get(draft.documentId) ?? draft.document.title,
                    });
                }
            }
        } catch (failure) {
            plan.failures.push({ store: store.kind, message: message(failure) });
        }
    }
    return plan;
}

/**
 * The backup (DECISION 2026-10-16): ONE human-readable JSON file holding exactly what this run
 * may change — every song and draft the plan picks — each as it is stored, with its store, id
 * and title. Written once, before anything is touched.
 */
export function upgradeBackup(plan: UpgradePlan, createdAt = new Date().toISOString()): string {
    return JSON.stringify(
        {
            format: 'ensemble-pre-upgrade-originals',
            version: 1,
            createdAt,
            about: 'An archive of the songs and unsaved drafts "Upgrade old songs" was about to change, each exactly as it was stored before the upgrade ran ("original").',
            songs: plan.songs.map(({ store, document, stored }) => ({
                store,
                id: document.id,
                title: document.title,
                original: stored,
            })),
            drafts: plan.drafts.map(({ store, draft, title }) => ({
                store,
                id: draft.documentId,
                title,
                writerId: draft.writerId,
                capturedAt: draft.capturedAt,
                original: draft.stored,
            })),
        },
        null,
        2,
    );
}

export interface UpgradeEntry {
    store: UpgradeStoreKind;
    id: string;
    title: string;
}

export interface UpgradeOutcome {
    /** Every song upgraded, those with changes included. */
    upgraded: UpgradeEntry[];
    /** Upgraded songs and drafts with the converter's lossy notes — not tone for tone. */
    changed: Array<UpgradeEntry & { draft: boolean; notes: UpgradeNote[] }>;
    /** Refused by the converter: left exactly as they were. */
    refused: Array<UpgradeEntry & { reasons: UpgradeNote[] }>;
    /** Not attempted, or a Save that was refused: left exactly as they were, with why. */
    skipped: Array<UpgradeEntry & { reason: string }>;
    /** Drafts rewritten in place. */
    draftsConverted: number;
    /** Drafts left exactly as they are, with why; `openable` when the song is on this device. */
    draftsKept: Array<
        UpgradeEntry & { reason: string; reasons?: UpgradeNote[]; openable: boolean }
    >;
    /** Stores that could not be read. */
    failures: Array<{ store: UpgradeStoreKind; message: string }>;
}

export interface UpgradeRunOptions {
    /** Unsaved text this TAB holds for a song (a draft no store has yet). */
    unsavedHere(store: UpgradeStoreKind, documentId: string): boolean;
    /** Called after every document, done of total. */
    onProgress?(done: number, total: number): void;
    /** Hands the event loop back between documents, so progress paints. */
    yieldNow?(): Promise<void>;
}

/**
 * A draft's liveness, by `liveDraft`'s rule: captured at or after the committed version it sits
 * on. A draft whose song this device does not hold readably — an orphan, or a song row that would
 * not read — is LIVE too: nothing here can say what it was an experiment on.
 */
function isLive(draft: UpgradeDraft, songs: ReadonlyMap<string, ChartDocument>): boolean {
    const song = songs.get(draft.documentId);
    return song === undefined || draft.capturedAt >= song.updatedAt;
}

/**
 * Upgrade every store in turn. Re-reads each store first (a plan shown on the card can be a moment
 * old), upgrades its songs one Save at a time, then re-reads and rewrites its old dead drafts in
 * place. Nothing here forces or deletes anything: every refusal is a line in the outcome.
 */
export async function runUpgrade(
    stores: readonly UpgradeStore[],
    options: UpgradeRunOptions,
): Promise<UpgradeOutcome> {
    const outcome: UpgradeOutcome = {
        upgraded: [],
        changed: [],
        refused: [],
        skipped: [],
        draftsConverted: 0,
        draftsKept: [],
        failures: [],
    };
    const plan = await planUpgrade(stores);
    outcome.failures.push(...plan.failures);
    const total = plan.songs.length + plan.drafts.length;
    let done = 0;
    const step = async () => {
        done = Math.min(done + 1, total);
        options.onProgress?.(done, total);
        await options.yieldNow?.();
    };
    options.onProgress?.(0, total);
    for (const store of stores) {
        if (plan.failures.some((failure) => failure.store === store.kind)) {
            continue;
        }
        let live: Set<string>;
        try {
            const [songs, drafts] = await Promise.all([store.songs(), store.drafts()]);
            const committed = new Map(songs.songs.map(({ document }) => [document.id, document]));
            // Every draft, any format: a live one is unsaved work on its song.
            live = new Set(
                drafts.drafts
                    .filter((draft) => isLive(draft, committed))
                    .map((draft) => draft.documentId),
            );
        } catch (failure) {
            outcome.failures.push({ store: store.kind, message: message(failure) });
            continue;
        }
        for (const { document } of plan.songs.filter((song) => song.store === store.kind)) {
            const entry = { store: store.kind, id: document.id, title: document.title };
            try {
                if (live.has(document.id) || options.unsavedHere(store.kind, document.id)) {
                    outcome.skipped.push({ ...entry, reason: UPGRADE_SKIPS.unsaved });
                    continue;
                }
                const result = upgradeDocument(document);
                if (result.kind === 'refused') {
                    outcome.refused.push({ ...entry, reasons: result.reasons });
                    continue;
                }
                if (result.kind === 'current') {
                    continue;
                }
                try {
                    await store.save(result.document, document.revision);
                } catch (failure) {
                    outcome.skipped.push({ ...entry, reason: message(failure) });
                    continue;
                }
                outcome.upgraded.push(entry);
                if (result.changes.length) {
                    outcome.changed.push({ ...entry, draft: false, notes: result.changes });
                }
            } finally {
                await step();
            }
        }
        // Drafts after songs, read AGAIN: a writer may have saved or discarded a draft meanwhile,
        // and only what is there now is acted on.
        let drafts: UpgradeDraft[];
        let now: Map<string, ChartDocument>;
        try {
            const [songs, fresh] = await Promise.all([store.songs(), store.drafts()]);
            now = new Map(songs.songs.map(({ document }) => [document.id, document]));
            drafts = fresh.drafts.filter((draft) => draftNeedsUpgrade(draft.document));
        } catch (failure) {
            outcome.failures.push({ store: store.kind, message: message(failure) });
            continue;
        }
        for (const draft of drafts) {
            const song = now.get(draft.documentId);
            const entry = {
                store: store.kind,
                id: draft.documentId,
                title: song?.title ?? draft.document.title,
            };
            const keep = (reason: string, reasons?: UpgradeNote[]) =>
                outcome.draftsKept.push({
                    ...entry,
                    reason,
                    reasons,
                    openable: song !== undefined,
                });
            try {
                if (isLive(draft, now)) {
                    // Unsaved work: the musician's to Save or discard, never ours to rewrite.
                    keep(song ? UPGRADE_SKIPS.draftLive : UPGRADE_SKIPS.draftOrphan);
                    continue;
                }
                const result = upgradeDraftDocument(draft.document);
                if (result.kind === 'refused') {
                    keep(UPGRADE_SKIPS.draftRefused, result.reasons);
                    continue;
                }
                if (result.kind === 'current') {
                    continue;
                }
                const written = await store.replaceDraft(draft, result.document);
                if (written === 'replaced') {
                    outcome.draftsConverted += 1;
                    if (result.changes.length) {
                        outcome.changed.push({ ...entry, draft: true, notes: result.changes });
                    }
                } else if (written === 'live') {
                    keep(UPGRADE_SKIPS.draftLive);
                } else if (written === 'changed') {
                    keep(UPGRADE_SKIPS.elsewhere);
                }
                // `gone`: that writer saved or discarded it since; nothing is left to upgrade.
            } catch (failure) {
                keep(message(failure));
            } finally {
                await step();
            }
        }
    }
    return outcome;
}
