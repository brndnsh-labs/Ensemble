/**
 * Shared Type Definitions for the Preact UI Layer
 *
 * Centralizing these types prepares the codebase for future migrations
 * (like Preact Signals) by creating a single source of truth for component contracts.
 */

/**
 * @typedef {import('preact').ComponentChild | import('preact').ComponentChildren} ComponentChildren
 */

/**
 * @typedef {Object<string, string|number>} StyleObject
 */

/**
 * @typedef {Object} SelectOption
 * @property {string|number} value - The internal value of the option.
 * @property {string} label - The display text.
 * @property {StyleObject} [style] - Optional inline styles for the option.
 */

export {};
