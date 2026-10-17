import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    clearOwnRecovery,
    clearRecovery,
    recover,
    recoveriesFor,
    recoverySlotCount,
} from '../../../prototypes/v2/lib/repository.js';
import { accountChart } from '../../utils/account-songbook-fixture.js';

/**
 * Guest recovery slots across WRITERS (#1269).
 *
 * `lib/repository.ts` gives every page load its own writer id, so one document can hold several
 * slots at once: this tab's live experiment, plus whatever an earlier load or a duplicated tab left
 * behind. Two operations care about that, in opposite directions.
 *
 * - After a Save, `clearOwnRecovery` is correct: another tab editing the same song is holding its
 *   own unsaved work, and this writer has no business discarding it.
 * - On sign-out it is not. The account's local data is being removed from a possibly shared device,
 *   and a slot an earlier load left behind holds that chart's text in plaintext just the same.
 *
 * The prefix is spelled out rather than imported because the module does not export it — the same
 * reading `prototypes/v2/checks/account-sign-out.chromium.spec.ts` takes from outside. If it ever
 * changes, these failing is the intended outcome.
 */

const RECOVERY = 'ensemble-v2-preview:recovery:';

/**
 * Node/happy-dom has no `localStorage` here (see `account-feature.test.ts`), so the scan has to be
 * given a real one. Map-backed on purpose: insertion order and, crucially, RENUMBERING on delete
 * are the Storage behaviors the index-walking scans in the module under test depend on.
 */
function fakeStorage(): Storage {
    const entries = new Map<string, string>();
    return {
        get length() {
            return entries.size;
        },
        key: (index: number) => [...entries.keys()][index] ?? null,
        getItem: (key: string) => entries.get(key) ?? null,
        setItem: (key: string, value: string) => {
            entries.set(key, value);
        },
        removeItem: (key: string) => {
            entries.delete(key);
        },
        clear: () => entries.clear(),
    } as Storage;
}

/** A slot written by some OTHER page load, which the module's own `writer` can never produce. */
function plantForeignSlot(writerId: string, id: string, title: string, capturedAt: string): void {
    localStorage.setItem(
        `${RECOVERY}${writerId}:${id}`,
        JSON.stringify({
            capturedAt,
            document: { ...accountChart(title, id), updatedAt: capturedAt },
        }),
    );
}

beforeEach(() => {
    vi.stubGlobal('localStorage', fakeStorage());
});

describe('recovery slots are counted across every writer, not just this page load', () => {
    it('counts this writer’s slot and an earlier load’s, and no other key', () => {
        recover(accountChart('Set list three', 'study'));
        plantForeignSlot('writer-earlier', 'study', 'Set list two', '2026-09-17T12:00:00.000Z');
        // Neither of these is a slot for `study`: a different document, and a key that merely
        // starts with the app's own namespace.
        plantForeignSlot('writer-earlier', 'take', 'Scratch', '2026-09-17T12:00:00.000Z');
        localStorage.setItem('ensemble-v2-preview:last-opened', 'study');

        expect(recoverySlotCount('study')).toBe(2);
        expect(recoverySlotCount('take')).toBe(1);
        expect(recoverySlotCount('never-written')).toBe(0);
    });

    it('still reads every writer’s record back, newest first', () => {
        recover({ ...accountChart('Mine', 'study'), updatedAt: '2026-09-18T09:00:00.000Z' });
        plantForeignSlot('writer-earlier', 'study', 'Theirs', '2026-09-17T12:00:00.000Z');

        const records = recoveriesFor(accountChart('Set list', 'study'));

        expect(records.map((record) => record.document.title)).toEqual(['Mine', 'Theirs']);
    });
});

describe('signing out clears every writer’s slot for a document', () => {
    it('removes the slot an earlier page load left behind, which `clearOwnRecovery` cannot', () => {
        recover(accountChart('Set list three', 'study'));
        plantForeignSlot('writer-earlier', 'study', 'Set list two', '2026-09-17T12:00:00.000Z');
        plantForeignSlot('writer-other-tab', 'study', 'Set list one', '2026-09-16T12:00:00.000Z');

        // The bug this exists to fix: the per-writer clear reaches exactly one of the three, and
        // the other two stay readable on the device after the account has been signed out of.
        clearOwnRecovery('study');
        expect(recoverySlotCount('study')).toBe(2);

        clearRecovery('study');
        expect(recoverySlotCount('study')).toBe(0);
    });

    it('leaves another document’s slots and non-recovery keys alone', () => {
        recover(accountChart('Set list three', 'study'));
        plantForeignSlot('writer-earlier', 'take', 'Scratch', '2026-09-17T12:00:00.000Z');
        localStorage.setItem('ensemble-v2-preview:last-opened', 'study');

        clearRecovery('study');

        expect(recoverySlotCount('study')).toBe(0);
        expect(recoverySlotCount('take')).toBe(1);
        expect(localStorage.getItem('ensemble-v2-preview:last-opened')).toBe('study');
    });

    it('removes a run of slots without the index walking past any of them', () => {
        // Removing inside a `localStorage.key(i)` scan renumbers every entry behind it, so a clear
        // that acted as it scanned would leave roughly half of these in place.
        for (let i = 0; i < 6; i++) {
            plantForeignSlot(`writer-${i}`, 'study', `Take ${i}`, '2026-09-17T12:00:00.000Z');
        }
        expect(recoverySlotCount('study')).toBe(6);

        clearRecovery('study');

        expect(recoverySlotCount('study')).toBe(0);
    });
});
