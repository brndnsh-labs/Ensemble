import { showToast } from './ui.js';
import { startExport, syncWorker } from './worker-client.js';

/** @param {any} [options={}] */
export function exportToMidi(options = {}) {
    showToast('Starting MIDI Export...');

    // Validate and sanitize filename (Defense in Depth)
    if (options.filename) {
        options.filename =
            options.filename
                .replace(/[^a-zA-Z0-9\s\-_()]/g, '')
                .substring(0, 64)
                .trim() || 'ensemble-export';
    }

    // Ensure worker has latest state
    syncWorker();
    startExport(options);
}
