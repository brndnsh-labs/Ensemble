## 2025-05-27 - [Map Closure and Pre-allocation]
**Learning:** Replaced chained and inline `.map()` and `.reduce()` calls in hot paths (like audio scheduling and MIDI export chunking) with standard `for` loops, notably utilizing pre-allocated arrays (`new Array(length)`) to avoid dynamic resizing costs.
**Action:** When replacing `.map()` in highly iterated code, pre-allocate the target array using `new Array(length)` to avoid dynamic array resizing performance penalties.
