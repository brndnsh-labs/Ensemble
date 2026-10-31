import { describe, expect, it } from 'vitest';
import type { SyncSnapshot } from '../../lib/account/sync-loop';
import { headerCloudLabel, type SyncStatusProps } from './library';

/** #1972 — the header's saved phrase: the menu's cloud label for the routine three, else null. */
const unobserved = { required: null, verified: null };

function props(over: {
    observation?: Partial<NonNullable<SyncSnapshot['observation']>> | null;
    sending?: boolean;
    lastSave?: SyncStatusProps['lastSave'];
    savedRevision?: SyncStatusProps['savedRevision'];
    foreign?: boolean;
    candidateKind?: SyncStatusProps['candidateKind'];
}): SyncStatusProps {
    const observation =
        over.observation === null
            ? null
            : {
                  remoteRevision: 'r1',
                  pendingCount: 0,
                  conflict: 'none' as const,
                  refused: null,
                  ...over.observation,
              };
    return {
        savedRevision: over.savedRevision ?? 3,
        editing: 'clean',
        lastSave: over.lastSave ?? 'idle',
        recovery: 'none',
        shell: 'verified',
        sounds: unobserved,
        foreign: over.foreign ?? false,
        candidateKind: over.candidateKind ?? null,
        sync: {
            owner: 'account-1',
            running: false,
            sending: over.sending ?? false,
            failure: null,
            observation,
            candidates: [],
            documents: unobserved,
            collectionSaves: 0,
            songsWaiting: 0,
            libraryVersion: 0,
            collectionsVersion: 0,
        },
    };
}

describe('headerCloudLabel', () => {
    it('says the account has a confirmed song', () => {
        expect(headerCloudLabel(props({}))).toBe('Saved to your account');
    });

    it('says a queued or sending Save is not there yet', () => {
        expect(headerCloudLabel(props({ observation: { pendingCount: 1 } }))).toBe(
            'Waiting to upload to your account',
        );
        expect(headerCloudLabel(props({ observation: { pendingCount: 1 }, sending: true }))).toBe(
            'Uploading to your account…',
        );
    });

    it.each([
        ['nothing observed yet', props({ observation: null })],
        ['never uploaded', props({ observation: { remoteRevision: null } })],
        ['a version conflict', props({ observation: { pendingCount: 1, conflict: 'version' } })],
        ['gone from the account', props({ observation: { pendingCount: 1, conflict: 'gone' } })],
        ['a refused upload', props({ observation: { pendingCount: 1, refused: 'too-large' } })],
        ['another account’s song', props({ foreign: true })],
        ['a deleted candidate beside a confirmed record', props({ candidateKind: 'deleted' })],
        ['a failed Save on this device', props({ lastSave: 'failed' })],
        ['an unknown local revision', props({ savedRevision: 'unknown' })],
    ])('keeps the device fact (null) for %s', (_, input) => {
        expect(headerCloudLabel(input)).toBeNull();
    });
});
