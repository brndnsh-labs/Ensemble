import { ACCOUNT_DATABASE, AccountChangedError, type AccountScope } from './protocol';

export const TABLES = ['songs', 'operations', 'receipts', 'drafts', 'meta', 'collections'] as const;

/**
 * Version 2 (#1474) adds the `collections` store and nothing else. The upgrade is additive by
 * construction: each step only CREATES what its version introduced, keyed on the version the
 * database is coming from, so a version-1 database keeps every existing store and every row in it
 * untouched (`tests/browser/account-collections.browser.test.ts` proves the rows byte-identical).
 * Never add a step here that reads, rewrites or deletes existing records — that is a migration,
 * a separate decision with its own brakes.
 */
export const ACCOUNT_DATABASE_VERSION = 2;
export type Table = (typeof TABLES)[number];

interface ActiveAccount {
    key: 'active';
    ownerId: string | null;
    generation: number;
}

export interface Transaction<T> {
    table(name: Table): IDBObjectStore;
    read<V>(request: IDBRequest<V>, consume: (value: V) => void): void;
    finish(value: T): void;
}

/** Every result is published on transaction completion, never on a request's success. */
export class AccountDatabase {
    private opening: Promise<IDBDatabase> | undefined;
    private readonly name: string;

    constructor(name = ACCOUNT_DATABASE) {
        if (!name.startsWith(ACCOUNT_DATABASE)) {
            throw new Error('Invalid account database name.');
        }
        this.name = name;
    }

    private open(): Promise<IDBDatabase> {
        if (!this.opening) {
            const opening = new Promise<IDBDatabase>((resolve, reject) => {
                const request = indexedDB.open(this.name, ACCOUNT_DATABASE_VERSION);
                let failed = false;
                request.onupgradeneeded = (event) => {
                    const db = request.result;
                    if (event.oldVersion < 1) {
                        db.createObjectStore('songs', { keyPath: ['ownerId', 'documentId'] });
                        const operations = db.createObjectStore('operations', {
                            keyPath: ['ownerId', 'operationId'],
                        });
                        operations.createIndex('song', ['ownerId', 'documentId']);
                        db.createObjectStore('receipts', { keyPath: ['ownerId', 'operationId'] });
                        const drafts = db.createObjectStore('drafts', {
                            keyPath: ['ownerId', 'documentId', 'writerId'],
                        });
                        drafts.createIndex('song', ['ownerId', 'documentId']);
                        // Generic keyed store, four namespaces: the `'active'` account pointer, the
                        // `remote:<owner>:<document>` candidates a library download preserves, the
                        // `delete:<owner>:<document>` frozen deletions (#1270) and the
                        // `last-opened:<owner>` preference (#1299). See `candidateKey`,
                        // `deletionKey` and `lastOpenedKey` in `protocol.ts` for why they all
                        // live here.
                        db.createObjectStore('meta', { keyPath: 'key' });
                    }
                    if (event.oldVersion < 2) {
                        // The collection half of `songs` (#1474): one row per (owner, collection),
                        // keyed exactly like a song so every owner-bounded range reads both alike.
                        // Its queued Saves share `operations` and `receipts` with the songs', which
                        // is why it lives in THIS database: a Save and its acknowledgement commit
                        // the record and the outbox in one transaction.
                        db.createObjectStore('collections', { keyPath: ['ownerId', 'documentId'] });
                    }
                };
                request.onblocked = () => {
                    failed = true;
                    reject(
                        new Error('Account storage is blocked by another tab. Close it and retry.'),
                    );
                };
                request.onerror = () =>
                    reject(request.error ?? new Error('Account storage unavailable.'));
                request.onsuccess = () => {
                    if (failed) {
                        request.result.close();
                        return;
                    }
                    request.result.onversionchange = () => {
                        request.result.close();
                        this.opening = undefined;
                    };
                    resolve(request.result);
                };
            });
            this.opening = opening;
            void opening.catch(() => {
                if (this.opening === opening) {
                    this.opening = undefined;
                }
            });
        }
        return this.opening;
    }

    async close(): Promise<void> {
        const pending = this.opening;
        this.opening = undefined;
        (await pending)?.close();
    }

    async run<T>(
        mode: IDBTransactionMode,
        scope: AccountScope | null,
        work: (transaction: Transaction<T>) => void,
    ): Promise<T> {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            // One serialized owner fence covers reads, Saves, recoveries and acknowledgements.
            // Callbacks are synchronous; no network/crypto await can deactivate the transaction.
            const tx = db.transaction([...TABLES], mode);
            let failure: unknown;
            let finished = false;
            let result: T;
            const guard = (action: () => void) => {
                try {
                    action();
                } catch (error) {
                    failure = error;
                    tx.abort();
                }
            };
            const context: Transaction<T> = {
                table: (name) => tx.objectStore(name),
                read: (request, consume) => {
                    request.onsuccess = () => guard(() => consume(request.result));
                },
                finish: (value) => {
                    finished = true;
                    result = value;
                },
            };
            tx.oncomplete = () =>
                finished
                    ? resolve(result)
                    : reject(new Error('Account transaction did not finish.'));
            tx.onabort = () =>
                reject(failure ?? tx.error ?? new Error('Account write interrupted.'));
            tx.onerror = () => {
                failure ??=
                    tx.error ?? new Error('Account storage failed; work has not been committed.');
            };
            guard(() => {
                context.read(
                    tx.objectStore('meta').get('active'),
                    (active: ActiveAccount | undefined) => {
                        if (
                            scope &&
                            (!active ||
                                active.ownerId !== scope.ownerId ||
                                active.generation !== scope.generation)
                        ) {
                            throw new AccountChangedError();
                        }
                        work(context);
                    },
                );
            });
        });
    }
}
