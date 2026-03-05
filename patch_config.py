import re

with open('public/soloist-config.js', 'r') as f:
    content = f.read()

# Make sure we don't have multiple insertions by running it once on a clean file
styles = ['scalar', 'shred', 'blues', 'neo', 'funk', 'hiphop', 'minimal', 'bird', 'disco', 'bossa', 'country', 'metal', 'reggae', 'acoustic', 'ska']

for style in styles:
    offset = 0
    if style in ['neo', 'hiphop']:
        offset = 0.015
    elif style in ['funk', 'ska']:
        offset = -0.005

    pattern = r"(\s*" + style + r": \{\n)(\s*)(restBase:)"
    repl = r"\g<1>\g<2>genreGravityOffset: " + str(offset) + ",\n\g<2>\g<3>"
    content = re.sub(pattern, repl, content)

with open('public/soloist-config.js', 'w') as f:
    f.write(content)

print("Patched.")
