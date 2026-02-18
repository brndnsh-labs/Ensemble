#!/bin/bash
# Ensemble: Agent Standards Verification Script (v1.0)
# Use this script to verify adherence to the four golden rules for maintainability.

echo "🔍 Running Ensemble Standards Verification..."

# 1. CHECK FOR DIRECT STATE MUTATIONS
# Scans for assignments to state objects like "playback.isPlaying = true" 
# which bypasses the dispatch/reducer pattern.
echo "   [1/4] Checking for direct state mutations in components/controllers..."
grep -rnE "(playback|chords|bass|soloist|harmony|groove|midi|vizState)\.[a-zA-Z0-9]+ = " public/components/ public/*.js | grep -v "state/" | grep -v "reducer" | grep -v "@direct-mutation" | grep -v "@worker-mutation" > .standards_mutations.log
if [ -s .standards_mutations.log ]; then
    echo "   ⚠️ WARNING: Potential direct state mutations found (bypass of dispatch/ACTIONS):"
    cat .standards_mutations.log
else
    echo "   ✅ No obvious direct state mutations found outside of state reducers."
fi
rm .standards_mutations.log

# 2. RUN LINTING
echo "   [2/4] Running ESLint for code standards..."
npm run lint -- --quiet
if [ $? -eq 0 ]; then
    echo "   ✅ Linting passed."
else
    echo "   ❌ Linting failed. Please fix style/import errors."
fi

# 3. VERIFY MUSICAL STANDARDS (REGRESSION CHECK)
echo "   [3/4] Running Musical Standards Tests (Regression Resistance)..."
npx vitest run tests/standards/ --reporter=verbose
if [ $? -eq 0 ]; then
    echo "   ✅ Musical standards preserved."
else
    echo "   ❌ Musical regression detected. Check tests/standards/ output."
fi

# 4. VERIFY IMPORT INTEGRITY
echo "   [4/4] Verifying all test files are reachable and parsing correctly..."
npx vitest run tests/unit/ --reporter=verbose
if [ $? -eq 0 ]; then
    echo "   ✅ Refactoring integrity verified (Test suite stable)."
else
    echo "   ❌ Refactoring error found. Some unit tests are failing to load/parse."
fi

echo "🏁 Verification Complete."
