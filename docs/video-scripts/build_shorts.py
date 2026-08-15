"""One short MP4 per SENGA passenger/driver feature (30–45 s, 9:16).

Writes to docs/video-scripts/out/shorts/. Reuses helpers from build_explainers.py.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_explainers import (  # noqa: E402
    BORDER,
    CLOUD,
    DESKTOP,
    GREEN,
    GREEN_SOFT,
    ICON_BRAND,
    ICON_DRV,
    ICON_PASS,
    INDIGO,
    MIDNIGHT,
    MIDNIGHT_SOFT,
    MOBILE,
    ORANGE,
    ORANGE_SOFT,
    OUT,
    SLATE,
    TEXT,
    TEXT_SEC,
    VIOLET,
    VIOLET_LIGHT,
    VIOLET_SOFT,
    WHITE,
    Shot,
    assemble,
    btn,
    drv_active,
    drv_home,
    drv_offer,
    end_card,
    font,
    load_icon,
    pass_booking,
    pass_confirm_shot,
    pass_home,
    pass_tracking,
    pointer,
    probe_duration,
    rr,
    status_bar,
    stylized_map,
    text_w,
    wrap,
)

SHORTS = OUT / "shorts"


def mobile_header(draw, w: int, title: str, y0=54) -> int:
    draw.rectangle((0, y0, w, y0 + 88), fill=MIDNIGHT_SOFT)
    draw.text((40, y0 + 22), title, font=font(34, True), fill=WHITE)
    return y0 + 88


def bottom_nav(draw, w: int, h: int, active: str = "Accueil") -> None:
    items = ["Accueil", "Historique", "Wallet", "Aide"]
    draw.rectangle((0, h - 110, w, h), fill=WHITE)
    draw.line((0, h - 110, w, h - 110), fill=BORDER, width=2)
    slot = w // 4
    for i, name in enumerate(items):
        col = VIOLET if name == active else TEXT_SEC
        draw.text((i * slot + 40, h - 72), name, font=font(22, name == active), fill=col)


def tabs(draw, w: int, y: int, names: list[str], active: int) -> int:
    n = len(names)
    tw = (w - 60) // n
    for i, name in enumerate(names):
        x = 30 + i * tw
        col = VIOLET if i == active else TEXT_SEC
        draw.text((x + 12, y + 10), name, font=font(24, i == active), fill=col)
        if i == active:
            draw.rectangle((x, y + 52, x + tw - 16, y + 58), fill=VIOLET)
    return y + 70


def field(draw, box, label: str, value: str, hint: str = "", accent=False) -> None:
    x0, y0, x1, y1 = box
    draw.text((x0 + 8, y0 - 32), label, font=font(22, True), fill=TEXT_SEC)
    rr(draw, box, 16, fill=WHITE, outline=VIOLET if (accent or value) else BORDER, width=3)
    shown = value or hint
    draw.text((x0 + 24, y0 + 22), shown, font=font(26, bool(value)), fill=TEXT if value else TEXT_SEC)


# --- Passenger feature screens ---------------------------------------------

def pass_delivery_hub(highlight: str = "Livraison colis"):
    from PIL import Image, ImageDraw

    w, h = MOBILE
    im = Image.new("RGB", MOBILE, CLOUD)
    d = ImageDraw.Draw(im)
    status_bar(d, w)
    y = mobile_header(d, w, "Livraisons")
    d.text((40, y + 16), "Choisissez votre type de livraison", font=font(24), fill=TEXT_SEC)
    cards = [
        ("Livraison repas", "Restaurants et plats locaux", GREEN),
        ("Livraison colis", "Envoyez un colis en toute sécurité", GREEN),
        ("Livraison express", "Envoi urgent en moins de 45 min", ORANGE),
        ("Courses & commissions", "Achats et courses pour vous", VIOLET),
    ]
    y = y + 70
    cw, ch, gap = 500, 280, 20
    for i, (title, sub, col) in enumerate(cards):
        col_i, row = i % 2, i // 2
        x = 30 + col_i * (cw + gap)
        yy = y + row * (ch + 16)
        box = (x, yy, x + cw, yy + ch)
        rr(d, box, 22, fill=WHITE, outline=BORDER, width=2)
        d.ellipse((x + 28, yy + 28, x + 100, yy + 100), fill=col)
        d.text((x + 28, yy + 120), title, font=font(26, True), fill=TEXT)
        for line in wrap(d, sub, font(20), 440):
            d.text((x + 28, yy + 168), line, font=font(20), fill=TEXT_SEC)
            break
        if title == highlight:
            rr(d, (x - 6, yy - 6, x + cw + 6, yy + ch + 6), 26, outline=ORANGE, width=6)
    bottom_nav(d, w, h)
    return im


def pass_parcel(filled=False, confirm=False):
    from PIL import Image, ImageDraw

    w, h = MOBILE
    im = Image.new("RGB", MOBILE, CLOUD)
    d = ImageDraw.Draw(im)
    status_bar(d, w)
    y = mobile_header(d, w, "Livraison colis")
    y += 50
    field(d, (30, y, w - 30, y + 88), "Adresse d'enlèvement", "Gombe — Boulevard du 30 Juin" if filled else "", "Point d'enlèvement")
    y += 160
    field(d, (30, y, w - 30, y + 88), "Adresse de livraison", "Limete — Marché de la Liberté" if filled else "", "Adresse de livraison")
    y += 150
    d.text((40, y), "Catégorie", font=font(22, True), fill=TEXT_SEC)
    y += 40
    cats = [("Documents", False), ("Petit colis", True), ("Moyen", False), ("Grand", False)]
    x = 30
    for name, sel in cats:
        box = (x, y, x + 240, y + 80)
        rr(d, box, 14, fill=VIOLET_SOFT if sel else WHITE, outline=VIOLET if sel else BORDER, width=3)
        d.text((x + 16, y + 24), name, font=font(22, True), fill=VIOLET if sel else TEXT)
        x += 256
    y += 120
    if confirm:
        rr(d, (30, y, w - 30, y + 180), 18, fill=WHITE, outline=BORDER, width=2)
        d.text((50, y + 24), "Estimation · Petit colis", font=font(24), fill=TEXT_SEC)
        d.text((50, y + 70), "4 800 FC", font=font(48, True), fill=GREEN)
        d.text((50, y + 130), "Gombe → Limete  ·  5,1 km", font=font(22), fill=TEXT_SEC)
        y += 210
        cx, cy = btn(d, (30, y, w - 30, y + 92), "Confirmer l'envoi", fill=GREEN, highlight=True)
    else:
        cx, cy = btn(d, (30, y, w - 30, y + 92), "Estimer le prix", fill=VIOLET, highlight=True)
    bottom_nav(d, w, h)
    return pointer(im, (cx, cy))


def pass_scheduled(filled=False, confirm=False, listed=False):
    from PIL import Image, ImageDraw

    w, h = MOBILE
    im = Image.new("RGB", MOBILE, CLOUD)
    d = ImageDraw.Draw(im)
    status_bar(d, w)
    y = mobile_header(d, w, "Réservation planifiée")
    y = tabs(d, w, y + 8, ["Nouvelle réservation transport", "Mes réservations"], 1 if listed else 0)
    if listed:
        d.text((40, y + 20), "Mes réservations", font=font(28, True), fill=TEXT)
        rr(d, (30, y + 80, w - 30, y + 320), 18, fill=WHITE, outline=BORDER, width=2)
        rr(d, (50, y + 110, 280, y + 160), 12, fill=VIOLET_SOFT)
        d.text((70, y + 122), "Planifiée", font=font(22, True), fill=VIOLET)
        d.text((50, y + 180), "Gombe → Aéroport", font=font(28, True), fill=TEXT)
        d.text((50, y + 230), "16/08/2026 à 07:30  ·  Moto-taxi", font=font(22), fill=TEXT_SEC)
        rr(d, (200, 700, 880, 980), 24, fill=WHITE, outline=BORDER, width=2)
        d.ellipse((480, 740, 600, 860), fill=GREEN_SOFT)
        d.text((500, 770), "OK", font=font(40, True), fill=GREEN)
        d.text((280, 880), "Réservation confirmée", font=font(28, True), fill=TEXT)
        bottom_nav(d, w, h)
        return im
    d.text((40, y + 10), "Réserver à l'avance", font=font(30, True), fill=TEXT)
    d.text((40, y + 56), "Programmez un trajet jusqu'à 7 jours à l'avance.", font=font(22), fill=TEXT_SEC)
    y += 120
    field(d, (30, y, w - 30, y + 88), "Date et heure de réservation", "16/08/2026 à 07:30" if filled else "", "Réservation possible jusqu'à J+7")
    y += 160
    field(d, (30, y, w - 30, y + 88), "Destination", "Aéroport" if filled else "", "Ex: Aéroport, Gombe…")
    y += 140
    d.text((40, y), "Départ : Ma position", font=font(22), fill=TEXT_SEC)
    y += 50
    for name, sel in (("Moto-taxi", True), ("Standard", False), ("Confort", False)):
        box = (30 + (0 if name == "Moto-taxi" else (256 if name == "Standard" else 512)), y, 30 + (240 if name == "Moto-taxi" else (496 if name == "Standard" else 752)), y + 80)
        rr(d, box, 14, fill=VIOLET_SOFT if sel else WHITE, outline=VIOLET if sel else BORDER, width=3)
        d.text((box[0] + 20, y + 24), name, font=font(22, True), fill=VIOLET if sel else TEXT)
    y += 110
    if confirm:
        rr(d, (30, y, w - 30, y + 160), 18, fill=WHITE, outline=BORDER, width=2)
        d.text((50, y + 20), "Tarif réservation", font=font(22), fill=TEXT_SEC)
        d.text((50, y + 64), "6 200 FC", font=font(44, True), fill=GREEN)
        y += 190
        cx, cy = btn(d, (30, y, w - 30, y + 92), "Confirmer la réservation", fill=GREEN, highlight=True)
    else:
        cx, cy = btn(d, (30, y, w - 30, y + 92), "Estimer le tarif", fill=VIOLET, highlight=True)
    bottom_nav(d, w, h)
    return pointer(im, (cx, cy))


def pass_carpool(stage: str):
    from PIL import Image, ImageDraw

    w, h = MOBILE
    im = Image.new("RGB", MOBILE, CLOUD)
    d = ImageDraw.Draw(im)
    status_bar(d, w)
    y = mobile_header(d, w, "Covoiturage")
    y = tabs(d, w, y + 8, ["Rechercher", "Mes réservations"], 0)
    if stage == "search":
        d.text((40, y + 8), "Trajets planifiés partagés — pas une course VTC immédiate.", font=font(20), fill=TEXT_SEC)
        y += 70
        field(d, (30, y, w - 30, y + 88), "Ville de départ", "Gombe, Kinshasa")
        y += 160
        field(d, (30, y, w - 30, y + 88), "Ville de destination", "Limete, Kinshasa")
        y += 160
        d.text((40, y), "Date : 16/08/2026", font=font(22), fill=TEXT)
        y += 60
        cx, cy = btn(d, (30, y, w - 30, y + 92), "Rechercher", fill=VIOLET, highlight=True)
        bottom_nav(d, w, h)
        return pointer(im, (cx, cy))
    if stage == "results":
        d.text((40, y + 8), "1 trajet(s) trouvé(s)", font=font(26, True), fill=TEXT)
        rr(d, (30, y + 60, w - 30, y + 420), 18, fill=WHITE, outline=BORDER, width=2)
        d.text((56, y + 90), "Gombe → Limete", font=font(30, True), fill=TEXT)
        d.text((56, y + 150), "16/08  ·  07:30  ·  2 places", font=font(22), fill=TEXT_SEC)
        d.text((56, y + 200), "2 500 FC / place", font=font(28, True), fill=VIOLET)
        btn(d, (56, y + 280, 300, y + 360), "Détails", fill=WHITE, fg=VIOLET)
        cx, cy = btn(d, (330, y + 280, w - 56, y + 360), "Réserver", fill=VIOLET, highlight=True)
        bottom_nav(d, w, h)
        return pointer(im, (cx, cy))
    rr(d, (120, 520, w - 120, 1180), 24, fill=WHITE, outline=BORDER, width=2)
    d.ellipse((w // 2 - 70, 580, w // 2 + 70, 720), fill=GREEN_SOFT)
    d.text((w // 2 - 40, 620), "OK", font=font(44, True), fill=GREEN)
    d.text((200, 760), "Réservation confirmée", font=font(32, True), fill=TEXT)
    d.text((180, 830), "Vous partagez ce trajet.", font=font(24), fill=TEXT_SEC)
    cx, cy = btn(d, (180, 980, w - 180, 1080), "Retour à l'accueil", fill=VIOLET, highlight=True)
    bottom_nav(d, w, h)
    return pointer(im, (cx, cy))


def pass_rental(stage: str):
    from PIL import Image, ImageDraw

    w, h = MOBILE
    im = Image.new("RGB", MOBILE, CLOUD)
    d = ImageDraw.Draw(im)
    status_bar(d, w)
    y = mobile_header(d, w, "Location véhicule" if stage != "mine" else "Ma location")
    if stage == "search":
        y = tabs(d, w, y + 8, ["Rechercher", "Mes locations"], 0)
        field(d, (30, y + 20, 510, y + 108), "Prise en charge", "16/08/2026")
        field(d, (540, y + 20, w - 30, y + 108), "Retour", "18/08/2026")
        y += 180
        field(d, (30, y, w - 30, y + 88), "Ville", "Gombe")
        y += 140
        d.text((40, y), "Catégorie", font=font(22, True), fill=TEXT_SEC)
        y += 40
        x = 30
        for name, sel in (("Toutes", False), ("Citadine", False), ("SUV", True), ("Utilitaire", False)):
            box = (x, y, x + 240, y + 72)
            rr(d, box, 14, fill=VIOLET_SOFT if sel else WHITE, outline=VIOLET if sel else BORDER, width=3)
            d.text((x + 20, y + 20), name, font=font(22, True), fill=VIOLET if sel else TEXT)
            x += 256
        y += 110
        cx, cy = btn(d, (30, y, w - 30, y + 92), "Rechercher", fill=INDIGO, highlight=True)
        bottom_nav(d, w, h)
        return pointer(im, (cx, cy), INDIGO)
    if stage == "detail":
        d.text((40, y + 16), "Détail véhicule", font=font(28, True), fill=TEXT)
        rr(d, (30, y + 70, w - 30, y + 360), 18, fill=VIOLET_SOFT)
        d.text((56, y + 110), "Toyota RAV4 2021", font=font(32, True), fill=TEXT)
        d.text((56, y + 170), "Gombe  ·  SUV  ·  Automatique", font=font(22), fill=TEXT_SEC)
        d.text((56, y + 230), "85 000 FC / jour", font=font(30, True), fill=INDIGO)
        y = y + 400
        d.text((40, y), "Configurer la location", font=font(26, True), fill=TEXT)
        y += 50
        rr(d, (30, y, w - 30, y + 220), 18, fill=WHITE, outline=BORDER, width=2)
        d.text((50, y + 24), "Aperçu du devis", font=font(22), fill=TEXT_SEC)
        d.text((50, y + 70), "Sous-total  255 000 FC", font=font(24), fill=TEXT)
        d.text((50, y + 120), "Caution (restituée)  100 000 FC", font=font(22), fill=TEXT_SEC)
        d.text((50, y + 164), "Total estimé  355 000 FC", font=font(26, True), fill=INDIGO)
        y += 250
        cx, cy = btn(d, (30, y, w - 30, y + 92), "Réserver maintenant", fill=INDIGO, highlight=True)
        bottom_nav(d, w, h)
        return pointer(im, (cx, cy), INDIGO)
    y = tabs(d, w, y + 8, ["Rechercher", "Mes locations"], 1)
    rr(d, (30, y + 20, w - 30, y + 320), 18, fill=WHITE, outline=BORDER, width=2)
    rr(d, (50, y + 50, 280, y + 100), 12, fill=GREEN_SOFT)
    d.text((70, y + 62), "Confirmé", font=font(22, True), fill=GREEN)
    d.text((50, y + 130), "Toyota RAV4  ·  16–18 août", font=font(28, True), fill=TEXT)
    d.text((50, y + 190), "Gombe  ·  255 000 FC", font=font(22), fill=TEXT_SEC)
    bottom_nav(d, w, h)
    return im


def pass_moving(stage: str):
    from PIL import Image, ImageDraw

    w, h = MOBILE
    im = Image.new("RGB", MOBILE, CLOUD)
    d = ImageDraw.Draw(im)
    status_bar(d, w)
    y = mobile_header(d, w, "Déménagement")
    y = tabs(d, w, y + 8, ["Nouvelle demande", "Mes demandes"], 1 if stage == "list" else 0)
    if stage == "list":
        d.text((40, y + 16), "Mes demandes", font=font(28, True), fill=TEXT)
        rr(d, (30, y + 70, w - 30, y + 340), 18, fill=WHITE, outline=BORDER, width=2)
        rr(d, (50, y + 100, 280, y + 150), 12, fill=ORANGE_SOFT)
        d.text((70, y + 112), "En attente", font=font(22, True), fill=ORANGE)
        d.text((50, y + 180), "Gombe → Limete", font=font(28, True), fill=TEXT)
        d.text((50, y + 240), "Appartement  ·  Camion ~15 m³", font=font(22), fill=TEXT_SEC)
        bottom_nav(d, w, h)
        return im
    d.text((40, y + 8), "Indiquez le volume, le trajet et le type d'engin.", font=font(20), fill=TEXT_SEC)
    y += 60
    field(d, (30, y, w - 30, y + 80), "Adresse de départ", "Gombe" if stage != "form" else "Gombe", "Adresse de départ")
    y += 150
    field(d, (30, y, w - 30, y + 80), "Adresse d'arrivée", "Limete", "Adresse d'arrivée")
    y += 140
    d.text((40, y), "Type de logement", font=font(22, True), fill=TEXT_SEC)
    y += 40
    rr(d, (30, y, 520, y + 72), 14, fill=VIOLET_SOFT, outline=VIOLET, width=3)
    d.text((50, y + 20), "Appartement", font=font(22, True), fill=VIOLET)
    y += 100
    d.text((40, y), "Type d'engin", font=font(22, True), fill=TEXT_SEC)
    y += 40
    rr(d, (30, y, 620, y + 72), 14, fill=VIOLET_SOFT, outline=VIOLET, width=3)
    d.text((50, y + 20), "Camion ~15 m³  ·  Recommandé", font=font(22, True), fill=VIOLET)
    y += 110
    if stage == "quote":
        rr(d, (30, y, w - 30, y + 150), 18, fill=WHITE, outline=BORDER, width=2)
        d.text((50, y + 20), "Volume estimé : 14 m³", font=font(22), fill=TEXT_SEC)
        d.text((50, y + 64), "85 000 FC", font=font(40, True), fill=GREEN)
        y += 180
        cx, cy = btn(d, (30, y, w - 30, y + 92), "Demander un devis", fill=GREEN, highlight=True)
    else:
        cx, cy = btn(d, (30, y, w - 30, y + 92), "Estimer le déménagement", fill=VIOLET, highlight=True)
    bottom_nav(d, w, h)
    return pointer(im, (cx, cy))


def pass_wallet(stage: str):
    from PIL import Image, ImageDraw

    w, h = MOBILE
    im = Image.new("RGB", MOBILE, CLOUD)
    d = ImageDraw.Draw(im)
    status_bar(d, w)
    y = mobile_header(d, w, "Portefeuille")
    if stage == "home":
        rr(d, (30, y + 24, w - 30, y + 280), 22, fill=MIDNIGHT_SOFT)
        d.text((56, y + 56), "Solde disponible", font=font(24), fill=(180, 186, 200))
        d.text((56, y + 110), "42 500 FC", font=font(52, True), fill=WHITE)
        cx, cy = btn(d, (56, y + 190, w - 56, y + 250), "Retirer vers Mobile Money", fill=GREEN)
        y += 320
        d.text((40, y), "Recharger avec", font=font(28, True), fill=TEXT)
        y += 50
        for i, (name, col) in enumerate((("Orange Money", ORANGE), ("M-Pesa (Vodacom)", GREEN), ("Airtel Money", (220, 38, 38)))):
            yy = y + i * 130
            rr(d, (30, yy, w - 30, yy + 110), 16, fill=WHITE, outline=ORANGE if i == 0 else BORDER, width=3 if i == 0 else 2)
            d.ellipse((56, yy + 24, 120, yy + 88), fill=col)
            d.text((150, yy + 36), name, font=font(26, True), fill=TEXT)
        bottom_nav(d, w, h, "Wallet")
        return pointer(im, (w // 2, y + 55), ORANGE)
    if stage == "topup":
        d.text((40, y + 24), "Recharger via Orange Money", font=font(30, True), fill=TEXT)
        y += 100
        field(d, (30, y, w - 30, y + 88), "Montant (FC)", "10 000")
        y += 160
        field(d, (30, y, w - 30, y + 88), "Numéro mobile money", "081 000 0000")
        y += 160
        cx, cy = btn(d, (30, y, w - 30, y + 92), "Confirmer la recharge", fill=ORANGE, highlight=True)
        bottom_nav(d, w, h, "Wallet")
        return pointer(im, (cx, cy), ORANGE)
    d.text((40, y + 16), "Historique", font=font(28, True), fill=TEXT)
    x = 30
    for name, sel in (("Tout (3)", True), ("Recharges (2)", False), ("Retraits (1)", False)):
        box = (x, y + 70, x + 320, y + 140)
        rr(d, box, 14, fill=VIOLET_SOFT if sel else WHITE, outline=VIOLET if sel else BORDER, width=2)
        d.text((x + 20, y + 90), name, font=font(22, True), fill=VIOLET if sel else TEXT)
        x += 340
    rows = (("Recharge", "+ 10 000 FC", GREEN), ("Recharge", "+ 20 000 FC", GREEN), ("Retrait", "− 5 000 FC", ORANGE))
    yy = y + 180
    for lab, amt, col in rows:
        rr(d, (30, yy, w - 30, yy + 120), 16, fill=WHITE, outline=BORDER, width=2)
        d.text((56, yy + 24), lab, font=font(24, True), fill=TEXT)
        d.text((56, yy + 68), "Orange Money  ·  aujourd'hui", font=font(20), fill=TEXT_SEC)
        d.text((w - 320, yy + 40), amt, font=font(26, True), fill=col)
        yy += 140
    bottom_nav(d, w, h, "Wallet")
    return im


# --- Driver feature screens ------------------------------------------------

def drv_menu(open_carpool=False):
    from PIL import Image, ImageDraw

    im = drv_home(True)
    w, h = MOBILE
    layer = im.convert("RGBA")
    from PIL import Image as _I

    overlay = _I.new("RGBA", (w, h), (0, 0, 0, 90))
    layer = _I.alpha_composite(layer, overlay)
    d = ImageDraw.Draw(layer)
    rr(d, (420, 140, w - 30, 820), 18, fill=WHITE + (255,))
    items = ["Revenus", "Historique", "Covoiturage", "Mon dossier", "Aide", "Signaler un incident", "Déconnexion"]
    y = 170
    for name in items:
        col = VIOLET if name == "Covoiturage" and open_carpool else TEXT
        d.text((460, y), name, font=font(26, name == "Covoiturage"), fill=col)
        if name == "Covoiturage" and open_carpool:
            rr(d, (440, y - 10, w - 50, y + 50), 10, outline=ORANGE + (255,), width=4)
        y += 80
    return layer.convert("RGB")


def drv_dash(section: str):
    from PIL import Image, ImageDraw

    w, h = MOBILE
    im = Image.new("RGB", MOBILE, CLOUD)
    d = ImageDraw.Draw(im)
    status_bar(d, w)
    y = mobile_header(d, w, "SENGA Driver")
    stylized_map(d, (30, y + 16, w - 30, y + 280), route=False, pins=False)
    y += 300
    rr(d, (30, y, w - 30, y + 160), 18, fill=WHITE, outline=BORDER, width=2)
    d.text((56, y + 20), "Disponibilité", font=font(22), fill=TEXT_SEC)
    d.text((56, y + 60), "En ligne", font=font(34, True), fill=GREEN)
    d.text((56, y + 110), "En ligne — courses et livraisons près de votre position GPS.", font=font(18), fill=TEXT_SEC)
    y += 180
    rr(d, (30, y, w - 30, y + 150), 18, fill=WHITE, outline=BORDER, width=2)
    d.text((56, y + 20), "Revenus du jour", font=font(22), fill=TEXT_SEC)
    d.text((56, y + 58), "18 400 FC", font=font(36, True), fill=GREEN)
    d.text((56, y + 108), "Solde retrait : 62 000 FC   ·   3 courses · 1 livraisons", font=font(18), fill=TEXT_SEC)
    if section == "earnings":
        rr(d, (24, y - 6, w - 24, y + 156), 22, outline=ORANGE, width=6)
    y += 170
    if section in ("slots", "assigned-sched", "assigned-rent", "assigned-move", "deliveries"):
        title = {
            "slots": "Créneaux planifiés",
            "assigned-sched": "Missions assignées",
            "assigned-rent": "Missions assignées",
            "assigned-move": "Missions assignées",
            "deliveries": "Livraisons disponibles (1)",
        }[section]
        d.text((40, y), title, font=font(26, True), fill=TEXT)
        if section == "slots":
            d.text((40, y + 40), "Candidature volontaire — SENGA assigne avant le départ.", font=font(18), fill=TEXT_SEC)
            rr(d, (30, y + 80, w - 30, y + 260), 16, fill=WHITE, outline=ORANGE, width=4)
            d.text((56, y + 100), "Gombe → Aéroport  ·  16/08 07:30", font=font(24, True), fill=TEXT)
            d.text((56, y + 150), "Moto-taxi  ·  Gain net ~5 400 FC", font=font(22), fill=TEXT_SEC)
            d.text((56, y + 200), "Appuyer pour gérer la mission", font=font(20), fill=VIOLET)
        elif section == "deliveries":
            rr(d, (30, y + 50, w - 30, y + 230), 16, fill=WHITE, outline=ORANGE, width=4)
            d.text((56, y + 70), "Colis  ·  4 800 FC", font=font(26, True), fill=TEXT)
            d.text((56, y + 120), "Gombe → Limete", font=font(22), fill=TEXT_SEC)
            d.text((56, y + 170), "Nouvelle livraison", font=font(20), fill=GREEN)
        else:
            kind = {"assigned-sched": "Course planifiée", "assigned-rent": "Location véhicule", "assigned-move": "Déménagement"}[section]
            rr(d, (30, y + 50, w - 30, y + 240), 16, fill=WHITE, outline=ORANGE, width=4)
            d.text((56, y + 70), kind, font=font(26, True), fill=TEXT)
            d.text((56, y + 120), "Gombe → Limete", font=font(22), fill=TEXT_SEC)
            d.text((56, y + 170), "Appuyer pour gérer la mission", font=font(20), fill=VIOLET)
    return im


def drv_delivery_offer():
    from PIL import Image, ImageDraw

    w, h = MOBILE
    im = Image.new("RGB", MOBILE, MIDNIGHT)
    d = ImageDraw.Draw(im)
    status_bar(d, w)
    d.text((40, 90), "Nouvelle livraison", font=font(40, True), fill=WHITE)
    d.text((40, 150), "Colis  ·  4 800 FC  ·  5,1 km", font=font(24), fill=(190, 196, 210))
    rr(d, (40, 230, w - 40, 560), 20, fill=(20, 24, 40))
    d.ellipse((70, 280, 110, 320), fill=GREEN)
    d.text((130, 278), "Gombe — Boulevard du 30 Juin", font=font(26, True), fill=WHITE)
    d.line((88, 324, 88, 420), fill=(80, 86, 110), width=4)
    d.ellipse((70, 430, 110, 470), fill=VIOLET)
    d.text((130, 428), "Limete — Marché de la Liberté", font=font(26), fill=(210, 214, 224))
    cx, cy = btn(d, (40, 1500, w - 40, 1600), "Accepter la livraison", fill=GREEN, highlight=True)
    btn(d, (40, 1630, w - 40, 1720), "Refuser", fill=(51, 65, 85))
    return pointer(im, (cx, cy), GREEN)


def drv_delivery_active(done=False):
    from PIL import Image, ImageDraw

    w, h = MOBILE
    im = Image.new("RGB", MOBILE, CLOUD)
    d = ImageDraw.Draw(im)
    status_bar(d, w)
    y = mobile_header(d, w, "Livraison active")
    stylized_map(d, (30, y + 16, w - 30, y + 560))
    y += 600
    if done:
        rr(d, (30, y, w - 30, y + 160), 16, fill=GREEN_SOFT)
        d.text((50, y + 50), "Livraison terminée", font=font(28, True), fill=(6, 95, 70))
        return im
    d.text((40, y), "Colis pris en charge", font=font(24), fill=TEXT_SEC)
    cx, cy = btn(d, (30, y + 50, w - 30, y + 140), "Navigation — client", fill=VIOLET, highlight=True)
    btn(d, (30, y + 170, w - 30, y + 260), "Navigation — prendre colis", fill=GREEN)
    return pointer(im, (cx, cy))


def drv_scheduled(stage: str):
    from PIL import Image, ImageDraw

    w, h = MOBILE
    im = Image.new("RGB", MOBILE, CLOUD)
    d = ImageDraw.Draw(im)
    status_bar(d, w)
    y = mobile_header(d, w, "Mission planifiée")
    d.text((40, y + 16), "Gombe → Aéroport", font=font(30, True), fill=TEXT)
    d.text((40, y + 70), "16/08/2026 à 07:30  ·  Moto-taxi", font=font(22), fill=TEXT_SEC)
    status = {
        "offer": ("Planifiée — en attente", VIOLET_SOFT, VIOLET),
        "applied": ("Candidature enregistrée pour ce créneau", GREEN_SOFT, GREEN),
        "assigned": ("Confirmée — prêt à démarrer", GREEN_SOFT, GREEN),
    }[stage]
    rr(d, (30, y + 120, w - 30, y + 210), 14, fill=status[1])
    d.text((50, y + 148), status[0], font=font(24, True), fill=status[2])
    y += 240
    if stage == "offer":
        cx, cy = btn(d, (30, y, w - 30, y + 92), "Me porter volontaire", fill=VIOLET, highlight=True)
        return pointer(im, (cx, cy))
    if stage == "applied":
        rr(d, (30, y, w - 30, y + 180), 16, fill=GREEN_SOFT)
        d.text((50, y + 40), "Candidature enregistrée — SENGA", font=font(24, True), fill=(6, 95, 70))
        d.text((50, y + 90), "vous notifiera si vous êtes assigné.", font=font(24), fill=(6, 95, 70))
        return im
    cx, cy = btn(d, (30, y, w - 30, y + 92), "Démarrer la course", fill=GREEN, highlight=True)
    btn(d, (30, y + 120, w - 30, y + 210), "Itinéraire départ", fill=VIOLET)
    return pointer(im, (cx, cy), GREEN)


def drv_carpool_publish(stage: str):
    from PIL import Image, ImageDraw

    w, h = MOBILE
    im = Image.new("RGB", MOBILE, CLOUD)
    d = ImageDraw.Draw(im)
    status_bar(d, w)
    y = mobile_header(d, w, "Publier covoiturage")
    y = tabs(d, w, y + 8, ["Publier", "Mes trajets"], 1 if stage == "mine" else 0)
    if stage == "mine":
        d.text((40, y + 16), "En tant que conducteur", font=font(26, True), fill=TEXT)
        rr(d, (30, y + 70, w - 30, y + 300), 18, fill=WHITE, outline=BORDER, width=2)
        d.text((56, y + 100), "Gombe → Limete", font=font(28, True), fill=TEXT)
        d.text((56, y + 160), "16/08 07:30  ·  3 places  ·  2 500 FC", font=font(22), fill=TEXT_SEC)
        rr(d, (56, y + 210, 280, y + 260), 12, fill=GREEN_SOFT)
        d.text((76, y + 222), "Publié", font=font(20, True), fill=GREEN)
        return im
    field(d, (30, y + 20, w - 30, y + 108), "Ville de départ", "Gombe, Kinshasa")
    y += 180
    field(d, (30, y, w - 30, y + 88), "Destination", "Limete, Kinshasa")
    y += 150
    field(d, (30, y, 500, y + 88), "Places disponibles (1-6)", "3")
    field(d, (530, y, w - 30, y + 88), "Prix par place (CDF)", "2500" if stage == "ready" else "")
    y += 150
    label = "Publier le trajet" if stage == "ready" else "Estimer le prix"
    col = GREEN if stage == "ready" else VIOLET
    cx, cy = btn(d, (30, y, w - 30, y + 92), label, fill=col, highlight=True)
    return pointer(im, (cx, cy), col)


def drv_rental_mission(stage: str):
    from PIL import Image, ImageDraw

    w, h = MOBILE
    im = Image.new("RGB", MOBILE, CLOUD)
    d = ImageDraw.Draw(im)
    status_bar(d, w)
    y = mobile_header(d, w, "Mission location")
    d.text((40, y + 16), "Toyota RAV4  ·  Gombe", font=font(28, True), fill=TEXT)
    d.text((40, y + 70), "Rémunération logistique SENGA  ·  12 000 FC", font=font(22), fill=TEXT_SEC)
    labels = {
        "ready": ("Confirmée — prêt pour la remise", "Remise effectuée → En cours", INDIGO),
        "ongoing": ("Location en cours", "Véhicule rendu", GREEN),
        "done": ("Terminée", "Véhicule rendu", GREEN),
    }
    st, action, col = labels[stage]
    rr(d, (30, y + 120, w - 30, y + 210), 14, fill=GREEN_SOFT if stage != "ready" else VIOLET_SOFT)
    d.text((50, y + 148), st, font=font(24, True), fill=col)
    y += 240
    d.text((40, y), "Réservation confirmée", font=font(22), fill=TEXT_SEC)
    d.text((40, y + 50), "Véhicule remis — location en cours" if stage != "ready" else "En attente de remise", font=font(22), fill=TEXT)
    if stage == "done":
        d.text((40, y + 100), "Véhicule rendu", font=font(22, True), fill=GREEN)
        return im
    if stage == "ready":
        btn(d, (30, y + 160, w - 30, y + 250), "Navigation vers le lieu", fill=VIOLET)
        cx, cy = btn(d, (30, y + 280, w - 30, y + 370), action, fill=INDIGO, highlight=True)
        return pointer(im, (cx, cy), INDIGO)
    cx, cy = btn(d, (30, y + 160, w - 30, y + 250), action, fill=GREEN, highlight=True)
    return pointer(im, (cx, cy), GREEN)


def drv_moving_mission(stage: str):
    from PIL import Image, ImageDraw

    w, h = MOBILE
    im = Image.new("RGB", MOBILE, CLOUD)
    d = ImageDraw.Draw(im)
    status_bar(d, w)
    y = mobile_header(d, w, "Mission déménagement")
    d.text((40, y + 16), "Gombe → Limete", font=font(30, True), fill=TEXT)
    d.text((40, y + 70), "Appartement  ·  Camion ~15 m³", font=font(22), fill=TEXT_SEC)
    labels = {
        "ready": ("Assigné — prêt à démarrer", "Démarrer le déménagement", VIOLET),
        "ongoing": ("Déménagement en cours", "Terminer le déménagement", ORANGE),
        "done": ("Terminé", "Déménagement terminé", GREEN),
    }
    st, action, col = labels[stage]
    rr(d, (30, y + 120, w - 30, y + 210), 14, fill=GREEN_SOFT if stage == "done" else VIOLET_SOFT)
    d.text((50, y + 148), st, font=font(24, True), fill=col)
    y += 240
    d.text((40, y), "Demande enregistrée  →  Équipe assignée", font=font(22), fill=TEXT_SEC)
    if stage == "done":
        rr(d, (30, y + 60, w - 30, y + 200), 16, fill=GREEN_SOFT)
        d.text((50, y + 110), "Déménagement terminé", font=font(28, True), fill=(6, 95, 70))
        return im
    extra = "Itinéraire départ" if stage == "ready" else "Itinéraire arrivée"
    cx, cy = btn(d, (30, y + 70, w - 30, y + 160), action, fill=col, highlight=True)
    btn(d, (30, y + 190, w - 30, y + 280), extra, fill=SLATE)
    return pointer(im, (cx, cy), col)


def drv_earnings(stage: str):
    from PIL import Image, ImageDraw

    w, h = MOBILE
    im = Image.new("RGB", MOBILE, CLOUD)
    d = ImageDraw.Draw(im)
    status_bar(d, w)
    y = mobile_header(d, w, "Revenus")
    rr(d, (30, y + 20, w - 30, y + 260), 22, fill=MIDNIGHT_SOFT)
    d.text((56, y + 48), "Solde disponible", font=font(22), fill=(180, 186, 200))
    d.text((56, y + 96), "62 000 FC", font=font(48, True), fill=WHITE)
    d.text((56, y + 180), "Gains aujourd'hui  18 400 FC   ·   Missions  4", font=font(20), fill=(190, 196, 210))
    y += 300
    if stage == "withdraw":
        d.text((40, y), "Retrait Mobile Money", font=font(28, True), fill=TEXT)
        y += 60
        field(d, (30, y, w - 30, y + 88), "Montant retrait (FC)", "20 000")
        y += 150
        cx, cy = btn(d, (30, y, w - 30, y + 92), "Retirer vers Mobile Money", fill=GREEN, highlight=True)
        return pointer(im, (cx, cy), GREEN)
    if stage == "history":
        d.text((40, y), "Historique recharges & retraits", font=font(26, True), fill=TEXT)
        yy = y + 60
        for lab, amt, col in (("Retrait", "− 20 000 FC", ORANGE), ("Recharge", "+ 10 000 FC", GREEN)):
            rr(d, (30, yy, w - 30, yy + 110), 16, fill=WHITE, outline=BORDER, width=2)
            d.text((56, yy + 24), lab, font=font(24, True), fill=TEXT)
            d.text((w - 340, yy + 36), amt, font=font(26, True), fill=col)
            yy += 130
        return im
    d.text((40, y), "Vue d'ensemble", font=font(26, True), fill=TEXT)
    for i, (lab, val) in enumerate((("Aujourd'hui", "18 400"), ("Semaine", "96 000"), ("Mois", "412 000"), ("Total", "1,2 M"))):
        x = 30 + (i % 2) * 520
        yy = y + 60 + (i // 2) * 160
        rr(d, (x, yy, x + 490, yy + 140), 16, fill=WHITE, outline=BORDER, width=2)
        d.text((x + 24, yy + 24), lab, font=font(20), fill=TEXT_SEC)
        d.text((x + 24, yy + 64), f"{val} FC", font=font(28, True), fill=TEXT)
    return im


def build_shorts() -> list[dict]:
    SHORTS.mkdir(parents=True, exist_ok=True)
    ic_p = load_icon(ICON_PASS if ICON_PASS.exists() else ICON_BRAND, 280)
    ic_d = load_icon(ICON_DRV if ICON_DRV.exists() else ICON_BRAND, 280)
    rows: list[dict] = []

    def add(slug, shots, accent=VIOLET):
        rows.append(assemble(slug, MOBILE, shots, accent, out_dir=SHORTS))

    add(
        "senga-passager-taxi",
        [
            Shot("home", 6, "Commander un taxi", "Sur SENGA, ouvrez Taxi / Moto-taxi.", pass_home(True, 0)),
            Shot("dest", 8, "Indiquez la destination", "Tapez votre destination, par exemple Gombe.", pass_booking("")),
            Shot("ok", 10, "Prix en francs congolais", "Choisissez le véhicule. SENGA affiche le prix, puis confirmez.", pass_confirm_shot()),
            Shot("track", 10, "Suivez le chauffeur", "Vous suivez le chauffeur en direct jusqu’à l’arrivée.", pass_tracking()),
            Shot("end", 6, "Téléchargez Senga", "Senga. La mobilité, simplement.", end_card(MOBILE, ic_p, "Senga", "Téléchargez Senga", "Taxi / Moto-taxi — Kinshasa et la RDC", VIOLET)),
        ],
    )
    add(
        "senga-passager-livraisons",
        [
            Shot("home", 6, "Livraisons SENGA", "Sur SENGA, ouvrez Livraisons.", pass_home(True, 1)),
            Shot("hub", 8, "Choisissez le type", "Repas, colis, express ou courses. Ici, un colis.", pass_delivery_hub()),
            Shot("form", 10, "Enlèvement et livraison", "Indiquez l’enlèvement et la livraison. SENGA estime le prix.", pass_parcel(True)),
            Shot("ok", 8, "Confirmer l'envoi", "Confirmez. Un livreur SENGA prend le colis.", pass_parcel(True, True)),
            Shot("end", 6, "Téléchargez Senga", "Senga. Livrez partout en RDC.", end_card(MOBILE, ic_p, "Senga", "Téléchargez Senga", "Livraisons — repas, colis, express", GREEN)),
        ],
        GREEN,
    )
    add(
        "senga-passager-reservation",
        [
            Shot("home", 6, "Réserver à l'avance", "Programmez un trajet à l’avance.", pass_home(True, 2)),
            Shot("form", 10, "Date, heure, destination", "Choisissez la date, l’heure et la destination.", pass_scheduled(True)),
            Shot("ok", 8, "Confirmer la réservation", "SENGA affiche le tarif. Confirmez.", pass_scheduled(True, True)),
            Shot("list", 8, "Réservation confirmée", "Elle apparaît dans Mes réservations. SENGA assigne un chauffeur avant l’heure.", pass_scheduled(listed=True)),
            Shot("end", 6, "Téléchargez Senga", "Senga. Réservez, puis partez.", end_card(MOBILE, ic_p, "Senga", "Téléchargez Senga", "Réservation planifiée — jusqu’à J+7", VIOLET_LIGHT)),
        ],
        VIOLET_LIGHT,
    )
    add(
        "senga-passager-covoiturage",
        [
            Shot("home", 6, "Covoiturage", "Sur SENGA, ouvrez Covoiturage.", pass_home(True, 3)),
            Shot("search", 8, "Rechercher un trajet", "Indiquez départ et destination, puis Rechercher.", pass_carpool("search")),
            Shot("hit", 10, "Réserver une place", "Un trajet correspond. Ouvrez Détails, puis Réserver.", pass_carpool("results")),
            Shot("ok", 8, "Réservation confirmée", "C’est confirmé. Vous partagez le trajet.", pass_carpool("ok")),
            Shot("end", 6, "Téléchargez Senga", "Senga. Partagez un trajet, économisez.", end_card(MOBILE, ic_p, "Senga", "Téléchargez Senga", "Covoiturage — trajets partagés", VIOLET)),
        ],
    )
    add(
        "senga-passager-location",
        [
            Shot("home", 6, "Location véhicule", "Sur SENGA, ouvrez Location véhicule.", pass_home(True, 4)),
            Shot("search", 8, "Rechercher un véhicule", "Choisissez les dates et la ville, puis Rechercher.", pass_rental("search")),
            Shot("car", 10, "Réserver maintenant", "Ouvrez le véhicule, voyez le devis, puis réservez.", pass_rental("detail")),
            Shot("mine", 8, "Ma location", "La location est dans Mes locations.", pass_rental("mine")),
            Shot("end", 6, "Téléchargez Senga", "Senga. Louez une voiture à Kinshasa.", end_card(MOBILE, ic_p, "Senga", "Téléchargez Senga", "Location véhicule — SUV, citadine, utilitaire", INDIGO)),
        ],
        INDIGO,
    )
    add(
        "senga-passager-demenagement",
        [
            Shot("home", 6, "Déménagement", "Sur SENGA, ouvrez Déménagement.", pass_home(True, 5)),
            Shot("form", 10, "Volume et trajet", "Indiquez le trajet, le logement et le camion.", pass_moving("form")),
            Shot("quote", 8, "Demander un devis", "SENGA estime le prix. Demandez un devis.", pass_moving("quote")),
            Shot("list", 8, "Mes demandes", "La demande apparaît dans Mes demandes.", pass_moving("list")),
            Shot("end", 6, "Téléchargez Senga", "Senga. Camion et manutention, simplement.", end_card(MOBILE, ic_p, "Senga", "Téléchargez Senga", "Déménagement — volume et camion", SLATE)),
        ],
        SLATE,
    )
    add(
        "senga-passager-wallet",
        [
            Shot("home", 6, "Wallet SENGA", "Ouvrez Wallet SENGA.", pass_home(True, 6)),
            Shot("bal", 8, "Solde disponible", "Voici votre solde. Rechargez avec Mobile Money.", pass_wallet("home")),
            Shot("pay", 10, "Confirmer la recharge", "Entrez le montant, puis confirmez la recharge.", pass_wallet("topup")),
            Shot("hist", 6, "Historique", "Chaque opération apparaît dans l’historique.", pass_wallet("hist")),
            Shot("end", 6, "Téléchargez Senga", "Senga. Payez vos courses depuis le portefeuille.", end_card(MOBILE, ic_p, "Senga", "Téléchargez Senga", "Portefeuille — solde, recharge, paiements", VIOLET)),
        ],
    )
    add(
        "senga-driver-taxi",
        [
            Shot("on", 6, "Passez En ligne", "Activez En ligne pour recevoir les courses.", drv_home(True)),
            Shot("offer", 10, "Nouvelle course", "Une course arrive. Appuyez sur Accepter la course.", drv_offer()),
            Shot("arrive", 8, "Je suis arrivé", "Naviguez jusqu’au passager, puis indiquez Je suis arrivé.", drv_active("arrive")),
            Shot("endride", 10, "Terminer la course", "Démarrez, puis terminez. Votre revenu s’affiche.", drv_active("finish")),
            Shot("end", 6, "SENGA Driver", "SENGA Driver. En ligne, vous travaillez.", end_card(MOBILE, ic_d, "SENGA Driver", "Téléchargez SENGA Driver", "Courses taxi et moto — Kinshasa", GREEN)),
        ],
        GREEN,
    )
    add(
        "senga-driver-livraisons",
        [
            Shot("home", 6, "Livraisons près de vous", "En ligne, les livraisons arrivent près de vous.", drv_dash("deliveries")),
            Shot("offer", 10, "Nouvelle livraison", "Une livraison colis arrive. Acceptez.", drv_delivery_offer()),
            Shot("go", 10, "Livraison active", "Prenez le colis, puis allez chez le client.", drv_delivery_active()),
            Shot("ok", 8, "Livraison terminée", "Marquez comme livré. Le revenu s’ajoute.", drv_delivery_active(True)),
            Shot("end", 6, "SENGA Driver", "SENGA Driver. Courses et livraisons.", end_card(MOBILE, ic_d, "SENGA Driver", "Téléchargez SENGA Driver", "Livraisons — colis, repas, express", GREEN)),
        ],
        GREEN,
    )
    add(
        "senga-driver-reservation",
        [
            Shot("home", 6, "Créneaux planifiés", "Les trajets planifiés apparaissent ici.", drv_dash("slots")),
            Shot("vol", 10, "Me porter volontaire", "Ouvrez la mission. Portez-vous volontaire.", drv_scheduled("offer")),
            Shot("ok", 8, "Candidature enregistrée", "SENGA vous notifie si vous êtes assigné.", drv_scheduled("applied")),
            Shot("go", 8, "Mission assignée", "Une fois assigné, démarrez la course à l’heure.", drv_scheduled("assigned")),
            Shot("end", 6, "SENGA Driver", "SENGA Driver. Missions planifiées, à l’heure.", end_card(MOBILE, ic_d, "SENGA Driver", "Téléchargez SENGA Driver", "Créneaux planifiés — Mission planifiée", VIOLET)),
        ],
        VIOLET,
    )
    add(
        "senga-driver-covoiturage",
        [
            Shot("menu", 6, "Menu Covoiturage", "Dans le menu, ouvrez Covoiturage.", drv_menu(True)),
            Shot("form", 10, "Publier un trajet", "Indiquez le trajet, les places et le prix.", drv_carpool_publish("form")),
            Shot("pub", 8, "Publier le trajet", "Estimez, puis publiez le trajet.", drv_carpool_publish("ready")),
            Shot("mine", 8, "Mes trajets", "Il apparaît dans Mes trajets.", drv_carpool_publish("mine")),
            Shot("end", 6, "SENGA Driver", "SENGA Driver. Publiez, les passagers réservent.", end_card(MOBILE, ic_d, "SENGA Driver", "Téléchargez SENGA Driver", "Covoiturage — publier un trajet", VIOLET)),
        ],
        VIOLET,
    )
    add(
        "senga-driver-location",
        [
            Shot("home", 6, "Mission location", "SENGA vous assigne une mission location.", drv_dash("assigned-rent")),
            Shot("go", 10, "Remise du véhicule", "Allez au lieu, puis indiquez Remise effectuée.", drv_rental_mission("ready")),
            Shot("run", 8, "Location en cours", "La location est en cours. Votre rémunération s’affiche.", drv_rental_mission("ongoing")),
            Shot("ok", 8, "Véhicule rendu", "À la fin, indiquez Véhicule rendu.", drv_rental_mission("done")),
            Shot("end", 6, "SENGA Driver", "SENGA Driver. Missions véhicules.", end_card(MOBILE, ic_d, "SENGA Driver", "Téléchargez SENGA Driver", "Mission location — logistique SENGA", INDIGO)),
        ],
        INDIGO,
    )
    add(
        "senga-driver-demenagement",
        [
            Shot("home", 6, "Mission déménagement", "SENGA vous assigne un déménagement.", drv_dash("assigned-move")),
            Shot("go", 10, "Démarrer le déménagement", "Ouvrez la mission, puis démarrez.", drv_moving_mission("ready")),
            Shot("run", 8, "Déménagement en cours", "Suivez l’itinéraire jusqu’à l’arrivée.", drv_moving_mission("ongoing")),
            Shot("ok", 8, "Terminer le déménagement", "À l’arrivée, terminez. Le revenu s’ajoute.", drv_moving_mission("done")),
            Shot("end", 6, "SENGA Driver", "SENGA Driver. Missions déménagement.", end_card(MOBILE, ic_d, "SENGA Driver", "Téléchargez SENGA Driver", "Mission déménagement", SLATE)),
        ],
        SLATE,
    )
    add(
        "senga-driver-revenus",
        [
            Shot("home", 6, "Revenus du jour", "Vos gains du jour sont sur l’accueil.", drv_dash("earnings")),
            Shot("bal", 10, "Solde disponible", "Voici le solde et les gains du jour.", drv_earnings("home")),
            Shot("out", 8, "Retrait Mobile Money", "Retirez vers Mobile Money.", drv_earnings("withdraw")),
            Shot("hist", 6, "Historique", "Chaque retrait apparaît dans l’historique.", drv_earnings("history")),
            Shot("end", 6, "SENGA Driver", "SENGA Driver. Vos revenus, clairement.", end_card(MOBILE, ic_d, "SENGA Driver", "Téléchargez SENGA Driver", "Revenus — solde et retrait Mobile Money", GREEN)),
        ],
        GREEN,
    )
    return rows


def write_readme(short_rows: list[dict], voice_note: str) -> None:
    long_names = [
        "senga-passager-mobile.mp4",
        "senga-chauffeur.mp4",
        "senga-passager-web.mp4",
        "senga-restaurant.mp4",
        "senga-location.mp4",
        "senga-admin.mp4",
    ]
    lines = [
        "# Vidéos explicatives SENGA",
        "",
        "Clips générés localement à partir des storyboards `docs/video-scripts/`.",
        "**Ne pas committer les MP4** (le dossier `out/` est déjà ignoré par git).",
        "",
        f"**Audio :** {voice_note}",
        "",
        "## Longs (parcours complets)",
        "",
        "| Fichier | Chemin | Durée | Résolution |",
        "|---------|--------|-------|------------|",
    ]
    for name in long_names:
        p = OUT / name
        if p.exists():
            try:
                dur = probe_duration(p)
            except Exception:
                dur = 0.0
            res = "1080×1920" if "passager-mobile" in name or name == "senga-chauffeur.mp4" else "1920×1080"
            lines.append(f"| `{name}` | `{p}` | {dur:.1f} s | {res} |")
        else:
            lines.append(f"| `{name}` | `{p}` | — | — |")
    lines += [
        "",
        "## Shorts — une vidéo par fonction (30–45 s)",
        "",
        "Dossier : `docs/video-scripts/out/shorts/`. Storyboards : `docs/video-scripts/shorts/`.",
        "",
        "| Fichier | Chemin | Durée | Résolution | Audio |",
        "|---------|--------|-------|------------|-------|",
    ]
    for r in short_rows:
        audio = "voix FR + sous-titres" if r["voice"] else "sous-titres seuls"
        lines.append(
            f"| `{r['file'].name}` | `{r['file']}` | {r['duration']:.1f} s | {r['resolution']} | {audio} |"
        )
    lines += [
        "",
        "### Chauffeur — modules absents",
        "",
        "Aucun des 7 thèmes demandés n’est absent de l’UI chauffeur.",
        "Écarts de libellé uniquement : **Créneaux planifiés** / **Mission planifiée** (pas « Réservation planifiée ») ; **Revenus** (pas « Wallet SENGA »).",
        "",
        "## Lecture",
        "",
        "```powershell",
        r"explorer 'C:\Users\Administrator\Mova\docs\video-scripts\out\shorts'",
        r"Start-Process 'C:\Users\Administrator\Mova\docs\video-scripts\out\shorts\senga-passager-taxi.mp4'",
        "```",
        "",
        "## Régénérer",
        "",
        "```powershell",
        "python docs/video-scripts/build_explainers.py   # longs",
        "python docs/video-scripts/build_shorts.py       # shorts (14 clips)",
        "```",
        "",
        "## Limites",
        "",
        "- Maquettes fidèles aux libellés UI Flutter (pas de session production).",
        "- Passager taxi : captures store `phone-screenshot-2/3` réutilisées quand elles existent.",
        "- Hors sujet : splash, OTP, PIN espèces, SOS.",
        "",
    ]
    (OUT / "README.md").write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    from build_explainers import FFMPEG

    if not Path(FFMPEG).exists():
        print("ffmpeg missing:", FFMPEG)
        return 1
    print("Building 14 feature shorts ->", SHORTS)
    rows = build_shorts()
    voice_note = "voix française (edge-tts Denise) + supers à l’écran"
    if not any(r["voice"] for r in rows):
        voice_note = "sous-titres français seuls (TTS indisponible)"
    elif not all(r["voice"] for r in rows):
        voice_note = "voix FR sur la plupart des plans + supers à l’écran"
    write_readme(rows, voice_note)
    print("README", OUT / "README.md")
    for r in rows:
        print(f"  {r['file']}  {r['duration']:.1f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
