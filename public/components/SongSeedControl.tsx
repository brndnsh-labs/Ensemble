import { saveCurrentState } from '../persistence.js';
import { dispatch } from '../state.js';
import { ACTIONS } from '../types.js';
import { useEnsembleState } from '../ui-bridge.js';
import { Icon } from './Icon.jsx';
import { ToolbarPopover } from './ToolbarPopover.jsx';

function rollHexSeed(): string {
    return Math.floor(Math.random() * 0xffffff)
        .toString(16)
        .padStart(6, '0')
        .toUpperCase();
}

export function SongSeedControl() {
    const { seed, randomizeSeed } = useEnsembleState((s) => ({
        seed: s.arranger.seed,
        randomizeSeed: s.arranger.randomizeSeed,
    }));

    const updateSeed = (val: string) => {
        dispatch(ACTIONS.SET_SONG_SEED, val);
        saveCurrentState();
    };

    const rollSeed = () => {
        dispatch(ACTIONS.SET_SONG_SEED, rollHexSeed());
        saveCurrentState();
    };

    const toggleRandomize = (on: boolean) => {
        dispatch(ACTIONS.SET_SEED_RANDOMIZE, on);
        // Locking with no seed yet: roll one so there is a concrete value to
        // see, edit, and reproduce. (Randomizing leaves the field alone — the
        // next playback re-rolls it.)
        if (!on && !seed) {
            dispatch(ACTIONS.SET_SONG_SEED, rollHexSeed());
        }
        saveCurrentState();
    };

    // When randomizing, the trigger reads "Random" (the seed re-rolls each play);
    // when locked, it shows the fixed value.
    const displayValue = randomizeSeed ? 'Random' : seed || '—';

    return (
        <ToolbarPopover
            buttonId="songSeedBtn"
            panelId="songSeedPanel"
            triggerAriaLabel="Open song seed controls"
            panelLabel="Song seed"
            triggerClassName="workspace-arranger-toolbar-trigger workspace-arranger-toolbar-trigger--seed"
            panelClassName="workspace-toolbar-panel--seed"
            triggerContent={
                <>
                    <span class="workspace-toolbar-trigger-copy">
                        <span class="workspace-toolbar-trigger-label">Seed</span>
                        <span class="workspace-toolbar-trigger-value">{displayValue}</span>
                    </span>
                    <span class="workspace-toolbar-trigger-caret" aria-hidden="true">
                        ▾
                    </span>
                </>
            }
        >
            <div class="workspace-toolbar-panel__section">
                <label class="workspace-toolbar-panel__check">
                    <input
                        id="seedRandomizeToggle"
                        type="checkbox"
                        checked={randomizeSeed}
                        onChange={(e) => toggleRandomize((e.target as HTMLInputElement).checked)}
                    />
                    <span>Randomize each playback</span>
                </label>
                <div class="workspace-seed-control">
                    <div class="workspace-seed-row">
                        <input
                            id="songSeedInput"
                            type="text"
                            value={randomizeSeed ? '' : seed || ''}
                            placeholder={randomizeSeed ? 'Random each play' : 'Set a seed'}
                            class="seed-input"
                            aria-label="Song seed"
                            disabled={randomizeSeed}
                            onInput={(e) => updateSeed((e.target as HTMLInputElement).value)}
                        />
                        <button
                            type="button"
                            class="icon-btn"
                            title="Generate Random Seed"
                            aria-label="Generate Random Seed"
                            disabled={randomizeSeed}
                            onClick={rollSeed}
                        >
                            <Icon name="dice" />
                        </button>
                    </div>
                </div>
            </div>
        </ToolbarPopover>
    );
}
