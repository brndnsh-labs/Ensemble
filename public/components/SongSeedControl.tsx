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
    const { seed } = useEnsembleState((s) => ({
        seed: s.arranger.seed,
    }));

    const updateSeed = (val: string) => {
        dispatch(ACTIONS.SET_SONG_SEED, val);
        saveCurrentState();
    };

    const rollSeed = () => {
        dispatch(ACTIONS.SET_SONG_SEED, rollHexSeed());
        saveCurrentState();
    };

    const displayValue = seed || '—';

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
                <label class="workspace-toolbar-panel__label" htmlFor="songSeedInput">
                    Song seed
                </label>
                <div class="workspace-seed-control">
                    <div class="workspace-seed-row">
                        <input
                            id="songSeedInput"
                            type="text"
                            value={seed || ''}
                            placeholder="Random"
                            class="seed-input"
                            aria-label="Song seed"
                            onInput={(e) => updateSeed((e.target as HTMLInputElement).value)}
                        />
                        <button
                            type="button"
                            class="icon-btn"
                            title="Generate Random Seed"
                            aria-label="Generate Random Seed"
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
