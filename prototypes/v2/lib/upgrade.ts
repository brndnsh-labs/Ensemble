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
 * - Same id, a new revision: each song is one ordinary Save against the revision it was read at,
 *   so a song changed in the meantime is a refused compare-and-swap, reported and left alone.
 * - Never over unsaved work: a song with a LIVE draft (captured at or after its committed version,
 *   the rule `recoveryFor` and the account's `liveDraft` share), or with unsaved text in this tab,
 *   is skipped with "save or discard it first". The draft is not touched.
 * - Never through a stuck queue: an account song whose outbox head is conflicted or refused, or
 *   with an account version waiting beside it, is skipped — its own resolution comes first.
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
function settles(document: ChartDocument): boolean {
    try {
        const stored = validateDocument({ ...document, updatedAt: new Date().toISOString() });
        return stored.schemaVersion === 2 && !needsUpgrade(stored);
    } catch {
        return false;
    }
}

const UNSETTLED: UpgradeNote = {
    message: 'The upgraded chart did not come out in the current format, so it was left as it is.',
};

/**
 * What one stored song becomes. A text chart goes through `proposeLegacyScoreConversion` (#1737),
 * which converts what v1 played or refuses with a reason per bar; every upgraded document is then
 * written as today's writer writes it (`writtenChart`, `withFollowFeel` against the song's own
 * `updatedAt`). `changes` are the converter's `tones-dropped` notes: upgraded, but not tone for
 * tone. Same id; the revision and `updatedAt` are the Save's to set.
 */
export function upgradeDocument(document: ChartDocument): DocumentUpgrade {
    if (!needsUpgrade(document)) {
        return { kind: 'current' };
    }
    if (document.schemaVersion === 2) {
        const next = asWrittenToday(document);
        return settles(next)
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
    const next = asWrittenToday(proposal.value, document.updatedAt);
    if (next.id !== document.id || !settles(next)) {
        return { kind: 'refused', reasons: [UNSETTLED] };
    }
    return {
        kind: 'upgraded',
        document: next,
        changes: proposal.notes.filter((note) => note.code === 'tones-dropped').map(noteOf),
    };
}

/**
 * What one retained schema-1 DRAFT becomes, converted in place. Not `withFollowFeel`: a draft's
 * readers apply that against its own `capturedAt`, which the rewrite keeps.
 */
export function upgradeDraftDocument(document: ChartDocument): DocumentUpgrade {
    if (document.schemaVersion !== 1) {
        return { kind: 'current' };
    }
    const proposal = proposeLegacyScoreConversion(JSON.stringify(document));
    if (proposal.kind === 'blocked') {
        return { kind: 'refused', reasons: proposal.issues.map(noteOf) };
    }
    const next = { ...proposal.value, chart: writtenChart(proposal.value.chart) };
    try {
        validateDocument(next);
    } catch {
        return { kind: 'refused', reasons: [UNSETTLED] };
    }
    return { kind: 'upgraded', document: next, changes: [] };
}

export type UpgradeStoreKind = 'guest' | 'account';

/** One retained unsaved experiment, as a store hands it to the run. `handle` is the store's own. */
export interface UpgradeDraft {
    documentId: string;
    writerId: string;
    capturedAt: string;
    document: ChartDocument;
    handle: unknown;
}

/**
 * One songbook's ordinary paths, as the run needs them. Implemented by the shell over
 * `lib/repository.ts` (guest) and `accountSync` (account); faked in the unit tests.
 */
export interface UpgradeStore {
    kind: UpgradeStoreKind;
    /** Every song this store holds, read fresh. A document that does not read is counted, never fatal. */
    songs(): Promise<{ documents: ChartDocument[]; unreadable: number }>;
    /** Every retained draft, all writers, read fresh. */
    drafts(): Promise<{ drafts: UpgradeDraft[]; unreadable: number }>;
    /** Why this song may not be written now — a stuck outbox head, an account version waiting. */
    blocked(documentId: string): Promise<string | null>;
    /** The store's ordinary Save, compare-and-swapped on `expected`. Throws when refused. */
    save(document: ChartDocument, expected: number): Promise<void>;
    /**
     * Rewrite (`next`) or retire (`null`) one draft in place, only if it is still exactly the one
     * read and still not live. False when it changed or went live meanwhile; nothing is written.
     */
    replaceDraft(draft: UpgradeDraft, next: ChartDocument | null): Promise<boolean>;
}

export interface PlannedSong {
    store: UpgradeStoreKind;
    document: ChartDocument;
}

export interface PlannedDraft {
    store: UpgradeStoreKind;
    draft: UpgradeDraft;
    /** The title of the song it is a draft of, else the draft's own. */
    title: string;
}

/** What an upgrade would touch, read fresh from every store. */
export interface UpgradePlan {
    /** Every song in the stores read, for the backup. */
    all: PlannedSong[];
    /** The songs `needsUpgrade` picks. */
    songs: PlannedSong[];
    /** The schema-1 drafts. */
    drafts: PlannedDraft[];
    /** Documents or drafts that could not be read at all; left alone and said. */
    unreadable: number;
    /** A store that could not be read, with why. */
    failures: Array<{ store: UpgradeStoreKind; message: string }>;
}

/** The card's number: songs to upgrade plus schema-1 drafts. */
export function upgradeCount(plan: UpgradePlan): number {
    return plan.songs.length + plan.drafts.length;
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
    const plan: UpgradePlan = { all: [], songs: [], drafts: [], unreadable: 0, failures: [] };
    for (const store of stores) {
        try {
            const [songs, drafts] = await Promise.all([store.songs(), store.drafts()]);
            const titles = new Map(songs.documents.map((song) => [song.id, song.title]));
            plan.unreadable += songs.unreadable + drafts.unreadable;
            for (const document of songs.documents) {
                plan.all.push({ store: store.kind, document });
                if (needsUpgrade(document)) {
                    plan.songs.push({ store: store.kind, document });
                }
                if (pace?.shouldYield()) {
                    await pace.yieldNow();
                }
            }
            for (const draft of drafts.drafts) {
                if (draft.document.schemaVersion === 1) {
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

export interface UpgradeEntry {
    store: UpgradeStoreKind;
    id: string;
    title: string;
}

export interface UpgradeOutcome {
    /** Every song upgraded, those with changes included. */
    upgraded: UpgradeEntry[];
    /** Upgraded with the converter's lossy notes — not tone for tone. */
    changed: Array<UpgradeEntry & { notes: UpgradeNote[] }>;
    /** Refused by the converter: left exactly as they were. */
    refused: Array<UpgradeEntry & { reasons: UpgradeNote[] }>;
    /** Not attempted, or a Save that was refused: left exactly as they were, with why. */
    skipped: Array<UpgradeEntry & { reason: string }>;
    /** Schema-1 drafts converted in place. */
    draftsConverted: number;
    /** Schema-1 drafts that would not convert, retired because they were in the backup. */
    draftsRetired: number;
    /** Schema-1 drafts left as they are, with why. */
    draftsKept: Array<UpgradeEntry & { reason: string }>;
    /** Stores that could not be read. */
    failures: Array<{ store: UpgradeStoreKind; message: string }>;
}

/** What the backup held, so a run only retires what it can prove was written to a file. */
export interface UpgradeBackup {
    songs: ReadonlySet<string>;
    drafts: ReadonlySet<string>;
}

export const songBackupKey = (store: UpgradeStoreKind, document: ChartDocument) =>
    `${store}:${document.id}:${document.revision}`;
export const draftBackupKey = (store: UpgradeStoreKind, draft: UpgradeDraft) =>
    `${store}:${draft.documentId}:${draft.writerId}:${draft.capturedAt}`;

export const UPGRADE_SKIPS = {
    unsaved: 'It has unsaved changes. Open it, then Save or discard them, and upgrade again.',
    changed:
        'It is not in the backup just made (it changed since, or its file could not be written). Upgrade again.',
    elsewhere: 'It was saved somewhere else while upgrading. Upgrade again.',
    draftLive: 'Unsaved changes in the old format. Open the song, then Save or discard them.',
    draftRefused:
        'An old unsaved draft could not be converted. It is kept: back it up to retire it.',
} as const;

export interface UpgradeRunOptions {
    /** Null when the musician chose to upgrade without one. */
    backup: UpgradeBackup | null;
    /** Unsaved text this TAB holds for a song (a draft no store has yet). */
    unsavedHere(store: UpgradeStoreKind, documentId: string): boolean;
    /** Called after every document, done of total. */
    onProgress?(done: number, total: number): void;
    /** Hands the event loop back between documents, so progress paints. */
    yieldNow?(): Promise<void>;
}

function isLive(draft: UpgradeDraft, songs: ReadonlyMap<string, ChartDocument>): boolean {
    const song = songs.get(draft.documentId);
    return song !== undefined && draft.capturedAt >= song.updatedAt;
}

/**
 * Upgrade every store in turn. Re-reads each store first (a plan shown on the card can be a moment
 * old), upgrades its songs one Save at a time, then converts its schema-1 drafts in place. Nothing
 * here forces a write: every refusal is a line in the outcome.
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
        draftsRetired: 0,
        draftsKept: [],
        failures: [],
    };
    const plan = await planUpgrade(stores);
    outcome.failures.push(...plan.failures);
    const total = upgradeCount(plan);
    let done = 0;
    const step = async () => {
        done += 1;
        options.onProgress?.(done, total);
        await options.yieldNow?.();
    };
    options.onProgress?.(0, total);
    for (const store of stores) {
        if (plan.failures.some((failure) => failure.store === store.kind)) {
            continue;
        }
        const songs = plan.songs.filter((song) => song.store === store.kind);
        const drafts = plan.drafts.filter((draft) => draft.store === store.kind);
        // Every draft, any format: a live one of either kind is unsaved work on its song.
        const live = new Set<string>();
        const committed = new Map(
            plan.all
                .filter((song) => song.store === store.kind)
                .map((song) => [song.document.id, song.document]),
        );
        try {
            for (const draft of (await store.drafts()).drafts) {
                if (isLive(draft, committed)) {
                    live.add(draft.documentId);
                }
            }
        } catch (failure) {
            outcome.failures.push({ store: store.kind, message: message(failure) });
            continue;
        }
        for (const { document } of songs) {
            const entry = { store: store.kind, id: document.id, title: document.title };
            try {
                if (
                    options.backup &&
                    !options.backup.songs.has(songBackupKey(store.kind, document))
                ) {
                    outcome.skipped.push({ ...entry, reason: UPGRADE_SKIPS.changed });
                    continue;
                }
                if (live.has(document.id) || options.unsavedHere(store.kind, document.id)) {
                    outcome.skipped.push({ ...entry, reason: UPGRADE_SKIPS.unsaved });
                    continue;
                }
                const blocked = await store.blocked(document.id);
                if (blocked) {
                    outcome.skipped.push({ ...entry, reason: blocked });
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
                    outcome.changed.push({ ...entry, notes: result.changes });
                }
            } finally {
                await step();
            }
        }
        // Drafts after songs, against the songs as they are NOW: an upgraded song's Save has moved
        // its committed version past every draft it had, which is what makes those drafts dead.
        let now: Map<string, ChartDocument>;
        try {
            now = new Map((await store.songs()).documents.map((song) => [song.id, song]));
        } catch (failure) {
            outcome.failures.push({ store: store.kind, message: message(failure) });
            continue;
        }
        for (const { draft, title } of drafts) {
            const entry = { store: store.kind, id: draft.documentId, title };
            try {
                if (isLive(draft, now)) {
                    // Unsaved work: the musician's to Save or discard, never ours to rewrite.
                    outcome.draftsKept.push({ ...entry, reason: UPGRADE_SKIPS.draftLive });
                    continue;
                }
                const result = upgradeDraftDocument(draft.document);
                if (result.kind === 'upgraded') {
                    if (await store.replaceDraft(draft, result.document)) {
                        outcome.draftsConverted += 1;
                    } else {
                        outcome.draftsKept.push({ ...entry, reason: UPGRADE_SKIPS.elsewhere });
                    }
                    continue;
                }
                if (
                    result.kind === 'refused' &&
                    options.backup?.drafts.has(draftBackupKey(store.kind, draft)) &&
                    (await store.replaceDraft(draft, null))
                ) {
                    outcome.draftsRetired += 1;
                    continue;
                }
                outcome.draftsKept.push({ ...entry, reason: UPGRADE_SKIPS.draftRefused });
            } catch (failure) {
                outcome.draftsKept.push({ ...entry, reason: message(failure) });
            } finally {
                await step();
            }
        }
    }
    return outcome;
}
