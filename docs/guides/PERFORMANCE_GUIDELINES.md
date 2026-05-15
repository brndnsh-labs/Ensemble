# Performance guidelines

This note captures small, repeatable optimizations that matter in hot audio and scheduling paths.

## Hot-loop rules

- Avoid inline array literals inside tight loops when the collection is constant.
- Prefer direct comparisons for small fixed sets, or hoist repeated lookups into a `Set`.
- Pre-compute boolean branches before entering the loop when possible.

## Why this matters

Audio synthesis and scheduling code runs under GC pressure. Tiny allocations in loops can show up as jitter or missed deadlines, especially in paths like `public/engine/soloist-pitch-engine.ts` and other note-generation hot loops.

The same rule applies to any worker or scheduler code that runs every frame or every step.
