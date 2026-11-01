import type { ScoreDirection, SemanticScore } from '../../core/songbook/score-types';

type Sign = Extract<ScoreDirection, { kind: 'segno' | 'coda' | 'fine' }>;

function isSign(direction: ScoreDirection): direction is Sign {
    return direction.kind === 'segno' || direction.kind === 'coda' || direction.kind === 'fine';
}

function* directionsOf(score: SemanticScore): Generator<ScoreDirection> {
    for (const section of score.sections) {
        for (const measure of section.measures) {
            yield* measure.start ?? [];
            yield* measure.end ?? [];
        }
    }
}

/**
 * The signs the band follows, as `kind:label` keys (#2005). A segno is followed when a D.S. names
 * it; a Fine when a jump stops there (an al-ending jump stops at the first Fine on its way, so
 * every Fine counts); a coda when a jump or a last-chorus coda departs from or lands on it.
 * Any other sign is drawn on the chart but never changes what plays.
 */
function followedSigns(score: SemanticScore): Set<string> {
    const followed = new Set<string>();
    const fines: string[] = [];
    let endingJump = false;
    for (const direction of directionsOf(score)) {
        if (direction.kind === 'fine') {
            fines.push(direction.label);
        } else if (direction.kind === 'jump') {
            if (direction.from === 'segno' && direction.segno !== undefined) {
                followed.add(`segno:${direction.segno}`);
            }
            const to = direction.destination;
            if (to.kind === 'fine') {
                followed.add(`fine:${to.label}`);
            } else if (to.kind === 'ending') {
                endingJump = true;
            } else if (to.kind === 'coda') {
                followed.add(`coda:${to.via}`);
                followed.add(`coda:${to.target}`);
            }
        } else if (direction.kind === 'last-chorus') {
            const { via, target } = direction.destination;
            followed.add(`coda:${target}`);
            if (via !== undefined) {
                followed.add(`coda:${via}`);
            }
        }
    }
    if (endingJump) {
        for (const label of fines) {
            followed.add(`fine:${label}`);
        }
    }
    return followed;
}

/** A test for "this sign is one the band never takes in this score"; false for a non-sign. */
export function signIsIgnored(score: SemanticScore): (direction: ScoreDirection) => boolean {
    const followed = followedSigns(score);
    return (direction) =>
        isSign(direction) && !followed.has(`${direction.kind}:${direction.label}`);
}

const JUMP_TEXT = /\bD\.\s?[CS]\.[^.]*?(?:\.|$)/i;

/**
 * One plain sentence for the top of an import preview when the chart draws signs the band does
 * not take, else null (#2005). It names the jump text the chart wrote ("D.S. al 2nd ending")
 * when there is one, else the kinds of sign.
 */
export function ignoredSignsSentence(score: SemanticScore): string | null {
    const ignored = signIsIgnored(score);
    const kinds = new Set<string>();
    for (const direction of directionsOf(score)) {
        if (isSign(direction) && ignored(direction)) {
            kinds.add(direction.kind);
        }
    }
    if (kinds.size === 0) {
        return null;
    }
    // The chart's own jump words are quoted only when the band takes no jump at all; beside a
    // real jump they could name the wrong one.
    const takesAJump = [...directionsOf(score)].some(
        (d) => d.kind === 'jump' || d.kind === 'last-chorus',
    );
    let text: string | undefined;
    for (const section of takesAJump ? [] : score.sections) {
        for (const measure of section.measures) {
            for (const note of measure.annotations ?? []) {
                text ??= JUMP_TEXT.exec(note.text)?.[0].replace(/\.$/, '').trim();
            }
        }
    }
    const names = (['segno', 'coda', 'fine'] as const)
        .filter((kind) => kinds.has(kind))
        .map((kind) => ({ segno: 'Segno', coda: 'Coda', fine: 'Fine' })[kind]);
    const what = text
        ? `the ${text}`
        : `the ${names.join(', ').replace(/, (?=[^,]*$)/, ' or ')} sign${kinds.size === 1 ? '' : 's'}`;
    return `The band plays straight through and loops; it won't take ${what}.`;
}

/** The stand's tooltip for an ignored sign. */
export const IGNORED_SIGN_TITLE = "The band doesn't take this sign: it plays straight through.";

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
        case 'last-chorus':
            // A tag (#1487) has no departure: its label sits on the coda's own barline.
            return direction.destination.via === undefined
                ? 'Last chorus only'
                : 'To Coda, last chorus';
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
