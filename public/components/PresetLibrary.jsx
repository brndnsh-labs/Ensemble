import { Fragment, h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { validateAndAnalyze } from '../arranger-controller.js';
import { CHORD_PRESETS } from '../data/chord-presets.js';
import { DRUM_PRESETS } from '../data/drum-presets.js';
import { flushBuffers, loadDrumPreset, switchMeasure } from '../instrument-controller.js';
import { saveCurrentState } from '../persistence.js';
import { ACTIONS } from '../types.js';
import { useDispatch, useEnsembleState } from '../ui-bridge.js';
import { decompressSections, formatUnicodeSymbols, generateId } from '../utils.js';
import { syncWorker } from '../worker-client.js';

export function PresetLibrary({ type }) {
    const dispatch = useDispatch();
    const { lastChordPreset, lastDrumPreset, isDirty } = useEnsembleState((s) => ({
        lastChordPreset: s.arranger.lastChordPreset,
        lastDrumPreset: s.groove.lastDrumPreset,
        isDirty: s.arranger.isDirty,
    }));

    const [userPresets, setUserPresets] = useState([]);
    const [confirmSelect, setConfirmSelect] = useState(null);
    const [confirmDelete, setConfirmDelete] = useState(null);

    useEffect(() => {
        const key = type === 'chord' ? 'ensemble_userPresets' : 'ensemble_userDrumPresets';
        const load = () => {
            let data = [];
            try {
                data = JSON.parse(localStorage.getItem(key) || '[]');
                if (!Array.isArray(data)) {
                    data = [];
                }
            } catch (e) {
                console.warn(`[State] Failed to parse ${key} from storage:`, e);
            }
            setUserPresets(data);
        };
        load();

        // Listen for internal storage events (from same window)
        window.addEventListener('storage_sync', load);
        return () => window.removeEventListener('storage_sync', load);
    }, [type]);

    const presets =
        type === 'chord'
            ? CHORD_PRESETS
            : Object.keys(DRUM_PRESETS).map((name) => ({ name, ...DRUM_PRESETS[name] }));

    // Optimization: Check isDirty state instead of manual DOM manipulation in arranger-controller
    const activeId = type === 'chord' ? (isDirty ? null : lastChordPreset) : lastDrumPreset;

    const handleSelect = (item, isUser = false) => {
        if (type === 'chord') {
            if (isDirty) {
                const itemId = item.id || item.name;
                if (confirmSelect !== itemId) {
                    setConfirmSelect(itemId);
                    setConfirmDelete(null); // Clear other
                    return;
                }
                setConfirmSelect(null);
            }

            const newSections = isUser
                ? item.sections
                    ? decompressSections(item.sections)
                    : [{ id: generateId(), label: 'Main', value: item.prog }]
                : item.sections.map((s) => ({
                      id: generateId(),
                      label: s.label,
                      value: s.value,
                      repeat: s.repeat || 1,
                      key: s.key || '',
                      timeSignature: s.timeSignature || '',
                      seamless: !!s.seamless,
                  }));

            dispatch(ACTIONS.SET_ARRANGEMENT, newSections);
            dispatch(ACTIONS.SET_PARAM, { module: 'arranger', param: 'isDirty', value: false });
            dispatch(ACTIONS.SET_PARAM, {
                module: 'arranger',
                param: 'isMinor',
                value: item.isMinor || false,
            });
            dispatch(ACTIONS.SET_PARAM, {
                module: 'arranger',
                param: 'lastChordPreset',
                value: item.name,
            });

            if (item.settings) {
                if (useEnsembleState.getState().playback.applyPresetSettings) {
                    if (item.settings.bpm) {
                        dispatch(ACTIONS.SET_BPM, item.settings.bpm);
                    }
                    if (item.settings.style) {
                        dispatch(ACTIONS.SET_STYLE, {
                            module: 'chords',
                            style: item.settings.style,
                        });
                    }
                }
                if (item.settings.timeSignature) {
                    dispatch(ACTIONS.SET_PARAM, {
                        module: 'arranger',
                        param: 'timeSignature',
                        value: item.settings.timeSignature,
                    });
                } else {
                    // Default back to 4/4 if not specified in preset
                    dispatch(ACTIONS.SET_PARAM, {
                        module: 'arranger',
                        param: 'timeSignature',
                        value: '4/4',
                    });
                }
            }

            validateAndAnalyze();
            flushBuffers();
            saveCurrentState();
        } else {
            if (isUser) {
                if (item.measures) {
                    dispatch(ACTIONS.SET_PARAM, {
                        module: 'groove',
                        param: 'measures',
                        value: item.measures,
                    });
                    dispatch(ACTIONS.SET_PARAM, {
                        module: 'groove',
                        param: 'currentMeasure',
                        value: 0,
                    });
                }
                item.pattern.forEach((savedInst) => {
                    dispatch(ACTIONS.SET_GROOVE_STEPS, {
                        instrument: savedInst.name,
                        steps: savedInst.steps,
                    });
                });
                if (item.swing !== undefined) {
                    dispatch(ACTIONS.SET_PARAM, {
                        module: 'groove',
                        param: 'swing',
                        value: item.swing,
                    });
                }
                if (item.swingSub) {
                    dispatch(ACTIONS.SET_PARAM, {
                        module: 'groove',
                        param: 'swingSub',
                        value: item.swingSub,
                    });
                }
                dispatch(ACTIONS.SET_PARAM, {
                    module: 'groove',
                    param: 'lastDrumPreset',
                    value: item.name,
                });
                syncWorker();
                saveCurrentState();
            } else {
                loadDrumPreset(item.name);
                dispatch(ACTIONS.SET_PARAM, {
                    module: 'groove',
                    param: 'lastDrumPreset',
                    value: item.name,
                });
                syncWorker();
                saveCurrentState();
            }
        }
    };

    const handleDelete = (e, index) => {
        e.stopPropagation();
        if (confirmDelete !== index) {
            setConfirmDelete(index);
            setConfirmSelect(null); // Clear other
            return;
        }
        setConfirmDelete(null);

        const key = type === 'chord' ? 'ensemble_userPresets' : 'ensemble_userDrumPresets';
        const updated = [...userPresets];
        updated.splice(index, 1);
        localStorage.setItem(key, JSON.stringify(updated));
        setUserPresets(updated);
        // Trigger other components
        window.dispatchEvent(new Event('storage_sync'));
    };

    const sorted = [...presets].sort((a, b) => {
        const catA = a.category || '';
        const catB = b.category || '';
        if (catA !== catB) {
            return catA.localeCompare(catB);
        }
        return (a.name || '').localeCompare(b.name || '');
    });

    return (
        <Fragment>
            <div className="presets-container">
                {sorted.map((item, idx) => {
                    const id = item.id || item.name;
                    return (
                        <button
                            key={id}
                            className={`preset-chip ${type}-preset-chip ${activeId === id ? 'active' : ''}`}
                            onClick={() => handleSelect(item)}
                            data-id={id}
                            data-category={item.category || 'Other'}
                            style={{
                                animationDelay: `${Math.min(idx * 0.03, 0.6)}s`,
                            }}
                            aria-label={
                                confirmSelect === id
                                    ? 'Discard arrangement and load preset?'
                                    : undefined
                            }
                            aria-live={confirmSelect === id ? 'polite' : 'off'}
                        >
                            {confirmSelect === id ? '⚠️ Replace?' : formatUnicodeSymbols(item.name)}
                        </button>
                    );
                })}
            </div>

            {userPresets.length > 0 && (
                <div
                    className="user-presets-section"
                    style="border-top: 1px solid #334155; padding-top: 0.5rem; margin-top: 0.5rem;"
                >
                    <label
                        className="library-label"
                        style="font-size: 0.75rem; color: #64748b; margin-bottom: 0.4rem; display: block;"
                    >
                        User
                    </label>
                    <div className="presets-container">
                        {userPresets.map((item, idx) => {
                            const id = item.id || item.name;
                            return (
                                <button
                                    key={`user-${idx}`}
                                    className={`preset-chip user-preset-chip ${type}-preset-chip ${activeId === item.name ? 'active' : ''}`}
                                    onClick={() => handleSelect(item, true)}
                                    style={{
                                        animationDelay: `${Math.min(idx * 0.05, 0.6)}s`,
                                    }}
                                    aria-label={
                                        confirmSelect === id
                                            ? 'Discard arrangement and load preset?'
                                            : undefined
                                    }
                                    aria-live={confirmSelect === id ? 'polite' : 'off'}
                                >
                                    {confirmSelect === id ? '⚠️ Replace?' : item.name}
                                    <span
                                        className="delete-btn"
                                        onClick={(e) => handleDelete(e, idx)}
                                        style="margin-left: 0.5rem; opacity: 0.5; font-size: 0.8rem;"
                                        aria-label={
                                            confirmDelete === idx
                                                ? 'Confirm delete preset'
                                                : 'Delete preset'
                                        }
                                        aria-live={confirmDelete === idx ? 'polite' : 'off'}
                                        role={confirmDelete === idx ? 'alert' : 'button'}
                                    >
                                        {confirmDelete === idx ? '⚠️ Sure?' : '✕'}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </Fragment>
    );
}
