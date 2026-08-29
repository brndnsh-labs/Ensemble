import type { EnsembleState } from '../types.js';
import { compingState, resetCompingState } from './comping-state.js';
import { clearHarmonyMemory } from './harmonies.js';

/**
 * Clears module-level generative memory that is not isolated by cloning an
 * EnsembleState. Every fresh live, MIDI, or WAV generation run must cross this
 * boundary before producing its first event.
 *
 * Run-specific state (soloist, bass, coordination carryover, and groove flags)
 * remains owned by the host because those reset contracts intentionally differ.
 */
export function resetHiddenGenerationMemory(state: EnsembleState): void {
    clearHarmonyMemory(state);
    resetCompingState(compingState);
}
