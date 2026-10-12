/**
 * Builds a soloist-state mock with the nested `audio` shape populated from a legacy flat
 * input. Tests can keep writing flat properties (e.g. `{ lastRenderedFreq: 440 }`) and this helper
 * lifts each known key into its real home, so engine code reading `soloist.audio.lastRenderedFreq`
 * sees the value.
 *
 * Every other key is kept at the top level as given (the slice's config fields are flat, and
 * tests may stash bespoke fields on the mock — these don't cross the engine boundary). The
 * helper does not validate keys against `SoloistState`.
 */
export function makeSoloistMock<T extends Record<string, unknown>>(flat: T): T {
    const out: any = {};

    // Default nested skeleton — engine code only reads, so we provide the
    // shape; tests overwrite specific leaves via the flat input below.
    const audio: any = {
        activeVoices: [],
        lastRenderedFreq: null,
    };

    // Routing: flat alias -> path in the nested shape.
    const ROUTES: Record<string, (v: unknown) => void> = {
        activeVoices: (v) => {
            audio.activeVoices = v as any;
        },
        lastRenderedFreq: (v) => {
            audio.lastRenderedFreq = v as any;
        },
    };

    for (const [k, v] of Object.entries(flat)) {
        if (ROUTES[k]) {
            ROUTES[k](v);
        } else if (k === 'audio' && v && typeof v === 'object') {
            deepMerge(audio, v as Record<string, unknown>);
        } else {
            // Config field (or a bespoke test field): keep it flat at the top.
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
