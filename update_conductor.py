import re

file_path = "public/conductor.js"
with open(file_path, "r") as f:
    content = f.read()

# Replace the block that assigns seeds
search = """                if (groove.creativity && nextSection) {
                    // Check if this section already has an assigned seed
                    const existingSeed = groove.sectionSeedMap[nextSection.id];
                    if (existingSeed === undefined) {
                        // Pick a new seed based on intensity
                        // Variation 0: Standard, 1: Sparse/Linear, 2: Driven/Complex
                        let seed = 0;
                        const rand = Math.random();
                        if (playback.bandIntensity > 0.7) {
                            seed = rand < 0.7 ? 2 : rand < 0.9 ? 0 : 1;
                        } else if (playback.bandIntensity < 0.4) {
                            seed = rand < 0.6 ? 1 : rand < 0.9 ? 0 : 2;
                        } else {
                            seed = rand < 0.5 ? 0 : rand < 0.8 ? 1 : 2;
                        }
                        dispatch(ACTIONS.SET_GROOVE_SEED, { sectionId: nextSection.id, seed });
                    }
                } else if (!groove.creativity && nextSection) {"""

replace = """                if (groove.creativity && nextSection) {
                    // Re-evaluate the drum seed based on current band intensity
                    // Variation 0: Standard, 1: Sparse/Linear, 2: Driven/Complex
                    let seed = 0;
                    const rand = Math.random();
                    if (playback.bandIntensity > 0.7) {
                        seed = rand < 0.7 ? 2 : rand < 0.9 ? 0 : 1;
                    } else if (playback.bandIntensity < 0.4) {
                        seed = rand < 0.6 ? 1 : rand < 0.9 ? 0 : 2;
                    } else {
                        seed = rand < 0.5 ? 0 : rand < 0.8 ? 1 : 2;
                    }
                    dispatch(ACTIONS.SET_GROOVE_SEED, { sectionId: nextSection.id, seed });
                } else if (!groove.creativity && nextSection) {"""

if search in content:
    content = content.replace(search, replace)
    with open(file_path, "w") as f:
        f.write(content)
    print("Updated public/conductor.js")
else:
    print("Could not find the target block in public/conductor.js")
