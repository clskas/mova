from __future__ import annotations

import base64
import io
import json
import struct
import time
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = Path(r"C:\Users\Administrator\Downloads\logo senga Partenaires.png")
MASTER = ROOT / "scripts" / "mova-icon-restaurant.png"
OUT = ROOT / "restaurant" / "public"
DARK = (13, 13, 26, 255)
BRAND = (255, 107, 53, 255)


def contain(im: Image.Image, size: int, bg: tuple[int, int, int, int]) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), bg)
    tmp = im.copy()
    tmp.thumbnail((size, size), Image.Resampling.LANCZOS)
    x = (size - tmp.width) // 2
    y = (size - tmp.height) // 2
    canvas.paste(tmp, (x, y), tmp)
    return canvas


def contain_pad(im: Image.Image, size: int, bg: tuple[int, int, int, int], pad_ratio: float = 0.14) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), bg)
    inner = int(size * (1 - pad_ratio * 2))
    tmp = im.copy()
    tmp.thumbnail((inner, inner), Image.Resampling.LANCZOS)
    x = (size - tmp.width) // 2
    y = (size - tmp.height) // 2
    canvas.paste(tmp, (x, y), tmp)
    return canvas


def main() -> None:
    im = Image.open(SRC).convert("RGBA")
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    MASTER.parent.mkdir(parents=True, exist_ok=True)
    im.save(MASTER, "PNG")

    for name, size, bg in [
        ("favicon.png", 32, DARK),
        ("icon-192.png", 192, DARK),
        ("icon-512.png", 512, DARK),
        ("icon-180.png", 180, DARK),
        ("apple-touch-icon.png", 180, DARK),
    ]:
        contain(im, size, bg).save(OUT / name, "PNG")
        print(name)

    contain_pad(im, 512, BRAND, 0.14).save(OUT / "icon-512-maskable.png", "PNG")
    print("icon-512-maskable.png")

    buf = io.BytesIO()
    contain(im, 32, DARK).save(buf, "PNG")
    png_bytes = buf.getvalue()
    ico = bytearray()
    ico += struct.pack("<HHH", 0, 1, 1)
    ico += struct.pack("<BBBBHHII", 32, 32, 0, 0, 1, 32, len(png_bytes), 22)
    ico += png_bytes
    (OUT / "favicon.ico").write_bytes(ico)
    print("favicon.ico")

    buf = io.BytesIO()
    contain(im, 256, DARK).save(buf, "PNG")
    b64 = base64.b64encode(buf.getvalue()).decode()
    (OUT / "icon.svg").write_text(
        (
            '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" '
            f'viewBox="0 0 512 512"><image width="512" height="512" '
            f'href="data:image/png;base64,{b64}"/></svg>\n'
        ),
        encoding="utf-8",
    )
    print("icon.svg")

    build_id = f"partner-icon-{int(time.time())}"
    (OUT / "version.json").write_text(
        json.dumps({"buildId": build_id, "version": "0.1.2"}) + "\n",
        encoding="utf-8",
    )
    print("version", build_id)


if __name__ == "__main__":
    main()
