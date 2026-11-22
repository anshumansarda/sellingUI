# Carrousel — a curated collection

A store you browse like a real shop. Four departments, each with its own display, each looping forever:

| Department | Display | How you move |
|---|---|---|
| **Clothes** | Garments hang from wire hooks on a steel rail. The centre piece and its two neighbours sit in one straight line; beyond them the rail curves away like a ring. | Scroll, drag or swipe left/right. Garments swing with the motion. |
| **Bags** | A limewashed wall of oak peg rails. Bags hang from brass pegs, staggered like a boutique wall. | Scroll, drag or swipe up/down through the wall. The row in front shows names and prices. |
| **Watches** | A walnut watch box with suede cushions and brass name plates. The watch in front lifts out of its cushion and turns to face you. | Scroll, drag or swipe left/right along the box. |
| **Accessories** | White stone gallery plinths in a gentle arc, each piece floating above its plinth under a spotlight. | Scroll, drag or swipe left/right. |

- **Click / tap a piece** to bring it to the front, and again to take a closer look. The piece flies off the display into a quick-look card with sizes, **Add to bag** (it turns green with a ✓) and a **View bag** link. ‹ › arrows (or ← →) step through the department.
- **Full details →** opens the product page: swipeable photo gallery, real description, options with sold-out sizes crossed out, a **View at ⟨store⟩ ↗** link to the real product, and more pieces from the department. On phones a slim buy bar follows you down the page.
- **Bag** (top right): count badge, drawer with quantity and remove. **Checkout** lists your pieces grouped by store with a **Buy ↗** link for each. Carrousel curates; each house sells and ships its own pieces.
- Keyboard: ← → / ↑ ↓ to browse, Enter to open the piece in front, Esc to close.
- Phone layout: the centre piece fills the screen with its neighbours peeking in, the department switcher spans the bottom, and quick look becomes a bottom sheet.

## Real data

63 products scraped from the brands' own public Shopify product feeds (`/products.json`): name, price and currency, sizes/options with live availability, description, photos, and the product URL.

- **Clothes (16):** Aimé Leon Dore, Stüssy, Fear of God, Represent, Colorful Standard
- **Bags (16):** Polène, Cuyana, Mansur Gavriel
- **Watches (16):** Audemars Piguet (via Analog:Shift), Vacheron Constantin, Patek Philippe, Omega, Cartier, A. Lange & Söhne, Jaeger-LeCoultre, Grand Seiko, Tudor, Casio G-Shock (via Watches of Switzerland)
- **Accessories (15):** Garrett Leight, Krewe, Mejuri, Missoma, Aimé Leon Dore, Polène, Cuyana

For each product the scraper picks the cleanest studio packshot (plain background, the whole piece in frame, and for clothes a flat garment rather than a model) and cuts it out to a transparent WebP for the displays. Prices are shown in each store's own currency. The bag subtotal is converted to USD at fixed reference rates (in `scraper/scrape.py`, `TO_USD`).

The snapshot is committed, so the site never scrapes at runtime and always shows the same pieces.

```
static/                  ← the whole website
  index.html
  css/style.css
  js/data.js             ← catalogue + helpers
  js/loop.js             ← infinite loop input (wheel, drag, flick, keys, snapping) + spring physics
  js/scenes.js           ← Rack, Wall, Box, Vitrine displays (DOM + CSS 3D)
  js/ui.js               ← switcher, quick look, product page, bag, checkout, router
  data/catalog.json      ← scraped catalogue (catalog.js is the same data as a script)
  img/<id>/cut.webp      ← transparent cutout used on the displays
  img/<id>/1..4.webp     ← product-page photos
scraper/scrape.py        ← curated picks + scraper + cutout
streamlit_app.py         ← Streamlit host
```

## Run on Streamlit

```bash
pip install -r requirements.txt
streamlit run streamlit_app.py
```

To deploy on **Streamlit Community Cloud**: push this folder to a GitHub repo, then **New app → pick the repo → main file `streamlit_app.py`**. `.streamlit/config.toml` turns on `enableStaticServing`, which the app needs to serve the images.

The wrapper inlines the HTML, CSS, JS and catalogue into one full-screen component and points image URLs at Streamlit's static route (`/app/static/…`, or `/~/+/app/static/…` on Community Cloud).

## Run as a plain website

It's a static site. Serve the `static/` folder over http (not `file://`):

```bash
python3 -m http.server 8765 --directory static
```

Any static host works too (GitHub Pages, Netlify, Vercel, Cloudflare Pages): publish `static/` with no build step.

## Refresh or change the collection

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r scraper/requirements.txt
python scraper/scrape.py                 # all departments
python scraper/scrape.py --only watches  # one department
```

The picks live in `CURATION` at the top of `scraper/scrape.py`: `(store, product title, brand shown, image index)`. Leave the image index as `None` to auto-pick the packshot, or set a number to force a specific photo. Stores change stock, so a product can sell out or disappear; the scraper prefers in-stock matches and reports anything it can't find.

## Notes

- No build tooling and no 3D library: the displays are DOM elements placed with CSS 3D transforms each frame, so images stay crisp and taps hit the real element.
- Honors `prefers-reduced-motion` (no swinging or floating).
- The bag is stored in the browser (`localStorage`).
- Product names, prices and photos belong to their brands and retailers. This is a demo storefront UI; use licensed imagery or affiliate feeds before running it commercially.
