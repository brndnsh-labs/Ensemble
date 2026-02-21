import { getState, dispatch } from './state.js';
import { showToast } from './ui.js';
import { ACTIONS } from './types.js';
import { DRUM_PRESETS } from './presets.js';
import { saveCurrentState } from './persistence.js';
import { syncWorker, flushWorker } from './worker-client.js';
import { getStepsPerMeasure } from './utils.js';
import { restoreGains, killChordBus, killBassBus, killSoloistBus, killHarmonyBus, killDrumBus, killAllPianoNotes, killSoloistNote, killHarmonyNote, killBassNote, killDrumNote } from './engine/engine.js';

let vizRef = null;

export function setInstrumentControllerRefs(scheduler, viz) {
    vizRef = viz;
}

export function switchMeasure(idx) {
    const { groove } = getState();
    if (groove.currentMeasure === idx) return;
    groove.currentMeasure = idx; // @worker-mutation
    dispatch('MEASURE_SWITCH');
}

export function updateMeasures(val) {
    const { groove } = getState();
    groove.measures = parseInt(val); // @worker-mutation
    if (groove.currentMeasure >= groove.measures) groove.currentMeasure = 0; // @worker-mutation
    saveCurrentState();
}

export function loadDrumPreset(name) {
    const { groove, arranger } = getState();
    let p = DRUM_PRESETS[name];
    if (p[arranger.timeSignature]) {
        p = { ...p, ...p[arranger.timeSignature] };
    }
    const newInstruments = groove.instruments.map(inst => {
        const spm = getStepsPerMeasure(arranger.timeSignature);
        const pattern = p[inst.name] || new Array(spm).fill(0);
        const newSteps = new Array(128).fill(0);
        pattern.forEach((v, i) => { if (i < 128) newSteps[i] = v; });
        return { ...inst, steps: newSteps };
    });

    Object.assign(groove, {
        lastDrumPreset: name,
        measures: p.measures || 1,
        currentMeasure: 0,
        instruments: [...newInstruments], // Force new array reference
        swing: p.swing !== undefined ? p.swing : groove.swing,
        swingSub: p.sub || groove.swingSub
    });
    
    dispatch('DRUM_PRESET_LOADED');
}

export function saveDrumPreset() {
    const { groove } = getState();
    const name = prompt("Name your drum pattern:", groove.lastDrumPreset || "My Pattern");
    if (!name) return;

    const userPresets = JSON.parse(localStorage.getItem('ensemble_userDrumPresets') || '[]');
    const newPreset = {
        name: name.substring(0, 32),
        measures: groove.measures,
        swing: groove.swing,
        swingSub: groove.swingSub,
        pattern: groove.instruments.map(inst => ({
            name: inst.name,
            steps: [...inst.steps]
        })),
        timestamp: Date.now()
    };

    userPresets.push(newPreset);
    localStorage.setItem('ensemble_userDrumPresets', JSON.stringify(userPresets));
    window.dispatchEvent(new Event('storage_sync'));
    showToast(`Saved "${name}" to drum library`);
}

export function cloneMeasure() {
    const { groove, arranger } = getState();
    const spm = getStepsPerMeasure(arranger.timeSignature);
    const sourceOffset = groove.currentMeasure * spm;
    const newInstruments = groove.instruments.map(inst => {
        const newSteps = [...inst.steps];
        const pattern = inst.steps.slice(sourceOffset, sourceOffset + spm);
        for (let m = 0; m < groove.measures; m++) {
            if (m === groove.currentMeasure) continue;
            const targetOffset = m * spm;
            for (let i = 0; i < spm; i++) {
                newSteps[targetOffset + i] = pattern[i];
            }
        }
        return { ...inst, steps: newSteps };
    });
    Object.assign(groove, { instruments: newInstruments });
    showToast(`Measure ${groove.currentMeasure + 1} copied to all`);
    dispatch('DRUM_MEASURE_CLONED');
}

export function clearDrumPresetHighlight() {
    dispatch(ACTIONS.SET_PARAM, { module: 'groove', param: 'lastDrumPreset', value: null });
}

let tapTimes = [];
export function handleTap(setBpmRef) {
    const now = performance.now();
    if (tapTimes.length > 0 && now - tapTimes[tapTimes.length-1] > 2000) tapTimes = [];
    tapTimes.push(now);
    
    if (tapTimes.length > 8) tapTimes.shift();

    if (tapTimes.length >= 2) {
        const intervals = [];
        for (let i = 1; i < tapTimes.length; i++) {
            intervals.push(tapTimes[i] - tapTimes[i-1]);
        }
        const avg = intervals.reduce((a, b) => a + b) / intervals.length;
        setBpmRef(Math.round(60000 / avg));
    }
}

export function flushBuffers(primeSteps = 0) {
    const { groove, arranger, playback, chords, bass, soloist, harmony } = getState();
    // 1. Clear local buffers
    bass.buffer.clear();
    soloist.buffer.clear();
    chords.buffer.clear();
    harmony.buffer.clear();
    
    // 2. Kill current sounds and buses
    killAllPianoNotes();
    killSoloistNote();
    killBassNote();
    killDrumNote();
    
    killChordBus();
    killBassBus();
    killSoloistBus();
    killDrumBus();

    // 3. Prepare sync data for atomicity
    const syncData = {
        arranger: { 
            progression: arranger.progression, 
            stepMap: arranger.stepMap, 
            sectionMap: arranger.sectionMap,
            totalSteps: arranger.totalSteps,
            key: arranger.key,
            isMinor: arranger.isMinor,
            timeSignature: arranger.timeSignature
        },
        chords: { style: chords.style, octave: chords.octave, density: chords.density, enabled: chords.enabled, volume: chords.volume },
        bass: { style: bass.style, octave: bass.octave, enabled: bass.enabled, lastFreq: bass.lastFreq, volume: bass.volume },
        soloist: { style: soloist.style, octave: soloist.octave, enabled: soloist.enabled, lastFreq: soloist.lastFreq, volume: soloist.volume, mode: soloist.mode, sessionSteps: soloist.sessionSteps },
        harmony: { style: harmony.style, octave: harmony.octave, enabled: harmony.enabled, volume: harmony.volume, complexity: harmony.complexity },
        groove: { 
            genreFeel: groove.genreFeel, 
            enabled: groove.enabled, 
            volume: groove.volume,
            measures: groove.measures,
            swing: groove.swing,
            swingSub: groove.swingSub,
            instruments: groove.instruments.map(i => ({ name: i.name, steps: [...i.steps], muted: i.muted }))
        },
        playback: { bpm: playback.bpm, bandIntensity: playback.bandIntensity, complexity: playback.complexity, autoIntensity: playback.autoIntensity }
    };

    // 4. Trigger a BUNDLED worker flush
    flushWorker(playback.step, syncData, primeSteps);
    restoreGains();
}

export function flushBuffer(type, primeSteps = 0) {
    const { playback, chords, bass, soloist, harmony } = getState();
    if (type === 'bass' || type === 'all') {
        if (bass.lastPlayedFreq !== null) bass.lastFreq = bass.lastPlayedFreq; // @worker-mutation
        bass.buffer.clear();
        killBassNote();
        killBassBus();
    }
    if (type === 'soloist' || type === 'all') {
        if (soloist.lastPlayedFreq !== null) soloist.lastFreq = soloist.lastPlayedFreq; // @worker-mutation
        soloist.buffer.clear();
        killSoloistNote();
        killSoloistBus();
    }
    if (type === 'chord' || type === 'all') {
        chords.buffer.clear();
        killAllPianoNotes();
        killChordBus();
    }
    if (type === 'harmony' || type === 'all') {
        harmony.buffer.clear();
        killHarmonyNote();
        killHarmonyBus();
    }
    if (type === 'groove' || type === 'all') {
        killDrumNote();
        killDrumBus();
    }
    
    // Solo flush (usually from UI toggles)
    if (type !== 'none') {
        flushWorker(playback.step, null, primeSteps);
    }
    restoreGains();
}

export function togglePower(type) {
    const { groove, vizState, chords, bass, soloist, harmony } = getState();
    const normalizedType = type === 'chords' ? 'chord' : (type === 'harmonies' ? 'harmony' : type);
    
    const stateMap = {
        chord: chords,
        bass: bass,
        soloist: soloist,
        harmony: harmony,
        groove: groove,
        viz: vizState
    };

    const state = stateMap[normalizedType];
    if (!state) return;
    
    const newState = !state.enabled;
    const moduleName = normalizedType === 'chord' ? 'chords' : (normalizedType === 'viz' ? 'vizState' : normalizedType);
    
    dispatch(ACTIONS.SET_PARAM, { module: moduleName, param: 'enabled', value: newState });
    
    // If turning off Soloist, also disable automated trade modes to ensure consistent UI state
    if (normalizedType === 'soloist' && !newState) {
        dispatch(ACTIONS.SET_PARAM, { module: 'soloist', param: 'tradeMode', value: 'manual' });
    }
    
    // Viz cleanup
    if (normalizedType === 'viz' && !newState && vizRef) {
        vizRef.clear();
    }
    
    syncWorker();

    if (['chord', 'bass', 'soloist', 'harmony'].includes(normalizedType)) {
        flushBuffer(normalizedType);
    } else {
        restoreGains();
    }

    if (newState) {
        restoreGains();
    }

    saveCurrentState();
}