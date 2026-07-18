/**
 * Shared viewport breakpoints for the Preact UI layer.
 */

// One breakpoint governs the compact experience: at ≤1023px the chart-first
// surface drops the always-visible instrument rail in favor of the fixed
// bottom MobileActionBar (whose Mix sheet re-hosts the full vertical rail).
// #1131 raised this from 700px (InstrumentRail) / introduced it fresh
// (ChartSurface) when the old 641–1023 "horizontal rail" tier was deleted;
// #1147 folded the two independently-declared MQ strings into this one
// source so they can't drift apart again.
export const COMPACT_MQ = '(max-width: 1023px)';
