import { ACCOUNT_DATABASE, AccountChangedError, type AccountScope } from './protocol';

export const TABLES = ['songs', 'operations', 'receipts', 'drafts', 'meta'] as const;
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
                const request = indexedDB.open(this.name, 1);
                let failed = false;
                request.onupgradeneeded = () => {
                    const db = request.result;
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
                    db.createObjectStore('meta', { keyPath: 'key' });
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
