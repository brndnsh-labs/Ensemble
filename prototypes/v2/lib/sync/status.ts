import { remoteRevision } from './protocol';

/**
 * Presentation model for the three independent status facts the sync contract keeps apart:
 * local safety, cloud confirmation and offline readiness. Three separate results, never one
 * priority badge — a single "saved" badge would lie to a musician who saved offline and then
 * kept editing, which is the exact case this exists to prevent.
 *
 * This is a pure projection. It reads no storage, opens no connection, starts no timer and
 * consults neither `navigator.onLine` nor wall-clock timestamps: every fact is supplied by
 * the caller, and an unobserved fact must be passed explicitly as unknown. Absent evidence
 * can never become success here.
 */

/** Counts are null when genuinely unobserved. Null is unknown, never zero. */
export type Progress = { required: number | null; verified: number | null };

export interface StatusFacts {
    local: {
        savedRevision: number | null | 'unknown';
        editing: 'clean' | 'dirty';
        lastSave: 'idle' | 'failed';
        recovery: 'unknown' | 'none' | 'confirmed' | 'failed';
    };
    cloud: {
        observation: null | {
            remoteRevision: string | null;
            pendingCount: number;
            conflict: boolean;
        };
        activity: 'idle' | 'sending' | 'reauth' | 'retry';
    };
    offline: {
        shell: 'unknown' | 'verified' | 'missing';
        documents: Progress;
        sounds: Progress;
    };
}

export interface StatusView {
    local: StatusFacts['local'] & {
        status: 'save-failed' | 'unsaved' | 'unknown' | 'saved';
    };
    cloud: {
        status: 'unknown' | 'conflict' | 'queued' | 'sending' | 'confirmed' | 'not-uploaded';
        pendingCount: number | null;
        activity: StatusFacts['cloud']['activity'];
    };
    offline: StatusFacts['offline'] & { status: 'unknown' | 'incomplete' | 'ready' };
}

const EDITING = ['clean', 'dirty'] as const;
const LAST_SAVE = ['idle', 'failed'] as const;
const RECOVERY = ['unknown', 'none', 'confirmed', 'failed'] as const;
const ACTIVITY = ['idle', 'sending', 'reauth', 'retry'] as const;
const SHELL = ['unknown', 'verified', 'missing'] as const;

/** Deny by default: an unknown key is a caller mistake, not a fact to ignore. */
function object(value: unknown, path: string, keys: readonly string[]): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${path} must be a status object.`);
    }
    const record = value as Record<string, unknown>;
    for (const key of keys) {
        if (!Object.hasOwn(record, key)) {
            throw new Error(`${path}.${key} is required. An unobserved fact must be explicit.`);
        }
    }
    for (const key of Object.keys(record)) {
        if (!keys.includes(key)) {
            throw new Error(`${path}.${key} is not a known status fact.`);
        }
    }
    return record;
}

function member<T extends string>(value: unknown, path: string, allowed: readonly T[]): T {
    if (typeof value !== 'string' || !allowed.includes(value as T)) {
        throw new Error(`${path} must be one of: ${allowed.join(', ')}.`);
    }
    return value as T;
}

function boolean(value: unknown, path: string): boolean {
    if (typeof value !== 'boolean') {
        throw new Error(`${path} must be a boolean.`);
    }
    return value;
}

function count(value: unknown, path: string): number | null {
    if (value === null) {
        return null;
    }
    if (!Number.isSafeInteger(value) || (value as number) < 0) {
        throw new Error(`${path} must be a non-negative safe integer, or null when unobserved.`);
    }
    return value as number;
}

function progress(value: unknown, path: string): Progress {
    const record = object(value, path, ['required', 'verified']);
    const required = count(record.required, `${path}.required`);
    const verified = count(record.verified, `${path}.verified`);
    // Verifying more than the requirement means the caller counted two different sets.
    if (required !== null && verified !== null && verified > required) {
        throw new Error(`${path}.verified cannot exceed ${path}.required.`);
    }
    return { required, verified };
}

/** True only when both counts are observed and the requirement is not yet met. */
function short(value: Progress): boolean {
    return value.required !== null && value.verified !== null && value.verified < value.required;
}

function unobserved(value: Progress): boolean {
    return value.required === null || value.verified === null;
}

function readLocal(facts: unknown): StatusView['local'] {
    const record = object(facts, 'local', ['savedRevision', 'editing', 'lastSave', 'recovery']);
    const savedRevision =
        record.savedRevision === 'unknown'
            ? ('unknown' as const)
            : count(record.savedRevision, 'local.savedRevision');
    const local = {
        savedRevision,
        editing: member(record.editing, 'local.editing', EDITING),
        lastSave: member(record.lastSave, 'local.lastSave', LAST_SAVE),
        // Recovery of an unsaved experiment is a separate authority from explicit Save, and
        // stays reported even when the Save that followed it failed.
        recovery: member(record.recovery, 'local.recovery', RECOVERY),
    };
    // First matching condition wins. A failed Save outranks everything: it may still sit
    // beside an older successful savedRevision, which must not read as "the editor is saved".
    const status =
        local.lastSave === 'failed'
            ? ('save-failed' as const)
            : local.editing === 'dirty'
              ? ('unsaved' as const)
              : local.savedRevision === 'unknown'
                ? ('unknown' as const)
                : local.savedRevision === null
                  ? ('unsaved' as const)
                  : ('saved' as const);
    return { ...local, status };
}

function readCloud(facts: unknown): StatusView['cloud'] {
    const record = object(facts, 'cloud', ['observation', 'activity']);
    const activity = member(record.activity, 'cloud.activity', ACTIVITY);
    const observation =
        record.observation === null
            ? null
            : (() => {
                  const value = object(record.observation, 'cloud.observation', [
                      'remoteRevision',
                      'pendingCount',
                      'conflict',
                  ]);
                  const pendingCount = count(value.pendingCount, 'cloud.observation.pendingCount');
                  if (pendingCount === null) {
                      throw new Error(
                          'cloud.observation.pendingCount must be observed. Use a null observation instead.',
                      );
                  }
                  if (value.remoteRevision !== null) {
                      remoteRevision(value.remoteRevision);
                  }
                  const conflict = boolean(value.conflict, 'cloud.observation.conflict');
                  // A preserved conflict is always a specific queued Save that failed.
                  if (conflict && pendingCount === 0) {
                      throw new Error('A conflict cannot exist with an empty pending queue.');
                  }
                  return {
                      remoteRevision: value.remoteRevision as string | null,
                      pendingCount,
                      conflict,
                  };
              })();
    // Claiming an upload is in flight without an observed queue to send would let a transient
    // UI state invent progress the outbox never had.
    if (activity === 'sending' && !(observation && observation.pendingCount > 0)) {
        throw new Error('Sending requires an observation with a positive pending queue.');
    }
    const status = !observation
        ? ('unknown' as const)
        : observation.conflict
          ? ('conflict' as const)
          : observation.pendingCount > 0
            ? activity === 'sending'
                ? ('sending' as const)
                : ('queued' as const)
            : observation.remoteRevision !== null
              ? ('confirmed' as const)
              : ('not-uploaded' as const);
    // Activity survives independently: reauth and retry are wait reasons, not lost work, and
    // they never erase a conflict or the queued count beside them.
    return { status, pendingCount: observation ? observation.pendingCount : null, activity };
}

function readOffline(facts: unknown): StatusView['offline'] {
    const record = object(facts, 'offline', ['shell', 'documents', 'sounds']);
    const offline = {
        shell: member(record.shell, 'offline.shell', SHELL),
        documents: progress(record.documents, 'offline.documents'),
        sounds: progress(record.sounds, 'offline.sounds'),
    };
    // Incomplete is tested before unknown: a definitely-missing shell or a definitely-short
    // count is a known shortfall, and reporting it as unknown would hide a real gap. Zero
    // required sounds is complete only because the empty requirement was actually observed.
    const status =
        offline.shell === 'missing' || short(offline.documents) || short(offline.sounds)
            ? ('incomplete' as const)
            : offline.shell === 'unknown' ||
                unobserved(offline.documents) ||
                unobserved(offline.sounds)
              ? ('unknown' as const)
              : ('ready' as const);
    return { ...offline, status };
}

/**
 * Project independently supplied facts into three separate results. Throws on any input that
 * would require guessing: absent fields, unknown keys, negative or unsafe counts, verified
 * beyond required, a conflict with an empty queue, or sending with no observed queue.
 *
 * The returned facts are fresh copies, so a caller holding the result cannot mutate the
 * object it passed in and see the view change underneath it.
 */
export function projectSyncStatus(facts: StatusFacts): StatusView {
    const record = object(facts, 'facts', ['local', 'cloud', 'offline']);
    return {
        local: readLocal(record.local),
        cloud: readCloud(record.cloud),
        offline: readOffline(record.offline),
    };
}
