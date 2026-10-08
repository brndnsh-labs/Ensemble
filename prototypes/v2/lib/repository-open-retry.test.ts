// @vitest-environment happy-dom
/**
 * One failed open of the guest songbook must not be the answer for the rest of the page's
 * life: `open()` once kept the rejected promise, so a transient IndexedDB error left every
 * later read and write failing until a reload.
 */
import { expect, it, vi } from 'vitest';
import { installFakeIndexedDB } from '../../../tests/utils/fake-indexeddb';

it('opens the songbook again after an open that failed', async () => {
    vi.resetModules();
    installFakeIndexedDB();
    const working = globalThis.indexedDB;
    const failing = {
        open: () => {
            const request = { onerror: null as (() => void) | null };
            queueMicrotask(() => request.onerror?.());
            return request;
        },
    };
    Object.defineProperty(globalThis, 'indexedDB', { value: failing, configurable: true });
    const { list } = await import('./repository');
    await expect(list()).rejects.toThrow('Local songbook storage is unavailable');

    Object.defineProperty(globalThis, 'indexedDB', { value: working, configurable: true });
    await expect(list()).resolves.toEqual([]);
});
