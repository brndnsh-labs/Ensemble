## 2024-05-23 - Global State Subscription Overhead & Mutable State Traps
**Learning:** Connecting Preact components to a global event bus without equality checks caused massive re-render storms on every dispatch (even irrelevant ones). Furthermore, relying on reference equality for selectors fails when the underlying state is mutable (e.g. arrays modified in place), requiring explicit version counters to signal updates reliably.
**Action:** Always implement equality checks in custom store hooks. When using mutable state, add version/timestamp properties to signal changes to subscribers.

## 2024-05-24 - DOM Query Thrashing in Animation Loops
**Learning:** Using `querySelectorAll` inside a `requestAnimationFrame` loop (even 60fps) is a major performance killer (O(N) * 60/sec). In `SequencerGrid`, this caused 50ms+ frame times for simple highlighting.
**Action:** For animation loops driving DOM elements, pre-cache the elements in a `Map` or `Array` (using `useLayoutEffect` to keep it synced with React renders) and use O(1) lookups in the loop.

## 2024-05-24 - Garbage Collection Jitter in Canvas Visualizers
**Learning:** Allocating temporary arrays (like `[x1, y, x2]`) or objects inside a canvas render loop creates significant Garbage Collection pressure, causing frame drops (jitter).
**Action:** Use pre-allocated "batch" arrays (class properties) and clear them (`length = 0`) each frame. Store data in flat arrays (e.g., `[x1, y, x2, x3, y, x4]`) instead of arrays of arrays to further reduce object count.

## 2024-05-24 - Object Allocation in High-Frequency Event Loops
**Learning:** Creating new object literals (e.g., `{ time: ev.time, ... }`) inside the animation loop for every visual event (drums, notes) generates thousands of short-lived objects per session, triggering frequent minor GCs.
**Action:** Reuse the event objects coming from the scheduler queue. Alias properties if necessary (e.g., `ev.noteName = ev.name`) instead of creating new adapter objects.

## 2024-05-25 - Lookup Tables vs Allocations in Render Loops
**Learning:** Even small array allocations like `[1, 3, 6, 8, 10].includes(x)` inside a render loop (running 60fps * 60 iterations) generate massive GC pressure (180k+ allocations/min).
**Action:** Replace conditional logic or temporary arrays with static lookup tables (e.g., `const IS_BLACK = [false, true, ...]`) for O(1) access and zero allocation.

## 2024-05-25 - React Memoization Breakers in Closures
**Learning:** Callbacks passed to `memo` components must be stable. If they depend on a changing object (like the entire store state), they break memoization for all children, causing massive re-renders. Using `getState()` inside the callback (instead of closing over the state) breaks this dependency chain while keeping the callback stable.
**Action:** For high-frequency interaction handlers (like grid cells), avoid adding the data source to the dependency array. Fetch the data directly from the state store inside the handler.
