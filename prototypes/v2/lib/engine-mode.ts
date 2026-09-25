import { compileTimeline } from '@band/index';
import { validateSemanticScore } from '@engine/songbook/score-codec';
import { prepareScorePlayback } from '@engine/songbook/score-playback';

/**
 * The band engine (`band/`, docs/design/band-engine.md) plays every page. `?engine=old` plays
 * the old worker/scheduler generator instead, for A/B comparison until it is retired (#1404).
 * Read once per page.
 */
export const BAND_ENGINE =
    typeof window === 'undefined' ||
    new URLSearchParams(window.location.search).get('engine') !== 'old';

/**
 * Can this page's engine play the score? Throws the reason if not. Every path that lets a
 * chart onto the stand (open, edit, import, the guided form) asks here, before anything
 * changes. The old engine keeps its own capability check exactly as it was. The band engine
 * plays anything the codec accepts, so it asks only that the score is valid and that its
 * timeline compiles.
 */
export function checkPlayable(score: unknown): void {
    if (!BAND_ENGINE) {
        prepareScorePlayback(score);
        return;
    }
    const checked = validateSemanticScore(score);
    if (checked.kind !== 'ok') {
        throw new Error('The chart is invalid; its source has not been changed.');
    }
    compileTimeline(checked.value);
}
