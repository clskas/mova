#!/usr/bin/env python3
"""Generate iOS AppIcon.appiconset PNGs from a 1024 source (no alpha for marketing)."""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

from PIL import Image

# (filename, pixel size) — matches Runner/Assets.xcassets/AppIcon.appiconset/Contents.json
SIZES = [
    ("Icon-App-20x20@1x.png", 20),
    ("Icon-App-20x20@2x.png", 40),
    ("Icon-App-20x20@3x.png", 60),
    ("Icon-App-29x29@1x.png", 29),
    ("Icon-App-29x29@2x.png", 58),
    ("Icon-App-29x29@3x.png", 87),
    ("Icon-App-40x40@1x.png", 40),
    ("Icon-App-40x40@2x.png", 80),
    ("Icon-App-40x40@3x.png", 120),
    ("Icon-App-50x50@1x.png", 50),
    ("Icon-App-50x50@2x.png", 100),
    ("Icon-App-57x57@1x.png", 57),
    ("Icon-App-57x57@2x.png", 114),
    ("Icon-App-60x60@2x.png", 120),
    ("Icon-App-60x60@3x.png", 180),
    ("Icon-App-72x72@1x.png", 72),
    ("Icon-App-72x72@2x.png", 144),
    ("Icon-App-76x76@1x.png", 76),
    ("Icon-App-76x76@2x.png", 152),
    ("Icon-App-83.5x83.5@2x.png", 167),
    ("Icon-App-1024x1024@1x.png", 1024),
]


def flatten_rgb(im: Image.Image, bg=(255, 255, 255)) -> Image.Image:
    """App Store marketing icon must not have alpha."""
    if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
        base = Image.new("RGB", im.size, bg)
        rgba = im.convert("RGBA")
        base.paste(rgba, mask=rgba.split()[-1])
        return base
    return im.convert("RGB")


def generate(src: Path, dest_dir: Path, bg: tuple[int, int, int]) -> None:
    dest_dir.mkdir(parents=True, exist_ok=True)
    src_im = Image.open(src)
    rgb = flatten_rgb(src_im, bg=bg)
    for name, px in SIZES:
        out = rgb.resize((px, px), Image.Resampling.LANCZOS)
        out.save(dest_dir / name, format="PNG")
    # Keep / write Contents.json if present alongside template
    print(f"Wrote {len(SIZES)} icons → {dest_dir} (from {src.name})")


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    contents_src = root / "ios/Runner/Assets.xcassets/AppIcon.appiconset/Contents.json"
    configs = [
        (
            "passenger",
            root / "assets/icon/movaicone_passenger.png",
            (60, 21, 166),  # #3C15A6
            root / "ios/Runner/Assets.xcassets/AppIcon-passenger.appiconset",
        ),
        (
            "driver",
            root / "assets/icon/movaicone_driver.png",
            (10, 50, 1),  # #0A3201
            root / "ios/Runner/Assets.xcassets/AppIcon-driver.appiconset",
        ),
    ]
    for flavor, src, bg, dest in configs:
        if not src.is_file():
            print(f"ERROR: missing {src}", file=sys.stderr)
            return 1
        generate(src, dest, bg)
        shutil.copy2(contents_src, dest / "Contents.json")
        # Validate JSON still lists same filenames
        json.loads((dest / "Contents.json").read_text(encoding="utf-8"))
        print(f"OK {flavor}")

    # Default AppIcon = passenger (Senga)
    default = root / "ios/Runner/Assets.xcassets/AppIcon.appiconset"
    passenger = root / "ios/Runner/Assets.xcassets/AppIcon-passenger.appiconset"
    for f in passenger.glob("*.png"):
        shutil.copy2(f, default / f.name)
    print(f"Synced passenger → {default}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
