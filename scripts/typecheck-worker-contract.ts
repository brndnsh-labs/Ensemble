import {
    WORKER_MSG,
    WORKER_RESP,
    type WorkerRequest,
    type WorkerResponse,
} from '../public/worker-types.js';

type KnownWorkerRequestType = (typeof WORKER_MSG)[keyof typeof WORKER_MSG];
type KnownWorkerResponseType = (typeof WORKER_RESP)[keyof typeof WORKER_RESP];

function acceptWorkerRequest(_message: WorkerRequest): void {}

function acceptWorkerResponse(_message: WorkerResponse): void {}

/**
 * Compile-only contract fixture. `npm run typecheck` includes scripts, so these
 * checks make protocol drift fail before either worker can ship it.
 */
function assertWorkerMessageContract(): void {
    const requestTypesCovered: KnownWorkerRequestType extends WorkerRequest['type'] ? true : never =
        true;
    const responseTypesCovered: KnownWorkerResponseType extends WorkerResponse['type']
        ? true
        : never = true;

    const validRequests = [
        { type: WORKER_MSG.START },
        { type: WORKER_MSG.STOP },
        { type: WORKER_MSG.SYNC_STATE, data: {} },
        { type: WORKER_MSG.REQUEST_BUFFER, data: { step: 0, requestTimestamp: 1 } },
        {
            type: WORKER_MSG.FLUSH,
            data: { step: 0, syncData: null, requestTimestamp: 1 },
        },
        { type: WORKER_MSG.EXPORT, data: { filename: 'song' } },
        { type: WORKER_MSG.RESOLUTION, data: { step: 0, requestTimestamp: 1 } },
    ] satisfies WorkerRequest[];

    const validResponses = [
        {
            type: WORKER_RESP.NOTES,
            notes: [],
            requestTimestamp: null,
            workerProcessTime: 0,
        },
        { type: WORKER_RESP.TICK },
        { type: WORKER_RESP.EXPORT_PROGRESS, progress: 0.5 },
        { type: WORKER_RESP.EXPORT_COMPLETE, blob: new Uint8Array(), filename: 'song.mid' },
        { type: WORKER_RESP.ERROR, data: 'message' },
    ] satisfies WorkerResponse[];

    const exportBytes = new Uint8Array();

    // @ts-expect-error — buffer requests require the latency-correlation timestamp.
    acceptWorkerRequest({ type: WORKER_MSG.REQUEST_BUFFER, data: { step: 0 } });

    // @ts-expect-error — export progress is a normalized number, never display text.
    acceptWorkerResponse({ type: WORKER_RESP.EXPORT_PROGRESS, progress: 'half' });

    // @ts-expect-error — a completed export always carries its download filename.
    acceptWorkerResponse({ type: WORKER_RESP.EXPORT_COMPLETE, blob: exportBytes });

    // @ts-expect-error — a completed export always carries the generated MIDI bytes.
    acceptWorkerResponse({ type: WORKER_RESP.EXPORT_COMPLETE, filename: 'song.mid' });

    void requestTypesCovered;
    void responseTypesCovered;
    void validRequests;
    void validResponses;
}

void assertWorkerMessageContract;
