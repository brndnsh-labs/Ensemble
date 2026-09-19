import { describe, expect, it } from 'vitest';
import {
    type Progress,
    projectSyncStatus,
    type StatusFacts,
} from '../../../prototypes/v2/lib/sync/status.js';

/**
 * The projection is the account UI's eventual contract, so these tests pin the ordered state
 * tables rather than a rendered badge. Nothing here contains chart text, credentials or owner
 * identifiers: the helper is deliberately unable to see them.
 */

const CLEAN_LOCAL: StatusFacts['local'] = {
    savedRevision: 3,
    editing: 'clean',
    lastSave: 'idle',
    recovery: 'none',
};
const IDLE_CLOUD: StatusFacts['cloud'] = {
    observation: { remoteRevision: 'cloud-3', pendingCount: 0, conflict: 'none', refused: null },
    activity: 'idle',
    // #1311 — the chart on the stand belongs to the account this device is attached to. Every
    // case below inherits this through `facts()`; the one that flips it is its own test.
    foreign: false,
};
const READY_OFFLINE: StatusFacts['offline'] = {
    shell: 'verified',
    documents: { required: 2, verified: 2 },
    sounds: { required: 5, verified: 5 },
};

// structuredClone, not a spread: the bases above hold nested objects (progress counts, the
// cloud observation), so a shallow copy would hand every case the SAME nested object and let
// a detachment case that mutates its input corrupt whichever test ran next.
function facts(patch: Partial<StatusFacts> = {}): StatusFacts {
    return structuredClone({
        local: { ...CLEAN_LOCAL, ...patch.local },
        cloud: { ...IDLE_CLOUD, ...patch.cloud },
        offline: { ...READY_OFFLINE, ...patch.offline },
    });
}

function local(patch: Partial<StatusFacts['local']>) {
    return projectSyncStatus(facts({ local: { ...CLEAN_LOCAL, ...patch } })).local;
}

function cloud(patch: Partial<StatusFacts['cloud']>) {
    return projectSyncStatus(facts({ cloud: { ...IDLE_CLOUD, ...patch } })).cloud;
}

function offline(patch: Partial<StatusFacts['offline']>) {
    return projectSyncStatus(facts({ offline: { ...READY_OFFLINE, ...patch } })).offline;
}

describe('local safety is separate from every cloud fact', () => {
    const cases: [string, Partial<StatusFacts['local']>, string][] = [
        [
            'a failed Save outranks an older successful revision',
            { lastSave: 'failed' },
            'save-failed',
        ],
        [
            'dirty editing is unsaved even with a committed revision',
            { editing: 'dirty' },
            'unsaved',
        ],
        ['unknown persistence is never reported as saved', { savedRevision: 'unknown' }, 'unknown'],
        ['a song never committed locally is unsaved', { savedRevision: null }, 'unsaved'],
        ['a clean editor over a committed revision is saved', {}, 'saved'],
        // Both of the next two independently satisfy a later branch (unknown persistence)
        // as well as their own; without these, swapping the ordering of the top two branches
        // with unknown persistence is invisible — a failed Save could silently soften into
        // "we're not sure", the exact lie this module exists to prevent.
        [
            'a failed Save still outranks unknown persistence',
            { lastSave: 'failed', savedRevision: 'unknown' },
            'save-failed',
        ],
        [
            'dirty editing still outranks unknown persistence',
            { editing: 'dirty', savedRevision: 'unknown' },
            'unsaved',
        ],
    ];
    for (const [name, patch, status] of cases) {
        it(name, () => expect(local(patch).status).toBe(status));
    }

    it('acknowledges the older saved version without claiming the editor is saved', () => {
        const view = local({ savedRevision: 2, lastSave: 'failed', editing: 'dirty' });
        expect(view.status).toBe('save-failed');
        // The older commit is still reported as a fact; it is simply not the editor's state.
        expect(view.savedRevision).toBe(2);
        expect(view.editing).toBe('dirty');
    });

    it('keeps draft recovery distinct from explicit Save, including after a failed Save', () => {
        expect(local({ recovery: 'confirmed', savedRevision: null }).status).toBe('unsaved');
        expect(local({ recovery: 'confirmed', savedRevision: null }).recovery).toBe('confirmed');
        expect(local({ recovery: 'failed', lastSave: 'failed' }).recovery).toBe('failed');
        expect(local({ recovery: 'unknown' }).status).toBe('saved');
    });
});

describe('cloud confirmation never borrows a local fact', () => {
    const observed = (patch: Partial<NonNullable<StatusFacts['cloud']['observation']>>) => ({
        remoteRevision: 'cloud-3' as string | null,
        pendingCount: 0,
        conflict: 'none' as NonNullable<StatusFacts['cloud']['observation']>['conflict'],
        refused: null as NonNullable<StatusFacts['cloud']['observation']>['refused'],
        ...patch,
    });

    it('an unavailable observation stays unknown rather than assuming not-uploaded', () => {
        const view = cloud({ observation: null });
        expect(view.status).toBe('unknown');
        expect(view.pendingCount).toBeNull();
    });

    it('a preserved conflict wins over queued and sending', () => {
        expect(
            cloud({ observation: observed({ pendingCount: 2, conflict: 'version' }) }).status,
        ).toBe('conflict');
        expect(
            cloud({
                observation: observed({ pendingCount: 2, conflict: 'version' }),
                activity: 'retry',
            }).status,
        ).toBe('conflict');
    });

    it('a Save refused because the cloud copy is gone is never reported as a conflict', () => {
        // #1270. A tombstoned (or never-created) id leaves the server with no version to offer,
        // so "choose which to keep" would name a choice that does not exist. It outranks the
        // two-sided conflict, the queue behind it, and every wait reason.
        expect(cloud({ observation: observed({ pendingCount: 1, conflict: 'gone' }) }).status).toBe(
            'gone',
        );
        const waiting = cloud({
            observation: observed({ pendingCount: 2, conflict: 'gone' }),
            activity: 'reauth',
        });
        expect(waiting.status).toBe('gone');
        // The queued count survives beside it: that work is still on this device.
        expect(waiting.pendingCount).toBe(2);
        expect(waiting.activity).toBe('reauth');
        // Still a conflict for the invariant's purposes: it is a specific queued Save that failed.
        expect(() =>
            cloud({ observation: observed({ pendingCount: 0, conflict: 'gone' }) }),
        ).toThrow('conflict cannot exist with an empty pending queue');
    });

    it('a permanent refusal is its own status, distinct from a version conflict (#1298)', () => {
        const tooLarge = cloud({
            observation: observed({ pendingCount: 1, refused: 'too-large' }),
        });
        expect(tooLarge.status).toBe('refused');
        expect(tooLarge.refused).toBe('too-large');
        expect(tooLarge.pendingCount).toBe(1);

        const refused = cloud({ observation: observed({ pendingCount: 2, refused: 'refused' }) });
        expect(refused.status).toBe('refused');
        expect(refused.refused).toBe('refused');

        // Every other status passes `refused` through as null, so a caller never has to guess
        // which reading is honest.
        expect(cloud({ observation: observed({ pendingCount: 1 }) }).refused).toBeNull();
        expect(cloud({ observation: null }).refused).toBeNull();
    });

    it('a nonempty queue is never confirmed, whatever the remote revision says', () => {
        expect(cloud({ observation: observed({ pendingCount: 1 }) }).status).toBe('queued');
        expect(
            cloud({ observation: observed({ pendingCount: 1 }), activity: 'sending' }).status,
        ).toBe('sending');
        expect(
            cloud({ observation: observed({ pendingCount: 1, remoteRevision: null }) }).status,
        ).toBe('queued');
    });

    it('confirmed requires both an observed remote revision and an observed empty queue', () => {
        expect(cloud({ observation: observed({}) }).status).toBe('confirmed');
        expect(cloud({ observation: observed({ remoteRevision: null }) }).status).toBe(
            'not-uploaded',
        );
    });

    it('authentication and retry are wait reasons, not lost work or confirmation', () => {
        for (const activity of ['reauth', 'retry'] as const) {
            const view = cloud({ observation: observed({ pendingCount: 3 }), activity });
            expect(view.status).toBe('queued');
            expect(view.activity).toBe(activity);
            // A transient failure cannot erase the queued count beside it.
            expect(view.pendingCount).toBe(3);
        }
        const conflicted = cloud({
            observation: observed({ pendingCount: 3, conflict: 'version' }),
            activity: 'reauth',
        });
        expect(conflicted.status).toBe('conflict');
        expect(conflicted.activity).toBe('reauth');
        expect(conflicted.pendingCount).toBe(3);
    });

    it('unsaved local editing is never treated as an upload candidate', () => {
        const view = projectSyncStatus(
            facts({
                local: { ...CLEAN_LOCAL, editing: 'dirty' },
                cloud: { observation: observed({}), activity: 'idle', foreign: false },
            }),
        );
        expect(view.local.status).toBe('unsaved');
        // The dirty editor did not add itself to the queue or invalidate the confirmation.
        expect(view.cloud.status).toBe('confirmed');
        expect(view.cloud.pendingCount).toBe(0);
    });

    it('a chart belonging to another account outranks every reading of the wrong library (#1311)', () => {
        // The exact shape the loop produces for it: it can only watch this document id in the
        // account that IS attached, which has never held it — so the observation comes back
        // empty and confirms nothing. Read as `not-uploaded`, that is an invitation to press the
        // one button guaranteed to be refused; the chart is fully saved in somebody else's
        // library, and "not in YOUR account yet" is true only in the least useful sense.
        const empty = {
            remoteRevision: null,
            pendingCount: 0,
            conflict: 'none',
            refused: null,
        } as const;
        expect(cloud({ observation: empty, activity: 'idle', foreign: false }).status).toBe(
            'not-uploaded',
        );
        expect(cloud({ observation: empty, activity: 'idle', foreign: true }).status).toBe(
            'foreign',
        );

        // It outranks a confirmation and an unobserved library too. Whatever the observation
        // beside it says, it is an answer about a different library than this chart's.
        expect(cloud({ foreign: true }).status).toBe('foreign');
        expect(cloud({ observation: null, activity: 'idle', foreign: true }).status).toBe(
            'foreign',
        );
    });

    it('refuses to guess whether a chart belongs to this account', () => {
        // The same deny-by-default rule every other fact here follows: an unobserved fact must be
        // explicit, and a missing one is a caller mistake rather than a quiet `false`.
        expect(() =>
            projectSyncStatus({
                local: CLEAN_LOCAL,
                cloud: { observation: null, activity: 'idle' } as never,
                offline: READY_OFFLINE,
            }),
        ).toThrow('cloud.foreign is required');
    });
});

describe('offline readiness reports its parts separately', () => {
    const p = (required: number | null, verified: number | null): Progress => ({
        required,
        verified,
    });

    const cases: [string, Partial<StatusFacts['offline']>, string][] = [
        ['a missing shell is incomplete', { shell: 'missing' }, 'incomplete'],
        ['short documents are incomplete', { documents: p(2, 1) }, 'incomplete'],
        ['short sounds are incomplete', { sounds: p(5, 4) }, 'incomplete'],
        ['an unknown shell is unknown', { shell: 'unknown' }, 'unknown'],
        ['an unobserved required count is unknown', { sounds: p(null, 0) }, 'unknown'],
        ['an unobserved verified count is unknown', { sounds: p(5, null) }, 'unknown'],
        // The sounds cases above prove nothing about documents: each fact is checked by its
        // own guard, and only sounds had a case exercising it.
        ['an unobserved documents count is unknown', { documents: p(null, null) }, 'unknown'],
        ['a verified shell with every requirement met is ready', {}, 'ready'],
    ];
    for (const [name, patch, status] of cases) {
        it(name, () => expect(offline(patch).status).toBe(status));
    }

    it('a known shortfall outranks an unknown elsewhere rather than hiding behind it', () => {
        expect(offline({ shell: 'unknown', sounds: p(5, 1) }).status).toBe('incomplete');
        expect(offline({ shell: 'missing', sounds: p(null, null) }).status).toBe('incomplete');
        // Same ordering claim, but for documents: the sounds-only case above cannot catch a
        // regression confined to the documents guard.
        expect(offline({ shell: 'unknown', documents: p(2, 1) }).status).toBe('incomplete');
    });

    it('zero required sounds is complete only when that empty requirement was observed', () => {
        expect(offline({ sounds: p(0, 0) }).status).toBe('ready');
        expect(offline({ sounds: p(null, 0) }).status).toBe('unknown');
    });

    it('reports document and sound progress separately, not as one number', () => {
        const view = offline({ documents: p(4, 4), sounds: p(9, 2) });
        expect(view.status).toBe('incomplete');
        expect(view.documents).toEqual(p(4, 4));
        expect(view.sounds).toEqual(p(9, 2));
    });

    it('an aborted download reports its remaining counts, not a new claim of readiness', () => {
        // The helper does not own transfer lifecycle: an abort arrives as counts or unknowns.
        expect(offline({ sounds: p(9, 6) }).status).toBe('incomplete');
        expect(offline({ sounds: p(9, null) }).status).toBe('unknown');
    });

    it('an account being present proves nothing about readiness', () => {
        // There is no account input at all; readiness can only come from verified evidence.
        expect(
            offline({ shell: 'unknown', documents: p(null, null), sounds: p(null, null) }),
        ).toMatchObject({ status: 'unknown' });
    });
});

describe('the offline Save journey keeps the three results independent', () => {
    // Save A -> edit B -> Save C -> edit D, then A and C are acknowledged.
    const journey: [string, StatusFacts, [string, string, string]][] = [
        [
            'A queued offline while B is being edited',
            facts({
                local: {
                    savedRevision: 0,
                    editing: 'dirty',
                    lastSave: 'idle',
                    recovery: 'confirmed',
                },
                cloud: {
                    observation: {
                        remoteRevision: null,
                        pendingCount: 1,
                        conflict: 'none',
                        refused: null,
                    },
                    activity: 'idle',
                    foreign: false,
                },
                offline: {
                    shell: 'verified',
                    documents: { required: 1, verified: 1 },
                    sounds: { required: 5, verified: 5 },
                },
            }),
            ['unsaved', 'queued', 'ready'],
        ],
        [
            'C queued behind A while D is being edited',
            facts({
                local: {
                    savedRevision: 1,
                    editing: 'dirty',
                    lastSave: 'idle',
                    recovery: 'confirmed',
                },
                cloud: {
                    observation: {
                        remoteRevision: null,
                        pendingCount: 2,
                        conflict: 'none',
                        refused: null,
                    },
                    activity: 'sending',
                    foreign: false,
                },
            }),
            ['unsaved', 'sending', 'ready'],
        ],
        [
            'A acknowledged, C still queued',
            facts({
                local: {
                    savedRevision: 1,
                    editing: 'dirty',
                    lastSave: 'idle',
                    recovery: 'confirmed',
                },
                cloud: {
                    observation: {
                        remoteRevision: 'cloud-1',
                        pendingCount: 1,
                        conflict: 'none',
                        refused: null,
                    },
                    activity: 'idle',
                    foreign: false,
                },
            }),
            ['unsaved', 'queued', 'ready'],
        ],
        [
            'C acknowledged while D remains an unsaved experiment',
            facts({
                local: {
                    savedRevision: 1,
                    editing: 'dirty',
                    lastSave: 'idle',
                    recovery: 'confirmed',
                },
                cloud: {
                    observation: {
                        remoteRevision: 'cloud-2',
                        pendingCount: 0,
                        conflict: 'none',
                        refused: null,
                    },
                    activity: 'idle',
                    foreign: false,
                },
            }),
            ['unsaved', 'confirmed', 'ready'],
        ],
        [
            'C conflicts instead, so both queued Saves and D survive',
            facts({
                local: {
                    savedRevision: 1,
                    editing: 'dirty',
                    lastSave: 'idle',
                    recovery: 'confirmed',
                },
                cloud: {
                    observation: {
                        remoteRevision: 'cloud-1',
                        pendingCount: 1,
                        conflict: 'version',
                        refused: null,
                    },
                    activity: 'idle',
                    foreign: false,
                },
            }),
            ['unsaved', 'conflict', 'ready'],
        ],
        [
            'the local write itself failed',
            facts({
                local: {
                    savedRevision: 1,
                    editing: 'dirty',
                    lastSave: 'failed',
                    recovery: 'failed',
                },
                cloud: {
                    observation: {
                        remoteRevision: 'cloud-1',
                        pendingCount: 0,
                        conflict: 'none',
                        refused: null,
                    },
                    activity: 'idle',
                    foreign: false,
                },
            }),
            ['save-failed', 'confirmed', 'ready'],
        ],
        [
            'the session expired with work still queued',
            facts({
                local: { savedRevision: 1, editing: 'clean', lastSave: 'idle', recovery: 'none' },
                cloud: {
                    observation: {
                        remoteRevision: 'cloud-1',
                        pendingCount: 2,
                        conflict: 'none',
                        refused: null,
                    },
                    activity: 'reauth',
                    foreign: false,
                },
            }),
            ['saved', 'queued', 'ready'],
        ],
        [
            'a sound went missing, invalidating readiness without touching save state',
            facts({
                local: { savedRevision: 1, editing: 'clean', lastSave: 'idle', recovery: 'none' },
                offline: {
                    shell: 'verified',
                    documents: { required: 2, verified: 2 },
                    sounds: { required: 5, verified: 3 },
                },
            }),
            ['saved', 'confirmed', 'incomplete'],
        ],
        [
            'the shell itself can no longer be verified',
            facts({
                offline: {
                    shell: 'unknown',
                    documents: { required: null, verified: null },
                    sounds: { required: null, verified: null },
                },
            }),
            ['saved', 'confirmed', 'unknown'],
        ],
    ];

    for (const [name, input, [expectedLocal, expectedCloud, expectedOffline]] of journey) {
        it(name, () => {
            const view = projectSyncStatus(input);
            expect(view.local.status).toBe(expectedLocal);
            expect(view.cloud.status).toBe(expectedCloud);
            expect(view.offline.status).toBe(expectedOffline);
        });
    }
});

describe('inputs that would require guessing are rejected, never defaulted', () => {
    it('rejects absent facts rather than treating them as success', () => {
        expect(() => projectSyncStatus({} as unknown as StatusFacts)).toThrow('local is required');
        const missing = facts() as unknown as Record<string, Record<string, unknown>>;
        delete missing.local.recovery;
        expect(() => projectSyncStatus(missing as unknown as StatusFacts)).toThrow(
            'local.recovery is required',
        );
    });

    it('rejects unknown keys instead of silently ignoring a fact it does not model', () => {
        const extra = facts() as unknown as Record<string, Record<string, unknown>>;
        extra.offline.online = true;
        expect(() => projectSyncStatus(extra as unknown as StatusFacts)).toThrow(
            'offline.online is not a known status fact',
        );
    });

    it('rejects negative and unsafe counts', () => {
        expect(() => offline({ sounds: { required: -1, verified: 0 } })).toThrow(
            'non-negative safe integer',
        );
        expect(() => offline({ sounds: { required: 1.5, verified: 0 } })).toThrow(
            'non-negative safe integer',
        );
        expect(() => offline({ sounds: { required: Number.NaN, verified: 0 } })).toThrow();
        expect(() => local({ savedRevision: -1 })).toThrow('non-negative safe integer');
    });

    it('rejects verifying more than the known requirement', () => {
        expect(() => offline({ sounds: { required: 2, verified: 3 } })).toThrow(
            'cannot exceed offline.sounds.required',
        );
    });

    it('rejects a conflict with an empty queue', () => {
        expect(() =>
            cloud({
                observation: {
                    remoteRevision: 'cloud-3',
                    pendingCount: 0,
                    conflict: 'version',
                    refused: null,
                },
            }),
        ).toThrow('conflict cannot exist with an empty pending queue');
    });

    it('rejects a refusal with an empty queue', () => {
        expect(() =>
            cloud({
                observation: {
                    remoteRevision: 'cloud-3',
                    pendingCount: 0,
                    conflict: 'none',
                    refused: 'too-large',
                },
            }),
        ).toThrow('refusal cannot exist with an empty pending queue');
    });

    it('rejects sending without an observed positive queue', () => {
        expect(() =>
            cloud({
                observation: {
                    remoteRevision: 'cloud-3',
                    pendingCount: 0,
                    conflict: 'none',
                    refused: null,
                },
                activity: 'sending',
            }),
        ).toThrow('positive pending queue');
        expect(() => cloud({ observation: null, activity: 'sending' })).toThrow(
            'positive pending queue',
        );
    });

    it('rejects an unobserved pending count inside an observation', () => {
        expect(() =>
            cloud({
                observation: {
                    remoteRevision: 'cloud-3',
                    pendingCount: null,
                    conflict: 'none',
                    refused: null,
                } as unknown as StatusFacts['cloud']['observation'],
            }),
        ).toThrow('must be observed');
    });

    it('validates remote revisions with the existing sync validator', () => {
        expect(() =>
            cloud({
                observation: {
                    remoteRevision: 'not a revision!',
                    pendingCount: 0,
                    conflict: 'none',
                    refused: null,
                },
            }),
        ).toThrow('Invalid remote revision');
    });

    it('rejects unknown enum members', () => {
        expect(() =>
            local({ editing: 'maybe' as unknown as StatusFacts['local']['editing'] }),
        ).toThrow('local.editing must be one of');
        expect(() =>
            offline({ shell: 'probably' as unknown as StatusFacts['offline']['shell'] }),
        ).toThrow('offline.shell must be one of');
    });

    // Every case above feeds a wrong-but-well-typed value. These feed structurally wrong
    // shapes instead, so a guard's own strictness (not just its enum table) is on the hook.
    it('rejects a conflict term outside the closed set, including a truthy boolean', () => {
        for (const wrong of ['yes', true, 1]) {
            expect(() =>
                cloud({
                    observation: {
                        remoteRevision: 'cloud-3',
                        pendingCount: 1,
                        conflict: wrong as unknown as 'none',
                        refused: null,
                    },
                }),
            ).toThrow('must be one of: none, version, gone');
        }
    });

    it('rejects a refusal term outside the closed set', () => {
        expect(() =>
            cloud({
                observation: {
                    remoteRevision: 'cloud-3',
                    pendingCount: 1,
                    conflict: 'none',
                    refused: 'quota' as unknown as 'refused',
                },
            }),
        ).toThrow('must be one of: too-large, refused');
    });

    it('rejects an unsafe integer count, not just a negative one', () => {
        expect(() => local({ savedRevision: 2 ** 53 + 2 })).toThrow('non-negative safe integer');
    });

    it('rejects explicit undefined the same as an absent field', () => {
        expect(() => local({ savedRevision: undefined as unknown as number })).toThrow(
            'non-negative safe integer',
        );
    });

    it('rejects an array standing in for a status object', () => {
        expect(() =>
            projectSyncStatus({ ...facts(), offline: [] as unknown as StatusFacts['offline'] }),
        ).toThrow('offline must be a status object');
    });

    it('rejects a required fact reachable only through the prototype chain', () => {
        // Bypasses facts()/structuredClone deliberately: a spread merge only copies OWN
        // properties, which would silently drop the inherited key before it ever reached
        // the guard under test, and structuredClone does not preserve custom prototypes.
        const withoutOwnRecovery = Object.assign(Object.create({ recovery: 'none' }), {
            savedRevision: 3,
            editing: 'clean',
            lastSave: 'idle',
        }) as StatusFacts['local'];
        expect(() =>
            projectSyncStatus({
                local: withoutOwnRecovery,
                cloud: IDLE_CLOUD,
                offline: READY_OFFLINE,
            }),
        ).toThrow('local.recovery is required');
    });
});

describe('retained facts are detached copies', () => {
    it('mutating the caller input afterwards cannot change an existing view', () => {
        const input = facts();
        const view = projectSyncStatus(input);
        input.offline.sounds.verified = 0;
        // documents alongside sounds: a leak confined to one Progress field must not hide
        // behind an assertion that only ever exercises the other one.
        input.offline.documents.verified = 0;
        input.local.savedRevision = 99;
        expect(view.offline.sounds).toEqual({ required: 5, verified: 5 });
        expect(view.offline.documents).toEqual({ required: 2, verified: 2 });
        expect(view.offline.status).toBe('ready');
        expect(view.local.savedRevision).toBe(3);
    });

    it('mutating a returned view cannot change the caller input or a later projection', () => {
        const input = facts();
        const view = projectSyncStatus(input);
        view.offline.sounds.verified = 0;
        view.offline.documents.verified = 0;
        expect(input.offline.sounds.verified).toBe(5);
        expect(input.offline.documents.verified).toBe(2);
        expect(projectSyncStatus(input).offline.sounds.verified).toBe(5);
        expect(projectSyncStatus(input).offline.documents.verified).toBe(2);
    });
});
