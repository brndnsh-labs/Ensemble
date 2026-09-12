import type { ScoreDirection } from '../../../public/songbook/score-types';

/** Plain labels share the same authored navigation on the review and music stand. */
export function directionLabel(direction: ScoreDirection): string {
    switch (direction.kind) {
        case 'segno':
            return '𝄋 Segno';
        case 'coda':
            return '𝄌 Coda';
        case 'fine':
            return 'Fine';
        case 'jump': {
            const jump = direction.from === 'start' ? 'D.C.' : 'D.S.';
            const target = direction.destination;
            const ending =
                target.kind === 'fine'
                    ? ' al Fine'
                    : target.kind === 'coda'
                      ? ' al Coda'
                      : target.kind === 'ending'
                        ? ` to ending ${target.pass}`
                        : '';
            return `${jump}${ending}`;
        }
        case 'repeat-start':
            return '𝄆';
        case 'repeat-end':
            return `𝄇 ×${direction.times}`;
        case 'ending-start':
            return `Ending ${direction.passes.join(', ')}`;
        case 'ending-end':
            return 'End ending';
    }
}
