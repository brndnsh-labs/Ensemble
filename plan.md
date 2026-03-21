1. **Extract `generateNotesForStep` into `public/engine/tick-logic.js`:**
   - I will create a new file `public/engine/tick-logic.js`.
   - I will extract the core tick logic from `fillBuffers` in `public/engine/worker-buffer-manager.js` into a new function `generateNotesForStep(state, step, cursors, isExporting)`.
   - The parameters for this function will be `state`, `step`, an object for cursors `{ mainCursor, lookaheadCursor }`, and an `isExporting` flag.
   - It will handle the context assembly, drum hits, soloist generation, bass generation, chords generation, and harmony generation.
   - It will return an object containing the generated notes `notesToMain` and the drum `coordination` context (useful for `midi-worker-logic.js`).
2. **Unify Conductor and Transition State:**
   - I will extract the transition state logic (e.g., `checkWorkerTransition` from `midi-worker-logic.js`) and combine it with the equivalent parts inside `generateNotesForStep`.
   - In `public/engine/conductor.js` or `tick-logic.js` (if conductor isn't appropriate), I will ensure `checkWorkerTransition` uses the exact same loping swing weights, turnarounds, section transitions, and drum fills as the live engine.
   - I will make sure this transition logic directly mutates the state passed to it, rather than dispatching Redux actions, to safely support the virtual timeline in the offline exporter.
3. **Refactor Consumers:**
   - **`public/engine/worker-buffer-manager.js`:** Update `fillBuffers` to call `generateNotesForStep` in a loop, pushing the returned notes to the `notesToMain` array and advancing the buffer heads. Ensure it still correctly manages `workerContext` state.
   - **`public/engine/midi-worker-logic.js`:** Update `processStep` to call `generateNotesForStep`. It will use the returned events to call `_writeNotesToTrack` for instruments and handle the drum tracking based on the results. Strip out the manual generation logic and turnaround math previously in `processStep`.
4. **Complete pre-commit steps:**
   - Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.
5. **Submit the change.**
   - Commit the changes and submit.
