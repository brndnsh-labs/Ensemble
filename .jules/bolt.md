## 2024-03-24 - Inline Array Allocation in Audio Hot-Loops
**Learning:** In JavaScript audio hot-loops (e.g., `selectPitchAndDevices`), inline array allocations and `.includes()` checks cause noticeable performance degradation due to garbage collection and repeated allocation.
**Action:** Replace inline array `.includes()` with logical OR statements (`=== || ===`) for 1-4 items, or hoist constant collections to the module scope as `Set` objects for O(1) `.has()` lookups. Pre-compute boolean conditions outside loops.
