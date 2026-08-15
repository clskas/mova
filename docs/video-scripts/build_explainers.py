"""Compose SENGA explainer MP4s from storyboards in docs/video-scripts/.

Produces captioned 1080p clips (9:16 mobile, 16:9 web) with French voiceover
when edge-tts or Windows SAPI Hortense is available.
"""
from __future__ import annotations

import asyncio
import math
import os
import shutil
import subprocess
import sys
import wave
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(r"C:\Users\Administrator\Mova")
OUT = ROOT / "docs" / "video-scripts" / "out"
WORK = OUT / "_work"
STORE = ROOT / "mobile" / "store-listing" / "senga"
ICON_PASS = ROOT / "mobile" / "assets" / "icon" / "movaicone_passenger.png"
ICON_DRV = ROOT / "mobile" / "assets" / "icon" / "movaicone_driver.png"
ICON_BRAND = STORE / "app-icon-512.png"
SHOT1 = STORE / "phone-screenshot-1.png"
SHOT2 = STORE / "phone-screenshot-2.png"
SHOT3 = STORE / "phone-screenshot-3.png"

FFMPEG = r"C:\Users\Administrator\AppData\Local\Microsoft\WinGet\Links\ffmpeg.exe"
FFPROBE = r"C:\Users\Administrator\AppData\Local\Microsoft\WinGet\Links\ffprobe.exe"

MIDNIGHT = (13, 13, 26)
MIDNIGHT_SOFT = (26, 26, 46)
VIOLET = (99, 102, 241)
VIOLET_LIGHT = (139, 92, 246)
GREEN = (16, 185, 129)
ORANGE = (249, 115, 22)
ORANGE_RESTO = (234, 88, 12)
INDIGO = (79, 70, 229)
CLOUD = (244, 243, 255)
WHITE = (255, 255, 255)
TEXT = (15, 23, 42)
TEXT_SEC = (100, 116, 139)
BORDER = (226, 232, 240)
SLATE = (51, 65, 85)
GREEN_SOFT = (209, 250, 229)
ORANGE_SOFT = (255, 237, 213)
VIOLET_SOFT = (224, 231, 255)
INDIGO_SOFT = (224, 231, 255)

MOBILE = (1080, 1920)
DESKTOP = (1920, 1080)
FPS = 30
VOICE_EDGE = "fr-FR-DeniseNeural"
VOICE_SAPI = "Microsoft Hortense Desktop"


def run(cmd: list[str]) -> None:
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if proc.returncode != 0:
        err = (proc.stderr or b"").decode("utf-8", errors="replace")[-2500:]
        raise RuntimeError(f"ffmpeg failed ({proc.returncode}):\n{err}")


def probe_duration(path: Path) -> float:
    out = subprocess.check_output(
        [FFPROBE, "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(path)],
        text=True,
    ).strip()
    return float(out)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    name = "segoeuib.ttf" if bold else "segoeui.ttf"
    for candidate in (name, f"C:/Windows/Fonts/{name}", "arial.ttf", "C:/Windows/Fonts/arial.ttf"):
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    return ImageFont.load_default()


def load_icon(path: Path, size: int) -> Image.Image:
    im = Image.open(path).convert("RGBA")
    im = im.resize((size, size), Image.Resampling.LANCZOS)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=int(size * 0.22), fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(im, (0, 0), mask)
    return out


def rr(draw: ImageDraw.ImageDraw, box, radius: int, fill=None, outline=None, width: int = 1) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def text_w(draw: ImageDraw.ImageDraw, text: str, fnt) -> int:
    return int(draw.textbbox((0, 0), text, font=fnt)[2] - draw.textbbox((0, 0), text, font=fnt)[0])


def wrap(draw: ImageDraw.ImageDraw, text: str, fnt, max_w: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    cur = ""
    for w in words:
        trial = f"{cur} {w}".strip()
        if text_w(draw, trial, fnt) <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines or [text]


def draw_text_center(draw, text, y, fnt, fill, width) -> int:
    tw = text_w(draw, text, fnt)
    draw.text(((width - tw) // 2, y), text, font=fnt, fill=fill)
    return y + int(fnt.size * 1.35)


def fit_cover(src: Image.Image, size: tuple[int, int]) -> Image.Image:
    tw, th = size
    im = src.convert("RGB")
    sw, sh = im.size
    scale = max(tw / sw, th / sh)
    nw, nh = int(sw * scale), int(sh * scale)
    im = im.resize((nw, nh), Image.Resampling.LANCZOS)
    left, top = (nw - tw) // 2, (nh - th) // 2
    return im.crop((left, top, left + tw, top + th))


def gradient(size, c1, c2, vertical=True) -> Image.Image:
    w, h = size
    im = Image.new("RGB", size)
    px = im.load()
    steps = h if vertical else w
    for i in range(steps):
        t = i / max(1, steps - 1)
        col = tuple(int(a + (b - a) * t) for a, b in zip(c1, c2))
        if vertical:
            for x in range(w):
                px[x, i] = col
        else:
            for y in range(h):
                px[i, y] = col
    return im


def caption_bar(im: Image.Image, super_text: str, accent=VIOLET) -> Image.Image:
    w, h = im.size
    overlay = im.convert("RGBA")
    bar_h = 220 if h > w else 160
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rectangle((0, h - bar_h, w, h), fill=(10, 12, 22, 210))
    d.rectangle((0, h - bar_h, 14, h), fill=accent + (255,))
    fnt = font(42 if h > w else 36, bold=True)
    lines = wrap(d, super_text, fnt, w - 80)
    y = h - bar_h + (36 if h > w else 28)
    for line in lines[:2]:
        d.text((40, y), line, font=fnt, fill=WHITE + (255,))
        y += int(fnt.size * 1.25)
    out = Image.alpha_composite(overlay, layer)
    return out.convert("RGB")


def pointer(im: Image.Image, xy: tuple[int, int], color=ORANGE) -> Image.Image:
    layer = im.convert("RGBA")
    d = ImageDraw.Draw(layer)
    x, y = xy
    d.ellipse((x - 46, y - 46, x + 46, y + 46), outline=color + (180,), width=6)
    d.ellipse((x - 18, y - 18, x + 18, y + 18), fill=color + (230,))
    d.polygon([(x + 8, y + 10), (x + 52, y + 78), (x + 28, y + 78), (x + 42, y + 118), (x + 8, y + 70)], fill=(30, 30, 40, 230))
    return layer.convert("RGB")


def status_bar(draw, w: int, time="14:32") -> None:
    draw.rectangle((0, 0, w, 54), fill=MIDNIGHT)
    draw.text((28, 10), time, font=font(22, True), fill=WHITE)
    draw.text((w - 210, 10), "5G  ●●●  86%", font=font(20), fill=WHITE)


def mobile_header(draw, w: int, title: str, y0=54) -> int:
    draw.rectangle((0, y0, w, y0 + 88), fill=MIDNIGHT_SOFT)
    draw.text((40, y0 + 22), title, font=font(34, True), fill=WHITE)
    return y0 + 88


def stylized_map(draw, box, route=True, pins=True) -> None:
    x0, y0, x1, y1 = box
    rr(draw, box, 18, fill=(28, 36, 52))
    for i in range(6):
        yy = y0 + 30 + i * 42
        draw.line((x0 + 16, yy, x1 - 16, yy), fill=(48, 58, 78), width=2)
    for i in range(5):
        xx = x0 + 40 + i * 70
        draw.line((xx, y0 + 16, xx + 30, y1 - 16), fill=(42, 52, 70), width=2)
    if route:
        pts = [(x0 + 80, y1 - 50), (x0 + 160, y0 + 90), (x1 - 90, y0 + 70)]
        draw.line(pts, fill=VIOLET, width=8)
    if pins:
        for (px, py), col, label in (
            ((x0 + 80, y1 - 50), GREEN, "Départ"),
            ((x1 - 90, y0 + 70), VIOLET, "Gombe"),
        ):
            draw.ellipse((px - 14, py - 14, px + 14, py + 14), fill=col)
            draw.text((px + 16, py - 16), label, font=font(18, True), fill=WHITE)


def btn(draw, box, label: str, fill=VIOLET, fg=WHITE, highlight=False) -> tuple[int, int]:
    rr(draw, box, 16, fill=fill)
    if highlight:
        rr(draw, (box[0] - 6, box[1] - 6, box[2] + 6, box[3] + 6), 20, outline=ORANGE, width=5)
    fnt = font(28, True)
    tw = text_w(draw, label, fnt)
    cx = (box[0] + box[2] - tw) // 2
    cy = (box[1] + box[3] - 28) // 2
    draw.text((cx, cy), label, font=fnt, fill=fg)
    return ((box[0] + box[2]) // 2, (box[1] + box[3]) // 2)


def browser_chrome(draw, w: int, url: str, accent=VIOLET) -> int:
    draw.rectangle((0, 0, w, 72), fill=(36, 40, 52))
    for i, col in enumerate(((239, 68, 68), (245, 158, 11), (34, 197, 94))):
        draw.ellipse((22 + i * 28, 26, 40 + i * 28, 44), fill=col)
    rr(draw, (140, 16, w - 40, 56), 12, fill=(20, 22, 30))
    draw.text((160, 22), url, font=font(22), fill=(200, 204, 214))
    draw.rectangle((0, 72, 8, 1080), fill=accent)
    return 72


def desktop_nav(draw, items: list[tuple[str, bool]], accent, y0=72) -> None:
    draw.rectangle((0, y0, 280, 1080), fill=MIDNIGHT_SOFT)
    draw.text((24, y0 + 24), "SENGA", font=font(26, True), fill=WHITE)
    y = y0 + 80
    for label, active in items:
        if active:
            rr(draw, (16, y - 8, 264, y + 44), 10, fill=accent)
            draw.text((32, y), label, font=font(22, True), fill=WHITE)
        else:
            draw.text((32, y), label, font=font(22), fill=(180, 186, 200))
        y += 58


def kpi_card(draw, box, label, value, accent) -> None:
    rr(draw, box, 16, fill=WHITE, outline=BORDER, width=2)
    draw.rectangle((box[0], box[1], box[0] + 10, box[3]), fill=accent)
    draw.text((box[0] + 24, box[1] + 18), label, font=font(20), fill=TEXT_SEC)
    draw.text((box[0] + 24, box[1] + 52), value, font=font(36, True), fill=TEXT)


def title_card(size, icon: Image.Image | None, title: str, subtitle: str, accent, cta: str) -> Image.Image:
    w, h = size
    im = gradient(size, MIDNIGHT, (accent[0] // 3, accent[1] // 3, min(80, accent[2] // 2)))
    d = ImageDraw.Draw(im)
    if icon:
        iw = icon.size[0]
        im.paste(icon, ((w - iw) // 2, int(h * 0.22)), icon)
        ty = int(h * 0.22) + iw + 40
    else:
        ty = int(h * 0.32)
    ty = draw_text_center(d, title, ty, font(64 if h > w else 56, True), WHITE, w)
    for line in wrap(d, subtitle, font(28), int(w * 0.8)):
        ty = draw_text_center(d, line, ty + 8, font(28), (210, 214, 224), w)
    bw = min(720, w - 120)
    btn(d, ((w - bw) // 2, h - 220, (w + bw) // 2, h - 140), cta, fill=accent)
    return im


def end_card(size, icon: Image.Image | None, title: str, cta: str, line: str, accent) -> Image.Image:
    return title_card(size, icon, title, line, accent, cta)


# --- Passenger mobile -------------------------------------------------------

def pass_home(highlight=False, highlight_idx: int = 0) -> Image.Image:
    w, h = MOBILE
    im = Image.new("RGB", MOBILE, CLOUD)
    d = ImageDraw.Draw(im)
    status_bar(d, w)
    d.rectangle((0, 54, w, 220), fill=MIDNIGHT_SOFT)
    d.text((40, 78), "Bonjour", font=font(26), fill=(180, 186, 200))
    d.text((40, 112), "Kinshasa", font=font(40, True), fill=WHITE)
    d.text((40, 168), "Mobilité partout en RDC — choisissez un service", font=font(22), fill=(190, 196, 210))
    if ICON_PASS.exists():
        ic = load_icon(ICON_PASS, 72)
        im.paste(ic, (w - 120, 90), ic)
    cards = [
        ("Taxi / Moto-taxi", "Course immédiate partout en RDC", VIOLET),
        ("Livraisons", "Repas, colis, express et plus", GREEN),
        ("Réservation planifiée", "Programmez votre trajet à l'avance", VIOLET_LIGHT),
        ("Covoiturage", "Partagez un trajet, économisez", MIDNIGHT_SOFT),
        ("Location véhicule", "Voiture, SUV ou minibus", VIOLET),
        ("Déménagement", "Camion et manutention", SLATE),
        ("Wallet SENGA", "Solde, recharge et paiements", MIDNIGHT_SOFT),
        ("Historique", "Vos courses et transactions", ORANGE),
    ]
    y = 250
    gap, cw, ch = 20, 500, 200
    for i, (title, sub, col) in enumerate(cards):
        col_i = i % 2
        row = i // 2
        x = 30 + col_i * (cw + gap)
        yy = y + row * (ch + 16)
        box = (x, yy, x + cw, yy + ch)
        rr(d, box, 22, fill=WHITE, outline=BORDER, width=2)
        d.ellipse((x + 24, yy + 28, x + 88, yy + 92), fill=col)
        d.text((x + 108, yy + 36), title, font=font(26, True), fill=TEXT)
        for line in wrap(d, sub, font(20), 360):
            d.text((x + 108, yy + 80), line, font=font(20), fill=TEXT_SEC)
            break
        if highlight and i == highlight_idx:
            rr(d, (x - 6, yy - 6, x + cw + 6, yy + ch + 6), 26, outline=ORANGE, width=6)
    return im


def pass_booking(dest="", estimate=False) -> Image.Image:
    w, h = MOBILE
    im = Image.new("RGB", MOBILE, CLOUD)
    d = ImageDraw.Draw(im)
    status_bar(d, w)
    y = mobile_header(d, w, "Taxi / Moto-taxi")
    stylized_map(d, (30, y + 20, w - 30, y + 360), route=bool(dest))
    y = y + 390
    for label, value, hint in (
        ("Départ", "Ma position", "Avenue Colonel Mondjiba, Gombe"),
        ("Destination", dest or "", "Ex: Gombe, Limete, Masina…"),
    ):
        d.text((40, y), label, font=font(22, True), fill=TEXT_SEC)
        rr(d, (30, y + 36, w - 30, y + 120), 16, fill=WHITE, outline=VIOLET if (label == "Destination" and dest) else BORDER, width=3)
        shown = value or hint
        d.text((56, y + 58), shown, font=font(28, True if value else False), fill=TEXT if value else TEXT_SEC)
        y += 150
    d.text((40, y), "Choisissez votre véhicule", font=font(26, True), fill=TEXT)
    y += 50
    vehicles = [("Moto-taxi", True), ("Standard", False), ("Confort", False), ("VIP", False)]
    x = 30
    for name, sel in vehicles:
        box = (x, y, x + 240, y + 88)
        rr(d, box, 14, fill=VIOLET_SOFT if sel else WHITE, outline=VIOLET if sel else BORDER, width=3)
        d.text((x + 20, y + 28), name, font=font(24, True), fill=VIOLET if sel else TEXT)
        x += 256
    y += 120
    if estimate:
        rr(d, (30, y, w - 30, y + 200), 18, fill=WHITE, outline=BORDER, width=2)
        d.text((50, y + 24), "Estimation · Moto-taxi", font=font(24), fill=TEXT_SEC)
        d.text((50, y + 70), "3 500 FC", font=font(48, True), fill=GREEN)
        d.text((50, y + 140), "4,2 km  ·  12 min", font=font(22), fill=TEXT_SEC)
        y += 230
        cx, cy = btn(d, (30, y, w - 30, y + 92), "Confirmer la course", fill=GREEN, highlight=True)
    else:
        cx, cy = btn(d, (30, y, w - 30, y + 92), "Estimer le prix", fill=VIOLET, highlight=True)
    im = pointer(im, (cx, cy))
    return im


def pass_tracking() -> Image.Image:
    if SHOT3.exists():
        return fit_cover(Image.open(SHOT3), MOBILE)
    w, h = MOBILE
    im = Image.new("RGB", MOBILE, MIDNIGHT)
    d = ImageDraw.Draw(im)
    status_bar(d, w)
    d.text((40, 80), "Suivi de course", font=font(36, True), fill=WHITE)
    d.text((40, 130), "Suivez votre chauffeur en temps réel", font=font(22), fill=(200, 204, 214))
    rr(d, (40, 180, 420, 230), 20, fill=VIOLET)
    d.text((60, 190), "Chauffeur en route", font=font(22, True), fill=WHITE)
    stylized_map(d, (30, 260, w - 30, 1200))
    rr(d, (0, 1280, w, h), 0, fill=MIDNIGHT_SOFT)
    d.ellipse((50, 1340, 170, 1460), fill=VIOLET)
    d.text((190, 1350), "Jean K.  ★ 4.9", font=font(30, True), fill=WHITE)
    d.text((190, 1400), "Moto-taxi · Gombe → destination", font=font(22), fill=(190, 196, 210))
    return im


def pass_confirm_shot() -> Image.Image:
    if SHOT2.exists():
        return fit_cover(Image.open(SHOT2), MOBILE)
    return pass_booking(dest="Gombe", estimate=True)


# --- Driver mobile ----------------------------------------------------------

def drv_home(online=False) -> Image.Image:
    w, h = MOBILE
    im = Image.new("RGB", MOBILE, CLOUD)
    d = ImageDraw.Draw(im)
    status_bar(d, w)
    y = mobile_header(d, w, "SENGA Driver")
    if ICON_DRV.exists():
        ic = load_icon(ICON_DRV, 64)
        im.paste(ic, (w - 110, 68), ic)
    stylized_map(d, (30, y + 20, w - 30, y + 520), route=False, pins=False)
    y = y + 560
    rr(d, (30, y, w - 30, y + 200), 20, fill=WHITE, outline=BORDER, width=2)
    d.text((56, y + 28), "Disponibilité", font=font(24), fill=TEXT_SEC)
    d.text((56, y + 70), "En ligne" if online else "Hors ligne", font=font(40, True), fill=GREEN if online else TEXT_SEC)
    # switch
    sx0, sy0 = w - 220, y + 70
    rr(d, (sx0, sy0, sx0 + 140, sy0 + 64), 32, fill=GREEN if online else (203, 213, 225))
    knob = sx0 + 84 if online else sx0 + 8
    d.ellipse((knob, sy0 + 6, knob + 52, sy0 + 58), fill=WHITE)
    if online:
        d.text((40, y + 230), "En ligne — courses et livraisons près de votre position GPS.", font=font(22), fill=TEXT_SEC)
        im = pointer(im, (sx0 + 110, sy0 + 32), GREEN)
    else:
        im = pointer(im, (sx0 + 40, sy0 + 32), ORANGE)
    return im


def drv_offer() -> Image.Image:
    w, h = MOBILE
    im = gradient(MOBILE, MIDNIGHT, MIDNIGHT_SOFT)
    d = ImageDraw.Draw(im)
    status_bar(d, w)
    d.text((40, 90), "Nouvelle course", font=font(40, True), fill=WHITE)
    d.text((40, 150), "Moto-taxi  ·  3 200 FC  ·  1,8 km", font=font(24), fill=(190, 196, 210))
    rr(d, (40, 230, w - 40, 520), 20, fill=(20, 24, 40))
    d.ellipse((70, 280, 110, 320), fill=GREEN)
    d.text((130, 278), "Boulevard du 30 Juin, Gombe", font=font(26, True), fill=WHITE)
    d.line((88, 324, 88, 400), fill=(80, 86, 110), width=4)
    d.ellipse((70, 400, 110, 440), fill=VIOLET)
    d.text((130, 398), "Marché de la Liberté, Limete", font=font(26), fill=(210, 214, 224))
    cx, cy = btn(d, (40, 1500, w - 40, 1600), "Accepter la course", fill=GREEN, highlight=True)
    btn(d, (40, 1630, w - 40, 1720), "Refuser", fill=(51, 65, 85))
    return pointer(im, (cx, cy), GREEN)


def drv_active(stage: str) -> Image.Image:
    w, h = MOBILE
    im = Image.new("RGB", MOBILE, CLOUD)
    d = ImageDraw.Draw(im)
    status_bar(d, w)
    y = mobile_header(d, w, "Course en cours")
    stylized_map(d, (30, y + 16, w - 30, y + 640))
    y = y + 680
    labels = {
        "nav": ("Navigation vers le passager", VIOLET, "Itinéraire Google Maps"),
        "arrive": ("Je suis arrivé", GREEN, "Point de départ — Gombe"),
        "start": ("Démarrer la course", VIOLET, "Arrivé — en attente du passager"),
        "finish": ("Terminer la course", ORANGE, "Destination — Limete"),
    }
    title, col, sub = labels[stage]
    d.text((40, y), sub, font=font(24), fill=TEXT_SEC)
    if stage == "finish":
        rr(d, (30, y + 50, w - 30, y + 200), 16, fill=GREEN_SOFT)
        d.text((50, y + 80), "Course terminée — revenu estimé 2 800 FC", font=font(24, True), fill=(6, 95, 70))
        y += 170
    cx, cy = btn(d, (30, y + 40, w - 30, y + 140), title, fill=col, highlight=True)
    if stage == "nav":
        btn(d, (30, y + 170, w - 30, y + 260), "Je suis arrivé", fill=GREEN)
    return pointer(im, (cx, cy), col)


# --- Web passenger ----------------------------------------------------------

def web_home(highlight=False) -> Image.Image:
    im = Image.new("RGB", DESKTOP, CLOUD)
    d = ImageDraw.Draw(im)
    browser_chrome(d, 1920, "https://senga.afri-soft.com")
    d.rectangle((0, 72, 1920, 168), fill=MIDNIGHT_SOFT)
    d.text((80, 92), "SENGA — RDC", font=font(36, True), fill=WHITE)
    d.text((80, 136), "Kinshasa · Mobilité nationwide", font=font(20), fill=(180, 186, 200))
    d.text((80, 200), "Bonjour  ·  La mobilité, simplement.", font=font(34, True), fill=TEXT)
    cards = [
        ("Taxi / Moto-taxi", "Course immédiate", VIOLET),
        ("Livraison colis", "Envoi sécurisé", GREEN),
        ("Express", "Livraison prioritaire", ORANGE),
        ("Repas", "Restaurants locaux", GREEN),
        ("Déménagement", "Volume & devis", VIOLET),
        ("Location", "Véhicules avec chauffeur", INDIGO),
        ("Commissions", "Courses & achats", GREEN),
        ("Portefeuille", "Solde et recharges", VIOLET),
        ("Planifiée", "Réserver à l'avance", ORANGE),
        ("Covoiturage", "Partager un trajet", VIOLET),
        ("Historique", "Vos activités", ORANGE),
    ]
    y, x0 = 270, 80
    for i, (title, sub, col) in enumerate(cards):
        col_i, row = i % 4, i // 4
        x = x0 + col_i * 450
        yy = y + row * 200
        rr(d, (x, yy, x + 420, yy + 170), 18, fill=WHITE, outline=BORDER, width=2)
        d.ellipse((x + 24, yy + 28, x + 84, yy + 88), fill=col)
        d.text((x + 104, yy + 36), title, font=font(26, True), fill=TEXT)
        d.text((x + 104, yy + 80), sub, font=font(20), fill=TEXT_SEC)
        if highlight and i == 0:
            rr(d, (x - 6, yy - 6, x + 426, yy + 176), 22, outline=ORANGE, width=5)
    return im


def web_taxi(dest="", estimate=False, confirmed=False) -> Image.Image:
    im = Image.new("RGB", DESKTOP, CLOUD)
    d = ImageDraw.Draw(im)
    browser_chrome(d, 1920, "https://senga.afri-soft.com")
    d.rectangle((0, 72, 1920, 168), fill=MIDNIGHT_SOFT)
    d.text((80, 100), "SENGA — RDC", font=font(32, True), fill=WHITE)
    d.text((80, 200), "← Accueil", font=font(22), fill=VIOLET)
    if confirmed:
        rr(d, (560, 300, 1360, 780), 24, fill=WHITE, outline=BORDER, width=2)
        d.ellipse((880, 360, 1040, 520), fill=GREEN_SOFT)
        d.text((910, 400), "OK", font=font(48, True), fill=GREEN)
        d.text((700, 560), "Course confirmée", font=font(40, True), fill=TEXT)
        d.text((640, 630), "Un chauffeur sera assigné sous peu.", font=font(26), fill=TEXT_SEC)
        return im
    d.text((80, 250), "Taxi / Moto-taxi", font=font(40, True), fill=TEXT)
    d.text((80, 330), "Destination", font=font(22, True), fill=TEXT_SEC)
    rr(d, (80, 370, 900, 460), 14, fill=WHITE, outline=VIOLET if dest else BORDER, width=3)
    d.text((100, 396), dest or "Ex: Gombe, Limete, Masina…", font=font(26, dest != ""), fill=TEXT if dest else TEXT_SEC)
    d.text((80, 500), "Type de véhicule", font=font(22, True), fill=TEXT_SEC)
    y = 550
    for name, sel in (("Moto-taxi", True), ("Standard", False), ("Confort", False)):
        rr(d, (80, y, 900, y + 80), 14, fill=VIOLET_SOFT if sel else WHITE, outline=VIOLET if sel else BORDER, width=2)
        d.text((110, y + 22), name, font=font(26, True), fill=VIOLET if sel else TEXT)
        y += 100
    if estimate:
        rr(d, (1000, 370, 1840, 620), 18, fill=WHITE, outline=BORDER, width=2)
        d.text((1040, 400), "Estimation", font=font(24), fill=TEXT_SEC)
        d.text((1040, 460), "4 200 CDF", font=font(52, True), fill=VIOLET)
        d.text((1040, 540), "Limete  ·  Moto-taxi", font=font(24), fill=TEXT_SEC)
        cx, cy = btn(d, (1000, 660, 1840, 760), "Confirmer la course", fill=GREEN, highlight=True)
    else:
        cx, cy = btn(d, (80, 880, 900, 980), "Estimer le prix", fill=VIOLET, highlight=True)
    return pointer(im, (cx, cy))


# --- Restaurant -------------------------------------------------------------

def resto_shell(active: str) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    im = Image.new("RGB", DESKTOP, (255, 247, 237))
    d = ImageDraw.Draw(im)
    browser_chrome(d, 1920, "https://restaurant.afri-soft.com", ORANGE_RESTO)
    items = [
        ("Tableau de bord", active == "dash"),
        ("Commandes", active == "orders"),
        ("Menu", active == "menu"),
        ("Codes promo", False),
        ("Revenus", False),
        ("Paramètres", False),
    ]
    desktop_nav(d, items, ORANGE_RESTO)
    return im, d


def resto_orders(stage: str) -> Image.Image:
    im, d = resto_shell("orders")
    d.text((320, 100), "Commandes en cours", font=font(36, True), fill=TEXT)
    d.text((320, 150), "Gérez vos commandes en temps réel", font=font(22), fill=TEXT_SEC)
    d.text((320, 210), "Nouvelles (1)", font=font(24, True), fill=ORANGE_RESTO)
    rr(d, (320, 260, 1840, 560), 18, fill=WHITE, outline=BORDER, width=2)
    d.text((350, 290), "#a1b2c3d4", font=font(26, True), fill=TEXT)
    status = {"wait": "En attente", "accepted": "Confirmée", "ready": "Prête pour livreur"}[stage]
    rr(d, (1600, 290, 1810, 340), 12, fill=ORANGE_SOFT)
    d.text((1620, 300), status, font=font(20, True), fill=ORANGE_RESTO)
    d.text((350, 350), "2× Poulet mayo, 1× Jus d'ananas", font=font(24), fill=TEXT)
    d.text((350, 400), "Livraison : Avenue Tombalbaye, Gombe", font=font(22), fill=TEXT_SEC)
    d.text((350, 450), "Votre part  8 400 FC", font=font(24, True), fill=TEXT)
    if stage == "wait":
        cx, cy = btn(d, (350, 490, 560, 540), "Accepter", fill=GREEN, highlight=True)
        btn(d, (580, 490, 760, 540), "Refuser", fill=(254, 226, 226), fg=(185, 28, 28))
        im = pointer(im, (cx, cy), GREEN)
    elif stage == "accepted":
        cx, cy = btn(d, (350, 490, 720, 540), "Prête pour livreur", fill=VIOLET, highlight=True)
        im = pointer(im, (cx, cy), VIOLET)
    else:
        rr(d, (350, 490, 820, 540), 12, fill=GREEN_SOFT)
        d.text((370, 502), "Livreur SENGA peut récupérer", font=font(22, True), fill=(6, 95, 70))
    return im


def resto_menu() -> Image.Image:
    im, d = resto_shell("menu")
    d.text((320, 100), "Menu & photos", font=font(36, True), fill=TEXT)
    d.text((320, 150), "Plats visibles dans l'app passager", font=font(22), fill=TEXT_SEC)
    for i, (name, price) in enumerate((("Poulet mayo", "6 500 FC"), ("Frites + soda", "4 000 FC"))):
        x = 320 + i * 520
        rr(d, (x, 220, x + 480, 520), 18, fill=WHITE, outline=BORDER, width=2)
        rr(d, (x + 20, 240, x + 460, 380), 12, fill=(255, 237, 213))
        d.text((x + 30, 400), name, font=font(26, True), fill=TEXT)
        d.text((x + 30, 450), price, font=font(24), fill=ORANGE_RESTO)
    cx, cy = btn(d, (320, 560, 720, 650), "Publier le menu", fill=ORANGE_RESTO, highlight=True)
    rr(d, (750, 570, 1500, 640), 12, fill=GREEN_SOFT)
    d.text((770, 588), "Menu enregistré — visible dans l'app passager", font=font(22, True), fill=(6, 95, 70))
    return pointer(im, (cx, cy), ORANGE_RESTO)


def resto_dash() -> Image.Image:
    im, d = resto_shell("dash")
    d.text((320, 100), "Tableau de bord", font=font(36, True), fill=TEXT)
    cards = [("Solde disponible", "124 000 FC", ORANGE_RESTO), ("Revenus aujourd'hui", "38 500 FC", GREEN), ("Revenus ce mois", "812 000 FC", VIOLET), ("Ventes créditées", "27", INDIGO)]
    for i, (lab, val, acc) in enumerate(cards):
        x = 320 + (i % 2) * 760
        y = 200 + (i // 2) * 220
        kpi_card(d, (x, y, x + 720, y + 180), lab, val, acc)
    return im


# --- Rental -----------------------------------------------------------------

def rent_shell(active: str) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    im = Image.new("RGB", DESKTOP, (238, 242, 255))
    d = ImageDraw.Draw(im)
    browser_chrome(d, 1920, "https://rental.afri-soft.com", INDIGO)
    items = [
        ("Tableau de bord", active == "dash"),
        ("Véhicules", active == "cars"),
        ("Réservations", active == "res"),
        ("Revenus", False),
        ("Codes promo", False),
    ]
    desktop_nav(d, items, INDIGO)
    return im, d


def rent_dash() -> Image.Image:
    im, d = rent_shell("dash")
    d.text((320, 100), "Tableau de bord", font=font(36, True), fill=TEXT)
    d.text((320, 150), "Vos véhicules et vos réservations", font=font(22), fill=TEXT_SEC)
    kpi_card(d, (320, 210, 860, 390), "Solde disponible", "210 000 FC", INDIGO)
    kpi_card(d, (900, 210, 1440, 390), "Revenus aujourd'hui", "45 000 FC", GREEN)
    for i, (title, stat, acc) in enumerate(
        (("Mes véhicules", "3 publié(s) · 0 en attente", INDIGO), ("Réservations", "1 en attente de confirmation", GREEN), ("Revenus", "Solde 210 000 FC", VIOLET))
    ):
        x = 320 + i * 520
        rr(d, (x, 430, x + 490, 700), 18, fill=WHITE, outline=BORDER, width=2)
        d.text((x + 30, 470), title, font=font(28, True), fill=TEXT)
        d.text((x + 30, 530), stat, font=font(22), fill=acc)
    return im


def rent_cars() -> Image.Image:
    im, d = rent_shell("cars")
    d.text((320, 100), "Mes véhicules", font=font(36, True), fill=TEXT)
    rr(d, (320, 160, 520, 210), 12, fill=GREEN_SOFT)
    d.text((340, 172), "Publié", font=font(20, True), fill=(6, 95, 70))
    for i, (name, city) in enumerate((("Toyota RAV4 2021", "Gombe"), ("Hyundai Tucson", "Limete"))):
        y = 250 + i * 220
        rr(d, (320, y, 1840, y + 200), 18, fill=WHITE, outline=BORDER, width=2)
        rr(d, (350, y + 30, 620, y + 170), 12, fill=INDIGO_SOFT)
        d.text((660, y + 40), name, font=font(30, True), fill=TEXT)
        d.text((660, y + 90), f"{city}  ·  Publié  ·  visible sur SENGA", font=font(22), fill=TEXT_SEC)
        d.text((660, y + 130), "85 000 FC / jour", font=font(24, True), fill=INDIGO)
    return im


def rent_res(stage: str) -> Image.Image:
    im, d = rent_shell("res")
    d.text((320, 100), "Réservations", font=font(36, True), fill=TEXT)
    rr(d, (320, 200, 1840, 720), 18, fill=WHITE, outline=BORDER, width=2)
    d.text((360, 240), "Toyota RAV4  ·  Gombe → 3 jours", font=font(30, True), fill=TEXT)
    d.text((360, 300), "Passager : Client démo  ·  15–18 août", font=font(22), fill=TEXT_SEC)
    d.text((360, 350), "255 000 FC  ·  Logistique SENGA", font=font(22), fill=TEXT_SEC)
    if stage == "pending":
        btn(d, (360, 480, 640, 550), "Prendre en charge", fill=WHITE, fg=INDIGO)
        cx, cy = btn(d, (660, 480, 1060, 550), "Confirmer disponibilité", fill=INDIGO, highlight=True)
        btn(d, (1080, 480, 1280, 550), "Refuser", fill=(254, 226, 226), fg=(185, 28, 28))
        im = pointer(im, (cx, cy), INDIGO)
    else:
        rr(d, (360, 460, 900, 540), 12, fill=GREEN_SOFT)
        d.text((380, 482), "Réservation confirmée — client informé", font=font(24, True), fill=(6, 95, 70))
    return im


# --- Admin ------------------------------------------------------------------

def admin_shell(active: str) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    im = Image.new("RGB", DESKTOP, CLOUD)
    d = ImageDraw.Draw(im)
    browser_chrome(d, 1920, "https://admin.afri-soft.com", VIOLET)
    items = [
        ("Tableau de bord", active == "dash"),
        ("Utilisateurs", False),
        ("Chauffeurs", False),
        ("KYC", active == "kyc"),
        ("Courses", False),
        ("Restaurants", False),
        ("Catalogue location", False),
    ]
    desktop_nav(d, items, VIOLET)
    return im, d


def admin_dash(kyc=3) -> Image.Image:
    im, d = admin_shell("dash")
    d.text((320, 96), "Tableau de bord", font=font(36, True), fill=TEXT)
    d.text((320, 146), "Kinshasa · couverture nationale", font=font(22), fill=TEXT_SEC)
    cards = [
        ("Utilisateurs", "12 480", MIDNIGHT_SOFT),
        ("Chauffeurs en ligne", "186", GREEN),
        ("KYC en attente", str(kyc), ORANGE),
        ("Courses actives", "42", VIOLET),
        ("Revenus du jour", "2,4 M FC", VIOLET_LIGHT),
        ("Livraisons actives", "19", GREEN),
    ]
    for i, (lab, val, acc) in enumerate(cards):
        x = 320 + (i % 3) * 520
        y = 210 + (i // 3) * 220
        kpi_card(d, (x, y, x + 490, y + 190), lab, val, acc)
        if lab == "KYC en attente":
            rr(d, (x - 4, y - 4, x + 494, y + 194), 18, outline=ORANGE, width=4)
    d.text((320, 700), "Valider KYC  →", font=font(26, True), fill=VIOLET)
    return pointer(im, (840, 300), ORANGE)


def admin_kyc(approved=False) -> Image.Image:
    im, d = admin_shell("kyc")
    d.text((320, 96), "KYC", font=font(36, True), fill=TEXT)
    d.text((320, 146), "Validation des documents chauffeurs", font=font(22), fill=TEXT_SEC)
    rr(d, (320, 220, 1840, 520), 18, fill=WHITE, outline=BORDER, width=2)
    d.text((360, 250), "Permis de conduire", font=font(28, True), fill=TEXT)
    d.text((360, 300), "Chauffeur  ·  dossier complet — prêt à valider", font=font(22), fill=TEXT_SEC)
    rr(d, (360, 360, 700, 480), 12, fill=(226, 232, 240))
    d.text((400, 400), "Aperçu document", font=font(20), fill=TEXT_SEC)
    if approved:
        rr(d, (1100, 360, 1500, 440), 12, fill=GREEN_SOFT)
        d.text((1120, 382), "Partenaire validé", font=font(24, True), fill=(6, 95, 70))
    else:
        cx, cy = btn(d, (1100, 360, 1380, 440), "Approuver", fill=GREEN, highlight=True)
        btn(d, (1410, 360, 1640, 440), "Rejeter", fill=(254, 226, 226), fg=(185, 28, 28))
        im = pointer(im, (cx, cy), GREEN)
    return im


# --- TTS + encode -----------------------------------------------------------

@dataclass
class Shot:
    name: str
    seconds: float
    super_text: str
    vo: str
    image: Image.Image


def wav_duration(path: Path) -> float:
    with wave.open(str(path), "rb") as wf:
        return wf.getnframes() / float(wf.getframerate())


def tts_edge(text: str, dest: Path) -> bool:
    async def _go() -> None:
        import edge_tts

        comm = edge_tts.Communicate(text, VOICE_EDGE)
        await comm.save(str(dest))

    try:
        asyncio.run(_go())
        return dest.exists() and dest.stat().st_size > 800
    except Exception as exc:
        print("edge-tts failed:", exc)
        return False


def tts_sapi(text: str, dest: Path) -> bool:
    wav = dest.with_suffix(".wav")
    safe = text.replace("'", "''")
    out = str(wav).replace("'", "''")
    ps = (
        "Add-Type -AssemblyName System.Speech; "
        "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
        f"$s.SelectVoice('{VOICE_SAPI}'); $s.Rate = 0; "
        f"$s.SetOutputToWaveFile('{out}'); $s.Speak('{safe}'); $s.Dispose()"
    )
    try:
        subprocess.check_call(["powershell", "-NoProfile", "-Command", ps], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if wav.exists() and wav.stat().st_size > 800:
            if dest.suffix.lower() != ".wav":
                run([FFMPEG, "-y", "-i", str(wav), "-ac", "1", "-ar", "24000", str(dest)])
            return True
    except Exception as exc:
        print("SAPI failed:", exc)
    return False


def make_voice(text: str, dest: Path) -> Path | None:
    mp3 = dest.with_suffix(".mp3")
    wav = dest.with_suffix(".wav")
    if tts_edge(text, mp3):
        return mp3
    if tts_sapi(text, wav):
        return wav if wav.exists() else mp3
    return None


def still_to_clip(png: Path, out_mp4: Path, seconds: float, size: tuple[int, int], audio: Path | None) -> None:
    w, h = size
    fade_out = max(0.3, seconds - 0.3)
    vf = f"scale={w}:{h},fade=t=in:st=0:d=0.25,fade=t=out:st={fade_out:.2f}:d=0.25"
    dur = f"{seconds:.2f}"
    cmd = [
        FFMPEG,
        "-y",
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-loop",
        "1",
        "-framerate",
        str(FPS),
        "-t",
        dur,
        "-i",
        str(png),
    ]
    if audio:
        cmd += ["-i", str(audio)]
    else:
        cmd += ["-f", "lavfi", "-t", dur, "-i", "anullsrc=channel_layout=mono:sample_rate=24000"]
    cmd += [
        "-t",
        dur,
        "-vf",
        vf,
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-crf",
        "20",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        str(out_mp4),
    ]
    run(cmd)


def concat_clips(parts: list[Path], dest: Path) -> None:
    lst = dest.with_suffix(".txt")
    with lst.open("w", encoding="utf-8") as f:
        for p in parts:
            f.write(f"file '{p.as_posix()}'\n")
    run(
        [
            FFMPEG,
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(lst),
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-r",
            str(FPS),
            "-crf",
            "20",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-movflags",
            "+faststart",
            str(dest),
        ]
    )


def assemble(
    slug: str,
    size: tuple[int, int],
    shots: list[Shot],
    accent,
    out_dir: Path | None = None,
) -> dict:
    folder = WORK / slug
    if folder.exists():
        shutil.rmtree(folder)
    folder.mkdir(parents=True)
    dest_root = out_dir or OUT
    dest_root.mkdir(parents=True, exist_ok=True)
    parts: list[Path] = []
    voiced = False
    total = 0.0
    for i, shot in enumerate(shots, 1):
        frame = caption_bar(shot.image, shot.super_text, accent)
        png = folder / f"{i:02d}_{shot.name}.png"
        frame.save(png, optimize=True)
        audio = make_voice(shot.vo, folder / f"{i:02d}_{shot.name}")
        dur = shot.seconds
        if audio:
            voiced = True
            try:
                if audio.suffix == ".wav":
                    ad = wav_duration(audio)
                else:
                    ad = probe_duration(audio)
                dur = max(dur, min(ad + 0.45, dur + 4.0))
            except Exception:
                pass
        mp4 = folder / f"{i:02d}_{shot.name}.mp4"
        print(f"  encode {slug} {shot.name} ({dur:.1f}s) vo={'yes' if audio else 'no'}", flush=True)
        still_to_clip(png, mp4, dur, size, audio)
        parts.append(mp4)
        total += dur
    dest = dest_root / f"{slug}.mp4"
    concat_clips(parts, dest)
    real = probe_duration(dest)
    print(f"WROTE {dest} {real:.1f}s {dest.stat().st_size // 1024} KB")
    return {
        "file": dest,
        "duration": real,
        "resolution": f"{size[0]}x{size[1]}",
        "voice": voiced,
        "planned": total,
    }


def build_all() -> list[dict]:
    OUT.mkdir(parents=True, exist_ok=True)
    WORK.mkdir(parents=True, exist_ok=True)
    ic_p = load_icon(ICON_PASS if ICON_PASS.exists() else ICON_BRAND, 280)
    ic_d = load_icon(ICON_DRV if ICON_DRV.exists() else ICON_BRAND, 280)
    ic_b = load_icon(ICON_BRAND, 260)

    results = []

    results.append(
        assemble(
            "senga-passager-mobile",
            MOBILE,
            [
                Shot("title", 6, "SENGA — commander un taxi", "Sur SENGA, vous choisissez votre service. Ici, un taxi.", pass_home(True)),
                Shot("dest", 8, "Indiquez la destination", "Tapez votre destination, par exemple Gombe.", pass_booking("")),
                Shot("price", 8, "Prix en francs congolais", "Choisissez le véhicule. SENGA affiche le prix en francs congolais.", pass_booking("Gombe", True)),
                Shot("confirm", 6, "Confirmer la course", "Confirmez. Un chauffeur proche reçoit la demande.", pass_confirm_shot()),
                Shot("track", 14, "Suivez le chauffeur", "Vous suivez le chauffeur en direct jusqu’à l’arrivée.", pass_tracking()),
                Shot("end", 6, "Téléchargez Senga", "Senga. La mobilité, simplement. Téléchargez l’application.", end_card(MOBILE, ic_p, "Senga", "Téléchargez Senga", "Taxi, livraisons, repas — Kinshasa et la RDC", VIOLET)),
            ],
            VIOLET,
        )
    )

    results.append(
        assemble(
            "senga-chauffeur",
            MOBILE,
            [
                Shot("online", 8, "Passez En ligne", "Ouvrez SENGA Driver. Activez En ligne pour recevoir les courses.", drv_home(True)),
                Shot("offer", 10, "Nouvelle course", "Une course arrive. Appuyez sur Accepter la course.", drv_offer()),
                Shot("nav", 8, "Navigation vers le passager", "L’app ouvre l’itinéraire jusqu’au passager.", drv_active("nav")),
                Shot("arrive", 6, "Je suis arrivé", "Vous êtes au point de départ. Indiquez Je suis arrivé.", drv_active("arrive")),
                Shot("start", 10, "Démarrer la course", "Le passager monte. Démarrez la course et suivez la destination.", drv_active("start")),
                Shot("finish", 10, "Terminer la course", "À l’arrivée, terminez la course. Votre revenu s’affiche.", drv_active("finish")),
                Shot("end", 6, "SENGA Driver", "SENGA Driver. En ligne, vous travaillez.", end_card(MOBILE, ic_d, "SENGA Driver", "Téléchargez SENGA Driver", "Courses et livraisons — Kinshasa", GREEN)),
            ],
            GREEN,
        )
    )

    results.append(
        assemble(
            "senga-passager-web",
            DESKTOP,
            [
                Shot("home", 6, "SENGA sur le web", "Sur senga.afri-soft.com, tous les services SENGA.", web_home(True)),
                Shot("taxi", 6, "Taxi / Moto-taxi", "Choisissez Taxi / Moto-taxi.", web_taxi()),
                Shot("dest", 10, "Destination", "Tapez Limete, puis le type de véhicule.", web_taxi("Limete")),
                Shot("est", 8, "Estimer, puis confirmer", "Estimez le prix, puis confirmez la course.", web_taxi("Limete", True)),
                Shot("ok", 8, "Course confirmée", "C’est confirmé. Un chauffeur arrive.", web_taxi(confirmed=True)),
                Shot("end", 6, "senga.afri-soft.com", "SENGA, aussi sur le téléphone dans le navigateur.", end_card(DESKTOP, ic_b, "SENGA — RDC", "senga.afri-soft.com", "Même services que l’app — taxi, repas, location", VIOLET)),
            ],
            VIOLET,
        )
    )

    results.append(
        assemble(
            "senga-restaurant",
            DESKTOP,
            [
                Shot("orders", 6, "Nouvelles commandes", "Voici vos commandes SENGA, en direct.", resto_orders("wait")),
                Shot("accept", 10, "Accepter", "Une commande arrive. Appuyez sur Accepter.", resto_orders("wait")),
                Shot("ready", 8, "Prête pour livreur", "Quand c’est prêt, indiquez Prête pour livreur.", resto_orders("accepted")),
                Shot("menu", 12, "Menu & photos", "Dans Menu, vous publiez les plats vus par les clients.", resto_menu()),
                Shot("dash", 6, "Tableau de bord", "Le tableau de bord montre vos ventes du jour.", resto_dash()),
                Shot("end", 6, "restaurant.afri-soft.com", "Portail Restaurant SENGA.", end_card(DESKTOP, ic_b, "SENGA Restaurant", "restaurant.afri-soft.com", "Accepter les commandes, publier le menu", ORANGE_RESTO)),
            ],
            ORANGE_RESTO,
        )
    )

    results.append(
        assemble(
            "senga-location",
            DESKTOP,
            [
                Shot("dash", 8, "Tableau de bord", "Le portail Location : vos véhicules et vos réservations.", rent_dash()),
                Shot("cars", 12, "Mes véhicules", "Ici, le catalogue. Les véhicules publiés sont visibles sur SENGA.", rent_cars()),
                Shot("res", 16, "Confirmer disponibilité", "Une réservation arrive. Confirmez la disponibilité.", rent_res("pending")),
                Shot("ok", 6, "Réservation confirmée", "Le client est informé. La location peut commencer.", rent_res("done")),
                Shot("end", 6, "rental.afri-soft.com", "Portail Location SENGA.", end_card(DESKTOP, ic_b, "SENGA Location", "rental.afri-soft.com", "Catalogue véhicules et réservations", INDIGO)),
            ],
            INDIGO,
        )
    )

    results.append(
        assemble(
            "senga-admin",
            DESKTOP,
            [
                Shot("dash", 12, "Tableau de bord", "La console SENGA : courses, chauffeurs, revenus.", admin_dash(3)),
                Shot("kyc", 6, "KYC", "Les nouveaux chauffeurs passent par le KYC.", admin_kyc(False)),
                Shot("ok", 14, "Approuver", "Vous vérifiez les papiers, puis Approuver.", admin_kyc(False)),
                Shot("back", 6, "Partenaire validé", "Le chauffeur peut passer En ligne.", admin_dash(2)),
                Shot("end", 6, "admin.afri-soft.com", "Admin SENGA — équipe interne.", end_card(DESKTOP, ic_b, "SENGA Admin", "admin.afri-soft.com", "Pilotage et validation des partenaires", VIOLET)),
            ],
            VIOLET,
        )
    )
    return results


def write_readme(rows: list[dict], voice_note: str) -> None:
    lines = [
        "# Vidéos explicatives SENGA",
        "",
        "Clips générés localement à partir des storyboards `docs/video-scripts/*.md`.",
        "Ne pas committer les MP4 (déjà ignorés via `out/`).",
        "",
        f"**Audio :** {voice_note}",
        "",
        "| Fichier | Durée | Résolution | Audio |",
        "|---------|-------|------------|-------|",
    ]
    for r in rows:
        audio = "voix FR + sous-titres" if r["voice"] else "sous-titres seuls"
        lines.append(f"| `{r['file'].name}` | {r['duration']:.1f} s | {r['resolution']} | {audio} |")
    lines += [
        "",
        "## Lecture",
        "",
        "Double-clic dans l’Explorateur, ou :",
        "",
        "```powershell",
        r"Start-Process 'C:\Users\Administrator\Mova\docs\video-scripts\out\senga-passager-mobile.mp4'",
        "```",
        "",
        "## Limites",
        "",
        "- Pas de connexion aux apps de production : maquettes fidèles aux libellés UI + captures store passager (`phone-screenshot-2/3`).",
        "- Pas de splash, OTP, PIN espèces, SOS, wallet (hors sujet des scripts).",
        "- Régénérer : `python docs/video-scripts/build_explainers.py`",
        "",
    ]
    (OUT / "README.md").write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    if not Path(FFMPEG).exists():
        print("ffmpeg missing:", FFMPEG)
        return 1
    print("Building 6 explainer videos ->", OUT)
    rows = build_all()
    voice_note = "voix française (edge-tts Denise) + supers à l’écran"
    if not any(r["voice"] for r in rows):
        voice_note = "sous-titres français seuls (TTS indisponible)"
    elif not all(r["voice"] for r in rows):
        voice_note = "voix FR sur la plupart des plans + supers à l’écran"
    write_readme(rows, voice_note)
    print("README", OUT / "README.md")
    return 0


if __name__ == "__main__":
    sys.exit(main())
