import { startExport } from './worker-client.js';
import { showToast } from './ui.js';
import { syncWorker } from './worker-client.js';

export function exportToMidi(options = {}) {
    showToast("Starting MIDI Export...");

    // Validate and sanitize filename (Defense in Depth)
    if (options.filename) {
        options.filename = options.filename
            .replace(/[^a-zA-Z0-9\s\-_()]/g, '')
            .substring(0, 64)
            .trim() || 'ensemble-export';
    }

    // Ensure worker has latest state
    syncWorker();
    startExport(options);
}
