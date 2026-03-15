import { Fragment, h } from 'preact';
import React from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
    clearChordPresetHighlight,
    refreshArrangerUI,
    validateAndAnalyze,
} from '../arranger-controller.js';
import { SONG_TEMPLATES } from '../data/song-templates.js';
import { pushHistory } from '../history.js';
import { generateSong } from '../song-generator.js';
import { getState } from '../state.js';
import { ACTIONS } from '../types.js';
import { showToast } from '../ui.js';
import { useDispatch, useEnsembleState } from '../ui-bridge.js';
import { generateId } from '../utils.js';
import { ButtonGroup, SettingGroup, SettingRow, Stepper, Toggle } from './UIControls.jsx';

export function GenerateSongModal() {
    const { arranger } = getState();
    const dispatch = useDispatch();
    const isOpen = useEnsembleState((s) => s.playback.modals.generateSong);
    const lastInteractedId = useEnsembleState((s) => s.arranger.lastInteractedSectionId);
    const sections = useEnsembleState((s) => s.arranger.sections);
    const isDirty = useEnsembleState((s) => s.arranger.isDirty);

    const overlayRef = useRef(null);

    // Internal component state for form values
    const [activeTab, setActiveTab] = useState('templates');
    const [key, setKey] = useState(arranger.key);
    const [isMinor, setIsMinor] = useState(arranger.isMinor);
    const [timeSignature, setTimeSignature] = useState(arranger.timeSignature);
    const [structure, setStructure] = useState('pop');
    const [complexity, setComplexity] = useState(0.3);
    const [seedMode, setSeedMode] = useState('none');
    const [selectedSectionId, setSelectedSectionId] = useState(
        lastInteractedId || (sections?.[0]?.id ?? ''),
    );
    const [manualSeedValue, setManualSeedValue] = useState('');
    const [seedType, setSeedType] = useState('Verse');
    const [hasGenerated, setHasGenerated] = useState(false);

    const prevOpenRef = useRef(false);

    useEffect(() => {
        if (isOpen && !prevOpenRef.current) {
            setHasGenerated(false);

            // Focus first element
            if (overlayRef.current) {
                const focusable = overlayRef.current.querySelector(
                    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
                );
                if (focusable) {
                    setTimeout(() => focusable.focus(), 50);
                }
            }
        }
        prevOpenRef.current = isOpen;
    }, [isOpen]);

    useEffect(() => {
        if (isOpen) {
            setKey(arranger.key);
            setIsMinor(arranger.isMinor);
            setTimeSignature(arranger.timeSignature);
            setSelectedSectionId(lastInteractedId || (sections?.[0]?.id ?? ''));
        }
    }, [
        isOpen,
        arranger.key,
        arranger.isMinor,
        arranger.timeSignature,
        lastInteractedId,
        sections,
    ]);

    const close = () => {
        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'generateSong', open: false });
    };

    const applyTemplate = (template) => {
        if (
            !confirm(
                `Apply "${template.name}" template? This will replace your current arrangement.`,
            )
        ) {
            return;
        }

        try {
            pushHistory();

            const newSections = template.sections.map((s) => ({
                id: generateId(),
                label: s.label,
                value: s.value,
                repeat: s.repeat || 1,
            }));

            dispatch(ACTIONS.SET_ARRANGEMENT, newSections);

            arranger.isDirty = true; // @direct-mutation
            if (template.isMinor !== undefined) {
                arranger.isMinor = template.isMinor; // @direct-mutation
            }

            clearChordPresetHighlight();
            refreshArrangerUI();

            setTimeout(() => {
                showToast('✨ Template Applied!');
                setHasGenerated(true);
            }, 50);
        } catch (e) {
            if (e.name === 'TypeError' && e.message.includes('currentTime')) {
                // Audio not initialized, ignore this error as it's expected if no user gesture yet
                setHasGenerated(true);
                return;
            }
            console.error('Template application failed:', e);
            showToast('Template application failed.');
        }
    };

    const handleConfirm = () => {
        if (hasGenerated) {
            close();
            return;
        }

        if (isDirty && sections.length > 1) {
            if (!confirm('Replace current arrangement with generated song?')) {
                return;
            }
        }

        try {
            let seed = null;
            if (seedMode === 'existing') {
                const section = sections.find((s) => s.id === selectedSectionId) || sections[0];
                if (section?.value) {
                    seed = {
                        type: seedType,
                        value: section.value,
                    };
                }
            } else if (seedMode === 'manual' && manualSeedValue.trim() !== '') {
                seed = {
                    type: seedType,
                    value: manualSeedValue.trim(),
                };
            }

            const newSections = generateSong({
                key,
                isMinor,
                timeSignature,
                structure,
                complexity,
                seed,
            });

            pushHistory();

            dispatch(ACTIONS.SET_ARRANGEMENT, newSections);

            if (newSections.length > 0) {
                const first = newSections[0];
                if (first.key && first.key !== 'Random') {
                    arranger.key = first.key; // @direct-mutation
                }
                if (first.timeSignature && first.timeSignature !== 'Random') {
                    arranger.timeSignature = first.timeSignature; // @direct-mutation
                }
            }

            arranger.isMinor = isMinor; // @direct-mutation
            arranger.isDirty = true; // @direct-mutation

            clearChordPresetHighlight();
            refreshArrangerUI();

            setTimeout(() => {
                showToast('✨ Arrangement Ready!');
                setHasGenerated(true);
            }, 50);
        } catch (e) {
            if (e.name === 'TypeError' && e.message.includes('currentTime')) {
                // Audio not initialized, ignore this error as it's expected if no user gesture yet
                setHasGenerated(true);
                return;
            }
            console.error('Generation failed explicitly:', e);
            showToast('Generation failed. Check console for details.');
        }
    };
    const structureOptions = [
        { id: 'pop', label: 'Pop 🎤', desc: 'Standard Verse-Chorus-Bridge' },
        { id: 'jazz', label: 'Jazz 🎷', desc: 'AABA Standard Form' },
        { id: 'blues', label: 'Blues 🎸', desc: '12-Bar Blues Form' },
        { id: 'ballad', label: 'Ballad 🎹', desc: 'Melodic & Sentimental' },
        { id: 'simple', label: 'Simple 🎵', desc: 'Basic Verse-Chorus' },
        { id: 'loop', label: 'Loop 🔄', desc: 'Short 4-Bar Phrase' },
    ];

    return (
        <div
            id="generateSongOverlay"
            ref={overlayRef}
            class={`modal-overlay ${isOpen ? 'active' : ''}`}
            aria-hidden={!isOpen ? 'true' : 'false'}
            role="dialog"
            aria-modal="true"
            aria-labelledby="generate-song-title"
            onClick={(e) => {
                if (e.target.id === 'generateSongOverlay') {
                    close();
                }
            }}
        >
            <div
                class="modal-content settings-content"
                style="min-height: 700px; display: flex; flex-direction: column;"
                onClick={(e) => e.stopPropagation()}
            >
                <div class="modal-header-shared">
                    <h2 id="generate-song-title">Inspiration Hub</h2>
                    <button
                        id="closeGenerateSongBtn"
                        class="close-btn"
                        aria-label="Close"
                        onClick={close}
                    >
                        &times;
                    </button>
                </div>

                <div class="modal-body" style="padding: 1.5rem; flex-grow: 1;">
                    {hasGenerated ? (
                        <div
                            class="animate-in"
                            style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2rem 0; text-align: center;"
                        >
                            <div
                                style="font-size: 4rem; margin-bottom: 1rem; filter: drop-shadow(0 0 10px var(--accent-color));"
                                aria-hidden="true"
                            >
                                ✨
                            </div>
                            <h3 style="margin-bottom: 0.5rem; color: var(--accent-color);">
                                Arrangement Ready!
                            </h3>
                            <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 2rem;">
                                Your new arrangement is ready to play.
                            </p>
                            <button
                                class="primary-btn"
                                style="width: 100%; padding: 1rem; font-size: 1rem;"
                                onClick={close}
                            >
                                👍 Done
                            </button>
                        </div>
                    ) : (
                        <div class="generate-form animate-in">
                            <div style="display: flex; justify-content: center; margin-bottom: 2rem; background: var(--input-bg); padding: 0.5rem; border-radius: 12px; border: 1px solid var(--border-color);">
                                <ButtonGroup
                                    style={{ gap: '0.5rem', width: '100%' }}
                                    options={[
                                        {
                                            label: '📚 Structure Library',
                                            value: 'templates',
                                            style: {
                                                flex: 1,
                                                padding: '0.75rem',
                                                fontSize: '1rem',
                                                borderRadius: '8px',
                                            },
                                        },
                                        {
                                            label: '🎲 Randomize',
                                            value: 'generator',
                                            style: {
                                                flex: 1,
                                                padding: '0.75rem',
                                                fontSize: '1rem',
                                                borderRadius: '8px',
                                            },
                                        },
                                    ]}
                                    value={activeTab}
                                    onChange={setActiveTab}
                                />
                            </div>

                            {activeTab === 'templates' ? (
                                <SettingGroup title="Song Templates">
                                    <p class="setting-description" style="margin-bottom: 1.5rem;">
                                        Select a curated song structure to replace your current
                                        arrangement.
                                    </p>
                                    <div
                                        class="template-grid"
                                        style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem; padding-bottom: 1rem;"
                                    >
                                        {SONG_TEMPLATES.map((template) => (
                                            <button
                                                key={template.name}
                                                class="template-card-btn"
                                                style="padding: 1.25rem; background: var(--input-bg); border: 1px solid var(--border-color); border-radius: 12px; color: var(--text-color); cursor: pointer; text-align: left; transition: all 0.2s; display: flex; flex-direction: column; gap: 0.25rem;"
                                                onClick={() => applyTemplate(template)}
                                                onMouseOver={(e) => {
                                                    e.currentTarget.style.borderColor =
                                                        'var(--accent-color)';
                                                    e.currentTarget.style.transform =
                                                        'translateY(-2px)';
                                                }}
                                                onMouseOut={(e) => {
                                                    e.currentTarget.style.borderColor =
                                                        'var(--border-color)';
                                                    e.currentTarget.style.transform =
                                                        'translateY(0)';
                                                }}
                                            >
                                                <div style="font-weight: bold; color: var(--accent-color); font-size: 1rem;">
                                                    {template.name}
                                                </div>
                                                <div style="font-size: 0.75rem; color: var(--text-muted);">
                                                    {template.sections.length} Sections •{' '}
                                                    {template.sections.reduce(
                                                        (acc, s) => acc + (s.repeat || 1),
                                                        0,
                                                    )}{' '}
                                                    Blocks
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </SettingGroup>
                            ) : (
                                <Fragment>
                                    {/* --- FOUNDATION --- */}
                                    <SettingGroup title="1. Foundation">
                                        <SettingRow
                                            label="Root Key"
                                            description="Starting key for the song"
                                        >
                                            <select
                                                id="gen-root-key"
                                                value={key}
                                                onChange={(e) => setKey(e.target.value)}
                                                style="min-width: 100px;"
                                            >
                                                <option value="Random">Random</option>
                                                <option value="C">C</option>
                                                <option value="Db">Db</option>
                                                <option value="D">D</option>
                                                <option value="Eb">Eb</option>
                                                <option value="E">E</option>
                                                <option value="F">F</option>
                                                <option value="Gb">Gb</option>
                                                <option value="G">G</option>
                                                <option value="Ab">Ab</option>
                                                <option value="A">A</option>
                                                <option value="Bb">Bb</option>
                                                <option value="B">B</option>
                                            </select>
                                        </SettingRow>

                                        <SettingRow
                                            label="Key Quality"
                                            description="Major or Minor mode"
                                        >
                                            <div
                                                class="flex-row"
                                                style="gap: 0.5rem; align-items: center;"
                                            >
                                                <span style={{ opacity: isMinor ? 0.5 : 1 }}>
                                                    Major
                                                </span>
                                                <Toggle checked={isMinor} onChange={setIsMinor} />
                                                <span style={{ opacity: isMinor ? 1 : 0.5 }}>
                                                    Minor
                                                </span>
                                            </div>
                                        </SettingRow>

                                        <SettingRow
                                            label="Time Signature"
                                            description="Rhythmic meter"
                                        >
                                            <select
                                                id="gen-time-sig"
                                                value={timeSignature}
                                                onChange={(e) => setTimeSignature(e.target.value)}
                                                style="min-width: 100px;"
                                            >
                                                <option value="Random">Random</option>
                                                <option value="4/4">4/4</option>
                                                <option value="3/4">3/4</option>
                                                <option value="2/4">2/4</option>
                                                <option value="5/4">5/4</option>
                                                <option value="6/8">6/8</option>
                                                <option value="7/8">7/8</option>
                                                <option value="12/8">12/8</option>
                                            </select>
                                        </SettingRow>
                                    </SettingGroup>

                                    {/* --- VIBE & STYLE --- */}
                                    <SettingGroup title="2. Vibe & Style" style="margin-top: 1rem;">
                                        <SettingRow
                                            label="Structure"
                                            description="The architectural form of the song"
                                        >
                                            <select
                                                id="gen-structure"
                                                value={structure}
                                                onChange={(e) => setStructure(e.target.value)}
                                                style="min-width: 150px;"
                                            >
                                                {structureOptions.map((opt) => (
                                                    <option key={opt.id} value={opt.id}>
                                                        {opt.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </SettingRow>

                                        <SettingRow
                                            label="Complexity"
                                            description="Influences chord extensions (7ths, 9ths)"
                                            valueDisplay={
                                                <span
                                                    style={{
                                                        color: 'var(--accent-color)',
                                                        fontWeight: 'bold',
                                                        marginRight: '0.5rem',
                                                    }}
                                                >
                                                    {Math.round(complexity * 100)}%
                                                </span>
                                            }
                                        >
                                            <input
                                                type="range"
                                                min="0"
                                                max="1"
                                                step="0.1"
                                                value={complexity}
                                                onInput={(e) =>
                                                    setComplexity(parseFloat(e.target.value))
                                                }
                                                style="width: 100px;"
                                            />
                                        </SettingRow>
                                    </SettingGroup>

                                    {/* --- ADVANCED --- */}
                                    <SettingGroup
                                        title="3. Seeds"
                                        style="margin-top: 1rem; border-bottom: none;"
                                    >
                                        <SettingRow
                                            label="Seed Source"
                                            description="Base the new song on a motif"
                                        >
                                            <select
                                                value={seedMode}
                                                onChange={(e) => setSeedMode(e.target.value)}
                                                style="min-width: 150px;"
                                            >
                                                <option value="none">None</option>
                                                <option value="existing">Existing Section</option>
                                                <option value="manual">Manual Entry</option>
                                            </select>
                                        </SettingRow>

                                        {seedMode === 'existing' && (
                                            <div class="animate-in" style="margin-top: 0.5rem;">
                                                <SettingRow
                                                    label="Select Section"
                                                    description="Choose a section to use as a seed"
                                                >
                                                    <select
                                                        value={selectedSectionId}
                                                        onChange={(e) =>
                                                            setSelectedSectionId(e.target.value)
                                                        }
                                                        style="min-width: 150px;"
                                                    >
                                                        {sections.map((s) => (
                                                            <option key={s.id} value={s.id}>
                                                                {s.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </SettingRow>
                                            </div>
                                        )}

                                        {seedMode === 'manual' && (
                                            <div class="animate-in" style="margin-top: 0.5rem;">
                                                <SettingRow
                                                    label="Chord Progression"
                                                    description="e.g. I | IV | V"
                                                >
                                                    <input
                                                        type="text"
                                                        value={manualSeedValue}
                                                        onInput={(e) =>
                                                            setManualSeedValue(e.target.value)
                                                        }
                                                        placeholder="I | IV | V"
                                                        style="width: 100%; padding: 0.5rem; background: var(--input-bg); color: var(--text-color); border: 1px solid var(--border-color); border-radius: 4px;"
                                                    />
                                                </SettingRow>
                                            </div>
                                        )}

                                        {seedMode !== 'none' && (
                                            <div class="animate-in" style="margin-top: 0.5rem;">
                                                <SettingRow
                                                    label="Treat Seed as..."
                                                    description="Section type for the seed"
                                                >
                                                    <select
                                                        id="gen-seed-type"
                                                        value={seedType}
                                                        onChange={(e) =>
                                                            setSeedType(e.target.value)
                                                        }
                                                        style="min-width: 100px;"
                                                    >
                                                        <option value="Verse">Verse</option>
                                                        <option value="Chorus">Chorus</option>
                                                        <option value="Bridge">Bridge</option>
                                                        <option value="Intro">Intro</option>
                                                    </select>
                                                </SettingRow>
                                            </div>
                                        )}
                                    </SettingGroup>

                                    <button
                                        class="primary-btn"
                                        style="width: 100%; margin-top: 1rem; padding: 1rem; font-size: 1rem;"
                                        onClick={handleConfirm}
                                    >
                                        ✨ Generate New Arrangement
                                    </button>
                                </Fragment>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
