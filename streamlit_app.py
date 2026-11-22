"""
Streamlit host for Carrousel.

Streamlit can't serve a multi-file website directly, so this wrapper:
  1. serves the images from ./static via `enableStaticServing`
     (they become /app/static/img/...), and
  2. inlines index.html + CSS + JS + the catalogue into one document,
     rendered as a full-screen component.

Run locally:   streamlit run streamlit_app.py
Deploy:        push this folder to GitHub and point Streamlit Community Cloud at streamlit_app.py
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components

SITE = Path(__file__).parent / "static"
ASSET_BASE = "app/static/"

st.set_page_config(page_title="Carrousel — a curated collection", page_icon="🪝", layout="wide",
                   initial_sidebar_state="collapsed")

# Make the component iframe fill the window and hide Streamlit's own chrome.
st.markdown(
    """
    <style>
      header, footer, [data-testid="stToolbar"], [data-testid="stDecoration"],
      [data-testid="stStatusWidget"], [data-testid="stHeader"], #MainMenu { display: none !important; }
      html, body, .stApp { overflow: hidden !important; background: #efece6; }
      .stApp, .main, .block-container, [data-testid="stAppViewBlockContainer"], [data-testid="stMain"] {
        padding: 0 !important; margin: 0 !important; max-width: 100% !important;
      }
      [data-testid="stVerticalBlock"] { gap: 0 !important; }
      iframe { position: fixed; inset: 0; width: 100vw !important; height: 100vh !important;
               height: 100dvh !important; border: 0; z-index: 1000; }
    </style>
    """,
    unsafe_allow_html=True,
)


def site_version() -> str:
    """Changes whenever an inlined file changes, so a redeploy never serves stale HTML."""
    files = [SITE / "index.html", SITE / "css" / "style.css", SITE / "data" / "catalog.json",
             *sorted((SITE / "js").glob("*.js"))]
    return "|".join(f"{f.name}:{f.stat().st_mtime_ns}:{f.stat().st_size}" for f in files)


@st.cache_data(show_spinner=False)
def build_page(version: str) -> str:
    html = (SITE / "index.html").read_text(encoding="utf-8")

    css = (SITE / "css" / "style.css").read_text(encoding="utf-8")
    html = html.replace('<link rel="stylesheet" href="css/style.css" />', f"<style>{css}</style>")

    # catalogue goes in inline (below); drop the external script tag
    html = html.replace('<script src="data/catalog.js"></script>', "")

    def inline_script(m: re.Match) -> str:
        code = (SITE / m.group(1)).read_text(encoding="utf-8").replace("</script", "<\\/script")
        return f"<script>\n{code}\n</script>"

    html = re.sub(r'<script src="(js/[^"]+)"></script>', inline_script, html)

    catalog = json.loads((SITE / "data" / "catalog.json").read_text(encoding="utf-8"))
    data = json.dumps(catalog, ensure_ascii=False).replace("</", "<\\/")
    # Community Cloud serves apps under "/~/+/", so static files live at
    # "/~/+/app/static/..." there and at "/app/static/..." locally.
    boot = (
        "<script>"
        "(function () {"
        "  var path = '/';"
        "  try { path = window.parent.location.pathname; } catch (e) {"
        "    try { path = new URL(document.referrer).pathname; } catch (e2) {} }"
        "  var m = path.match(/^.*?\\/~\\/\\+\\//);"
        f"  window.__ASSET_BASE__ = (m ? m[0] : '/') + {json.dumps(ASSET_BASE)};"
        "})();"
        f"window.__CATALOG__ = {data};"
        "</script>"
    )
    return html.replace("</head>", boot + "</head>", 1)


components.html(build_page(site_version()), height=900, scrolling=False)
