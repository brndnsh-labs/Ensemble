import { getState, storage } from '../state.js';
import { MIXER_SETTINGS_VERSION } from './instruments.js';

let saveTimeout: ReturnType<typeof setTimeout> | undefined;

export function saveCurrentState(): void {
    const { arranger, playback, chords, bass, soloist, harmony, groove, vizState, midi } =
        getState();
    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }
    const data = {
        sections: arranger.sections,
        key: arranger.key,
        timeSignature: arranger.timeSignature,
        grouping: arranger.grouping,
        isMinor: arranger.isMinor,
        notation: arranger.notation,
        lastChordPreset: arranger.lastChordPreset,
        seed: arranger.seed,
        randomizeSeed: arranger.randomizeSeed,
        palette: playback.palette,
        mode: playback.mode,
        // #1145 — while a practice tempo ramp (#1021) is armed and in-flight,
        // `playback.bpm` is the momentarily-elevated ramped value, not the
        // user's base tempo; `rampBpmTarget` (>0 only during a live drill) is
        // the goal captured from `bpm` at play-start, and the TOGGLE_PLAY/
        // SET_PRACTICE_LOOP reducers already restore `bpm` from it on a normal
        // stop/clear. Saving `rampBpmTarget` here (when set) covers the gap
        // those reducers don't: an interrupted drill — tab close, crash, the
        // 1s debounce, or main.ts's visibilitychange flush firing mid-climb —
        // where a normal stop never ran to do the restore.
        bpm: playback.rampBpmTarget > 0 ? playback.rampBpmTarget : playback.bpm,
        complexity: playback.complexity,
        metronome: playback.metronome,
        visualFlash: playback.visualFlash,
        qualityColors: playback.qualityColors,
        countIn: playback.countIn,
        applyPresetSettings: playback.applyPresetSettings,
        sessionTimer: playback.sessionTimer,
        songMode: playback.songMode,
        vizEnabled: vizState.enabled,
        autoIntensity: playback.autoIntensity,
        practiceMode: playback.practiceMode,
        masterVolume: playback.masterVolume,
        mixerVersion: MIXER_SETTINGS_VERSION,
        chords: {
            enabled: chords.enabled,
            voice: chords.voice,
            autoSound: chords.autoSound,
            style: chords.style,
            instrument: (chords as any).instrument,
            octave: chords.octave,
            density: chords.density,
            volume: chords.volume,
            reverb: chords.reverb,
        },
        bass: {
            enabled: bass.enabled,
            voice: bass.voice,
            autoSound: bass.autoSound,
            style: bass.style,
            octave: bass.octave,
            volume: bass.volume,
            reverb: bass.reverb,
        },
        soloist: {
            enabled: soloist.enabled,
            voice: soloist.voice,
            autoSound: soloist.autoSound,
            style: soloist.style,
            preset: soloist.preset,
            octave: soloist.octave,
            volume: soloist.volume,
            reverb: soloist.reverb,
            mode: soloist.mode,
            autoMode: soloist.autoMode,
            // #1167 — the "Complexity" slider writes this. Before #1167 it wrote
            // the inert `soloist.complexity`, so nothing user-visible was lost by
            // omitting it here. Now the control is live, and leaving it unsaved
            // would silently discard the setting on reload.
            phrasingIntensity: soloist.phrasingIntensity,
        },
        harmony: {
            enabled: harmony.enabled,
            voice: harmony.voice,
            autoSound: harmony.autoSound,
            style: harmony.style,
            octave: harmony.octave,
            volume: harmony.volume,
            reverb: harmony.reverb,
            complexity: harmony.complexity,
        },
        groove: {
            enabled: groove.enabled,
            voice: groove.voice,
            autoSound: groove.autoSound,
            volume: groove.volume,
            reverb: groove.reverb,
            swing: groove.swing,
            swingSub: groove.swingSub,
            humanize: groove.humanize,
            lastDrumPreset: groove.lastDrumPreset,
            genreFeel: groove.genreFeel,
            lastSmartGenre: groove.lastSmartGenre,
            sectionSeedMap: groove.sectionSeedMap,
            pattern: groove.instruments.map((inst) => ({
                name: inst.name,
                steps: [...inst.steps],
            })),
        },
        midi: {
            enabled: midi.enabled,
            selectedOutputId: midi.selectedOutputId,
            inputEnabled: midi.inputEnabled,
            selectedInputId: midi.selectedInputId,
            chordsChannel: midi.chordsChannel,
            bassChannel: midi.bassChannel,
            soloistChannel: midi.soloistChannel,
            harmonyChannel: midi.harmonyChannel,
            drumsChannel: midi.drumsChannel,
            chordsOctave: midi.chordsOctave,
            bassOctave: midi.bassOctave,
            soloistOctave: midi.soloistOctave,
            harmonyOctave: midi.harmonyOctave,
            drumsOctave: midi.drumsOctave,
            latency: midi.latency,
            muteLocal: midi.muteLocal,
            velocitySensitivity: midi.velocitySensitivity,
        },
    };
    storage.save('currentState', data);
}

export function debounceSaveState(): void {
    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }
    saveTimeout = setTimeout(saveCurrentState, 1000);
}
