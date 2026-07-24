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
import { dispatch, getState, getSyncState, stateMap } from '../state.js';
import type { Mutable } from '../types.js';
import { ACTIONS } from '../types.js';
import { getStepsPerMeasure } from '../utils.js';
import { flushWorker, syncWorker } from '../worker-client.js';

export function setInstrumentControllerRefs(_scheduler: any): void {}

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
    let p: any = (DRUM_PRESETS as any)[name];
    if (p[arranger.timeSignature]) {
        p = { ...p, ...p[arranger.timeSignature] };
    }
    const newInstruments = groove.instruments.map((inst) => {
        const spm = getStepsPerMeasure(arranger.timeSignature);
        const pattern = p[inst.name] || new Array(spm).fill(0);
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
    const { playback, bass, soloist, chords, harmony } = getState();
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

    // 3. Prepare sync data for atomicity
    const syncData = getSyncState();

    // 4. Trigger a BUNDLED worker flush
    flushWorker(playback.step, syncData);
    restoreGains(stateMap);
}

function flushBuffer(type: string): void {
    const { playback, chords, bass, soloist, harmony } = getState();
    if (type === 'bass' || type === 'all') {
        if (bass.lastPlayedFreq !== null) {
            (bass as Mutable<typeof bass>).lastFreq = bass.lastPlayedFreq; // @direct-mutation
        }
        bass.buffer.clear();
        killBassNote(stateMap);
        killBassBus(stateMap);
    }
    if (type === 'soloist' || type === 'all') {
        if (soloist.audio.lastPlayedFreq !== null) {
            (soloist.audio as Mutable<typeof soloist.audio>).lastFreq =
                soloist.audio.lastPlayedFreq; // @direct-mutation
        }
        soloist.audio.buffer.clear();
        killSoloistNote(stateMap);
        killSoloistBus(stateMap);
    }
    if (type === 'chord' || type === 'all') {
        chords.buffer.clear();
        killAllPianoNotes(stateMap);
        killChordBus(stateMap);
    }
    if (type === 'harmony' || type === 'all') {
        harmony.buffer.clear();
        killHarmonyNote(stateMap);
        killHarmonyBus(stateMap);
    }
    if (type === 'groove' || type === 'all') {
        killDrumNote(stateMap);
        killDrumBus(stateMap);
    }

    // Solo flush (usually from UI toggles)
    if (type !== 'none') {
        flushWorker(playback.step, null);
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

    syncWorker();

    if (['chord', 'bass', 'soloist', 'harmony'].includes(normalizedType)) {
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
