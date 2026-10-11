/**
 * Builds a soloist-state mock with the nested `audio` shape populated from a legacy flat
 * input. Tests can keep writing flat properties (e.g. `{ lastFreq: 440 }`) and this helper
 * lifts each known key into its real home, so engine code reading `soloist.audio.lastFreq`
 * sees the value.
 *
 * Unknown keys are kept at the top level (for forward compat with tests that
 * stash bespoke fields on the soloist mock — these don't cross the engine
 * boundary).
 */
export function makeSoloistMock<T extends Record<string, unknown>>(flat: T): T {
    const out: any = {};

    // Config (flat at the top)
    const CONFIG = new Set([
        'enabled',
        'mode',
        'style',
        'volume',
        'reverb',
        'complexity',
        'doubleStopProb',
        'seed',
    ]);

    // Default nested skeleton — engine code only reads, so we provide the
    // shape; tests overwrite specific leaves via the flat input below.
    const audio: any = {
        activeVoices: [],
        buffer: new Map(),
        lastFreq: null,
        lastRenderedFreq: null,
        lastPlayedFreq: null,
    };

    // Routing: flat alias -> path in the nested shape.
    const ROUTES: Record<string, (v: unknown) => void> = {
        activeVoices: (v) => {
            audio.activeVoices = v as any;
        },
        buffer: (v) => {
            audio.buffer = v as any;
        },
        lastFreq: (v) => {
            audio.lastFreq = v as any;
        },
        lastRenderedFreq: (v) => {
            audio.lastRenderedFreq = v as any;
        },
        lastPlayedFreq: (v) => {
            audio.lastPlayedFreq = v as any;
        },
    };

    for (const [k, v] of Object.entries(flat)) {
        if (CONFIG.has(k)) {
            out[k] = v;
        } else if (ROUTES[k]) {
            ROUTES[k](v);
        } else if (k === 'audio' && v && typeof v === 'object') {
            deepMerge(audio, v as Record<string, unknown>);
        } else {
            // Unknown key — preserve at top level for back-compat with tests
            // that stash bespoke fields here.
            out[k] = v;
        }
    }

    out.audio = audio;
    return out as T;
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): void {
    for (const [k, v] of Object.entries(source)) {
        if (
            v &&
            typeof v === 'object' &&
            !Array.isArray(v) &&
            target[k] &&
            typeof target[k] === 'object' &&
            !Array.isArray(target[k])
        ) {
            deepMerge(target[k] as Record<string, unknown>, v as Record<string, unknown>);
        } else {
            target[k] = v;
        }
    }
}
