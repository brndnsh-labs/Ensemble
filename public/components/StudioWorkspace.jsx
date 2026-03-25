import { GENRE_NAMES, SMART_GENRES } from '../data/smart-genres.js';
import { saveCurrentState } from '../persistence.js';
import { dispatch } from '../state.js';
import { ACTIONS } from '../types.js';
import { useEnsembleState } from '../ui-bridge.js';
import { syncWorker } from '../worker-client.js';
import { GroovePanel } from './GroovePanel.jsx';
import { InstrumentPanel } from './InstrumentPanel.jsx';

function StudioGenreStrip() {
    const activeGenre = useEnsembleState(
        (/** @type {import('../types.js').EnsembleState} */ s) =>
            s.groove.lastSmartGenre || s.groove.genreFeel,
    );

    return (
        <div class="panel dashboard-panel workspace-panel workspace-studio-genre-strip">
            <div class="workspace-studio-genre-header">
                <div>
                    <p class="workspace-kicker">Band feel</p>
                    <h2 id="studioWorkspaceTitle">Choose the groove language</h2>
                </div>
                <span class="workspace-studio-genre-badge">{activeGenre}</span>
            </div>
            <div
                class="workspace-studio-genre-pills"
                role="toolbar"
                aria-label="Studio genre strip"
            >
                {GENRE_NAMES.map((genreName) => {
                    const config = /** @type {any} */ (SMART_GENRES)[genreName];
                    const isActive = activeGenre === genreName;
                    return (
                        <button
                            key={genreName}
                            type="button"
                            class={`workspace-genre-pill ${isActive ? 'active' : ''}`}
                            aria-pressed={isActive}
                            aria-label={`Set groove language to ${genreName}`}
                            onClick={() => {
                                const payload = {
                                    genreName,
                                    ...config,
                                };
                                dispatch(ACTIONS.SET_GENRE_FEEL, payload);
                                syncWorker(ACTIONS.SET_GENRE_FEEL, payload);
                                saveCurrentState();
                            }}
                        >
                            {genreName}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

export function StudioWorkspace() {
    return (
        <section
            class="workspace-view workspace-view--studio"
            data-workspace="studio"
            aria-labelledby="studioWorkspaceTitle"
        >
            <StudioGenreStrip />
            <div class="workspace-columns">
                <div class="workspace-stack">
                    <div class="workspace-group-header">
                        <p class="workspace-kicker">Rhythm section</p>
                        <h2>Foundation</h2>
                    </div>

                    <GroovePanel isActiveMobile={true} showLaunchAction={false} />
                    <InstrumentPanel
                        id="panel-chords"
                        module="chords"
                        title="Chords"
                        isActiveMobile={true}
                        showPerformanceAction={false}
                    />
                    <InstrumentPanel
                        id="panel-bass"
                        module="bass"
                        title="Bass"
                        isActiveMobile={true}
                        showPerformanceAction={false}
                    />
                </div>

                <div class="workspace-stack">
                    <div class="workspace-group-header">
                        <p class="workspace-kicker">Melodic layers</p>
                        <h2>Lead and texture</h2>
                    </div>

                    <InstrumentPanel
                        id="panel-soloist"
                        module="soloist"
                        title="Soloist"
                        isActiveMobile={true}
                        showPerformanceAction={false}
                    />
                    <InstrumentPanel
                        id="panel-harmonies"
                        module="harmony"
                        title="Harmony"
                        isActiveMobile={true}
                        showPerformanceAction={false}
                    />
                </div>
            </div>
        </section>
    );
}
