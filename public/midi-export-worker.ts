/// <reference lib="webworker" />

import { handleExport } from './engine/midi-worker-logic.js';
import {
    MIDI_EXPORT_MSG,
    MIDI_EXPORT_RESP,
    type MidiExportRequest,
    postMidiExportResponse,
} from './worker-types.js';

let started = false;

if (typeof self !== 'undefined') {
    const workerSelf = self as unknown as DedicatedWorkerGlobalScope;
    workerSelf.onmessage = (event: MessageEvent<MidiExportRequest>) => {
        const request = event.data;
        if (request.type !== MIDI_EXPORT_MSG.START) {
            return;
        }
        if (started) {
            postMidiExportResponse({
                type: MIDI_EXPORT_RESP.ERROR,
                data: 'MIDI export worker already started',
            });
            return;
        }

        started = true;
        handleExport(request.data.state, request.data.options);
    };
}
