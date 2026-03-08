## 2025-05-18 - [JS Branch Hoisting]
**Learning:** Hoisting a branch condition (`if (track === 'soloist')`) out of a tight render loop with ~200k iterations didn't yield a measurable wall-clock improvement in V8 (Node 20). The branch predictor likely handled the consistent false/true patterns extremely well.
**Action:** Prioritize memory access patterns and algorithmic changes over manual loop unrolling/hoisting unless the branch is data-dependent and unpredictable.

## 2025-05-20 - [Canvas Path Reuse]
**Learning:** The `UnifiedVisualizer` was iterating history buffers twice per frame (outline + fill) for generic tracks. Canvas 2D allows reusing the current path for multiple strokes/fills.
**Action:** Reused the `ctx.beginPath()` ... `ctx.moveTo/lineTo` sequence for both the outline stroke and the color stroke. This reduced JS loop iterations and internal Canvas path construction overhead by 50% for these tracks.

## 2024-05-24 - [Audio Signal Iteration Performance]
**Learning:** In highly iterated, performance-critical audio signal loops (like parsing dense `Float32Array` buffers), `Array.prototype.reduce` incurs significant per-element callback overhead, especially in V8.
**Action:** Replace `reduce` with standard `for` loops in hot paths to massively reduce execution time (observed ~10-15x speedup for simple aggregations like RMS energy).

## 2025-05-25 - [Array Reduce in Filter Closures]
**Learning:** In hot loops, filtering arrays containing arrays (like rhythmic cells) using `.reduce()` inside the `.filter()` callback introduces significant overhead due to intermediate allocations and callback execution per element in V8. While pre-calculating and attaching a `.hits` property to constant array objects seemed theoretically faster, it degraded performance compared to the original `.reduce()`. Replacing `.reduce()` with a simple inline `for` loop within the `.filter()` closure provided the best performance (~6% faster execution).
**Action:** Replace `.reduce()` calls inside frequently executed array methods (like `.filter()`) with inline `for` loops in performance-critical paths. Be wary of attaching new properties to constant arrays in V8, as it might de-optimize them.

## 2025-05-26 - [Chained Array Methods in Hot Loops]
**Learning:** In hot loops within `public/engine/coordination-engine.js` (such as `updateCoordinationContext`), chaining array methods like `.map(n => n.midi).filter(m => m > 0)` or `.filter(r => r.midi > 0).reduce(...)` creates significant overhead due to intermediate array allocations and closure execution per element. Replacing these functional chains with single-pass, standard `for` loops avoids these intermediate allocations.
**Action:** Replace `.map().filter().reduce()` chains with inline `for` loops when processing arrays in performance-critical paths like the coordination engine.