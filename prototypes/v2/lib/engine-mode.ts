import { compileTimeline } from '@band/index';
import { validateSemanticScore } from '@engine/songbook/score-codec';

/**
 * Can the band engine (`band/`, docs/design/band-engine.md) play the score? Throws the reason
 * if not. Every path that lets a chart onto the stand (open, edit, import, the guided form) asks
 * here, before anything changes. The band plays anything the codec accepts, so it asks only
 * that the score is valid and that its timeline compiles.
 */
export function checkPlayable(score: unknown): void {
    const checked = validateSemanticScore(score);
    if (checked.kind !== 'ok') {
        throw new Error('The chart is invalid; its source has not been changed.');
    }
    compileTimeline(checked.value);
}
