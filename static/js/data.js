/* Catalogue + small shared helpers. Everything hangs off window.CR. */
(function () {
  const CR = (window.CR = window.CR || {});
  const doc = window.__CATALOG__ || { products: [], rates: { USD: 1 } };

  CR.products = doc.products;
  CR.rates = doc.rates || { USD: 1 };
  CR.byId = Object.fromEntries(doc.products.map((p) => [p.id, p]));
  CR.byCat = (cat) => doc.products.filter((p) => p.category === cat);

  CR.CATS = [
    { key: "clothes", label: "Clothes" },
    { key: "bags", label: "Bags" },
    { key: "watches", label: "Watches" },
    { key: "accessories", label: "Accessories" },
  ];

  // Local static site: "" ; Streamlit sets window.__ASSET_BASE__ to its static route.
  const BASE = window.__ASSET_BASE__ || "";
  CR.asset = (p) => (p && /^https?:/.test(p) ? p : BASE + p);

  const SYM = { USD: "$", EUR: "€", GBP: "£", CAD: "CA$", AUD: "A$", DKK: "kr " };
  CR.money = (amount, cur = "USD") => {
    const sym = SYM[cur] || cur + " ";
    const whole = Math.abs(amount - Math.round(amount)) < 0.005;
    const n = amount.toLocaleString("en-US", {
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    });
    return sym + n;
  };
  CR.price = (p) => CR.money(p.price, p.currency);

  CR.esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  CR.mod = (a, n) => ((a % n) + n) % n;
  CR.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  CR.lerp = (a, b, t) => a + (b - a) * t;
  CR.smooth = (t) => t * t * (3 - 2 * t);
  CR.isPhone = () => window.innerWidth < 720;
  CR.reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Category-friendly "type" line, e.g. "Outerwear", "Shoulder bag"
  CR.kind = (p) => {
    const t = (p.type || "").toLowerCase();
    if (p.category === "watches") return "Timepiece";
    if (p.category === "bags") return "Bag";
    if (/sun|eyewear/.test(t) || /sun\b/i.test(p.name)) return "Sunglasses";
    if (/hat|headwear/.test(t) || /hat|cap/i.test(p.name)) return "Cap";
    if (/wallet|leather|card/i.test(t + p.name)) return "Small leather goods";
    if (/chain|hoop|ring|neck|brace|stud|jewel/i.test(t + p.name)) return "Jewellery";
    if (p.category === "clothes") return t ? t.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/And Otw|& Otw/i, "& Outerwear") : "Clothing";
    return "Accessory";
  };
})();
