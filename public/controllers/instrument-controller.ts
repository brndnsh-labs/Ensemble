import { validateProgression } from '../engine/chords-engine.js';
import {
    killAllPianoNotes,
    killBassBus,
    killBassNote,
    killChordBus,
    killDrumBus,
    killDrumNote,
    killHarmonyBus,
    killHarmonyNote,
    killSoloistBus,
    killSoloistNote,
    restoreGains,
} from '../engine/engine.js';
import { dispatch, getState, stateMap } from '../state.js';
import type { Mutable } from '../types.js';
import { ACTIONS } from '../types.js';
import { getStepsPerMeasure } from '../utils.js';

export function switchMeasure(idx: number): void {
    const { groove } = getState();
    if (groove.currentMeasure === idx) {
        return;
    }
    dispatch(ACTIONS.SET_ACTIVE_MEASURE, idx);
}

export async function loadDrumPreset(name: string): Promise<void> {
    const { groove, arranger } = getState();
    const { DRUM_PRESETS } = await import('../data/drum-presets.js');
    // #1244 — an unknown name falls back instead of throwing. This is a public
    // entrypoint whose main.ts call site passes the *persisted* `lastDrumPreset`,
    // which a corrupt or rolled-back payload can leave holding anything. The throw
    // was invisible when it happened: this function is `async` and that call site
    // neither awaits nor voids it, so a bad name surfaced as an unhandled rejection
    // and a silently empty drum grid rather than an error anyone could see.
    // `Object.hasOwn`, not `??` — a name like 'toString' would otherwise resolve to
    // an inherited prototype member and read as a (nonsense) preset.
    const presets = DRUM_PRESETS as any;
    let p: any = Object.hasOwn(presets, name) ? presets[name] : presets['Basic Rock'];
    if (p[arranger.timeSignature]) {
        p = { ...p, ...p[arranger.timeSignature] };
    }
    const newInstruments = groove.instruments.map((inst) => {
        const spm = getStepsPerMeasure(arranger.timeSignature);
        const rawPattern = p[inst.name] || new Array(spm).fill(0);
        // The catalog mixes numeric hits with compact string grids for default rests.
        const pattern =
            typeof rawPattern === 'string' ? Array.from(rawPattern, Number) : rawPattern;
        const newSteps = new Array(128).fill(0);
        pattern.forEach((v: any, i: number) => {
            if (i < 128) {
                newSteps[i] = v;
            }
        });
        return { ...inst, steps: newSteps };
    });

    dispatch(ACTIONS.SET_PARAM, { module: 'groove', param: 'lastDrumPreset', value: name });
    dispatch(ACTIONS.SET_PARAM, { module: 'groove', param: 'measures', value: p.measures || 1 });
    dispatch(ACTIONS.SET_ACTIVE_MEASURE, 0);
    dispatch(ACTIONS.SET_PARAM, {
        module: 'groove',
        param: 'instruments',
        value: [...newInstruments],
    });
    dispatch(ACTIONS.SET_PARAM, {
        module: 'groove',
        param: 'swing',
        value: p.swing !== undefined ? p.swing : groove.swing,
    });
    dispatch(ACTIONS.SET_PARAM, {
        module: 'groove',
        param: 'swingSub',
        value: p.sub || groove.swingSub,
    });

    dispatch(ACTIONS.DRUM_PRESET_LOADED);
}

let tapTimes: number[] = [];

export function handleTap(setBpmRef: (bpm: number) => void): void {
    const now = performance.now();
    if (tapTimes.length > 0 && now - tapTimes[tapTimes.length - 1] > 2000) {
        tapTimes = [];
    }
    tapTimes.push(now);

    if (tapTimes.length > 8) {
        tapTimes.shift();
    }

    if (tapTimes.length >= 2) {
        const intervals = [];
        for (let i = 1; i < tapTimes.length; i++) {
            intervals.push(tapTimes[i] - tapTimes[i - 1]);
        }
        let sum = 0;
        for (let i = 0; i < intervals.length; i++) {
            sum += intervals[i];
        }
        const avg = sum / intervals.length;
        setBpmRef(Math.round(60000 / avg));
    }
}

export function flushBuffers(): void {
    const { bass, soloist, chords, harmony } = getState();
    // 1. Clear local buffers
    bass.buffer.clear();
    soloist.audio.buffer.clear();
    chords.buffer.clear();
    harmony.buffer.clear();

    // 2. Kill current sounds and buses
    killAllPianoNotes(stateMap);
    killSoloistNote(stateMap);
    killBassNote(stateMap);
    killDrumNote(stateMap);
    killHarmonyNote(stateMap);

    killChordBus(stateMap);
    killBassBus(stateMap);
    killSoloistBus(stateMap);
    killDrumBus(stateMap);
    killHarmonyBus(stateMap);

    restoreGains(stateMap);
}

function flushBuffer(...types: string[]): void {
    const { chords, bass, soloist, harmony } = getState();
    const has = (lane: string) => types.includes(lane) || types.includes('all');
    if (has('bass')) {
        if (bass.lastPlayedFreq !== null) {
            (bass as Mutable<typeof bass>).lastFreq = bass.lastPlayedFreq; // @direct-mutation
        }
        bass.buffer.clear();
        killBassNote(stateMap);
        killBassBus(stateMap);
    }
    if (has('soloist')) {
        if (soloist.audio.lastPlayedFreq !== null) {
            (soloist.audio as Mutable<typeof soloist.audio>).lastFreq =
                soloist.audio.lastPlayedFreq; // @direct-mutation
        }
        soloist.audio.buffer.clear();
        killSoloistNote(stateMap);
        killSoloistBus(stateMap);
    }
    if (has('chord')) {
        chords.buffer.clear();
        killAllPianoNotes(stateMap);
        killChordBus(stateMap);
    }
    if (has('harmony')) {
        harmony.buffer.clear();
        killHarmonyNote(stateMap);
        killHarmonyBus(stateMap);
    }
    if (has('groove')) {
        killDrumNote(stateMap);
        killDrumBus(stateMap);
    }
    restoreGains(stateMap);
}

export function togglePower(type: string): void {
    const { groove, vizState, chords, bass, soloist, harmony } = getState();
    const normalizedType = type === 'chords' ? 'chord' : type === 'harmonies' ? 'harmony' : type;

    const stateMap = {
        chord: chords,
        bass: bass,
        soloist: soloist,
        harmony: harmony,
        groove: groove,
        viz: vizState,
    };

    const state = (stateMap as any)[normalizedType];
    if (!state) {
        return;
    }

    const newState = !state.enabled;
    const moduleName =
        normalizedType === 'chord'
            ? 'chords'
            : normalizedType === 'viz'
              ? 'vizState'
              : normalizedType;

    dispatch(ACTIONS.SET_PARAM, { module: moduleName, param: 'enabled', value: newState });

    // Soloist Phrasing Improvements
    if (normalizedType === 'soloist') {
        if (newState) {
            // Turning ON: Force a clean entry on the next measure
            dispatch(ACTIONS.SET_PARAM, {
                module: 'soloist',
                param: 'isWaitingForEntry',
                value: true,
            });
            dispatch(ACTIONS.SET_PARAM, { module: 'soloist', param: 'isResting', value: true });
            dispatch(ACTIONS.SET_PARAM, { module: 'soloist', param: 'isYielding', value: false });
        } else {
            // Turning OFF: Reset flags
            dispatch(ACTIONS.SET_PARAM, { module: 'soloist', param: 'tradeMode', value: 'manual' });
            dispatch(ACTIONS.SET_PARAM, { module: 'soloist', param: 'isYielding', value: false });
            dispatch(ACTIONS.SET_PARAM, {
                module: 'soloist',
                param: 'isWaitingForEntry',
                value: false,
            });
        }
    }

    // Viz cleanup is now handled by the component's unmount/disable effect

    // #1313 — chord voicings are baked at parse time and depend on whether a bass
    // line is sounding (rootless shells + a higher floor with it, rooted voicings
    // without). Muting the bass is "I'm playing that part", so the comp has to be
    // re-voiced NOW or it keeps the rootless shapes with nothing stating the root.
    // Mutate -> validate -> flush. Flush every lane that reads the re-voiced progression
    // (chords + harmony, not just the bass buffer) — but NOT the drums or the
    // soloist: a player muting the bass mid-groove must not hear the time hiccup.
    const bassToggled = normalizedType === 'bass';
    if (bassToggled) {
        // getState(), NOT `stateMap`: this function's local `stateMap` is the lane
        // lookup above and shadows the imported state tree.
        validateProgression(getState(), dispatch);
    }

    if (bassToggled) {
        flushBuffer('bass', 'chord', 'harmony');
    } else if (['chord', 'soloist', 'harmony'].includes(normalizedType)) {
        flushBuffer(normalizedType);
    } else {
        restoreGains(getState());
    }

    if (newState) {
        restoreGains(getState());
    }

    // #1144 — no immediate save: the SET_PARAM dispatch above (enabled, plus
    // the soloist flag dispatches) already schedules the #1127 chokepoint's
    // debounced save.
}
