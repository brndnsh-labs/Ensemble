import { INSTRUMENT_ROLES, PLAYER_INSTRUMENTS, type PlayerInstrument } from '../lib/instrument';
import './player-prompt.css';

interface PlayerPromptProps {
    onChoose: (instrument: PlayerInstrument) => void;
}

/**
 * "What do you play?" (#1992), asked once on the stand of a device that has never answered: a
 * quiet row of choices under the transport, never a modal — the chart stays playable under it.
 * "Not now" answers "Just listening", which changes nothing; Settings changes it any time.
 */
export function PlayerPrompt({ onChoose }: PlayerPromptProps) {
    return (
        <section className="player-prompt" aria-labelledby="player-prompt-title">
            <h2 id="player-prompt-title" className="player-prompt-title">
                What do you play?
            </h2>
            <p className="player-prompt-note muted">
                Your part is muted when a song opens, and the band leaves room for it.
            </p>
            <div className="player-prompt-choices">
                {PLAYER_INSTRUMENTS.filter((id) => id !== 'listening').map((id) => (
                    <button
                        key={id}
                        type="button"
                        className="player-prompt-choice"
                        onClick={() => onChoose(id)}
                    >
                        {INSTRUMENT_ROLES[id].label}
                    </button>
                ))}
                <button
                    type="button"
                    className="player-prompt-choice quiet"
                    onClick={() => onChoose('listening')}
                >
                    Just listening
                </button>
            </div>
        </section>
    );
}
