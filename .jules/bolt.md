## 2025-05-18 - [JS Branch Hoisting]
**Learning:** Hoisting a branch condition (`if (track === 'soloist')`) out of a tight render loop with ~200k iterations didn't yield a measurable wall-clock improvement in V8 (Node 20). The branch predictor likely handled the consistent false/true patterns extremely well.
**Action:** Prioritize memory access patterns and algorithmic changes over manual loop unrolling/hoisting unless the branch is data-dependent and unpredictable.

## 2025-05-20 - [Canvas Path Reuse]
**Learning:** The `UnifiedVisualizer` was iterating history buffers twice per frame (outline + fill) for generic tracks. Canvas 2D allows reusing the current path for multiple strokes/fills.
**Action:** Reused the `ctx.beginPath()` ... `ctx.moveTo/lineTo` sequence for both the outline stroke and the color stroke. This reduced JS loop iterations and internal Canvas path construction overhead by 50% for these tracks.
