import type { AccountScope, PreparedSave } from './protocol';
import { copyScope } from './records';
import type { AccountSongbook } from './repository';

export type SaveTransport = (request: PreparedSave) => Promise<unknown>;

/** One ordered step. The future authenticated host owns retries and connection lifecycle. */
export async function sendNext(
    songbook: AccountSongbook,
    scope: AccountScope,
    documentId: string,
    transport: SaveTransport,
): Promise<'idle' | 'conflict' | 'committed' | 'retry'> {
    scope = copyScope(scope);
    const request = await songbook.prepare(scope, documentId);
    if (typeof request === 'string') {
        return request;
    }
    let response: unknown;
    try {
        response = await transport(Object.freeze({ ...request }));
    } catch {
        // Uncertain delivery retains the frozen request, even if the server committed it.
        // A storage/account failure is not a transport retry: let the caller handle it.
        await songbook.pending(scope, documentId);
        return 'retry';
    }
    return songbook.acknowledge(scope, request, response);
}
