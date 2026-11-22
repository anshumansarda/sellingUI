#!/usr/bin/env python3
"""
Snapshot a curated, real catalogue for the store from public Shopify feeds.

Every Shopify storefront exposes `/products.json`. For each curated pick below we
find the live product, keep its real name, price, currency, sizes/options,
description and photos, pick the cleanest studio packshot, cut it out to a
transparent WebP for the 3D displays, and keep a link back to the product page.

Output (committed, so the site never scrapes at runtime):
  static/data/catalog.json    + static/data/catalog.js (same data as a script)
  static/img/<id>/cut.webp    transparent cutout used on racks / walls / box
  static/img/<id>/1..4.webp   product-page gallery

Usage:
  pip install -r scraper/requirements.txt
  python scraper/scrape.py               # full refresh
  python scraper/scrape.py --only watches
"""
from __future__ import annotations

import argparse
import hashlib
import html
import io
import json
import re
import sys
import time
import urllib.request
from datetime import date
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "static"
OUT_IMG = SITE / "img"
OUT_JSON = SITE / "data" / "catalog.json"
CACHE = ROOT / "scraper" / ".cache"

UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/126 Safari/537.36"}

# Fixed reference rates used only to show one cart total. Every product also
# keeps its original listed price and currency.
TO_USD = {"USD": 1.0, "EUR": 1.08, "GBP": 1.27, "CAD": 0.72, "DKK": 0.145, "AUD": 0.66}

STORE_NAMES = {
    "www.aimeleondore.com": "Aimé Leon Dore", "www.fearofgod.com": "Fear of God",
    "representclo.com": "Represent", "www.colorfulstandard.com": "Colorful Standard",
    "www.stussy.com": "Stüssy", "www.polene-paris.com": "Polène", "www.cuyana.com": "Cuyana",
    "www.mansurgavriel.com": "Mansur Gavriel", "www.watchesofswitzerland.com": "Watches of Switzerland",
    "www.analogshift.com": "Analog:Shift", "www.garrettleight.com": "Garrett Leight",
    "www.krewe.com": "Krewe", "www.mejuri.com": "Mejuri", "www.missoma.com": "Missoma",
}

# (store, exact-ish title, brand shown, image index or None = auto-pick packshot)
CURATION: dict[str, list[tuple]] = {
    "clothes": [
        ("www.stussy.com", "MICRO RIPSTOP DOWN JACKET", "Stüssy", None),
        ("www.aimeleondore.com", "Striped Hand-Knit Sweater", "Aimé Leon Dore", None),
        ("representclo.com", "Represent Owners Club Script Hoodie", "Represent", None),
        ("www.fearofgod.com", "Melange Wool Relaxed Jacket", "Fear of God", None),
        ("www.colorfulstandard.com", "Women Merino Wool Collar Cardigan - Fern", "Colorful Standard", None),
        ("www.aimeleondore.com", "Boiled Wool Letterman Sweater", "Aimé Leon Dore", None),
        ("www.stussy.com", "MIDWEIGHT HOODED PUFFER", "Stüssy", None),
        ("www.aimeleondore.com", "ALD / Vanson Paneled Leather Moto Jacket", "Aimé Leon Dore", None),
        ("www.colorfulstandard.com", "Oversized Merino Wool Crew - Cherry", "Colorful Standard", None),
        ("representclo.com", "Initial Oversized Hoodie - Midnight", "Represent", None),
        ("www.aimeleondore.com", "Poros Jacquard Pullover", "Aimé Leon Dore", None),
        ("www.fearofgod.com", "MLB Coaches Jacket", "Fear of God Essentials", None),
        ("www.colorfulstandard.com", "Merino Wool Turtleneck - Soft Lavender", "Colorful Standard", None),
        ("www.aimeleondore.com", "Cashmere Embroidered Logo Hoodie", "Aimé Leon Dore", None),
        ("www.stussy.com", "FUR LINED FLIGHT BOMBER", "Stüssy", None),
        ("www.aimeleondore.com", "Wool Cashmere Jacquard Cardigan", "Aimé Leon Dore", None),
    ],
    "bags": [
        ("www.polene-paris.com", "Numéro Un - Trio Camel", "Polène", None),
        ("www.cuyana.com", "Cordina Bag", "Cuyana", None),
        ("www.mansurgavriel.com", "Gaia Shoulder Bag - Olive Plush Velvet", "Mansur Gavriel", None),
        ("www.polene-paris.com", "Numéro Neuf East West", "Polène", None),
        ("www.cuyana.com", "Nova Bag", "Cuyana", None),
        ("www.mansurgavriel.com", "Mini Candy Bag - Crinkled Gold", "Mansur Gavriel", None),
        ("www.polene-paris.com", "Numéro Dix", "Polène", None),
        ("www.cuyana.com", "Oversized Bow Bag (Suede)", "Cuyana", None),
        ("www.mansurgavriel.com", "Mini Cloud Clutch - Chocolate", "Mansur Gavriel", None),
        ("www.polene-paris.com", "Boky - Cerise Noire", "Polène", None),
        ("www.cuyana.com", "Barela Shoulder Bag", "Cuyana", None),
        ("www.mansurgavriel.com", "Carryall Tote - Anise Suede", "Mansur Gavriel", None),
        ("www.polene-paris.com", "Nodde Hobo", "Polène", None),
        ("www.mansurgavriel.com", "Pina Evening Bag", "Mansur Gavriel", None),
        ("www.polene-paris.com", "Cyme - Brume", "Polène", None),
        ("www.cuyana.com", "Forma Top Handle Bag", "Cuyana", None),
    ],
    "watches": [
        ("www.analogshift.com", "Audemars Piguet Royal Oak 'Yves Klein'", "Audemars Piguet", 1),
        ("www.watchesofswitzerland.com", "Overseas Self-Winding", "Vacheron Constantin", None),
        ("www.watchesofswitzerland.com", "GM-2110D-2A", "Casio G-Shock", None),
        ("www.watchesofswitzerland.com", "Seamaster Aqua Terra 150M", "Omega", None),
        ("www.watchesofswitzerland.com", "Calatrava", "Patek Philippe", None),
        ("www.watchesofswitzerland.com", "Tank Louis Cartier Medium Model", "Cartier", None),
        ("www.watchesofswitzerland.com", "Heritage Quartz Snowflake", "Grand Seiko", None),
        ("www.watchesofswitzerland.com", "Patrimony Manual-Winding", "Vacheron Constantin", None),
        ("www.watchesofswitzerland.com", "GMW-B5000D-1C", "Casio G-Shock", None),
        ("www.watchesofswitzerland.com", "Reverso Tribute Monoface", "Jaeger-LeCoultre", None),
        ("www.analogshift.com", "Audemars Piguet Royal Oak 'Salmon'", "Audemars Piguet", 1),
        ("www.watchesofswitzerland.com", "Speedmaster 38 Silver", "Omega", None),
        ("www.watchesofswitzerland.com", "Santos de Cartier Large Model", "Cartier", None),
        ("www.watchesofswitzerland.com", "Lange 1 'Prussian Blue'", "A. Lange & Söhne", None),
        ("www.watchesofswitzerland.com", "Black Bay 58", "Tudor", None),
        ("www.watchesofswitzerland.com", "Nautilus 'Midsize'", "Patek Philippe", None),
    ],
    "accessories": [
        ("www.garrettleight.com", "VERDUGO SUN", "Garrett Leight", None),
        ("www.mejuri.com", "Bold Figaro Chain Bracelet", "Mejuri", None),
        ("www.aimeleondore.com", "ALD / New Era Mets Cashmere Ballpark", "Aimé Leon Dore", None),
        ("www.krewe.com", "OLIVIA | Chamomile", "Krewe", None),
        ("www.missoma.com", "Wavy Ridge Caspia Gemstone Cord Necklace", "Missoma", None),
        ("www.polene-paris.com", "Portefeuille Sierra - Trio Camel", "Polène", None),
        ("www.garrettleight.com", "HANCOCK SUN", "Garrett Leight", None),
        ("www.mejuri.com", "Easy Medium Hoops", "Mejuri", None),
        ("www.aimeleondore.com", "ALD / LA Dodgers Leather Bi-Fold Wallet", "Aimé Leon Dore", None),
        ("www.krewe.com", "STL II | Haze + Iberia 12K Polarized", "Krewe", None),
        ("www.missoma.com", "Sculptural Ridge Stacking Ring", "Missoma", None),
        ("www.mejuri.com", "Clara Ribbon Necklace", "Mejuri", None),
        ("www.garrettleight.com", "GLCO X LAURENT DAGENAIS VERDUGO SUN", "Garrett Leight", None),
        ("www.cuyana.com", "Men's Fold Cardholder", "Cuyana", None),
        ("www.aimeleondore.com", "ALD / New Era Yankees Cashmere Ballpark", "Aimé Leon Dore", None),
    ],
}

# per-product background tolerance where the department default doesn't suit the photo
# (lower keeps pale silver highlights, higher drops a soft studio shadow)
TOL_OVERRIDE = {
    "Sculptural Ridge Stacking Ring": 14,
    "ALD / New Era Mets Cashmere Ballpark": 46,
    "ALD / New Era Yankees Cashmere Ballpark": 46,
}

GALLERY_MAX = 4
GALLERY_W = 1100
CUT_MAX = 900


# ------------------------------------------------------------------ fetching
def fetch(url: str, retries: int = 3) -> bytes:
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=45) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            if attempt == retries - 1:
                raise
            print(f"  retry {url}: {e}", file=sys.stderr)
            time.sleep(2 * (attempt + 1))
    raise RuntimeError


def feed(store: str) -> list[dict]:
    """Whole products.json for a store, cached for a day."""
    CACHE.mkdir(parents=True, exist_ok=True)
    f = CACHE / f"{store}.json"
    if f.exists() and time.time() - f.stat().st_mtime < 86400:
        return json.loads(f.read_text())
    items: list[dict] = []
    for page in range(1, 60):
        batch = json.loads(fetch(f"https://{store}/products.json?limit=250&page={page}")).get("products", [])
        if not batch:
            break
        items += batch
        time.sleep(0.5)
    f.write_text(json.dumps(items))
    return items


def page_currency(store: str, handle: str) -> tuple[str | None, float | None]:
    """The currency/price the product page itself advertises (og:price meta)."""
    try:
        h = fetch(f"https://{store}/products/{handle}").decode("utf-8", "ignore")
    except Exception:  # noqa: BLE001
        return None, None
    cur = re.search(r'og:price:currency"\s+content="([A-Z]{3})"', h)
    amt = re.search(r'og:price:amount"\s+content="([\d.,]+)"', h)
    return (cur.group(1) if cur else None,
            float(amt.group(1).replace(",", "")) if amt else None)


# ------------------------------------------------------------------ text
def html_to_blocks(raw: str) -> dict:
    raw = raw or ""
    raw = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", raw, flags=re.S | re.I)
    bullets = [re.sub(r"<[^>]+>", "", b) for b in re.findall(r"<li[^>]*>(.*?)</li>", raw, re.S | re.I)]
    raw = re.sub(r"<li[^>]*>.*?</li>", "", raw, flags=re.S | re.I)
    raw = re.sub(r"<(br|/p|/div|/h\d|/tr)[^>]*>", "\n", raw, flags=re.I)
    text = html.unescape(re.sub(r"<[^>]+>", " ", raw))
    clean = lambda s: re.sub(r"\s+", " ", html.unescape(s)).strip()  # noqa: E731
    paras, extra = [], []
    for line in text.split("\n"):
        line = clean(line)
        if len(line) < 3:
            continue
        if line.startswith(("*", "•", "-", "–")):
            extra.append(line.lstrip("*•-– ").strip())
        else:
            paras.append(line)
    bullets = [clean(b) for b in bullets + extra if clean(b)]
    junk = re.compile(r"(?i)^(sku|style code|disclaimer|imported|country of origin|marketed by|mrp|"
                      r"free shipping|please note|ref\.?:?$)")
    paras = [p for p in paras if not junk.match(p)]
    # keep it short and readable
    out_p, total = [], 0
    for p in paras:
        if total > 700:
            break
        out_p.append(p)
        total += len(p)
    return {"paragraphs": out_p[:4], "bullets": [b for b in bullets if len(b) < 160][:8]}


def nice_title(s: str) -> str:
    if s.isupper():
        s = " ".join(w if len(w) <= 3 and w in {"ALD", "MLB", "NBA", "NY", "LA", "II"} else w.capitalize()
                     for w in s.split())
    return s


def options_of(p: dict) -> dict:
    """Size (or other) choices with availability."""
    opts = [o["name"] for o in p.get("options", [])]
    idx = next((i for i, o in enumerate(opts) if re.search(r"(?i)size|taille|length", o)), None)
    if idx is None:
        if len(p["variants"]) <= 1 or opts == ["Title"]:
            return {"label": None, "values": []}
        idx = 0
    seen: dict[str, bool] = {}
    for v in p["variants"]:
        val = str(v.get(f"option{idx + 1}") or v["title"]).strip()
        seen[val] = seen.get(val, False) or bool(v.get("available"))
    label = opts[idx] if idx < len(opts) else "Option"
    label = "Size" if re.search(r"(?i)size|taille", label) else label
    return {"label": label, "values": [{"label": k, "available": a} for k, a in seen.items()][:12]}


# ------------------------------------------------------------------ images
def shopify_img(src: str, width: int) -> str:
    return f"{src.split('?')[0]}?width={width}"


def load(src: str, width: int) -> np.ndarray:
    """RGB, or RGBA when the source already ships with real transparency."""
    im = Image.open(io.BytesIO(fetch(shopify_img(src, width))))
    if im.mode in ("RGBA", "LA", "P"):
        rgba = np.array(im.convert("RGBA"))
        if (rgba[..., 3] < 128).mean() > 0.05:
            return rgba
    return np.array(im.convert("RGB"))


def border_stats(a: np.ndarray) -> tuple[np.ndarray, float]:
    h, w, _ = a.shape
    k = max(3, min(h, w) // 80)
    ring = np.concatenate([a[:k].reshape(-1, 3), a[-k:].reshape(-1, 3),
                           a[:, :k].reshape(-1, 3), a[:, -k:].reshape(-1, 3)]).astype(np.int16)
    med = np.median(ring, axis=0)
    close = (np.abs(ring - med).max(axis=1) < 18).mean()
    return med, float(close)


def bg_mask(a: np.ndarray, tol: int, holes: bool) -> np.ndarray:
    """255 where background. Flood fill from every border pixel close to the bg colour."""
    h, w, _ = a.shape
    med, _ = border_stats(a)
    diff = np.abs(a.astype(np.int16) - med.astype(np.int16)).max(axis=2)
    near = (diff < tol).astype(np.uint8)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(near, connectivity=4)
    border_labels = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    keep = np.zeros(n, np.uint8)
    for l in border_labels:
        keep[l] = 255
    if holes:  # enclosed background (inside bag handles, hoops, cap straps)
        min_area = 0.0015 * h * w
        tight = (diff < max(8, tol - 8)).astype(np.uint8)
        for l in range(1, n):
            if not keep[l] and stats[l, cv2.CC_STAT_AREA] > min_area:
                region = lab == l
                if tight[region].mean() > 0.9:
                    keep[l] = 255
    return keep[lab]


def cutout(a: np.ndarray, tol: int, holes: bool) -> Image.Image | None:
    if a.shape[2] == 4:  # already transparent: just trim
        alpha = a[..., 3]
        ys, xs = np.where(alpha > 20)
        pad = int(0.02 * max(a.shape[:2]))
        x0, x1 = max(0, xs.min() - pad), min(a.shape[1], xs.max() + pad + 1)
        y0, y1 = max(0, ys.min() - pad), min(a.shape[0], ys.max() + pad + 1)
        return Image.fromarray(a[y0:y1, x0:x1], "RGBA")
    bg = bg_mask(a, tol, holes)
    fg = 255 - bg
    # keep the biggest blobs only (drops specks/dust)
    n, lab, stats, _ = cv2.connectedComponentsWithStats((fg > 0).astype(np.uint8), connectivity=8)
    if n <= 1:
        return None
    biggest = stats[1:, cv2.CC_STAT_AREA].max()
    keep = np.zeros(n, np.uint8)
    for l in range(1, n):
        if stats[l, cv2.CC_STAT_AREA] >= 0.02 * biggest:
            keep[l] = 255
    fg = keep[lab]
    med, _ = border_stats(a)
    light = med.mean() > 200
    # light studio backgrounds leave a pale fringe: shave one more pixel off those edges
    fg = cv2.erode(fg, np.ones((3, 3) if light else (2, 2), np.uint8))
    alpha = cv2.GaussianBlur(fg, (3, 3), 0.8)
    # un-mix the background colour from semi-transparent edge pixels
    af = alpha.astype(np.float32)[..., None] / 255.0
    edge = (af > 0.02) & (af < 0.98)
    rgbf = a.astype(np.float32)
    clean = (rgbf - med.astype(np.float32) * (1 - af)) / np.maximum(af, 0.02)
    a = np.where(edge, np.clip(clean, 0, 255), rgbf).astype(np.uint8)
    ys, xs = np.where(alpha > 20)
    if len(xs) == 0:
        return None
    pad = int(0.02 * max(a.shape[:2]))
    x0, x1 = max(0, xs.min() - pad), min(a.shape[1], xs.max() + pad + 1)
    y0, y1 = max(0, ys.min() - pad), min(a.shape[0], ys.max() + pad + 1)
    rgba = np.dstack([a, alpha])[y0:y1, x0:x1]
    return Image.fromarray(rgba, "RGBA")


def packshot_score(a: np.ndarray, cat: str) -> float | None:
    """None if this photo isn't a clean product-only shot."""
    if a.shape[2] == 4:
        return float((a[..., 3] > 128).mean())
    med, close = border_stats(a)
    if close < 0.96:
        return None
    light, dark = med.mean() > 200, med.mean() < 40
    if not (light or dark):
        return None
    bg = bg_mask(a, 22, False)
    fg = bg == 0
    ys, xs = np.where(fg)
    if len(xs) < 50:
        return None
    h, w = fg.shape
    bw, bh = xs.max() - xs.min() + 1, ys.max() - ys.min() + 1
    area = fg.mean()
    if area < 0.03:
        return None
    touches = (xs.min() <= 1) + (xs.max() >= w - 2)
    if cat != "watches":  # a strap may run off the top/bottom of a watch shot
        touches += (ys.min() <= 1) + (ys.max() >= h - 2)
    if touches:
        return None
    if cat == "clothes" and bh / bw > 1.55:  # standing model, not a flat garment
        return None
    return area


def save_images(pid: str, cat: str, p: dict, forced_idx: int | None, tol_override: int | None = None) -> dict:
    folder = OUT_IMG / pid
    folder.mkdir(parents=True, exist_ok=True)
    imgs = p["images"]
    tol = tol_override or {"watches": 16, "clothes": 20, "bags": 20, "accessories": 28}[cat]
    holes = cat in ("bags", "accessories")

    # choose the packshot
    chosen = forced_idx
    if chosen is None:
        best = None
        for i, im in enumerate(imgs[:8]):
            try:
                a = load(im["src"], 420)
            except Exception:  # noqa: BLE001
                continue
            s = packshot_score(a, cat)
            if s is not None:
                best = i
                break
        chosen = best if best is not None else 0

    big = load(imgs[chosen]["src"], 1400)
    if big.shape[2] == 4 and cat == "watches":
        big = big[..., :3]
    cut = cutout(big, tol, holes)
    if cut is None:
        raise RuntimeError("cutout failed")
    cut.thumbnail((CUT_MAX, CUT_MAX), Image.LANCZOS)
    cut.save(folder / "cut.webp", "WEBP", quality=88, method=6)

    # gallery: packshot first, then the next photos in store order
    order = [chosen] + [i for i in range(len(imgs)) if i != chosen]
    gallery = []
    for n, i in enumerate(order[:GALLERY_MAX]):
        im = Image.open(io.BytesIO(fetch(shopify_img(imgs[i]["src"], GALLERY_W))))
        if im.mode in ("RGBA", "LA", "P"):  # transparent packshot: lay it on the page colour
            im = im.convert("RGBA")
            bgc = Image.new("RGBA", im.size, (244, 243, 240, 255))
            im = Image.alpha_composite(bgc, im)
        im = im.convert("RGB")
        im.thumbnail((GALLERY_W, GALLERY_W * 1.4))
        name = f"{n + 1}.webp"
        im.save(folder / name, "WEBP", quality=80, method=6)
        gallery.append(f"img/{pid}/{name}")
        time.sleep(0.1)
    return {"cut": f"img/{pid}/cut.webp", "cutAspect": round(cut.width / cut.height, 4),
            "images": gallery, "packshotIndex": chosen}


# ------------------------------------------------------------------ main
def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", html.unescape(s).lower()).strip()


def find(store: str, title: str) -> dict | None:
    items = feed(store)
    t = norm(title)
    live = [p for p in items if p["images"] and any(v.get("available") for v in p["variants"])]
    for pool in (live, items):
        for p in pool:  # exact
            if norm(p["title"]) == t or norm(p["title"].split("|")[0]) == t:
                return p
        for p in pool:  # prefix
            if norm(p["title"]).startswith(t):
                return p
    return None


def price_of(p: dict) -> tuple[float, float | None]:
    vs = [v for v in p["variants"] if v.get("available")] or p["variants"]
    price = min(float(v["price"]) for v in vs)
    cmp = [float(v["compare_at_price"]) for v in vs if v.get("compare_at_price")]
    mrp = max(cmp) if cmp and max(cmp) > price else None
    return price, mrp


DEFAULT_CUR = {"www.polene-paris.com": "EUR", "www.missoma.com": "GBP"}


def build(cat: str, entries: list[tuple], store_cur: dict) -> list[dict]:
    out = []
    for n, (store, title, brand, idx) in enumerate(entries, 1):
        p = find(store, title)
        if not p:
            print(f"  !! not found: {store} {title}")
            continue
        pid = f"{cat[:3]}-{hashlib.sha1((store + p['handle']).encode()).hexdigest()[:8]}"
        print(f"[{cat} {n:2d}/{len(entries)}] {brand} — {p['title']}")
        price, mrp = price_of(p)
        if store not in store_cur:
            cur, _ = page_currency(store, p["handle"])
            store_cur[store] = cur or DEFAULT_CUR.get(store, "USD")
        cur = store_cur[store]
        name = p["title"]
        if store == "www.analogshift.com":
            name = re.sub(r"^Audemars Piguet\s+", "", name)
        if store == "www.watchesofswitzerland.com":
            name = name.split("|")[0].strip()
        name = re.sub(r"^(ALD / |Represent )", lambda m: "" if m.group(1) == "Represent " else m.group(1), name)
        try:
            imgs = save_images(pid, cat, p, idx, TOL_OVERRIDE.get(title))
        except Exception as e:  # noqa: BLE001
            print(f"  !! images failed: {e}")
            continue
        tags = p["tags"] if isinstance(p["tags"], list) else [t.strip() for t in p["tags"].split(",")]
        out.append({
            "id": pid, "category": cat, "brand": brand, "name": nice_title(name),
            "type": p.get("product_type") or "",
            "price": round(price, 2), "mrp": mrp, "currency": cur,
            "priceUSD": round(price * TO_USD.get(cur, 1.0), 2),
            "options": options_of(p),
            "description": html_to_blocks(p.get("body_html", "")),
            "tags": [t for t in tags if len(t) < 30][:6],
            "store": STORE_NAMES.get(store, store), "storeDomain": store.replace("www.", ""),
            "url": f"https://{store}/products/{p['handle']}",
            **imgs,
        })
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=list(CURATION))
    args = ap.parse_args()
    existing = {}
    if OUT_JSON.exists():
        existing = {c: [p for p in json.loads(OUT_JSON.read_text())["products"] if p["category"] == c]
                    for c in CURATION}
    store_cur: dict[str, str] = {}
    products: list[dict] = []
    for cat, entries in CURATION.items():
        if args.only and cat != args.only:
            products += existing.get(cat, [])
            continue
        products += build(cat, entries, store_cur)
    write(products)
    # drop image folders for products no longer in the catalogue
    keep = {p["id"] for p in products}
    for d in OUT_IMG.iterdir():
        if d.is_dir() and d.name not in keep:
            for f in d.iterdir():
                f.unlink()
            d.rmdir()
    print(f"Wrote {len(products)} products -> {OUT_JSON.relative_to(ROOT)}")


def write(products: list[dict]) -> None:
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    doc = json.dumps({
        "generated": date.today().isoformat(),
        "version": int(time.time()),  # appended to image URLs so a re-scrape is never served from cache
        "rates": TO_USD,
        "count": len(products),
        "products": products,
    }, ensure_ascii=False, indent=1)
    OUT_JSON.write_text(doc)
    OUT_JSON.with_suffix(".js").write_text("window.__CATALOG__ = " + doc.replace("</", "<\\/") + ";\n")


if __name__ == "__main__":
    main()
