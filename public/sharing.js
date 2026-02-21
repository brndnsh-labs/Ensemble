import { getState } from './state.js';
import { showToast } from './ui.js';
import { compressSections } from './utils.js';

export function shareProgression() {
    const { arranger, chords, groove, playback } = getState();
    try {
        const params = new URLSearchParams();
        params.set('s', compressSections(arranger.sections));
        params.set('key', arranger.key);
        params.set('ts', arranger.timeSignature);
        params.set('bpm', playback.bpm);
        params.set('style', chords.style);
        params.set('genre', groove.genreFeel);
        params.set('int', playback.bandIntensity.toFixed(2));
        params.set('comp', playback.complexity.toFixed(2));
        params.set('notation', arranger.notation);
        const url = `${window.location.origin + window.location.pathname}?${params.toString()}`;

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
