import { MIXER_SETTINGS_VERSION } from './state/instruments.js';
import { getState } from './state.js';
import { showToast } from './ui.js';
import { compressSections, encodeBase64Unicode } from './utils.js';

export interface ShareOptions {
    includeSolo?: boolean;
    includeBass?: boolean;
    includeChords?: boolean;
    includeHarmony?: boolean;
    includeDrums?: boolean;
    targetDuration?: number;
    /** Appends `&autoplay=1` so the landing page shows the audition overlay. */
    autoplay?: boolean;
}

/**
 * Compresses the full band/mixer state into a Base64 string.
 */
function compressBandSettings(options: ShareOptions = {}): string {
    const { arranger, soloist, bass, chords, harmony, groove } = getState();

    const band = {
        mv: MIXER_SETTINGS_VERSION,
        s: {
            e: (options.includeSolo !== undefined ? options.includeSolo : soloist.enabled) ? 1 : 0,
            s: soloist.style,
            p: soloist.preset,
            o: soloist.octave,
            v: parseFloat(soloist.volume.toFixed(2)),
            r: parseFloat(soloist.reverb.toFixed(2)),
            m: soloist.mode,
            am: soloist.autoMode ? 1 : 0,
            sd: arranger.seed || '',
        },
        b: {
            e: (options.includeBass !== undefined ? options.includeBass : bass.enabled) ? 1 : 0,
            s: bass.style,
            o: bass.octave,
            v: parseFloat(bass.volume.toFixed(2)),
            r: parseFloat(bass.reverb.toFixed(2)),
        },
        c: {
            e: (options.includeChords !== undefined ? options.includeChords : chords.enabled)
                ? 1
                : 0,
            s: chords.style,
            o: chords.octave,
            v: parseFloat(chords.volume.toFixed(2)),
            r: parseFloat(chords.reverb.toFixed(2)),
            d: chords.density,
        },
        h: {
            e: (options.includeHarmony !== undefined ? options.includeHarmony : harmony.enabled)
                ? 1
                : 0,
            s: harmony.style,
            o: harmony.octave,
            v: parseFloat(harmony.volume.toFixed(2)),
            r: parseFloat(harmony.reverb.toFixed(2)),
            c: parseFloat(harmony.complexity.toFixed(2)),
        },
        g: {
            e: (options.includeDrums !== undefined ? options.includeDrums : groove.enabled) ? 1 : 0,
            v: parseFloat(groove.volume.toFixed(2)),
            r: parseFloat(groove.reverb.toFixed(2)),
            sw: groove.swing,
            ss: groove.swingSub,
            hu: groove.humanize,
        },
    };

    const json = JSON.stringify(band);
    return encodeBase64Unicode(json);
}

export function generateShareUrl(options: ShareOptions = {}): string {
    const { arranger, chords, groove, playback } = getState();
    const params = new URLSearchParams();
    params.set('s', compressSections(arranger.sections));
    params.set('key', arranger.key);
    params.set('ts', arranger.timeSignature);
    params.set('bpm', playback.bpm.toString());
    params.set('style', chords.style);
    params.set('genre', groove.genreFeel);
    params.set('int', playback.bandIntensity.toFixed(2));
    params.set('comp', playback.complexity.toFixed(2));
    params.set('notation', arranger.notation);

    // Add target duration if provided
    if (options.targetDuration && options.targetDuration > 0) {
        params.set('tmr', options.targetDuration.toString());
    }

    // High-fidelity band settings
    params.set('bnd', compressBandSettings(options));

    if (options.autoplay) {
        params.set('autoplay', '1');
    }

    return `${window.location.origin + window.location.pathname}?${params.toString()}`;
}

export function shareProgression(): void {
    try {
        const url = generateShareUrl();

        navigator.clipboard
            .writeText(url)
            .then(() => {
                showToast('Share link copied to clipboard!');
            })
            .catch((err) => {
                console.error('Failed to copy URL: ', err);
                showToast('Failed to copy link. Please copy it from the address bar.');
            });
    } catch (e) {
        console.error('Error generating share link:', e);
        showToast('Error generating share link.');
    }
}
