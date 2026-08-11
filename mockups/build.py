#!/usr/bin/env python3
"""Inline the subsetted Ubuntu woff2 fonts into each mockup template.

The Artifact CSP blocks font CDNs, so the faces have to travel inside the
page as data URIs. Keeping this as a build step means the templates stay
readable and the base64 lives in exactly one place.
"""

import pathlib
import sys

HERE = pathlib.Path(__file__).parent
FONTS = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "fonts"

sans = (FONTS / "usans.b64").read_text().strip()
mono = (FONTS / "usmono.b64").read_text().strip()

for tpl in sorted(HERE.glob("*.tpl.html")):
    out = HERE / tpl.name.replace(".tpl.html", ".html")
    html = tpl.read_text()
    missing = [k for k in ("__FONT_SANS__", "__FONT_MONO__") if k not in html]
    if missing:
        sys.exit(f"{tpl.name}: missing placeholder(s) {', '.join(missing)}")
    html = html.replace("__FONT_SANS__", sans).replace("__FONT_MONO__", mono)
    out.write_text(html)
    print(f"{tpl.name} -> {out.name}  ({len(html) / 1024:.0f} KB)")
