#!/usr/bin/env python3
"""Stamp versions so phones and iPads pick up changes. Run before every commit:

    python3 tools/stamp.py

- sw.js: cache name V = hash of everything served, and SHELL precaches the app files (so it plays offline)
- legacy/: rebuilt from index.html for old iPads (needs Node; see tools/legacy/build.mjs)
Safe to run any number of times; it only changes what actually changed.
"""
import hashlib, pathlib, re, shutil, subprocess

ROOT = pathlib.Path(__file__).resolve().parent.parent
h = lambda b: hashlib.sha1(b).hexdigest()[:10]

shell = ["./", "manifest.webmanifest", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "fonts/fonts.css"] + \
        sorted("fonts/" + p.name for p in (ROOT / "fonts").glob("*.woff2")) + ["vendor/three.min.js"]
files = [ROOT / "index.html"] + [ROOT / s for s in shell[1:]]
version = h(b"".join(p.read_bytes() for p in files))

sw = ROOT / "sw.js"
src = sw.read_text(encoding="utf-8")
src = re.sub(r'const V = "gs-[\w]*";', f'const V = "gs-{version}";', src)
src = re.sub(r'const SHELL = \[.*?\];', "const SHELL = " + str(["./" + s if s != "./" else s for s in shell]).replace("'", '"') + ";", src)
sw.write_text(src, encoding="utf-8")
print(f"stamped: sw gs-{version}, {len(shell)} files precached")

# Rebuild legacy/ (the old-iPad copy). Needs Node.
lg = ROOT / "tools" / "legacy"
if shutil.which("node"):
    if not (lg / "node_modules").exists():
        subprocess.run(["npm", "install", "--silent", "--no-audit", "--no-fund"], cwd=lg, check=True)
    subprocess.run(["node", "build.mjs"], cwd=lg, check=True)
else:
    print("legacy: SKIPPED (Node not installed) - legacy/ is now out of date")
