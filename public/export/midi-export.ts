import { showToast } from '../ui.js';
import { startExport } from '../worker-client.js';
import type { WorkerExportOptions } from '../worker-types.js';

export function exportToMidi(options: WorkerExportOptions = {}): Promise<void> {
    showToast('Starting MIDI Export...');

    // Validate and sanitize filename (Defense in Depth)
    if (options.filename) {
        options.filename =
            options.filename
                .replace(/[^a-zA-Z0-9\s\-_()]/g, '')
                .substring(0, 64)
                .trim() || 'ensemble-export';
    }

    return startExport(options);
}
