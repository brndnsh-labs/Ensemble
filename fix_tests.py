import os
import re

def fix_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # The tests typically do: getDrumMotif(i, 'Genre', true, 0.8)
    # or getDrumMotif(0, 'Genre', false, 0.2)

    # We will replace `getDrumMotif(var, genre, creativity, complexity)`
    # With `getDrumMotif(((var * 137 + (creativity ? 42 : 0)) % 256) / 256, genre, complexity)`

    # regex to match getDrumMotif(arg1, arg2, arg3, arg4)
    pattern = r"getDrumMotif\(([^,]+),\s*([^,]+),\s*(true|false),\s*([^\)]+)\)"

    def replacer(match):
        var = match.group(1).strip()
        genre = match.group(2).strip()
        creativity = match.group(3).strip()
        complexity = match.group(4).strip()

        offset = "42" if creativity == "true" else "0"

        new_seed = f"((({var}) * 137 + {offset}) % 256) / 256"

        return f"getDrumMotif({new_seed}, {genre}, {complexity})"

    new_content = re.sub(pattern, replacer, content)

    with open(filepath, 'w') as f:
        f.write(new_content)

for root, _, files in os.walk('tests/standards/'):
    for file in files:
        if file.endswith('.test.js'):
            fix_file(os.path.join(root, file))
