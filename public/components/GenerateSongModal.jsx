import { h } from 'preact';
import React from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
    clearChordPresetHighlight,
    refreshArrangerUI,
    validateAndAnalyze,
} from '../arranger-controller.js';
import { pushHistory } from '../history.js';
import { generateSong } from '../song-generator.js';
import { getState } from '../state.js';
import { ACTIONS } from '../types.js';
import { showToast } from '../ui.js';
import { useDispatch, useEnsembleState } from '../ui-bridge.js';
import { SettingGroup, SettingRow, Stepper, Toggle } from './UIControls.jsx';

export function GenerateSongModal() {
    const { arranger } = getState();
    const dispatch = useDispatch();
    const isOpen = useEnsembleState((s) => s.playback.modals.generateSong);
    const lastInteractedId = useEnsembleState((s) => s.arranger.lastInteractedSectionId);
    const sections = useEnsembleState((s) => s.arranger.sections);
    const isDirty = useEnsembleState((s) => s.arranger.isDirty);

    const overlayRef = useRef(null);

    // Internal component state for form values
    const [key, setKey] = useState('Random');
    const [isMinor, setIsMinor] = useState(false);
    const [timeSignature, setTimeSignature] = useState('Random');
    const [structure, setStructure] = useState('pop');
    const [complexity, setComplexity] = useState(0.3);
    const [useSeed, setUseSeed] = useState(false);
    const [seedType, setSeedType] = useState('Verse');

    useEffect(() => {
        if (isOpen && overlayRef.current) {
            const focusable = overlayRef.current.querySelector(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
            );
            if (focusable) {
                setTimeout(() => focusable.focus(), 50);
            }
        }
    }, [isOpen]);

    const close = () => {
        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'generateSong', open: false });
    };

    const handleConfirm = () => {
        if (isDirty && sections.length > 1) {
            if (!confirm('Replace current arrangement with generated song?')) {
                return;
            }
        }

        try {
            let seed = null;
            if (useSeed) {
                const section = sections.find((s) => s.id === lastInteractedId) || sections[0];
                if (section?.value) {
                    seed = {
                        type: seedType,
                        value: section.value,
                    };
                }
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
                    arranger.key = first.key;
                }
                if (first.timeSignature && first.timeSignature !== 'Random') {
                    arranger.timeSignature = first.timeSignature;
                }
            }

            arranger.isMinor = isMinor;
            arranger.isDirty = true;

            clearChordPresetHighlight();
            refreshArrangerUI();

            showToast('✨ Arrangement Ready!');
            close();
        } catch (e) {
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
            <div class="modal-content settings-content" onClick={(e) => e.stopPropagation()}>
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

                <div class="modal-body" style="padding: 1.5rem;">
                    {/* --- FOUNDATION --- */}
                    <SettingGroup title="1. Foundation">
                        <SettingRow label="Root Key" description="Starting key for the song">
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

                        <SettingRow label="Key Quality" description="Major or Minor mode">
                            <div class="flex-row" style="gap: 0.5rem; align-items: center;">
                                <span style={{ opacity: isMinor ? 0.5 : 1 }}>Major</span>
                                <Toggle
                                    checked={isMinor}
                                    onChange={setIsMinor}
                                    />
                                <span style={{ opacity: isMinor ? 1 : 0.5 }}>Minor</span>
                            </div>
                        </SettingRow>

                        <SettingRow label="Time Signature" description="Rhythmic meter">
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
                                onInput={(e) => setComplexity(parseFloat(e.target.value))}
                                style="width: 100px;"
                                
                            />
                        </SettingRow>
                    </SettingGroup>

                    {/* --- ADVANCED --- */}
                    <SettingGroup title="3. Seeds" style="margin-top: 1rem; border-bottom: none;">
                        <SettingRow
                            label="Seed from Current"
                            description="Use active section as a motif"
                        >
                            <Toggle
                                checked={useSeed}
                                onChange={setUseSeed}
                                
                            />
                        </SettingRow>

                        {useSeed && (
                            <div class="animate-in" style="margin-top: 0.5rem;">
                                <SettingRow
                                    label="Treat Seed as..."
                                    description="Section type for the seed"
                                >
                                    <select
                                        id="gen-seed-type"
                                        value={seedType}
                                        onChange={(e) => setSeedType(e.target.value)}
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
                </div>
            </div>
        </div>
    );
}
