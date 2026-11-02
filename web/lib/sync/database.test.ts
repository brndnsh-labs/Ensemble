/**
 * Blocked site data must reach account sync as a plain sentence, never the browser's own
 * `SecurityError` text (#2067). Explicit imports: the v2 build typechecks web/lib without the
 * root config's Vitest globals.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountDatabase } from './database';

describe('AccountDatabase open', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('says storage is unavailable when the indexedDB getter throws', async () => {
        vi.stubGlobal('indexedDB', {
            open() {
                throw new DOMException('The operation is insecure.', 'SecurityError');
            },
        });
        const db = new AccountDatabase();
        await expect(db.run('readonly', null, () => {})).rejects.toThrow(
            'Account storage unavailable.',
        );
    });

    it('says the same when the open request errors', async () => {
        vi.stubGlobal('indexedDB', {
            open() {
                const request = {
                    error: new DOMException('raw browser words', 'UnknownError'),
                    onerror: null as ((event: Event) => void) | null,
                };
                queueMicrotask(() => request.onerror?.(new Event('error')));
                return request;
            },
        });
        const db = new AccountDatabase();
        await expect(db.run('readonly', null, () => {})).rejects.toThrow(
            'Account storage unavailable.',
        );
    });
});
