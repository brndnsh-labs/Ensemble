import re

file_path = "tests/unit/engines/soloist-logic.test.js"
with open(file_path, "r") as f:
    content = f.read()

# Replace the test
search = """    describe('Melodic Devices', () => {
        it('should trigger melodic devices (Enclosures, Runs, Slides)', () => {
            const deviceTests = [
                { style: 'neo', label: 'Quartal/Enclosure' },
                { style: 'blues', label: 'Slide' },
                { style: 'shred', label: 'Run' },
            ];

            deviceTests.forEach((t) => {"""

replace = """    describe('Melodic Devices', () => {
        it('should trigger melodic devices (Enclosures, Runs, Slides)', () => {
            const deviceTests = [
                { style: 'neo', label: 'Quartal/Enclosure' },
                { style: 'blues', label: 'Slide' },
                { style: 'shred', label: 'Run' },
            ];

            // Some devices like Quartal/GuitarDouble require polyphonic mode
            soloist.mode = 'polyphonic';

            deviceTests.forEach((t) => {"""

if search in content:
    content = content.replace(search, replace)
    with open(file_path, "w") as f:
        f.write(content)
    print("Updated tests/unit/engines/soloist-logic.test.js")
else:
    print("Could not find the target block in tests/unit/engines/soloist-logic.test.js")
