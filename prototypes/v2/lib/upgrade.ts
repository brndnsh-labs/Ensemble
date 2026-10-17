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
import { type ChartDocument, validateDocument } from './documents';

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

/** A document as the current writer would store it (`writtenChart`). */
function asWrittenToday<T extends ChartDocument>(document: T): T {
    return { ...document, chart: writtenChart(document.chart) };
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
 * does when its stored content differs from what today's writer would store (`writtenChart`):
 * no stored energy, say. A collection (`kind` set) never does.
 *
 * Asked of a raw row that will not read too (`unreadableLooksOld`): one that still carries a
 * band or performance field the codec no longer accepts (#1741) differs from `writtenChart`'s
 * field-by-field copy, so it is listed as an old leftover rather than ignored.
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
 * written as today's writer writes it (`writtenChart`). `changes` are the converter's `tones-dropped` notes: upgraded, but not tone for
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
    const next = { ...asWrittenToday(proposal.value), updatedAt: document.updatedAt };
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
 * What one retained DRAFT becomes, rewritten in place: a text chart converted, and either kind
 * written as today's writer writes it (`writtenChart`).
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
    /** Its exact stored bytes: what "unchanged since the backup" is compared on. */
    raw: string;
    handle: unknown;
}

/** A stored row that will not read, as a store hands it to the plan. */
export interface UpgradeUnreadableRow {
    id: string;
    /** A draft's writer, for a draft row. */
    writerId?: string;
    reason: string;
    stored: unknown;
    /**
     * For a draft row, its chart document as far as it parses (`stored` when absent): what
     * `unreadableLooksOld` is asked about.
     */
    document?: unknown;
    /**
     * Its exact stored bytes; null when it has none to compare (a row with no document), which is
     * never removable — no backup can hold bytes that are not there.
     */
    raw: string | null;
    /** An account song the server holds: removing the local row would not remove it. */
    serverHeld?: boolean;
    handle?: unknown;
}

export const UPGRADE_SKIPS = {
    unsaved: 'It has unsaved changes. Open it, then Save or discard them, and upgrade again.',
    refused:
        'Your account refused its last Save. Open it and resolve that first (Keep both), then upgrade again.',
    waiting:
        'Your account has a newer version of it waiting. Open it and choose which to keep first.',
    deleting: 'It is being deleted from your account. Let that finish first.',
    elsewhere: 'It was saved somewhere else while upgrading. Upgrade again.',
    changedSinceBackup: 'Changed since your backup — upgrade again.',
    draftLive: 'Unsaved changes in the old format. Open the song, then Save or discard them.',
    draftOrphan: 'Unsaved changes for a song this device no longer holds.',
    draftUnreadableSong: 'Unsaved changes for a song that will not read on this device.',
    draftRefused: 'Old unsaved changes that could not be converted.',
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
 * Something old the upgrade cannot fix, listed so the musician can deal with it (DECISION
 * 2026-10-16): a dead draft the converter refuses, a draft of a song this device does not hold or
 * cannot read, and an old row that will not read. The run never removes one; the musician may,
 * one at a time, once the backup holds it (`UpgradeStore.remove`).
 */
export interface UpgradeLeftover {
    store: UpgradeStoreKind;
    kind: 'song' | 'draft';
    id: string;
    writerId?: string;
    title: string;
    reason: string;
    reasons?: UpgradeNote[];
    /** The row as stored, for the backup. */
    stored: unknown;
    /** Its exact stored bytes, compared before a removal; null: none, so never removable. */
    raw: string | null;
    /** The account holds it on the server, so a local removal would not remove it. */
    serverHeld: boolean;
    handle: unknown;
}

/**
 * One leftover's identity, across scans. A draft's includes its writer: two of one song's drafts
 * are two leftovers, each removable on its own.
 */
export const leftoverKey = (leftover: UpgradeLeftover) =>
    `${leftover.store}:${leftover.kind}:${leftover.id}:${leftover.writerId ?? ''}`;

/**
 * One songbook's own paths, as the run needs them. Implemented by `lib/upgrade-stores.ts` over
 * the guest repository and `accountSync`; faked in the unit tests.
 */
export interface UpgradeStore {
    kind: UpgradeStoreKind;
    /** Every song, read fresh: each readable one with its row as stored; each other row too. */
    songs(): Promise<{
        songs: Array<{ document: ChartDocument; stored: unknown }>;
        unreadable: UpgradeUnreadableRow[];
    }>;
    /** Every retained draft, all writers, read fresh; each one that does not read too. */
    drafts(): Promise<{ drafts: UpgradeDraft[]; unreadable: UpgradeUnreadableRow[] }>;
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
    /**
     * Remove ONE leftover row, at the musician's own press — a local delete of exactly that row,
     * only while it still holds `leftover.raw`; never a cloud delete. `held`: the account holds
     * it on the server, so it is not removed here. Throws, removing nothing, for a leftover with
     * no bytes (`raw` null).
     */
    remove(leftover: UpgradeLeftover): Promise<'removed' | 'changed' | 'gone' | 'live' | 'held'>;
}

export interface PlannedSong {
    store: UpgradeStoreKind;
    document: ChartDocument;
    stored: unknown;
}

export interface PlannedDraft {
    store: UpgradeStoreKind;
    draft: UpgradeDraft;
    /** The title of the song it is a draft of. */
    title: string;
}

/** What an upgrade would touch, read fresh from every store. */
export interface UpgradePlan {
    /** The songs `needsUpgrade` picks. */
    songs: PlannedSong[];
    /** The drafts `draftNeedsUpgrade` picks on a song this device holds: dead ones to rewrite,
     * live ones (unsaved work) to leave and list. */
    drafts: PlannedDraft[];
    /** What the upgrade cannot fix: listed, counted, removable by the musician. */
    leftovers: UpgradeLeftover[];
    /** A store that could not be read, with why. */
    failures: Array<{ store: UpgradeStoreKind; message: string }>;
}

/**
 * The card's number: everything still old on this device — songs, drafts, leftovers and stores
 * that could not be read. Zero means nothing old is stored here.
 */
export function upgradeCount(plan: UpgradePlan): number {
    return plan.songs.length + plan.drafts.length + plan.leftovers.length + plan.failures.length;
}

function message(failure: unknown): string {
    return failure instanceof Error ? failure.message : String(failure);
}

/** Hands the event loop back between slices of a long read (`framePace`); may throw to stop it. */
export interface UpgradePace {
    shouldYield: () => boolean;
    yieldNow: () => Promise<void>;
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

export async function planUpgrade(
    stores: readonly UpgradeStore[],
    pace?: UpgradePace,
): Promise<UpgradePlan> {
    const plan: UpgradePlan = { songs: [], drafts: [], leftovers: [], failures: [] };
    for (const store of stores) {
        let songs: Awaited<ReturnType<UpgradeStore['songs']>>;
        let drafts: Awaited<ReturnType<UpgradeStore['drafts']>>;
        try {
            [songs, drafts] = await Promise.all([store.songs(), store.drafts()]);
        } catch (failure) {
            if (failure instanceof UpgradeScanCancelled) {
                throw failure;
            }
            plan.failures.push({ store: store.kind, message: message(failure) });
            continue;
        }
        const readable = new Map(songs.songs.map(({ document }) => [document.id, document]));
        const unreadableSongs = new Set(songs.unreadable.map((row) => row.id));
        for (const { document, stored } of songs.songs) {
            if (needsUpgrade(document)) {
                plan.songs.push({ store: store.kind, document, stored });
            }
            if (pace?.shouldYield()) {
                await pace.yieldNow();
            }
        }
        const leftover = (
            row: Omit<UpgradeLeftover, 'store' | 'serverHeld'> & { serverHeld?: boolean },
        ) =>
            plan.leftovers.push({ ...row, store: store.kind, serverHeld: row.serverHeld ?? false });
        for (const row of songs.unreadable) {
            if (unreadableLooksOld(row.stored)) {
                leftover({ ...row, kind: 'song', title: row.id, handle: row.handle });
            }
        }
        for (const row of drafts.unreadable) {
            // The songs' rule: one a newer app wrote is not ours to list.
            if (unreadableLooksOld('document' in row ? row.document : row.stored)) {
                const { document: _document, ...rest } = row;
                leftover({ ...rest, kind: 'draft', title: row.id, handle: row.handle });
            }
        }
        for (const draft of drafts.drafts) {
            if (!draftNeedsUpgrade(draft.document)) {
                continue;
            }
            const song = readable.get(draft.documentId);
            const base = {
                kind: 'draft' as const,
                id: draft.documentId,
                writerId: draft.writerId,
                title: song?.title ?? draft.document.title,
                stored: draft.stored,
                raw: draft.raw,
                handle: draft.handle,
            };
            if (!song) {
                leftover({
                    ...base,
                    reason: unreadableSongs.has(draft.documentId)
                        ? UPGRADE_SKIPS.draftUnreadableSong
                        : UPGRADE_SKIPS.draftOrphan,
                });
                continue;
            }
            if (!isLive(draft, readable)) {
                const result = upgradeDraftDocument(draft.document);
                if (result.kind === 'refused') {
                    leftover({
                        ...base,
                        reason: UPGRADE_SKIPS.draftRefused,
                        reasons: result.reasons,
                    });
                    continue;
                }
            }
            plan.drafts.push({ store: store.kind, draft, title: song.title });
        }
        if (pace?.shouldYield()) {
            await pace.yieldNow();
        }
    }
    return plan;
}

/** A superseded scan, stopped by its pace (`app/use-upgrade.ts`). */
export class UpgradeScanCancelled extends Error {
    constructor() {
        super('Superseded upgrade scan.');
    }
}

/**
 * The backup (DECISION 2026-10-16): ONE human-readable JSON file holding exactly what this run
 * may change — every song and draft the plan picks — and every leftover the musician may then
 * remove, each as it is stored, with its store, id and title. Written once, before anything is
 * touched. `leftoversOnly` is the file "Download these first" writes after a run without one.
 */
export function upgradeBackup(
    plan: UpgradePlan,
    createdAt = new Date().toISOString(),
    leftoversOnly = false,
): string {
    return JSON.stringify(
        {
            format: 'ensemble-pre-upgrade-originals',
            version: 1,
            createdAt,
            about: leftoversOnly
                ? 'An archive of old songs and unsaved drafts "Upgrade old songs" could not upgrade, each exactly as it was stored ("original"), kept before any of them is removed.'
                : 'An archive of the songs and unsaved drafts "Upgrade old songs" was about to change, and of the old ones it cannot change, each exactly as it was stored before the upgrade ran ("original").',
            songs: leftoversOnly
                ? []
                : plan.songs.map(({ store, document, stored }) => ({
                      store,
                      id: document.id,
                      title: document.title,
                      original: stored,
                  })),
            drafts: leftoversOnly
                ? []
                : plan.drafts.map(({ store, draft, title }) => ({
                      store,
                      id: draft.documentId,
                      title,
                      writerId: draft.writerId,
                      capturedAt: draft.capturedAt,
                      original: draft.stored,
                  })),
            leftovers: plan.leftovers
                .filter((leftover) => !leftover.serverHeld)
                .map((leftover) => ({
                    store: leftover.store,
                    kind: leftover.kind,
                    id: leftover.id,
                    ...(leftover.writerId === undefined ? {} : { writerId: leftover.writerId }),
                    title: leftover.title,
                    reason: leftover.reason,
                    original: leftover.stored,
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
    /** Drafts left exactly as they are, with why; `openable` when it is unsaved work on a song. */
    draftsKept: Array<UpgradeEntry & { reason: string; openable: boolean }>;
    /** Stores that could not be read. */
    failures: Array<{ store: UpgradeStoreKind; message: string }>;
}

export interface UpgradeRunOptions {
    /** The run follows a backup of `plan`: anything changed since is "changed since your backup". */
    backedUp: boolean;
    /** Unsaved text this TAB holds for a song (a draft no store has yet). */
    unsavedHere(store: UpgradeStoreKind, documentId: string): boolean;
    /** Called after every document, done of total. */
    onProgress?(done: number, total: number): void;
    /** Hands the event loop back between documents, so progress paints. */
    yieldNow?(): Promise<void>;
}

/**
 * Upgrade exactly what `plan` holds — the plan the backup file was written from, or one made at
 * the musician's "Upgrade without a backup" — and nothing else: each song is saved against its
 * PLANNED revision and each draft rewritten only while it still holds its planned bytes, so
 * anything changed since is left alone and said. Nothing here forces or deletes anything.
 */
export async function runUpgrade(
    stores: readonly UpgradeStore[],
    plan: UpgradePlan,
    options: UpgradeRunOptions,
): Promise<UpgradeOutcome> {
    const outcome: UpgradeOutcome = {
        upgraded: [],
        changed: [],
        refused: [],
        skipped: [],
        draftsConverted: 0,
        draftsKept: [],
        failures: [...plan.failures],
    };
    const moved = options.backedUp ? UPGRADE_SKIPS.changedSinceBackup : UPGRADE_SKIPS.elsewhere;
    const total = plan.songs.length + plan.drafts.length;
    let done = 0;
    const step = async () => {
        done = Math.min(done + 1, total);
        options.onProgress?.(done, total);
        await options.yieldNow?.();
    };
    options.onProgress?.(0, total);
    for (const store of stores) {
        const songs = plan.songs.filter((song) => song.store === store.kind);
        const drafts = plan.drafts.filter((draft) => draft.store === store.kind);
        if (!songs.length && !drafts.length) {
            continue;
        }
        let live: Set<string>;
        try {
            const [fresh, freshDrafts] = await Promise.all([store.songs(), store.drafts()]);
            const committed = new Map(fresh.songs.map(({ document }) => [document.id, document]));
            // Every draft, any format: a live one is unsaved work on its song.
            live = new Set(
                freshDrafts.drafts
                    .filter((draft) => isLive(draft, committed))
                    .map((draft) => draft.documentId),
            );
        } catch (failure) {
            outcome.failures.push({ store: store.kind, message: message(failure) });
            continue;
        }
        for (const { document } of songs) {
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
                    // The PLANNED revision: a song saved since the plan loses this
                    // compare-and-swap and is left alone.
                    await store.save(result.document, document.revision);
                } catch (failure) {
                    outcome.skipped.push({
                        ...entry,
                        reason:
                            failure instanceof UpgradeRefusal && failure.reason === 'elsewhere'
                                ? moved
                                : message(failure),
                    });
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
        // Drafts after songs, against what is stored NOW: a draft saved or discarded since is
        // done; one captured again since the plan is left alone.
        let now: Map<string, ChartDocument>;
        let current: Map<string, UpgradeDraft>;
        try {
            const [fresh, freshDrafts] = await Promise.all([store.songs(), store.drafts()]);
            now = new Map(fresh.songs.map(({ document }) => [document.id, document]));
            current = new Map(
                freshDrafts.drafts.map((draft) => [`${draft.documentId}:${draft.writerId}`, draft]),
            );
        } catch (failure) {
            outcome.failures.push({ store: store.kind, message: message(failure) });
            continue;
        }
        for (const { draft, title } of drafts) {
            const song = now.get(draft.documentId);
            const entry = { store: store.kind, id: draft.documentId, title: song?.title ?? title };
            const keep = (reason: string) =>
                outcome.draftsKept.push({
                    ...entry,
                    reason,
                    openable: song !== undefined && reason === UPGRADE_SKIPS.draftLive,
                });
            try {
                const held = current.get(`${draft.documentId}:${draft.writerId}`);
                if (!held) {
                    // Saved or discarded since the plan: nothing is left to upgrade.
                    continue;
                }
                if (held.raw !== draft.raw) {
                    keep(moved);
                    continue;
                }
                if (isLive(draft, now)) {
                    // Unsaved work: the musician's to Save or discard, never ours to rewrite.
                    keep(song ? UPGRADE_SKIPS.draftLive : UPGRADE_SKIPS.draftOrphan);
                    continue;
                }
                const result = upgradeDraftDocument(draft.document);
                if (result.kind === 'refused') {
                    keep(UPGRADE_SKIPS.draftRefused);
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
                    keep(moved);
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
