/**
 * The smallest IndexedDB `prototypes/v2/lib/repository.ts` actually drives, for node/happy-dom
 * tests that need the REAL repository rather than a stand-in for it (#1274).
 *
 * Node and happy-dom ship no IndexedDB. Rather than pull in a new dependency, this implements
 * exactly what `open()`/`save()`/`list()` call: one database, one object store keyed by `id`,
 * `get`/`put`/`getAll`, and transaction completion that fires only once every request it
 * dispatched — including one queued synchronously from inside another request's `onsuccess`,
 * which is precisely what `save()`'s read-modify-write does. Same spirit as this repo's manual
 * `Storage` mock for the v1 writers.
 *
 * `reset()` empties the store WITHOUT replacing the database object, because `repository.ts`
 * holds on to its `open()` promise for the module's lifetime: a second
 * `installFakeIndexedDB()` between tests would build a fresh store that the already-resolved
 * handle never reaches.
 */
import { vi } from 'vitest';

export interface FakeIndexedDB {
    /** Empties the object store, leaving the memoised database handle valid. */
    reset: () => void;
    /** The raw rows, for a test that wants to look without going through the repository. */
    rows: Map<string, unknown>;
}

export function installFakeIndexedDB(): FakeIndexedDB {
    const store = new Map<string, unknown>();

    function makeRequest<T>() {
        return {
            result: undefined as T | undefined,
            onsuccess: null as (() => void) | null,
            onerror: null as (() => void) | null,
        };
    }

    function transaction() {
        const tx = {
            pending: 0,
            aborted: false,
            oncomplete: null as (() => void) | null,
            onerror: null as (() => void) | null,
            onabort: null as (() => void) | null,
            objectStore: () => ({
                get(key: string) {
                    const request = makeRequest<unknown>();
                    tx.pending++;
                    queueMicrotask(() => {
                        request.result = store.get(key);
                        request.onsuccess?.();
                        settle();
                    });
                    return request;
                },
                put(value: { id: string }) {
                    const request = makeRequest<void>();
                    tx.pending++;
                    queueMicrotask(() => {
                        store.set(value.id, value);
                        request.onsuccess?.();
                        settle();
                    });
                    return request;
                },
                getAll() {
                    const request = makeRequest<unknown[]>();
                    tx.pending++;
                    queueMicrotask(() => {
                        request.result = [...store.values()];
                        request.onsuccess?.();
                        settle();
                    });
                    return request;
                },
            }),
            abort() {
                tx.aborted = true;
                queueMicrotask(() => tx.onabort?.());
            },
        };
        function settle() {
            tx.pending--;
            if (tx.pending === 0 && !tx.aborted) {
                queueMicrotask(() => {
                    if (tx.pending === 0 && !tx.aborted) {
                        tx.oncomplete?.();
                    }
                });
            }
        }
        return tx;
    }

    vi.stubGlobal('indexedDB', {
        open() {
            const request: {
                result: unknown;
                onupgradeneeded: (() => void) | null;
                onsuccess: (() => void) | null;
                onerror: (() => void) | null;
                onblocked: (() => void) | null;
            } = {
                result: undefined,
                onupgradeneeded: null,
                onsuccess: null,
                onerror: null,
                onblocked: null,
            };
            queueMicrotask(() => {
                request.result = {
                    createObjectStore: () => {},
                    transaction,
                    close() {},
                    onversionchange: null,
                };
                request.onupgradeneeded?.();
                request.onsuccess?.();
            });
            return request;
        },
    });

    return { reset: () => store.clear(), rows: store };
}
