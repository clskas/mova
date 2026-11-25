#!/usr/bin/env python3
"""Turns raw simulator screenshots into the App Store Connect sizes used by SENGA.

  iPhone 6.5" slot (APP_IPHONE_65): 1284 x 2778
  iPad 13"  slot (APP_IPAD_PRO_3GEN_129): 2064 x 2752 (or 2048 x 2732)

Only the store screenshots (names starting with a digit 1-9) are kept; "00-diag-*"
files stay in the raw artifact for debugging. The image is scaled to the slot width
and cropped evenly top/bottom (a few pixels) — the content itself is untouched.
Usage: finalize.py <raw_dir> <out_dir>   (raw_dir/iphone/*.png, raw_dir/ipad/*.png)
"""
import sys
from pathlib import Path

from PIL import Image

SIZES = {"iphone": (1284, 2778), "ipad": (2064, 2752)}


def fit(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    w, h = size
    if img.size == size:
        return img
    scale = max(w / img.width, h / img.height)
    resized = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    left = (resized.width - w) // 2
    top = (resized.height - h) // 2
    return resized.crop((left, top, left + w, top + h))


def main() -> None:
    raw, out = Path(sys.argv[1]), Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    count = 0
    for device, size in SIZES.items():
        for src in sorted((raw / device).glob("[1-9]*.png")):
            img = Image.open(src).convert("RGB")
            print(f"{device}/{src.name}: {img.size} -> {size}")
            fit(img, size).save(out / f"{device}-{src.name}", optimize=True)
            count += 1
    if count == 0:
        sys.exit("no store screenshot produced")


if __name__ == "__main__":
    main()
