import { getChordDetails } from '@engine/engine/chords-engine';

// Match the playback parser's root precedence and spelling, not a new chart language.
const ROOT = /^(?:[#b]?(?:III|II|IV|I|VII|VI|V|iii|ii|iv|i|vii|vi|v)|[#b]?[1-7]|[A-Ga-g][#b]?)/;

function supportedChord(token: string): boolean {
    const root = token.match(ROOT)?.[0];
    if (!root) {
        return false;
    }
    const tail = token.slice(root.length);
    if (tail === '6/9') {
        return true;
    }
    const [suffix, bass, extra] = tail.split('/');
    return (
        extra === undefined &&
        (bass === undefined || (!!bass && bass.match(ROOT)?.[0] === bass)) &&
        getChordDetails(suffix).suffix === suffix
    );
}

/** The legacy parser is tolerant; new editor text must never silently become another chord. */
export function validateEditorText(label: string, text: string): void {
    const bars = text.trim().replace(/^\|/, '').replace(/\|$/, '').split('|');
    for (const bar of bars) {
        if (!bar.trim()) {
            throw new Error(
                `Section ${label}: add chords to each bar. Empty bars are not supported yet.`,
            );
        }
        for (const token of bar.trim().split(/\s+/)) {
            if (!supportedChord(token)) {
                throw new Error(
                    `Section ${label}: unsupported chord spelling “${token.slice(0, 60)}”. Try Dm7, G7/B or Cmaj7; use # and b for accidentals.`,
                );
            }
        }
    }
}
