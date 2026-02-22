## 2025-05-18 - [JS Branch Hoisting]
**Learning:** Hoisting a branch condition (`if (track === 'soloist')`) out of a tight render loop with ~200k iterations didn't yield a measurable wall-clock improvement in V8 (Node 20). The branch predictor likely handled the consistent false/true patterns extremely well.
**Action:** Prioritize memory access patterns and algorithmic changes over manual loop unrolling/hoisting unless the branch is data-dependent and unpredictable.
