
## 2024-05-18 - Avoid micro-optimizations on extremely small arrays
**Learning:** Replacing native `Array.prototype.find()` or `findIndex()` with a custom binary search on very small collections (like `sectionMap`, which typically has 5-30 elements) offers negligible real-world benefits. The O(1) constant overhead of setting up the binary search might even outweigh the theoretical O(log N) advantage on small array sizes.
**Action:** Focus on higher-impact optimizations, such as hoisting linear array lookups (`.includes()`) from within hot loops into O(1) `Set` object lookups, which provide tangible performance gains without sacrificing code readability or risking broken implementations.
