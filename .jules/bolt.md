## 2025-10-24 - Bolt: Optimize Range Lookups with binarySearchMap
**Learning:** `Array.prototype.find()` on large, sorted arrays of step ranges (like `arranger.stepMap` and `arranger.sectionMap`) inside hot loops (e.g., inside generative engine workers per step) creates O(N) linear overhead.
**Action:** Replace linear `.find((e) => step >= e.start && step < e.end)` lookups with a custom `binarySearchMap` function to achieve O(log N) lookups, greatly reducing CPU time in tight audio calculation loops.

## 2025-02-12 - Bolt: Eliminate Map Allocations in audio-analyzer-lite.js
**Learning:** In V8 Node environments and performance-sensitive loops, chaining methods like `Array.from(Map.entries()).map(...)` creates multiple intermediate array allocations that significantly drag down performance, especially in inner processing chunks for audio analysis. Using `.map()` on large numerical arrays (like `flux`) also incurs unnecessary closure creation and array allocation overhead.
**Action:** Replace `Array.prototype.map()` on large number arrays with pre-allocated `Float32Array` or `Int32Array` loops. Convert `.from().map()` chains directly into explicit `for...of` loops that push to a final array to avoid temporary garbage collection spikes.

## 2025-02-12 - Bolt: Eliminate Array Spread with Map in Hot Loops
**Learning:** In performance-critical hot loops evaluating audio engine steps (such as `selectPitchAndDevices`), constructing arrays using a combination of the spread operator and `.map()` with object spread (e.g., `[...extra.map((n) => ({ ...result, ...n })), result]`) incurs a double-penalty: creating intermediate array allocations that must be immediately re-iterated by the spread operator, plus closure instantiation overhead.
**Action:** In high-frequency generative engine paths, replace `[...arr.map(fn), item]` with a pre-allocated array via `new Array(arr.length + 1)` and a standard `for` loop to manually populate properties, eliminating both the intermediate array allocation and function execution overhead.

## 2025-10-25 - Bolt: Optimize Chord Tone Selection with Bitmask
**Learning:** In hot loops within the audio pitch selection engine (e.g. `selectPitchAndDevices`), calling `Array.prototype.some()` on invariant arrays like `targetChord.intervals` within an inner candidate loop causes severe performance penalties due to repeated closure creation and O(N) linear array scanning per candidate note.
**Action:** Pre-compute small invariant arrays (like chord intervals) into an integer bitmask (e.g. `chordMask |= 1 << interval`) prior to the loop. Inside the loop, replace the `some()` call with an O(1) bitwise check (`(chordMask >> interval) & 1`). This eliminates array iterations and function allocations inside the hot path.

## 2025-10-26 - Bolt: Eliminate linear search using `.some` for double stop logic
**Learning:** Generating extra notes for "double stops" (`generateExtraNotes`) invokes linear array scanning inside tight looping logic (`currentChord.intervals.some`).
**Action:** Precompute chord intervals into a bitmask (`chordMask`) and evaluate matching intervals via bitwise lookup `((chordMask >> interval) & 1)`.

## 2025-10-27 - Bolt: Optimize Range Index Lookups with binarySearchMapIndex
**Learning:** Just like `find()`, using `.findIndex((e) => step >= e.start && step < e.end)` on large sorted map arrays (like `arranger.stepMap`) inside frequent audio updates or UI loops causes O(N) linear scan overhead.
**Action:** Add and use a custom `binarySearchMapIndex` function in `utils.js` to achieve O(log N) performance for retrieving the array index of the matching range block.

## 2025-10-28 - Bolt: Replace .includes() with Bitwise Lookups for small integer sets
**Learning:** Inside intense audio calculation loops (like evaluating many candidate pitches in `selectPitchAndDevices`), calling `[...].includes(interval)` inside switch statements causes repeated temporary array allocations and O(N) linear scanning.
**Action:** For sets of small integers (e.g., musical intervals 0-11), pre-calculate a bitmask (like `1257 = (1<<0) | (1<<3)...`) and replace the `.includes(val)` lookup with a bitwise evaluation `((mask >> val) & 1)` to eliminate array operations and drastically speed up the hot path.
