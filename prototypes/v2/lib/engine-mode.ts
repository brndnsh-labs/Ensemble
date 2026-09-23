import { compileTimeline } from '@band/index';
import { validateSemanticScore } from '@engine/songbook/score-codec';
import { prepareScorePlayback } from '@engine/songbook/score-playback';

/**
 * `?engine=next` plays the new band engine (`band/`, docs/design/band-engine.md) in place of
 * the worker/scheduler generator. Read once per page.
 */
export const ENGINE_NEXT =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('engine') === 'next';

/**
 * Can this page's engine play the score? Throws the reason if not. Every path that lets a
 * chart onto the stand (open, edit, import, the guided form) asks here, before anything
 * changes. The old engine keeps its own capability check exactly as it was. The band engine
 * plays anything the codec accepts, so it asks only that the score is valid and that its
 * timeline compiles.
 */
export function checkPlayable(score: unknown): void {
    if (!ENGINE_NEXT) {
        prepareScorePlayback(score);
        return;
    }
    const checked = validateSemanticScore(score);
    if (checked.kind !== 'ok') {
        throw new Error('The chart is invalid; its source has not been changed.');
    }
    compileTimeline(checked.value);
}
