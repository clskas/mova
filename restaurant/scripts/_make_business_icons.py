"""Generate SENGA Business PWA icons (storefront, not restaurant cloche)."""
from __future__ import annotations

import os

from PIL import Image, ImageDraw

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public")


def lerp(a: int, b: int, t: float) -> int:
    return int(a + (b - a) * t)


def make_icon(size: int, maskable: bool = False) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    radius = int(size * (0.18 if maskable else 0.22))

    for y in range(size):
        t = y / max(size - 1, 1)
        r = lerp(0xE8, 0xFF, t)
        g = lerp(0x3A, 0x8A, t)
        b = lerp(0x1C, 0x35, t)
        draw.line([(0, y), (size, y)], fill=(r, g, b, 255))

    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    img.putalpha(mask)

    cx, cy = size / 2, size / 2
    s = size * (0.52 if maskable else 0.48)
    left = cx - s / 2
    right = cx + s / 2
    top = cy - s * 0.38
    awning_h = s * 0.22
    body_top = top + awning_h
    body_bot = cy + s * 0.42

    roof = [
        (left - s * 0.04, body_top),
        (left + s * 0.08, top),
        (right - s * 0.08, top),
        (right + s * 0.04, body_top),
    ]
    draw.polygon(roof, fill=(255, 255, 255, 255))
    inset = s * 0.06
    draw.rounded_rectangle(
        [left + inset, body_top - 1, right - inset, body_bot],
        radius=max(2, int(size * 0.03)),
        fill=(255, 255, 255, 255),
    )

    holes: list[tuple[float, float, float, float]] = []
    dw, dh = s * 0.18, s * 0.28
    dx0 = cx - dw / 2
    dy1 = body_bot - s * 0.02
    dy0 = dy1 - dh
    holes.append((dx0, dy0, dx0 + dw, dy1))
    ww, wh = s * 0.16, s * 0.14
    wy = body_top + s * 0.08
    holes.append((left + inset + s * 0.08, wy, left + inset + s * 0.08 + ww, wy + wh))
    holes.append((right - inset - s * 0.08 - ww, wy, right - inset - s * 0.08, wy + wh))

    hole_mask = Image.new("L", (size, size), 0)
    hd = ImageDraw.Draw(hole_mask)
    for box in holes:
        hd.rounded_rectangle(box, radius=max(1, int(size * 0.02)), fill=255)

    pixels = img.load()
    hm = hole_mask.load()
    for y in range(size):
        t = y / max(size - 1, 1)
        r = lerp(0xE8, 0xFF, t)
        g = lerp(0x3A, 0x8A, t)
        b = lerp(0x1C, 0x35, t)
        for x in range(size):
            if hm[x, y]:
                a = pixels[x, y][3]
                pixels[x, y] = (r, g, b, a)
    return img


def main() -> None:
    out = os.path.abspath(OUT_DIR)
    os.makedirs(out, exist_ok=True)
    master = make_icon(512, maskable=False)
    maskable = make_icon(512, maskable=True)
    master.save(os.path.join(out, "icon-512.png"), format="PNG", optimize=True)
    maskable.save(os.path.join(out, "icon-512-maskable.png"), format="PNG", optimize=True)
    for name, size in (
        ("icon-192.png", 192),
        ("icon-180.png", 180),
        ("apple-touch-icon.png", 180),
        ("favicon.png", 64),
    ):
        master.resize((size, size), Image.Resampling.LANCZOS).save(
            os.path.join(out, name), format="PNG", optimize=True
        )
    icos = [master.resize((s, s), Image.Resampling.LANCZOS) for s in (16, 32, 48)]
    icos[0].save(
        os.path.join(out, "favicon.ico"),
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
    )
    svg = """<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#E83A1C"/>
      <stop offset="100%" stop-color="#FF8A35"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#g)"/>
  <path fill="#fff" d="M96 210 L140 130 H372 L416 210 Z"/>
  <rect x="120" y="208" width="272" height="210" rx="18" fill="#fff"/>
  <rect x="150" y="240" width="70" height="58" rx="10" fill="#F05A28"/>
  <rect x="292" y="240" width="70" height="58" rx="10" fill="#F05A28"/>
  <rect x="216" y="308" width="80" height="110" rx="12" fill="#F05A28"/>
</svg>
"""
    with open(os.path.join(out, "icon.svg"), "w", encoding="utf-8") as f:
        f.write(svg)
    print("icons written to", out)


if __name__ == "__main__":
    main()
