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

export function isSoloistPianoMode(_mode: string | null | undefined): boolean {
    return false;
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
