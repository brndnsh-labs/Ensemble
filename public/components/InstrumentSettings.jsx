import { h, Fragment } from 'preact';
import { useEnsembleState } from '../ui-bridge.js';
import { ACTIONS } from '../types.js';
import { dispatch, getState } from '../state.js';
const { playback } = getState();
import { MIXER_GAIN_MULTIPLIERS } from '../config.js';
import { saveCurrentState } from '../persistence.js';

export function InstrumentSettings({ module }) {
    const state = useEnsembleState(s => {
        const key = module === 'groove' ? 'groove' : module; 
        return s[key];
    });

    if (!state) return null;

    const moduleName = module === 'groove' ? 'drum' : 
                      module === 'chords' ? 'chord' :
                      module === 'harmony' ? 'harmony' : module;

    // Helper to update Volume/Reverb with audio ramping
    const updateAudio = (type, val) => {
        const numVal = parseFloat(val);
        const isReverb = type === 'reverb';
        
        if (state) {
            state[isReverb ? 'reverb' : 'volume'] = numVal;
            saveCurrentState();
        }

        const internalName = module === 'groove' ? 'drums' : 
                            module === 'harmony' ? 'harmonies' : module;
        
        const gainKey = isReverb ? `${internalName}Reverb` : `${internalName}Gain`;
        const multiplier = isReverb ? 1.0 : (MIXER_GAIN_MULTIPLIERS[internalName] || 1.0);
        
        if (playback[gainKey] && playback.audio) {
            const target = Math.max(0.0001, numVal * multiplier);
            playback[gainKey].gain.cancelScheduledValues(playback.audio.currentTime);
            playback[gainKey].gain.setValueAtTime(playback[gainKey].gain.value, playback.audio.currentTime);
            playback[gainKey].gain.exponentialRampToValueAtTime(target, playback.audio.currentTime + 0.04);
        }
    };

    return (
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
            {/* Left Column: Instrument Specifics */}
            <div>
                <h4 style="margin-top: 0; margin-bottom: 1rem; font-size: 0.9rem; color: var(--accent-color);">
                    {module === 'groove' ? 'Feel & Actions' : 
                     module === 'chords' || module === 'harmony' ? 'Voicing' : 'Instrument'}
                </h4>
                
                {module === 'chords' && (
                    <div style="margin-bottom: 1rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-size: 0.8rem; color: #94a3b8;">Density</label>
                        <select 
                            id="densitySelect"
                            value={state.density || 'standard'} 
                            onChange={(e) => {
                                dispatch(ACTIONS.SET_CHORD_DENSITY, e.target.value);
                                saveCurrentState();
                            }}
                            aria-label="Voicing Density"
                        >
                            <option value="thin">Thin (3 notes)</option>
                            <option value="standard">Standard (4 notes)</option>
                            <option value="rich">Rich (5+ notes)</option>
                        </select>
                    </div>
                )}

                {module === 'harmony' && (
                    <div style="margin-bottom: 1rem;">
                        <label style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.8rem; color: #94a3b8;">
                            <span>Complexity</span>
                            <span id="harmonyComplexityValue" style="color: var(--accent-color); font-weight: bold;">{Math.round((state.complexity || 0.5) * 100)}%</span>
                        </label>
                        <input 
                            id="harmonyComplexity"
                            type="range" 
                            min="0" 
                            max="1" 
                            step="0.05" 
                            value={state.complexity || 0.5} 
                            onInput={(e) => {
                                state.complexity = parseFloat(e.target.value); // Legacy mutation
                                if (document.getElementById('harmonyComplexityValue')) {
                                    document.getElementById('harmonyComplexityValue').textContent = `${Math.round(state.complexity * 100)}%`;
                                }
                                saveCurrentState();
                            }}
                            aria-label="Harmony Complexity" 
                        />
                    </div>
                )}

                {module === 'soloist' && (
                    <Fragment>
                        <div style="margin-bottom: 1rem;">
                            <label style="display: block; margin-bottom: 0.5rem; font-size: 0.8rem; color: #94a3b8;">Lead Sound</label>
                            <select
                                id="soloistPresetSelect"
                                value={state.preset || 'classic'}
                                onChange={(e) => {
                                    dispatch(ACTIONS.SET_SOLOIST_PRESET, e.target.value);
                                    saveCurrentState();
                                }}
                                aria-label="Lead Sound Preset"
                            >
                                <option value="classic">Classic Sawtooth</option>
                                <option value="neo">Neo-Juno</option>
                                <option value="vowel">Vowel Lead</option>
                            </select>
                        </div>
                        <div style="margin-bottom: 1rem;">
                            <label style="font-size: 0.75rem; color: var(--green); display: flex; align-items: center; gap: 0.25rem; cursor: pointer; border-left: 1px solid rgba(133,153,0,0.2); padding-left: 1rem;">
                                <input
                                    id="soloistDoubleStops"
                                    type="checkbox"
                                    checked={state.doubleStops}
                                    onChange={(e) => {
                                        dispatch(ACTIONS.SET_DOUBLE_STOPS, e.target.checked);
                                        saveCurrentState();
                                    }}
                                />
                                Double Stops
                            </label>
                        </div>
                    </Fragment>
                )}

                {module === 'groove' && (
                    <GrooveControls state={state} />
                )}
            </div>

            {/* Right Column: Mixer */}
            <div>
                <h4 style="margin-top: 0; margin-bottom: 1rem; font-size: 0.9rem; color: var(--accent-color);">Mixer</h4>
                <div style="margin-bottom: 1rem;">
                    <label style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.8rem; color: #94a3b8;">
                        <span>Volume</span>
                        <span style="color: var(--accent-color); font-weight: bold;">{Math.round(state.volume * 100)}%</span>
                    </label>
                    <input 
                        id={`${moduleName}Volume`}
                        type="range" 
                        min="0" 
                        max="1" 
                        step="0.05" 
                        value={state.volume} 
                        onInput={(e) => updateAudio('volume', e.target.value)}
                        aria-label={`${module} Volume`} 
                        style="width: 100%;"
                    />
                </div>
                <div>
                    <label style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.8rem; color: #94a3b8;">
                        <span>Reverb</span>
                        <span style="color: var(--accent-color); font-weight: bold;">{Math.round(state.reverb * 100)}%</span>
                    </label>
                    <input 
                        id={`${moduleName}Reverb`}
                        type="range" 
                        min="0" 
                        max="1" 
                        step="0.05" 
                        value={state.reverb} 
                        onInput={(e) => updateAudio('reverb', e.target.value)}
                        aria-label={`${module} Reverb`} 
                        style="width: 100%;"
                    />
                </div>
            </div>
        </div>
    );
}

function GrooveControls({ state }) {
    const { swing, swingSub } = useEnsembleState(s => s.playback);
    
    return (
        <div>
            <div style="margin-bottom: 1rem;">
                <label class="control-label" style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.8rem; color: #94a3b8;">
                    <span>Swing</span>
                    <span style="color: var(--accent-color); font-weight: bold;">{swing || 0}%</span>
                </label>
                <div style="display: flex; gap: 0.4rem; align-items: center;">
                    <input 
                        id="swingSlider"
                        type="range" 
                        min="0" 
                        max="100" 
                        value={swing || 0} 
                        onInput={(e) => {
                            dispatch(ACTIONS.SET_SWING, parseInt(e.target.value));
                            saveCurrentState();
                        }}
                        style="flex-grow: 1; height: 4px;" 
                        aria-label="Swing Amount" 
                    />
                    <select 
                        id="swingBaseSelect"
                        value={swingSub || '8th'}
                        onChange={(e) => {
                            dispatch(ACTIONS.SET_SWING_SUB, e.target.value);
                            saveCurrentState();
                        }}
                        aria-label="Swing Base Note"
                    >
                        <option value="16th">1/16</option>
                        <option value="8th">1/8</option>
                    </select>
                </div>
            </div>
            <div style="margin-bottom: 1rem;">
                <label class="control-label" style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.8rem; color: #94a3b8;">
                    <span>Humanize</span>
                    <span style="color: var(--accent-color); font-weight: bold;">{state.humanize || 0}%</span>
                </label>
                <input 
                    id="humanizeSlider"
                    type="range" 
                    min="0" 
                    max="100" 
                    value={state.humanize || 0} 
                    onInput={(e) => {
                         state.humanize = parseInt(e.target.value); 
                         saveCurrentState();
                    }}
                    style="width: 100%; height: 4px;" 
                    aria-label="Humanize Amount" 
                />
            </div>
            <div style="margin-bottom: 1rem; border-top: 1px solid var(--border-color); padding-top: 1rem;">
                <label style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.8rem; color: #94a3b8; cursor: pointer;">
                    <span>Lars Mode</span>
                    <input 
                        id="larsModeCheck"
                        type="checkbox" 
                        checked={state.larsMode} 
                        onChange={(e) => {
                            dispatch(ACTIONS.SET_LARS_MODE, e.target.checked);
                            saveCurrentState();
                        }}
                    />
                </label>
                <div id="larsIntensityContainer" style={{ opacity: state.larsMode ? '1' : '0.5', pointerEvents: state.larsMode ? 'auto' : 'none' }}>
                    <label style="display: flex; justify-content: space-between; margin-bottom: 0.3rem; font-size: 0.75rem; color: #64748b;">
                        <span>Lars Intensity</span>
                        <span id="larsIntensityValue" style="color: var(--accent-color); font-weight: bold;">{Math.round(state.larsIntensity * 100)}%</span>
                    </label>
                    <input 
                        id="larsIntensitySlider"
                        type="range" 
                        min="0" 
                        max="100" 
                        value={Math.round(state.larsIntensity * 100)} 
                        onInput={(e) => {
                            const val = parseInt(e.target.value);
                            dispatch(ACTIONS.SET_LARS_INTENSITY, val / 100);
                            if (document.getElementById('larsIntensityValue')) {
                                document.getElementById('larsIntensityValue').textContent = `${val}%`;
                            }
                        }}
                        style="width: 100%; height: 4px;" 
                        aria-label="Lars Mode Intensity" 
                    />
                </div>
            </div>
        </div>
    );
}
