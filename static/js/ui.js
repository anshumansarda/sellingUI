/* UI: category switcher, quick look, product page, bag, checkout, router. */
(function () {
  const CR = window.CR;
  const $ = (s, r = document) => r.querySelector(s);
  const ui = (CR.ui = {});

  /* ================================================================ BAG */
  const KEY = "carrousel.bag.v1";
  const bag = {
    items: [],
    load() {
      try { this.items = JSON.parse(localStorage.getItem(KEY) || "[]").filter((x) => CR.byId[x.id]); }
      catch (_) { this.items = []; }
    },
    save() {
      try { localStorage.setItem(KEY, JSON.stringify(this.items)); } catch (_) {}
      ui.renderBag();
    },
    add(id, option) {
      const hit = this.items.find((x) => x.id === id && x.option === option);
      if (hit) hit.qty = Math.min(9, hit.qty + 1);
      else this.items.push({ id, option, qty: 1 });
      this.save();
      ui.bump();
    },
    setQty(k, q) {
      if (q <= 0) this.items.splice(k, 1);
      else this.items[k].qty = Math.min(9, q);
      this.save();
    },
    count() { return this.items.reduce((a, x) => a + x.qty, 0); },
    totalUSD() { return this.items.reduce((a, x) => a + CR.byId[x.id].priceUSD * x.qty, 0); },
  };
  CR.bag = bag;

  ui.bump = () => {
    const b = $("#bagBtn");
    b.classList.remove("bump");
    void b.offsetWidth;
    b.classList.add("bump");
  };

  ui.renderBag = () => {
    const n = bag.count();
    const badge = $("#bagCount");
    badge.textContent = n;
    badge.hidden = n === 0;
    $("#bagBtn").setAttribute("aria-label", `Bag, ${n} item${n === 1 ? "" : "s"}`);
    const list = $("#bagList");
    if (!bag.items.length) {
      list.innerHTML = `<div class="bag-empty"><p>Your bag is empty.</p><button class="btn-ghost" data-close-bag>Keep browsing</button></div>`;
      $("#bagFoot").hidden = true;
      return;
    }
    $("#bagFoot").hidden = false;
    list.innerHTML = bag.items
      .map((x, k) => {
        const p = CR.byId[x.id];
        return `<div class="bag-line">
          <a class="bl-img cat-${p.category}" href="#/p/${p.id}"><img src="${CR.asset(p.cut)}" alt=""></a>
          <div class="bl-info">
            <span class="bl-brand">${CR.esc(p.brand)}</span>
            <a class="bl-name" href="#/p/${p.id}">${CR.esc(p.name)}</a>
            ${x.option ? `<span class="bl-opt">${CR.esc(p.options.label || "Option")}: ${CR.esc(x.option)}</span>` : ""}
            <div class="bl-row">
              <div class="qty" data-k="${k}">
                <button data-q="-1" aria-label="Decrease">−</button><span>${x.qty}</span><button data-q="1" aria-label="Increase">+</button>
              </div>
              <span class="bl-price">${CR.money(p.price * x.qty, p.currency)}</span>
            </div>
          </div>
          <button class="bl-x" data-rm="${k}" aria-label="Remove">×</button>
        </div>`;
      })
      .join("");
    const cur = new Set(bag.items.map((x) => CR.byId[x.id].currency));
    $("#bagTotal").textContent = (cur.size > 1 ? "≈ " : "") + CR.money(Math.round(bag.totalUSD()), "USD");
    $("#bagNote").textContent =
      cur.size > 1 ? "Items are listed in their store's currency; total shown in USD at reference rates." : "Taxes and shipping are set by each store at checkout.";
  };

  ui.openBag = () => {
    ui.renderBag();
    document.body.classList.add("bag-open");
    $("#bagPanel").setAttribute("aria-hidden", "false");
    setTimeout(() => $("#bagPanel .x").focus(), 50);
  };
  ui.closeBag = () => {
    document.body.classList.remove("bag-open");
    $("#bagPanel").setAttribute("aria-hidden", "true");
    $("#bagPanel").classList.remove("checking-out");
  };

  ui.checkout = () => {
    const panel = $("#bagPanel");
    const groups = {};
    bag.items.forEach((x) => {
      const p = CR.byId[x.id];
      (groups[p.store] = groups[p.store] || []).push({ p, x });
    });
    $("#checkoutList").innerHTML = Object.entries(groups)
      .map(
        ([store, rows]) => `<div class="co-store">
        <h4>${CR.esc(store)}</h4>
        ${rows
          .map(
            ({ p, x }) => `<a class="co-line" href="${p.url}" target="_blank" rel="noopener">
              <img src="${CR.asset(p.cut)}" alt="">
              <span><b>${CR.esc(p.name)}</b><small>${x.option ? CR.esc(x.option) + " · " : ""}Qty ${x.qty} · ${CR.money(p.price * x.qty, p.currency)}</small></span>
              <em>Buy ↗</em>
            </a>`
          )
          .join("")}
      </div>`
      )
      .join("");
    panel.classList.add("checking-out");
  };

  /* ========================================================= OPTION PICKER */
  function optionsHTML(p, prefix) {
    const o = p.options;
    if (!o || !o.values || !o.values.length) return "";
    const one = o.values.length === 1;
    return `<div class="opts" data-prefix="${prefix}">
      <div class="opts-head"><span>${CR.esc(one ? o.label || "Option" : "Select " + (o.label || "option").toLowerCase())}</span><em class="opts-msg"></em></div>
      <div class="chips">${o.values
        .map(
          (v) => `<button class="chip${v.available ? "" : " out"}${one && v.available ? " on" : ""}" ${v.available ? "" : "disabled"} data-v="${CR.esc(v.label)}">${CR.esc(v.label)}</button>`
        )
        .join("")}</div></div>`;
  }
  function bindOptions(root) {
    root.querySelectorAll(".chips").forEach((c) =>
      c.addEventListener("click", (e) => {
        const b = e.target.closest(".chip");
        if (!b || b.disabled) return;
        c.querySelectorAll(".chip").forEach((x) => x.classList.toggle("on", x === b));
        const o = root.querySelector(".opts");
        o.classList.remove("need");
        o.querySelector(".opts-msg").textContent = "";
      })
    );
  }
  function addFrom(root, p, btn) {
    const opts = root.querySelector(".opts");
    let option = null;
    if (opts) {
      const on = opts.querySelector(".chip.on");
      if (!on) {
        opts.classList.remove("need");
        void opts.offsetWidth;
        opts.classList.add("need");
        opts.querySelector(".opts-msg").textContent = "Please choose one";
        return false;
      }
      option = on.dataset.v;
    }
    bag.add(p.id, option);
    btn.classList.add("added");
    btn.innerHTML = `Added to bag <span class="tick">✓</span>`;
    clearTimeout(btn._t);
    btn._t = setTimeout(() => {
      btn.classList.remove("added");
      btn.textContent = "Add to bag";
    }, 2200);
    return true;
  }
  const allSoldOut = (p) => p.options && p.options.values.length > 0 && p.options.values.every((v) => !v.available);

  /* ========================================================= QUICK LOOK */
  let quickState = null;
  ui.quick = (p, fromImg, scene) => {
    const q = $("#quick");
    quickState = { p, scene };
    const prevActive = document.activeElement;
    quickState.ret = prevActive;
    q.className = `quick cat-${p.category}`;
    $("#quickHero").innerHTML = `<div class="qh-wrap"><img src="${CR.asset(p.cut)}" alt="${CR.esc(p.brand + " " + p.name)}"></div>`;
    $("#quickCard").innerHTML = `
      <span class="q-kind">${CR.esc(CR.kind(p))}</span>
      <span class="q-brand">${CR.esc(p.brand)}</span>
      <h2 class="q-name">${CR.esc(p.name)}</h2>
      <div class="q-price">${CR.price(p)}${p.mrp ? ` <s>${CR.money(p.mrp, p.currency)}</s>` : ""}</div>
      ${optionsHTML(p, "q")}
      <button class="btn-primary q-add" ${allSoldOut(p) ? "disabled" : ""}>${allSoldOut(p) ? "Sold out" : "Add to bag"}</button>
      <div class="q-links">
        <a href="#/p/${p.id}" class="q-more">Full details →</a>
        <button class="q-viewbag" data-open-bag>View bag</button>
      </div>
      <a class="q-store" href="${p.url}" target="_blank" rel="noopener">Sold by ${CR.esc(p.store)} ↗</a>`;
    const card = $("#quickCard");
    card.classList.remove("did-add");
    bindOptions(card);
    card.querySelector(".q-add").addEventListener("click", (e) => {
      if (addFrom(card, p, e.currentTarget)) card.classList.add("did-add");
    });

    // fly the product from where it sits on the display into the quick look
    const hero = $("#quickHero img");
    document.body.classList.add("quick-open");
    q.setAttribute("aria-hidden", "false");
    if (fromImg && !CR.reducedMotion) {
      const a = fromImg.getBoundingClientRect();
      requestAnimationFrame(() => {
        const b = hero.getBoundingClientRect();
        if (!b.width || !a.width) return;
        const sx = a.width / b.width, sy = a.height / b.height;
        hero.animate(
          [
            { transform: `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${sx}, ${sy})`, transformOrigin: "0 0" },
            { transform: "none", transformOrigin: "0 0" },
          ],
          { duration: 620, easing: "cubic-bezier(.2,.8,.2,1)" }
        );
      });
    }
    card.setAttribute("tabindex", "-1");
    setTimeout(() => card.focus({ preventScroll: true }), 80);
  };
  ui.closeQuick = () => {
    if (!document.body.classList.contains("quick-open")) return;
    document.body.classList.remove("quick-open");
    $("#quick").setAttribute("aria-hidden", "true");
    if (quickState && quickState.ret && quickState.ret.focus) quickState.ret.focus({ preventScroll: true });
    quickState = null;
  };
  ui.quickStep = (dir) => {
    if (!quickState) return;
    const { p, scene } = quickState;
    const list = scene.items;
    const next = list[CR.mod(list.indexOf(p) + dir, list.length)];
    if (scene.loop && scene.cat !== "bags") scene.loop.goTo(list.indexOf(next));
    const hero = $("#quickHero");
    hero.classList.remove("slide-l", "slide-r");
    void hero.offsetWidth;
    hero.classList.add(dir > 0 ? "slide-r" : "slide-l");
    ui.quick(next, null, scene);
  };

  /* ======================================================== PRODUCT PAGE */
  ui.showProduct = (p) => {
    const page = $("#pdp");
    const d = p.description || {};
    const gal = p.images.map((src, k) => `<figure class="g-slide" data-k="${k}"><img src="${CR.asset(src)}" alt="${CR.esc(p.name)} — photo ${k + 1}" ${k ? 'loading="lazy"' : ""}></figure>`).join("");
    const thumbs = p.images.map((src, k) => `<button class="g-thumb${k ? "" : " on"}" data-k="${k}" aria-label="Photo ${k + 1}"><img src="${CR.asset(src)}" alt=""></button>`).join("");
    const soldOut = allSoldOut(p);
    const related = CR.byCat(p.category).filter((x) => x.id !== p.id);
    const start = CR.mod(related.findIndex((x) => x.brand !== p.brand), related.length);
    const recs = [...related.slice(start), ...related.slice(0, start)].slice(0, 4);
    page.innerHTML = `
      <div class="pdp-top">
        <button class="pdp-back" data-back aria-label="Back to the collection"><span>←</span> ${CR.esc(CR.CATS.find((c) => c.key === p.category).label)}</button>
      </div>
      <div class="pdp-grid">
        <div class="gallery">
          <div class="g-track" tabindex="0" aria-label="Photos">${gal}</div>
          <div class="g-thumbs">${thumbs}</div>
          <div class="g-dots">${p.images.map((_, k) => `<i class="${k ? "" : "on"}"></i>`).join("")}</div>
        </div>
        <div class="pdp-info">
          <span class="q-kind">${CR.esc(CR.kind(p))}</span>
          <span class="pdp-brand">${CR.esc(p.brand)}</span>
          <h1 class="pdp-name">${CR.esc(p.name)}</h1>
          <div class="pdp-price">${CR.price(p)}${p.mrp ? ` <s>${CR.money(p.mrp, p.currency)}</s>` : ""}
            ${p.currency !== "USD" ? `<small>≈ ${CR.money(Math.round(p.priceUSD), "USD")}</small>` : ""}</div>
          ${optionsHTML(p, "p")}
          <div class="pdp-buy">
            <button class="btn-primary pdp-add" ${soldOut ? "disabled" : ""}>${soldOut ? "Sold out" : "Add to bag"}</button>
            <a class="btn-ghost pdp-store" href="${p.url}" target="_blank" rel="noopener">View at ${CR.esc(p.store)} ↗</a>
          </div>
          <div class="pdp-desc">
            ${(d.paragraphs || []).map((t) => `<p>${CR.esc(t)}</p>`).join("")}
            ${d.bullets && d.bullets.length ? `<ul>${d.bullets.map((t) => `<li>${CR.esc(t)}</li>`).join("")}</ul>` : ""}
          </div>
          <dl class="pdp-meta">
            <div><dt>Sold by</dt><dd><a href="${p.url}" target="_blank" rel="noopener">${CR.esc(p.store)}</a></dd></div>
            <div><dt>Listed price</dt><dd>${CR.price(p)} (${p.currency})</dd></div>
            ${p.options && p.options.values.length ? `<div><dt>${CR.esc(p.options.label || "Options")}</dt><dd>${p.options.values.filter((v) => v.available).length} of ${p.options.values.length} available</dd></div>` : ""}
          </dl>
        </div>
      </div>
      <section class="recs">
        <h3>More from the ${CR.esc(CR.CATS.find((c) => c.key === p.category).label.toLowerCase())}</h3>
        <div class="rec-row">${recs
          .map((r) => `<a class="rec cat-${r.category}" href="#/p/${r.id}"><span class="rec-img"><img src="${CR.asset(r.cut)}" alt="" loading="lazy"></span><b>${CR.esc(r.brand)}</b><span>${CR.esc(r.name)}</span><em>${CR.price(r)}</em></a>`)
          .join("")}</div>
      </section>
      <div class="buybar">
        <div><b>${CR.esc(p.name)}</b><span>${CR.price(p)}</span></div>
        <button class="btn-primary bb-add" ${soldOut ? "disabled" : ""}>${soldOut ? "Sold out" : "Add to bag"}</button>
      </div>`;
    const info = page.querySelector(".pdp-info");
    bindOptions(info);
    const add = (btn) => {
      if (!addFrom(info, p, btn)) {
        info.querySelector(".opts").scrollIntoView({ behavior: "smooth", block: "center" });
      }
    };
    info.querySelector(".pdp-add").addEventListener("click", (e) => add(e.currentTarget));
    page.querySelector(".bb-add").addEventListener("click", (e) => add(e.currentTarget));

    // gallery: scroll-snap track + thumbs + dots
    const track = page.querySelector(".g-track");
    const thumbsEl = page.querySelectorAll(".g-thumb"), dots = page.querySelectorAll(".g-dots i");
    const mark = (k) => {
      thumbsEl.forEach((t, j) => t.classList.toggle("on", j === k));
      dots.forEach((t, j) => t.classList.toggle("on", j === k));
    };
    track.addEventListener("scroll", () => mark(Math.round(track.scrollLeft / track.clientWidth)), { passive: true });
    thumbsEl.forEach((t) => t.addEventListener("click", () => track.scrollTo({ left: +t.dataset.k * track.clientWidth, behavior: "smooth" })));
    track.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.stopPropagation();
        track.scrollBy({ left: (e.key === "ArrowRight" ? 1 : -1) * track.clientWidth, behavior: "smooth" });
      }
    });

    // sticky buy bar on phones once the main button scrolls away
    const bar = page.querySelector(".buybar");
    const io = new IntersectionObserver(([en]) => bar.classList.toggle("show", !en.isIntersecting && en.boundingClientRect.top < 0), { root: page });
    io.observe(info.querySelector(".pdp-add"));

    page.scrollTop = 0;
    document.body.classList.add("pdp-open");
    page.setAttribute("aria-hidden", "false");
    document.title = `${p.brand} ${p.name} — Carrousel`;
    setTimeout(() => page.querySelector(".pdp-back").focus({ preventScroll: true }), 60);
  };
  ui.hideProduct = () => {
    document.body.classList.remove("pdp-open");
    $("#pdp").setAttribute("aria-hidden", "true");
    document.title = "Carrousel — a curated collection";
  };

  /* =========================================================== SCENES */
  const scenes = {};
  let current = null;
  ui.scenes = scenes;

  ui.setCategory = (cat, instant) => {
    if (!CR.Scenes[cat]) cat = "clothes";
    if (current && current.cat === cat) return;
    ui.closeQuick();
    const s = (scenes[cat] = scenes[cat] || new CR.Scenes[cat]($("#scenes"), cat));
    s.ensure();
    const prev = current;
    current = s;
    document.body.dataset.cat = cat;
    document.querySelectorAll(".seg button").forEach((b) => {
      const on = b.dataset.cat === cat;
      b.classList.toggle("on", on);
      b.setAttribute("aria-selected", on);
    });
    moveIndicator();
    s.active = true;
    s.el.classList.add("active");
    if (!instant) {
      s.el.classList.add("enter");
      requestAnimationFrame(() => requestAnimationFrame(() => s.el.classList.remove("enter")));
    }
    if (prev) {
      prev.el.classList.remove("active");
      prev.el.classList.add("leave");
      setTimeout(() => {
        prev.el.classList.remove("leave");
        if (current !== prev) prev.active = false;
      }, 700);
    }
  };

  function moveIndicator() {
    const on = $(".seg button.on"), ind = $(".seg-ind");
    if (!on || !ind) return;
    ind.style.width = on.offsetWidth + "px";
    ind.style.transform = `translateX(${on.offsetLeft}px)`;
  }
  ui.moveIndicator = moveIndicator;

  ui.current = () => current;

  /* =========================================================== ROUTER */
  ui.route = () => {
    const h = location.hash.replace(/^#\/?/, "");
    const [a, b] = h.split("/");
    if (a === "p" && CR.byId[b]) {
      const p = CR.byId[b];
      const q = $("#quick");
      q.classList.add("snap");
      ui.closeQuick();
      setTimeout(() => q.classList.remove("snap"), 60);
      ui.closeBag();
      ui.setCategory(p.category, true);
      ui.showProduct(p);
      return;
    }
    ui.hideProduct();
    ui.setCategory(CR.Scenes[a] ? a : (current && current.cat) || "clothes", !current);
  };
  ui.back = () => {
    const p = location.hash.match(/^#\/p\/(.+)$/);
    const cat = p && CR.byId[p[1]] ? CR.byId[p[1]].category : (current && current.cat) || "clothes";
    location.hash = "#/" + cat;
  };

  /* =========================================================== BOOT */
  ui.init = () => {
    bag.load();
    ui.renderBag();

    // category switcher
    $(".seg").innerHTML =
      `<i class="seg-ind" aria-hidden="true"></i>` +
      CR.CATS.map((c) => `<button role="tab" data-cat="${c.key}" aria-selected="false">${c.label}</button>`).join("");
    $(".seg").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-cat]");
      if (b) location.hash = "#/" + b.dataset.cat;
    });

    document.addEventListener("click", (e) => {
      // In-app links are hash routes. Inside Streamlit's srcdoc iframe a plain "#/…" href
      // resolves against the parent page and would reload the app, so route them here.
      const link = e.target.closest('a[href^="#/"]');
      if (link && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        if (link.closest(".bag-line, .rec, .quick-card")) ui.closeBag();
        location.hash = link.getAttribute("href");
        return;
      }
      if (e.target.closest("#bagBtn") || e.target.closest("[data-open-bag]")) { ui.closeQuick(); ui.openBag(); return; }
      if (e.target.closest("[data-close-bag]") || e.target.closest(".bag-scrim")) { ui.closeBag(); return; }
      if (e.target.closest("[data-back]")) { ui.back(); return; }
      if (e.target.closest("[data-close-quick]")) { ui.closeQuick(); return; }
      if (e.target.closest("[data-quick-prev]")) { ui.quickStep(-1); return; }
      if (e.target.closest("[data-quick-next]")) { ui.quickStep(1); return; }
      if (e.target.closest("#checkoutBtn")) { ui.checkout(); return; }
      if (e.target.closest("#checkoutBack")) { $("#bagPanel").classList.remove("checking-out"); return; }
      const rm = e.target.closest("[data-rm]");
      if (rm) { bag.setQty(+rm.dataset.rm, 0); return; }
      const qb = e.target.closest(".qty button");
      if (qb) {
        const k = +qb.parentElement.dataset.k;
        bag.setQty(k, bag.items[k].qty + +qb.dataset.q);
        return;
      }
      if (e.target.closest(".bag-line a, .rec")) ui.closeBag();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (document.body.classList.contains("bag-open")) return ui.closeBag();
        if (document.body.classList.contains("quick-open")) return ui.closeQuick();
        if (document.body.classList.contains("pdp-open")) return ui.back();
      }
      const busy = document.body.classList.contains("pdp-open") || document.body.classList.contains("bag-open");
      if (busy || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
      const s = current;
      if (!s) return;
      if (document.body.classList.contains("quick-open")) {
        if (e.key === "ArrowRight") ui.quickStep(1);
        if (e.key === "ArrowLeft") ui.quickStep(-1);
        return;
      }
      const fwd = s.cat === "bags" ? ["ArrowDown", "ArrowRight"] : ["ArrowRight", "ArrowDown"];
      const back = s.cat === "bags" ? ["ArrowUp", "ArrowLeft"] : ["ArrowLeft", "ArrowUp"];
      if (fwd.includes(e.key)) { e.preventDefault(); s.loop.key(1); }
      else if (back.includes(e.key)) { e.preventDefault(); s.loop.key(-1); }
      else if (e.key === "Enter" && s.cat !== "bags") {
        const i = s.loop.center;
        const node = s.nodes && s.nodes[i];
        s.open(i, node && (node.el || node.up));
      }
    });

    // the first interaction hides the hint
    document.addEventListener("loop:touched", () => document.body.classList.add("touched"), { once: true });
    setTimeout(() => document.body.classList.add("touched"), 9000);

    window.addEventListener("hashchange", ui.route);
    let rz;
    window.addEventListener("resize", () => {
      clearTimeout(rz);
      rz = setTimeout(() => {
        Object.values(scenes).forEach((s) => s.built && s.resize());
        moveIndicator();
      }, 120);
    });

    ui.route();
    // the pill's sliding indicator depends on text width: re-measure once fonts arrive
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(moveIndicator);
    if (window.ResizeObserver) new ResizeObserver(moveIndicator).observe($(".seg"));

    // one RAF drives whichever scenes are on screen
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      for (const s of Object.values(scenes)) if (s.active && s.built) s.frame(dt);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    requestAnimationFrame(() => document.body.classList.add("ready"));
  };
})();
