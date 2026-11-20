#!/usr/bin/env python3
"""Generate the OpenMonkey PNG icons from the SVG design.

The PNGs (icon16/32/48/128.png) are generated artifacts, not source:
they are derived from extension/icons/icon.svg and are intentionally
NOT committed to git (see .gitignore). Run this before packaging or
loading the extension in Safari/Xcode if the PNGs are missing:

    python3 scripts/generate-icons.py

With --appicon it also writes the Xcode AppIcon set
(xcode/App/Assets.xcassets/AppIcon.appiconset/), which IS committed
as part of the Xcode project:

    python3 scripts/generate-icons.py --appicon

The AppIcon set carries iOS 18 light/dark appearances (v0.5.1):
every size is written twice — a light variant (white #FFFFFF
background) and a dark variant (black #000000 background) — both with
the same purple </> glyph, and Contents.json lists both with
`appearances: luminosity light/dark`. The light variant keeps the
historic filename; the dark variant adds a `-dark` suffix. (The
extension toolbar icons stay the old design — purple squircle tile
with a white glyph — they are not appearance-aware and are unchanged.)

Requires Pillow (pip install pillow). The drawing reproduces the SVG
geometry (a purple squircle with a bold white geometric </> glyph)
and downscales with LANCZOS for the smaller sizes.
"""
import json
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError:
    print("generate-icons.py: Pillow is required (pip install pillow)", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "extension" / "icons"
APPICON = ROOT / "xcode" / "App" / "Assets.xcassets" / "AppIcon.appiconset"
SIZES = (16, 32, 48, 128)

PURPLE = (0x6C, 0x5C, 0xFF, 255)
WHITE = (255, 255, 255, 255)

# AppIcon light/dark appearances (v0.5.1): the background follows the
# system appearance; the purple glyph is identical in both.
LIGHT_BG = (255, 255, 255)
DARK_BG = (0, 0, 0)

# The </> glyph in 128-space: three strokes (two angle brackets and a
# slash), matching icon.svg exactly. Each stroke is a polyline of points.
STROKES = (
    ((43, 44), (31, 64), (43, 84)),   # <
    ((65, 38), (77, 90)),             # /
    ((85, 44), (97, 64), (85, 84)),   # >
)
STROKE_WIDTH_128 = 14


def draw_mark(size: int) -> Image.Image:
    """Draw the mark at the requested pixel size."""
    scale = size / 128.0
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    # Purple squircle tile.
    tile = Image.new("RGBA", (size, size), PURPLE)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, size, size], radius=max(1, round(28 * scale)), fill=255)
    img.paste(tile, (0, 0), mask)
    d = ImageDraw.Draw(img)
    width = max(1, round(STROKE_WIDTH_128 * scale))
    radius = width / 2.0
    for stroke in STROKES:
        pts = [(x * scale, y * scale) for (x, y) in stroke]
        # Round joins.
        d.line(pts, fill=WHITE, width=width, joint="curve")
        # Round caps (Pillow lines have square ends).
        for (x, y) in pts:
            d.ellipse([x - radius, y - radius, x + radius, y + radius], fill=WHITE)
    return img


def draw_appicon_mark(size: int, background) -> Image.Image:
    """Draw the AppIcon mark at the requested pixel size.

    Full-bleed `background` square with the purple </> glyph in the
    same geometry as the SVG (STROKES). No squircle, no alpha: iOS
    masks AppIcon assets itself.
    """
    scale = size / 128.0
    img = Image.new("RGB", (size, size), background)
    d = ImageDraw.Draw(img)
    width = max(1, round(STROKE_WIDTH_128 * scale))
    radius = width / 2.0
    for stroke in STROKES:
        pts = [(x * scale, y * scale) for (x, y) in stroke]
        d.line(pts, fill=PURPLE[:3], width=width, joint="curve")
        for (x, y) in pts:
            d.ellipse([x - radius, y - radius, x + radius, y + radius],
                      fill=PURPLE[:3])
    return img


def write_extension_icons() -> None:
    ICONS.mkdir(parents=True, exist_ok=True)
    base = draw_mark(128)
    for size in SIZES:
        out = ICONS / f"icon{size}.png"
        img = base if size == 128 else base.resize((size, size), Image.LANCZOS)
        img.save(out, "PNG")
        print(f"wrote {out.relative_to(ROOT)} ({size}x{size})")


def write_appicon() -> None:
    """Write the Xcode AppIcon set as SINGLE SIZE (one 1024 source per
    appearance) — the only shape in which actool accepts luminosity
    (dark) variants.

    History: the v0.5.1 set listed 18 per-size slots x light/dark.
    actool rejected every entry carrying an explicit luminosity
    appearance: with light entries tagged too it warned "36 unassigned
    children" and compiled NO icon at all (run #44); with light entries
    untagged it still warned "18 unassigned children" — all the dark
    entries, including 1024-dark (run #46). The legacy all-sizes set
    simply has no dark slots. Apple's documented route for dark
    variants is Single Size: one 1024 entry per appearance, and Xcode
    generates every size from it. The Contents.json shape below is
    exactly what Xcode itself writes (idiom universal, platform ios,
    size 1024x1024, no scale key; light entry untagged, dark entry
    tagged luminosity dark).

    The 34 per-size PNGs already in the folder stay on disk but are
    unreferenced now; actool ignores unreferenced files. Only the two
    1024 masters are written here.
    """
    APPICON.mkdir(parents=True, exist_ok=True)
    # Light and dark variants share the glyph; only the background differs.
    # Full-bleed square (no squircle, no transparency): iOS applies its
    # own mask to AppIcon assets, and transparent corners would render
    # as black on the Home Screen. The dark background is opaque black,
    # as the user asked: white in light mode, black in dark mode.
    light_base = draw_appicon_mark(1024, LIGHT_BG)
    dark_base = draw_appicon_mark(1024, DARK_BG)
    light_base.save(APPICON / "AppIcon-1024.png", "PNG")
    print(f"wrote {APPICON.relative_to(ROOT)}/AppIcon-1024.png "
          "(1024x1024, light)")
    dark_base.save(APPICON / "AppIcon-1024-dark.png", "PNG")
    print(f"wrote {APPICON.relative_to(ROOT)}/AppIcon-1024-dark.png "
          "(1024x1024, dark)")
    contents = {
        "images": [
            {
                "filename": "AppIcon-1024.png",
                "idiom": "universal",
                "platform": "ios",
                "size": "1024x1024",
            },
            {
                "appearances": [
                    {"appearance": "luminosity", "value": "dark"}
                ],
                "filename": "AppIcon-1024-dark.png",
                "idiom": "universal",
                "platform": "ios",
                "size": "1024x1024",
            },
        ],
        "info": {"author": "xcode", "version": 1},
    }
    (APPICON / "Contents.json").write_text(
        json.dumps(contents, indent=2) + "\n")
    print(f"wrote {APPICON.relative_to(ROOT)}/Contents.json "
          "(2 images, single size)")


def main() -> None:
    write_extension_icons()
    if "--appicon" in sys.argv[1:]:
        write_appicon()


if __name__ == "__main__":
    main()
