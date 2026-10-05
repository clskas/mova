"""Generate App Review walkthrough MP4 for Senga Driver (mock UI + captions)."""
from __future__ import annotations

import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 1080, 1920
PURPLE = (108, 52, 214)
TEAL = (16, 140, 140)
TEXT = (28, 32, 48)
MUTED = (110, 118, 140)
BG = (248, 249, 252)
WHITE = (255, 255, 255)
GREEN = (34, 170, 100)
LIGHT_P = (238, 232, 255)
BANNER = (20, 24, 40)

ROOT = Path("mobile/store-listing/ios")
FRAMES = ROOT / "_review_frames_driver"
OUT = ROOT / "senga-driver-app-review-walkthrough.mp4"
SRC_6_5 = ROOT / "driver-6.5"


def font(size: int, bold: bool = False):
    for path in (
        r"C:\Windows\Fonts\segoeuib.ttf" if bold else r"C:\Windows\Fonts\segoeui.ttf",
        r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf",
    ):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def rounded(draw, xy, r, fill, outline=None, width=2):
    draw.rounded_rectangle(xy, radius=r, fill=fill, outline=outline, width=width)


def status_bar(draw):
    draw.text((48, 36), "9:41", font=font(34, True), fill=TEXT)
    x = W - 80
    draw.rounded_rectangle((x, 40, x + 48, 68), radius=5, outline=TEXT, width=2)
    draw.rectangle((x + 5, 46, x + 34, 62), fill=TEXT)


def caption_bar(img: Image.Image, title: str, subtitle: str) -> Image.Image:
    canvas = Image.new("RGB", (W, H + 220), BANNER)
    canvas.paste(img.resize((W, H), Image.Resampling.LANCZOS), (0, 0))
    d = ImageDraw.Draw(canvas)
    d.text((48, H + 36), title, font=font(40, True), fill=WHITE)
    d.text((48, H + 100), subtitle, font=font(30), fill=(190, 198, 214))
    return canvas


def frame_splash() -> Image.Image:
    img = Image.new("RGB", (W, H), (12, 40, 48))
    d = ImageDraw.Draw(img)
    status_bar(d)
    cx, cy = W // 2, H // 2 - 80
    d.ellipse((cx - 90, cy - 90, cx + 90, cy + 90), fill=TEAL)
    d.ellipse((cx - 40, cy - 40, cx + 40, cy + 40), outline=WHITE, width=10)
    d.ellipse((cx - 10, cy - 10, cx + 10, cy + 10), fill=WHITE)
    d.text((W // 2, cy + 140), "SENGA Driver", font=font(64, True), fill=WHITE, anchor="mt")
    d.text((W // 2, cy + 220), "Espace chauffeur", font=font(36), fill=(180, 220, 220), anchor="mt")
    return caption_bar(img, "1. Launch app", "Physical-device style walkthrough — Senga Driver 1.0.17")


def frame_phone() -> Image.Image:
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    status_bar(d)
    d.ellipse((80, 140, 170, 230), fill=TEAL)
    d.text((200, 150), "SENGA", font=font(48, True), fill=PURPLE)
    d.text((200, 205), "Driver", font=font(32, True), fill=TEAL)
    d.text((72, 300), "Espace chauffeur", font=font(56, True), fill=TEXT)
    d.text((72, 380), "Connectez-vous avec votre PIN ou un code SMS", font=font(30), fill=MUTED)
    rounded(d, (72, 480, W - 72, 600), 20, WHITE, outline=(220, 222, 230))
    d.text((100, 500), "Téléphone", font=font(26), fill=MUTED)
    d.text((100, 545), "+243900000023", font=font(40, True), fill=TEXT)
    rounded(d, (72, 680, W - 72, 820), 28, PURPLE)
    d.text((W // 2, 750), "Continuer", font=font(40, True), fill=WHITE, anchor="mm")
    return caption_bar(img, "2. Enter demo phone", "+243900000023 (KYC approved demo driver)")


def frame_forgot_pin() -> Image.Image:
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    status_bar(d)
    d.text((72, 180), "Code PIN SENGA", font=font(52, True), fill=TEXT)
    d.text((72, 260), "+243900000023", font=font(32), fill=MUTED)
    for i, x in enumerate(range(100, 900, 140)):
        rounded(d, (x, 380, x + 110, 520), 18, WHITE, outline=PURPLE if i < 0 else (220, 222, 230))
    # Highlight forgot link
    rounded(d, (72, 580, 620, 680), 16, (255, 244, 220))
    d.text((100, 610), "Code PIN oublié ?", font=font(40, True), fill=(180, 90, 0))
    d.text((72, 740), "Do NOT enter 123456 as the PIN.", font=font(32, True), fill=(180, 40, 40))
    d.text((72, 800), "Tap Forgot PIN, then use SMS OTP.", font=font(32), fill=TEXT)
    return caption_bar(img, "3. Forgot PIN (required)", "123456 is the SMS OTP — not the local PIN")


def frame_otp() -> Image.Image:
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    status_bar(d)
    d.text((72, 180), "Code SMS", font=font(52, True), fill=TEXT)
    d.text((72, 260), "Entrez le code reçu par SMS", font=font(32), fill=MUTED)
    digits = "123456"
    for i, ch in enumerate(digits):
        x = 100 + i * 140
        rounded(d, (x, 380, x + 110, 520), 18, LIGHT_P, outline=PURPLE)
        d.text((x + 55, 450), ch, font=font(48, True), fill=PURPLE, anchor="mm")
    rounded(d, (72, 620, W - 72, 760), 28, PURPLE)
    d.text((W // 2, 690), "Vérifier le code", font=font(40, True), fill=WHITE, anchor="mm")
    return caption_bar(img, "4. Enter OTP 123456", "Demo whitelist OTP for App Review")


def frame_from_png(path: Path, title: str, subtitle: str) -> Image.Image:
    src = Image.open(path).convert("RGB")
    # Phone screenshots are 1284x2778 — letterbox into 1080x1920 content area
    scale = min(W / src.width, H / src.height)
    nw, nh = int(src.width * scale), int(src.height * scale)
    resized = src.resize((nw, nh), Image.Resampling.LANCZOS)
    phone = Image.new("RGB", (W, H), BG)
    phone.paste(resized, ((W - nw) // 2, (H - nh) // 2))
    return caption_bar(phone, title, subtitle)


def frame_help_delete() -> Image.Image:
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    status_bar(d)
    d.text((72, 160), "Aide", font=font(56, True), fill=TEXT)
    rounded(d, (72, 280, W - 72, 520), 24, WHITE)
    d.text((100, 320), "Comment supprimer mon compte ?", font=font(34, True), fill=TEXT)
    d.text(
        (100, 390),
        "Envoyez une demande via Aide →\nContacter le support. Traitement\nselon la politique de confidentialité.",
        font=font(30),
        fill=MUTED,
    )
    rounded(d, (72, 560, W - 72, 700), 24, PURPLE)
    d.text((W // 2, 630), "Contacter le support", font=font(36, True), fill=WHITE, anchor="mm")
    d.text((72, 760), "Privacy: https://senga.afri-soft.com/privacy", font=font(28), fill=MUTED)
    return caption_bar(img, "5. Account deletion path", "Help → Contact support (documented in FAQ)")


def main() -> None:
    FRAMES.mkdir(parents=True, exist_ok=True)
    sequence: list[tuple[Image.Image, float]] = [
        (frame_splash(), 3.0),
        (frame_phone(), 4.0),
        (frame_forgot_pin(), 5.0),
        (frame_otp(), 4.0),
        (frame_from_png(SRC_6_5 / "01-en-ligne.png", "6. Driver home — Online", "Toggle Online to receive jobs"), 5.0),
        (frame_from_png(SRC_6_5 / "02-nouvelle-course.png", "7. Accept / navigate to rider", "Typical trip flow"), 5.0),
        (frame_from_png(SRC_6_5 / "03-revenus.png", "8. Earnings", "Weekly net earnings in CDF"), 4.0),
        (frame_help_delete(), 5.0),
    ]

    list_path = FRAMES / "concat.txt"
    lines: list[str] = []
    for i, (im, dur) in enumerate(sequence):
        # Final canvas is H+220
        path = FRAMES / f"frame_{i:02d}.png"
        im.save(path)
        # escape for ffmpeg concat
        p = path.resolve().as_posix().replace("'", "'\\''")
        lines.append(f"file '{p}'")
        lines.append(f"duration {dur}")
    # last frame needs to be repeated for concat demuxer
    last = (FRAMES / f"frame_{len(sequence) - 1:02d}.png").resolve().as_posix().replace("'", "'\\''")
    lines.append(f"file '{last}'")
    list_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg",
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        str(list_path),
        "-vf",
        "fps=30,format=yuv420p",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        str(OUT),
    ]
    print(" ".join(cmd))
    subprocess.run(cmd, check=True)
    print(f"OK {OUT.resolve()} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
