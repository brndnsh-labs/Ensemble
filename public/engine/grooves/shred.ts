/**
 * Shred Genre Engine
 * Currently inherits from Metal, but allows for independent specialization of
 * high-intensity melodic-driven patterns.
 */
import * as Metal from './metal.js';

export const config = {
    ...Metal.config,
};

export const getMotif = Metal.getMotif;
export const applyOverrides = Metal.applyOverrides;
