import {
    MIDI_EXPORT_MSG,
    MIDI_EXPORT_RESP,
    type MidiExportRequest,
    type MidiExportResponse,
    WORKER_MSG,
    WORKER_RESP,
    type WorkerRequest,
    type WorkerResponse,
} from '../public/worker-types.js';

type KnownWorkerRequestType = (typeof WORKER_MSG)[keyof typeof WORKER_MSG];
type KnownWorkerResponseType = (typeof WORKER_RESP)[keyof typeof WORKER_RESP];
type KnownMidiExportRequestType = (typeof MIDI_EXPORT_MSG)[keyof typeof MIDI_EXPORT_MSG];
type KnownMidiExportResponseType = (typeof MIDI_EXPORT_RESP)[keyof typeof MIDI_EXPORT_RESP];

function acceptWorkerRequest(_message: WorkerRequest): void {}

function acceptWorkerResponse(_message: WorkerResponse): void {}
function acceptMidiExportRequest(_message: MidiExportRequest): void {}
function acceptMidiExportResponse(_message: MidiExportResponse): void {}

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
    const exportRequestTypesCovered: KnownMidiExportRequestType extends MidiExportRequest['type']
        ? true
        : never = true;
    const exportResponseTypesCovered: KnownMidiExportResponseType extends MidiExportResponse['type']
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
        { type: WORKER_RESP.ERROR, data: 'message' },
    ] satisfies WorkerResponse[];

    const validExportRequest = {
        type: MIDI_EXPORT_MSG.START,
        data: { state: {} as never, options: { filename: 'song' } },
    } satisfies MidiExportRequest;
    const validExportResponses = [
        { type: MIDI_EXPORT_RESP.PROGRESS, progress: 0.5 },
        { type: MIDI_EXPORT_RESP.COMPLETE, blob: new Uint8Array(), filename: 'song.mid' },
        { type: MIDI_EXPORT_RESP.ERROR, data: 'message' },
    ] satisfies MidiExportResponse[];

    const exportBytes = new Uint8Array();

    // @ts-expect-error — buffer requests require the latency-correlation timestamp.
    acceptWorkerRequest({ type: WORKER_MSG.REQUEST_BUFFER, data: { step: 0 } });

    // @ts-expect-error — live worker errors carry displayable text.
    acceptWorkerResponse({ type: WORKER_RESP.ERROR, data: 500 });

    // @ts-expect-error — export progress is a normalized number, never display text.
    acceptMidiExportResponse({ type: MIDI_EXPORT_RESP.PROGRESS, progress: 'half' });

    // @ts-expect-error — a completed export always carries its download filename.
    acceptMidiExportResponse({ type: MIDI_EXPORT_RESP.COMPLETE, blob: exportBytes });

    // @ts-expect-error — a completed export always carries the generated MIDI bytes.
    acceptMidiExportResponse({ type: MIDI_EXPORT_RESP.COMPLETE, filename: 'song.mid' });

    // @ts-expect-error — an export request always includes its detached generation state.
    acceptMidiExportRequest({ type: MIDI_EXPORT_MSG.START, data: { options: {} } });

    void requestTypesCovered;
    void responseTypesCovered;
    void exportRequestTypesCovered;
    void exportResponseTypesCovered;
    void validRequests;
    void validResponses;
    void validExportRequest;
    void validExportResponses;
}

void assertWorkerMessageContract;
