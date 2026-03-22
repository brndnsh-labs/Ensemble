
## 2025-02-17 - Readability vs Micro-Optimizations in Hot Loops
**Learning:** While replacing array `.includes()` with bitwise operators `(mask >> val) & 1` in JavaScript is technically faster in tight loops, it severely damages code readability and creates subtle risks (like bit-shift wrap-around for values >= 32). In a collaborative codebase, raw speed must be balanced with maintainability.
**Action:** When optimizing repeated array checks in a hot loop, first hoist the static arrays to the module scope as constants rather than converting to opaque decimal bitmasks. This prevents garbage collection overhead from re-allocation while keeping the intervals readable to future developers.
