const SOLOIST_MODE_ALIASES: Record<string, string> = {
    polyphonic: 'monophonic',
    piano: 'monophonic',
};

const CANONICAL_SOLOIST_MODES = new Set(['monophonic', 'guitar']);

export function resolveSoloistMode(mode: string | null | undefined): 'monophonic' | 'guitar' {
    if (typeof mode !== 'string') {
        return 'monophonic';
    }

    const canonical = SOLOIST_MODE_ALIASES[mode] || mode;

    return CANONICAL_SOLOIST_MODES.has(canonical)
        ? (canonical as 'monophonic' | 'guitar')
        : 'monophonic';
}

export function isSoloistMonophonicMode(mode: string | null | undefined): boolean {
    return resolveSoloistMode(mode) === 'monophonic';
}

export function isSoloistGuitarMode(mode: string | null | undefined): boolean {
    return resolveSoloistMode(mode) === 'guitar';
}

export function allowsSoloistPolyphony(mode: string | null | undefined): boolean {
    return !isSoloistMonophonicMode(mode);
}

export function getSoloistVoiceLimit(mode: string | null | undefined): number {
    const resolved = resolveSoloistMode(mode);
    if (resolved === 'guitar') {
        return 2;
    }
    return 1;
}

/**
 * The sample-pack voices whose timbre IS a guitar. Selecting one as the
 * soloist's lead voice implies guitar phrasing (2-voice double-stops), so in
 * Auto mode it engages guitar mode. #856.
 */
const GUITAR_SOLOIST_PACK_VOICES = new Set<string>([
    'pack:nylon-guitar',
    'pack:electric-guitar-clean',
    'pack:electric-guitar-driven',
]);

export function isGuitarSoloistVoice(voice: string | null | undefined): boolean {
    return typeof voice === 'string' && GUITAR_SOLOIST_PACK_VOICES.has(voice);
}

/**
 * Derive the soloist phrasing mode from the lead VOICE, with a genre fallback
 * (#856). A guitar pack always plays guitar (its double-stops are the idiom);
 * any other voice falls back to the genre's declared mode (Neo-Soul → guitar on
 * its synth lead) or monophonic. This is the **Auto** behavior — an explicit
 * user pin (`autoMode === false`) bypasses it. Centralizing here keeps the
 * voice→mode mapping in one place rather than a per-genre `soloistMode` table.
 */
export function deriveSoloistMode(
    voice: string | null | undefined,
    genreSoloistMode: string | null | undefined,
): 'monophonic' | 'guitar' {
    if (isGuitarSoloistVoice(voice)) {
        return 'guitar';
    }
    return resolveSoloistMode(genreSoloistMode);
}
