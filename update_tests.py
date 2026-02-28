import re

file_path = "tests/unit/engines/groove-seeds.test.js"
with open(file_path, "r") as f:
    content = f.read()

# Replace the test
search = """    it('should assign a seed to a new section and remember it', () => {
        // Simulate transitioning to s2 (Chorus) at step 16
        // checkSectionTransition is called at the START of the measure that transitions
        // In 4/4, stepsPerMeasure is 16.
        // We call it at step 0 to schedule the measure [0-15].
        // At step 0, we look at measureEnd = 16. EffectiveStep = 15.
        // Step 15 is in s1. nextEntry is step 16 which is s2.

        checkSectionTransition(0, 16);

        // Verify seed was assigned to s2
        expect(mockState.groove.sectionSeedMap.s2).toBeDefined();
        const firstSeed = mockState.groove.sectionSeedMap.s2;

        // Call again - should not change the seed
        checkSectionTransition(0, 16);
        expect(mockState.groove.sectionSeedMap.s2).toBe(firstSeed);
    });

    it('should use the same seed for repeating sections', () => {
        // Setup a repeating section
        mockState.arranger.stepMap = [
            { start: 0, end: 16, chord: { sectionId: 's1', sectionLabel: 'Verse' } },
            { start: 16, end: 32, chord: { sectionId: 's2', sectionLabel: 'Chorus' } },
            { start: 32, end: 48, chord: { sectionId: 's1', sectionLabel: 'Verse' } },
        ];
        mockState.arranger.totalSteps = 48;

        // Transition to s2
        checkSectionTransition(0, 16);

        // Transition back to s1 (at step 16, looking at step 32)
        checkSectionTransition(16, 16);

        // Since s1 is the current section at step 0, it should have been assigned a seed if it didn't have one?
        // Wait, checkSectionTransition only assigns to NEXT section.
        // Let's manually assign s1 seed or simulate loop end.
        mockState.groove.sectionSeedMap.s1 = 0;

        checkSectionTransition(16, 16); // Transition to s1 at step 32
        expect(mockState.groove.sectionSeedMap.s1).toBe(0); // Should still be 0
    });"""

replace = """    it('should assign a seed to a new section', () => {
        checkSectionTransition(0, 16);

        // Verify seed was assigned to s2
        expect(mockState.groove.sectionSeedMap.s2).toBeDefined();
    });

    it('should dynamically update the seed for repeating sections based on intensity', () => {
        // Setup a repeating section
        mockState.arranger.stepMap = [
            { start: 0, end: 16, chord: { sectionId: 's1', sectionLabel: 'Verse' } },
            { start: 16, end: 32, chord: { sectionId: 's2', sectionLabel: 'Chorus' } },
            { start: 32, end: 48, chord: { sectionId: 's1', sectionLabel: 'Verse' } },
        ];
        mockState.arranger.totalSteps = 48;

        // 1. High intensity transition to s2 -> likely seed 2 (Driven)
        mockState.playback.bandIntensity = 0.99; // force high
        // Force Math.random to always pick the highest probability path for high intensity (< 0.7 = seed 2)
        vi.spyOn(Math, 'random').mockReturnValue(0.1);
        checkSectionTransition(0, 16);
        expect(mockState.groove.sectionSeedMap.s2).toBe(2);

        // 2. Low intensity transition back to s1 -> likely seed 1 (Sparse)
        mockState.playback.bandIntensity = 0.1; // force low
        // Force Math.random to pick seed 1 (< 0.6 = seed 1)
        vi.spyOn(Math, 'random').mockReturnValue(0.1);
        checkSectionTransition(16, 16);
        expect(mockState.groove.sectionSeedMap.s1).toBe(1);

        // Restore random
        vi.restoreAllMocks();
    });"""

if search in content:
    content = content.replace(search, replace)
    with open(file_path, "w") as f:
        f.write(content)
    print("Updated tests/unit/engines/groove-seeds.test.js")
else:
    print("Could not find the target block in tests/unit/engines/groove-seeds.test.js")
