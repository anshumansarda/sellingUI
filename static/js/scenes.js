/* The four displays. Each is DOM + CSS 3D, driven by a CR.Loop.
   Rack (clothes) · Wall (bags) · Box (watches) · Vitrine (accessories). */
(function () {
  const CR = window.CR;
  const { clamp, smooth, mod } = CR;
  const deg = (r) => (r * 180) / Math.PI;

  /* ---------------------------------------------------------------- base */
  class Scene {
    constructor(root, cat) {
      this.cat = cat;
      this.items = CR.byCat(cat);
      this.n = this.items.length;
      this.el = document.createElement("section");
      this.el.className = `scene scene--${cat}`;
      this.el.dataset.cat = cat;
      this.el.setAttribute("aria-label", cat);
      root.appendChild(this.el);
      this.t = 0;
      this.active = false;
    }
    ensure() {
      if (this.built) return;
      this.built = true;
      this.build();
      this.resize();
    }
    // tap on an item: bring it to the centre, or open it if it already is
    tap(i, el) {
      if (i === null) return;
      if (i === this.loop.center && this.loop.settled) this.open(i, el);
      else if (i === this.loop.center) this.open(i, el);
      else this.loop.goTo(i);
    }
    open(i, el) {
      CR.ui.quick(this.items[i], el && el.querySelector("img.prod"), this);
    }
    current() {
      return this.items[this.loop.center];
    }
    setCaption(p) {
      const c = this.caption;
      if (!c || !p) return;
      c.classList.remove("show");
      clearTimeout(this._capT);
      this._capT = setTimeout(() => {
        c.innerHTML = `<span class="cap-brand">${CR.esc(p.brand)}</span>
          <span class="cap-name">${CR.esc(p.name)}</span>
          <span class="cap-price">${CR.price(p)}</span>`;
        c.classList.add("show");
      }, 120);
    }
    makeLoop(axis, stepPx) {
      this.loop = new CR.Loop({
        el: this.el,
        axis,
        count: this.loopCount || this.n,
        stepPx,
        onTap: (i, el) => this.tap(i, el),
        onCenter: (c) => this.onCenter && this.onCenter(c),
      });
    }
  }

  /* -------------------------------------------- shared arc (rack, vitrine)
     |d| <= 1 : straight line (centre and its two neighbours stay in one plane)
     |d|  > 1 : bends back on a circle, so the line reads as an endless ring */
  function arc(d, gapC, gapS, R) {
    const a = Math.abs(d), s = Math.sign(d) || 1;
    if (a <= 1) return { x: d * gapC, z: 0, ry: 0 };
    const e = a - 1, ang = (e * gapS) / R;
    return { x: s * (gapC + R * Math.sin(ang)), z: -R * (1 - Math.cos(ang)), ry: s * ang };
  }

  // slim wire hook: curls over the rail, drops to a brass dot at the collar
  const HOOK = `<svg class="hook" viewBox="0 0 24 44" aria-hidden="true">
      <defs>
        <linearGradient id="hm" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#7c7e82"/><stop offset=".5" stop-color="#eceded"/><stop offset="1" stop-color="#6f7175"/>
        </linearGradient>
        <radialGradient id="hd" cx=".35" cy=".3" r=".75">
          <stop offset="0" stop-color="#fff4cf"/><stop offset=".45" stop-color="#c9a24c"/><stop offset="1" stop-color="#6c4f17"/>
        </radialGradient>
      </defs>
      <path d="M12 36 V12 C12 6 16 3 18 5" fill="none" stroke="url(#hm)" stroke-width="2.2" stroke-linecap="round"/>
      <circle cx="12" cy="38" r="4.6" fill="url(#hd)"/>
    </svg>`;

  /* ================================================================ RACK */
  class Rack extends Scene {
    build() {
      this.el.innerHTML = `
        <div class="backdrop wall-plaster"><div class="floor"></div><div class="spot"></div></div>
        <div class="stage"><div class="world"></div></div>
        <div class="caption" aria-live="polite"></div>`;
      this.world = this.el.querySelector(".world");
      this.stage = this.el.querySelector(".stage");
      this.caption = this.el.querySelector(".caption");
      this.rail = document.createElement("div");
      this.rail.className = "rail";
      this.world.appendChild(this.rail);
      this.nodes = this.items.map((p, i) => {
        const it = document.createElement("div");
        it.className = "it";
        it.dataset.i = i;
        it.innerHTML = `<div class="swing">
            <img class="shadow" src="${CR.asset(p.cut)}" alt="" draggable="false">
            ${HOOK}
            <img class="prod" src="${CR.asset(p.cut)}" alt="${CR.esc(p.brand + " " + p.name)}" draggable="false" ${i > 6 && i < this.n - 6 ? 'loading="lazy"' : ""}>
          </div>`;
        this.world.appendChild(it);
        return { el: it, swing: it.firstElementChild, spring: new CR.Spring(30 + (i % 5) * 3, 2.6), p };
      });
      this.makeLoop("x", () => this.m.gapS * 1.15);
    }
    resize() {
      const vw = innerWidth, vh = innerHeight, phone = vw < 720;
      const itemW = phone ? Math.min(vw * 0.58, vh * 0.34) : clamp(Math.min(vw * 0.18, vh * 0.31), 150, 320);
      const m = (this.m = {
        phone, itemW,
        H: itemW * 1.12,
        gapC: phone ? itemW * 1.12 : itemW * 1.55,
        gapS: phone ? itemW * 0.62 : itemW * 0.9,
        R: phone ? vw * 0.9 : Math.max(560, vw * 0.43),
        railY: phone ? vh * 0.25 : vh * 0.22,
        pop: phone ? 0.1 : 0.26,
      });
      m.hookW = Math.max(16, itemW * 0.085);
      m.hookH = (m.hookW * 44) / 24;
      m.hookY = (m.hookH * 4.5) / 44; // where the hook rests on the rail
      m.gTop = m.hookH * 0.86; // garment collar sits just under the brass dot
      this.stage.style.perspective = (phone ? 1000 : 1500) + "px";
      this.stage.style.perspectiveOrigin = `50% ${m.railY + m.H * 0.4}px`;
      this.world.style.top = m.railY + "px";
      this.nodes.forEach((nd) => {
        const a = nd.p.cutAspect || 0.85;
        let w = Math.min(m.itemW * 1.3, m.H * a);
        const h = w / a;
        nd.w = w; nd.h = h;
        const el = nd.el;
        el.style.width = w + "px";
        el.style.left = -w / 2 + "px";
        el.style.top = -m.hookY + "px";
        el.style.transformOrigin = `50% ${m.hookY}px`;
        nd.swing.style.transformOrigin = `50% ${m.hookY}px`;
        nd.swing.style.height = m.gTop + h + "px";
        const hk = el.querySelector(".hook");
        hk.style.width = m.hookW + "px";
        hk.style.left = (w - m.hookW) / 2 + "px";
        const top = m.gTop;
        for (const img of el.querySelectorAll("img")) {
          img.style.top = top + "px";
          img.style.width = w + "px";
          img.style.height = h + "px";
        }
      });
      this.buildRail();
      this.onCenter(this.loop.center);
    }
    buildRail() {
      const m = this.m, span = m.phone ? 5 : 8;
      let html = "";
      const step = 0.25;
      for (let d = -span; d < span; d += step) {
        const a = arc(d, m.gapC, m.gapS, m.R), b = arc(d + step, m.gapC, m.gapS, m.R);
        const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) + 1.5;
        const ang = Math.atan2(-dz, dx);
        const fade = clamp(1 - (Math.abs(d) - (span - 2.5)) / 2.5, 0, 1);
        html += `<i style="width:${len}px;opacity:${fade.toFixed(3)};transform:translate3d(${(a.x + b.x) / 2 - len / 2}px,-3px,${(a.z + b.z) / 2}px) rotateY(${deg(ang)}deg)"></i>`;
      }
      this.rail.innerHTML = html;
    }
    onCenter(c) {
      this.setCaption(this.items[c]);
      const m = this.m, nd = this.nodes[c];
      if (!m || !nd) return;
      this.caption.style.top = m.railY - m.hookY + (m.gTop + nd.h) * (1 + m.pop) + 26 + "px";
    }
    frame(dt) {
      this.loop.step(dt);
      const m = this.m, L = this.loop, vis = m.phone ? 4.2 : 6.5;
      const force = -L.v * (m.phone ? 34 : 26);
      for (let i = 0; i < this.n; i++) {
        const nd = this.nodes[i];
        const d = L.offset(i), a = Math.abs(d);
        if (a > vis) {
          if (nd.vis !== false) { nd.el.style.visibility = "hidden"; nd.vis = false; }
          nd.spring.x = 0; nd.spring.v = 0;
          continue;
        }
        if (nd.vis !== true) { nd.el.style.visibility = "visible"; nd.vis = true; }
        const { x, z, ry } = arc(d, m.gapC, m.gapS, m.R);
        const p = smooth(clamp(1 - a, 0, 1));
        const s = 1 + m.pop * p;
        const swing = CR.reducedMotion ? 0 : clamp(nd.spring.step(dt, force * (0.85 + (i % 3) * 0.12)), -16, 16);
        nd.el.style.transform = `translate3d(${x.toFixed(1)}px,0,${z.toFixed(1)}px) rotateY(${deg(ry).toFixed(2)}deg) scale(${s.toFixed(4)})`;
        nd.el.style.zIndex = 100 - Math.round(a * 10);
        nd.swing.style.transform = `rotate(${swing.toFixed(2)}deg)`;
        nd.el.style.setProperty("--pop", p.toFixed(3));
        nd.el.style.opacity = clamp(vis - a, 0, 1).toFixed(3);
      }
    }
  }

  /* ================================================================ WALL */
  class Wall extends Scene {
    build() {
      this.el.innerHTML = `
        <div class="backdrop wall-limewash"><div class="spot"></div></div>
        <div class="stage"><div class="world"></div></div>
        <div class="wall-fade"></div>`;
      this.world = this.el.querySelector(".world");
      this.stage = this.el.querySelector(".stage");
      this.rows = [];
      this.loopCount = 100000; // rows are virtual: the wall never repeats a visible pattern
      this.makeLoop("y", () => this.m.rowH * 0.9);
      this.loop.pos = this.loop.target = 0;
    }
    resize() {
      const vw = innerWidth, vh = innerHeight, phone = vw < 720;
      const cols = phone ? 2 : vw > 1500 ? 4 : 3;
      const colGap = phone ? vw * 0.47 : Math.min(vw / (cols + 0.4), 360);
      const rowH = phone ? vh * 0.33 : clamp(vh * 0.46, 260, 470);
      this.m = { phone, cols, colGap, rowH, B: phone ? vw * 0.34 : Math.min(colGap * 0.62, rowH * 0.6), R: rowH * 3.2 };
      this.stage.style.perspective = (phone ? 1000 : 1600) + "px";
      this.world.style.top = (phone ? vh * 0.44 : vh * 0.43) + "px";
      this.stage.style.perspectiveOrigin = `50% ${phone ? vh * 0.44 : vh * 0.43}px`;
      this.world.innerHTML = "";
      this.rows = [];
      const K = 3;
      for (let k = -K; k <= K; k++) {
        const row = document.createElement("div");
        row.className = "row";
        row.innerHTML = `<div class="peg-rail" style="width:${this.m.colGap * cols + 120}px;left:${-(this.m.colGap * cols + 120) / 2}px"></div>`;
        const slots = [];
        for (let c = 0; c < cols; c++) {
          const s = document.createElement("div");
          s.className = "bag";
          s.innerHTML = `<div class="swing"><img class="shadow" alt="" draggable="false"><img class="prod" alt="" draggable="false"></div>
            <i class="peg"></i><div class="tag"></div>`;
          row.appendChild(s);
          slots.push({ el: s, swing: s.firstElementChild, shadow: s.querySelector(".shadow"), img: s.querySelector(".prod"), tag: s.querySelector(".tag"), spring: new CR.Spring(26 + c * 4, 2.4), idx: -1 });
        }
        this.world.appendChild(row);
        this.rows.push({ el: row, slots, r: null });
      }
    }
    // horizontal offset for column c in row r: alternate rows are staggered half a column
    colX(c, r) {
      const m = this.m;
      return (c - (m.cols - 1) / 2) * m.colGap + (mod(r, 2) ? m.colGap * 0.22 : -m.colGap * 0.22) * (m.phone ? 0.25 : 1);
    }
    assign(row, r) {
      row.r = r;
      const m = this.m;
      row.slots.forEach((s, c) => {
        const idx = mod(r * m.cols + c, this.n);
        if (s.idx === idx) return;
        s.idx = idx;
        const p = this.items[idx];
        s.el.dataset.i = idx;
        s.img.src = s.shadow.src = CR.asset(p.cut);
        s.img.alt = p.brand + " " + p.name;
        const a = p.cutAspect || 1;
        const w = Math.min(m.B * Math.sqrt(a) * 1.05, m.colGap * 0.86), h = w / a;
        const hh = Math.min(h, m.rowH * 0.78);
        const ww = hh * a;
        s.el.style.width = ww + "px";
        s.el.style.height = hh + "px";
        s.el.style.left = this.colX(c, r) - ww / 2 + "px";
        s.tag.innerHTML = `<b>${CR.esc(p.brand)}</b> ${CR.price(p)}`;
      });
    }
    tap(i, el) {
      if (i === null) return;
      const row = el && el.closest(".row");
      const r = row ? +row.dataset.r : null;
      if (r !== null && Math.abs(r - this.loop.pos) > 0.6) {
        this.loop.target = r;
        return;
      }
      this.open(i, el);
    }
    current() {
      const r = Math.round(this.loop.pos);
      return this.items[mod(r * this.m.cols + Math.floor((this.m.cols - 1) / 2), this.n)];
    }
    frame(dt) {
      this.loop.step(dt);
      const m = this.m, L = this.loop, base = Math.round(L.pos);
      for (let r = base - 3; r <= base + 3; r++) {
        const row = this.rows[mod(r, this.rows.length)];
        if (row.r !== r) {
          this.assign(row, r);
          row.el.dataset.r = r;
        }
        const d = r - L.pos, a = Math.abs(d);
        const ang = (d * m.rowH) / m.R;
        const y = m.R * Math.sin(ang), z = -m.R * (1 - Math.cos(ang));
        const p = smooth(clamp(1 - a, 0, 1));
        row.el.style.transform = `translate3d(0,${(y - m.rowH * 0.34).toFixed(1)}px,${(z + p * 30).toFixed(1)}px) rotateX(${(-deg(ang)).toFixed(2)}deg)`;
        row.el.style.opacity = clamp(3.2 - a, 0, 1).toFixed(3);
        row.el.style.setProperty("--pop", p.toFixed(3));
        row.el.style.zIndex = 100 - Math.round(a * 10);
        row.slots.forEach((s, c) => {
          const sw = CR.reducedMotion ? 0 : clamp(s.spring.step(dt, L.v * (c % 2 ? 9 : -9)), -7, 7);
          s.swing.style.transform = `rotate(${sw.toFixed(2)}deg)`;
        });
      }
    }
  }

  /* ================================================================= BOX */
  class Box extends Scene {
    build() {
      this.el.innerHTML = `
        <div class="backdrop box-room"><div class="spot"></div></div>
        <div class="stage"><div class="world">
          <div class="plane">
            <div class="lining"></div>
            <div class="wall back"></div>
            <div class="lid"><div class="lid-glass"></div></div>
            <div class="cells"></div>
            <div class="wall front"></div>
          </div>
          <div class="lifted"></div>
        </div></div>
        <div class="box-vignette"></div>
        <div class="caption caption--box" aria-live="polite"></div>`;
      this.world = this.el.querySelector(".world");
      this.plane = this.el.querySelector(".plane");
      this.cellsEl = this.el.querySelector(".cells");
      this.liftedEl = this.el.querySelector(".lifted");
      this.stage = this.el.querySelector(".stage");
      this.caption = this.el.querySelector(".caption");
      this.nodes = this.items.map((p, i) => {
        const c = document.createElement("div");
        c.className = "cell";
        c.dataset.i = i;
        c.innerHTML = `<div class="pillow"></div><i class="divider"></i>
          <img class="w-rest" src="${CR.asset(p.cut)}" alt="" draggable="false">
          <span class="plate">${CR.esc(p.brand)}</span>`;
        this.cellsEl.appendChild(c);
        const up = document.createElement("div");
        up.className = "up";
        up.dataset.i = i;
        up.innerHTML = `<i class="up-shadow"></i><img class="prod" src="${CR.asset(p.cut)}" alt="${CR.esc(p.brand + " " + p.name)}" draggable="false">`;
        this.liftedEl.appendChild(up);
        return { cell: c, up, rest: c.querySelector(".w-rest"), img: up.querySelector(".prod"), p };
      });
      this.makeLoop("x", () => this.m.cellW);
    }
    resize() {
      const vw = innerWidth, vh = innerHeight, phone = vw < 720;
      const cellW = phone ? vw * 0.46 : clamp(vw * 0.16, 170, 260);
      const D = phone ? cellW * 1.3 : cellW * 1.35;
      const m = (this.m = { phone, cellW, D, tilt: phone ? 46 : 52, wallH: cellW * 0.2, lift: phone ? cellW * 0.95 : cellW * 0.9 });
      this.stage.style.perspective = (phone ? 900 : 1400) + "px";
      const cy = phone ? vh * 0.5 : vh * 0.52;
      this.world.style.top = cy + "px";
      this.stage.style.perspectiveOrigin = `50% ${cy - vh * 0.18}px`;
      const long = Math.max(vw * 3, 3000);
      this.plane.style.transform = `rotateX(${m.tilt}deg)`;
      const set = (sel, css) => Object.assign(this.plane.querySelector(sel).style, css);
      set(".lining", { width: long + "px", height: D + "px", left: -long / 2 + "px", top: -D / 2 + "px" });
      set(".wall.front", { width: long + "px", height: m.wallH + "px", left: -long / 2 + "px", top: D / 2 - m.wallH / 2 + "px", transform: `translateZ(${m.wallH / 2}px) rotateX(-90deg)` });
      set(".wall.back", { width: long + "px", height: m.wallH + "px", left: -long / 2 + "px", top: -D / 2 - m.wallH / 2 + "px", transform: `translateZ(${m.wallH / 2}px) rotateX(-90deg)` });
      set(".lid", { width: long + "px", height: D * 0.92 + "px", left: -long / 2 + "px", top: -D / 2 - D * 0.92 + "px", transformOrigin: "50% 100%", transform: `translateZ(${m.wallH}px) rotateX(-${phone ? 64 : 72}deg)` });
      this.nodes.forEach((nd) => {
        const a = nd.p.cutAspect || 0.5;
        const c = nd.cell.style;
        c.width = cellW + "px"; c.height = D + "px"; c.left = -cellW / 2 + "px"; c.top = -D / 2 + "px";
        const hRest = D * 0.98, wRest = Math.min(hRest * a, cellW * 0.78);
        Object.assign(nd.rest.style, { width: wRest + "px", height: wRest / a + "px", left: (cellW - wRest) / 2 + "px", top: (D - wRest / a) / 2 + "px" });
        nd.divider = nd.cell.querySelector(".divider");
        Object.assign(nd.divider.style, { width: D + "px", height: m.wallH + "px", left: cellW - D / 2 + "px", top: D / 2 - m.wallH / 2 + "px", transform: `translateZ(${m.wallH / 2}px) rotateZ(90deg) rotateX(-90deg)` });
        const plate = nd.cell.querySelector(".plate");
        plate.style.transform = `translate3d(-50%, ${D - 6}px, ${m.wallH * 0.55}px) rotateX(-90deg)`;
        const upH = phone ? Math.min(vh * 0.33, cellW * 1.7) : Math.min(vh * 0.44, cellW * 2.0);
        const upW = Math.min(upH * a, cellW * 1.6);
        nd.upW = upW; nd.upH = upW / a;
        Object.assign(nd.up.style, { width: upW + "px", height: nd.upH + "px", left: -upW / 2 + "px", top: -nd.upH / 2 + "px" });
      });
      this.onCenter(this.loop.center);
    }
    onCenter(c) {
      this.setCaption(this.items[c]);
    }
    frame(dt) {
      this.loop.step(dt);
      this.t += dt;
      const m = this.m, L = this.loop, vis = m.phone ? 3.5 : 6;
      for (let i = 0; i < this.n; i++) {
        const nd = this.nodes[i];
        const d = L.offset(i), a = Math.abs(d);
        if (a > vis) {
          if (nd.vis !== false) { nd.cell.style.visibility = nd.up.style.visibility = "hidden"; nd.vis = false; }
          continue;
        }
        if (nd.vis !== true) { nd.cell.style.visibility = nd.up.style.visibility = "visible"; nd.vis = true; }
        const x = d * m.cellW;
        nd.cell.style.transform = `translate3d(${x.toFixed(1)}px,0,0)`;
        const p = smooth(clamp(1 - a * 1.35, 0, 1));
        nd.rest.style.opacity = (1 - p).toFixed(3);
        // lifted watch: rises out of its cushion and turns to face you
        if (p > 0.001) {
          const bob = CR.reducedMotion ? 0 : Math.sin(this.t * 1.6) * 4 * p;
          const t = m.tilt;
          const yScreen = -m.lift * 0.62 * p;
          nd.up.style.opacity = Math.min(1, p * 1.6).toFixed(3);
          nd.up.style.transform = `translate3d(${x.toFixed(1)}px, ${(yScreen + bob).toFixed(1)}px, ${(m.lift * 0.5 * p).toFixed(1)}px) rotateX(${(t * (1 - p)).toFixed(2)}deg) scale(${(0.62 + 0.38 * p).toFixed(4)})`;
          nd.up.style.setProperty("--lift", p.toFixed(3));
        } else if (nd.up.style.opacity !== "0") {
          nd.up.style.opacity = "0";
        }
      }
    }
  }

  /* ============================================================= VITRINE */
  class Vitrine extends Scene {
    build() {
      this.el.innerHTML = `
        <div class="backdrop stone"><div class="floor"></div><div class="spot"></div></div>
        <div class="stage"><div class="world"></div></div>
        <div class="caption" aria-live="polite"></div>`;
      this.world = this.el.querySelector(".world");
      this.stage = this.el.querySelector(".stage");
      this.caption = this.el.querySelector(".caption");
      this.nodes = this.items.map((p, i) => {
        const it = document.createElement("div");
        it.className = "plinth-it";
        it.dataset.i = i;
        it.innerHTML = `<div class="obj"><img class="shadow" src="${CR.asset(p.cut)}" alt="" draggable="false"><img class="prod" src="${CR.asset(p.cut)}" alt="${CR.esc(p.brand + " " + p.name)}" draggable="false"></div>
          <div class="plinth"><i class="wshadow"></i><i class="fshadow"></i><i class="glow"></i><i class="body"></i><i class="top"></i></div>`;
        this.world.appendChild(it);
        return { el: it, obj: it.firstElementChild, img: it.querySelector(".prod"), p, ph: (i * 1.7) % 6.28 };
      });
      this.makeLoop("x", () => this.m.gapS * 1.1);
    }
    resize() {
      const vw = innerWidth, vh = innerHeight, phone = vw < 720;
      const base = phone ? Math.min(vw * 0.52, vh * 0.3) : clamp(Math.min(vw * 0.15, vh * 0.28), 140, 260);
      const m = (this.m = {
        phone, base,
        gapC: phone ? base * 1.25 : base * 1.75,
        gapS: phone ? base * 0.95 : base * 1.22,
        R: phone ? vw * 1.1 : Math.max(640, vw * 0.52),
        floorY: phone ? vh * 0.6 : vh * 0.62,
        plW: base * 0.9,
        plH: phone ? vh * 0.2 : vh * 0.21,
        pop: phone ? 0.12 : 0.24,
      });
      this.stage.style.perspective = (phone ? 1000 : 1500) + "px";
      this.stage.style.perspectiveOrigin = `50% ${m.floorY - m.plH * 1.3}px`;
      this.world.style.top = m.floorY - m.plH + "px"; // world origin = top of plinths
      this.nodes.forEach((nd) => {
        const a = nd.p.cutAspect || 1;
        let w = base * Math.sqrt(a) * 0.98, h = w / a;
        if (h > base * 1.05) { h = base * 1.05; w = h * a; }
        if (w > base * 1.45) { w = base * 1.45; h = w / a; }
        nd.w = w; nd.h = h;
        Object.assign(nd.el.style, { width: m.plW + "px", left: -m.plW / 2 + "px", top: "0px" });
        Object.assign(nd.obj.style, { width: w + "px", height: h + "px", left: (m.plW - w) / 2 + "px", top: -h - m.plW * 0.08 + "px" });
        Object.assign(nd.el.querySelector(".plinth").style, { height: m.plH + "px" });
        nd.el.style.setProperty("--topH", m.plW * 0.2 + "px");
      });
      this.onCenter(this.loop.center);
    }
    onCenter(c) {
      this.setCaption(this.items[c]);
      if (this.m) this.caption.style.top = this.m.floorY + 22 + "px";
    }
    frame(dt) {
      this.loop.step(dt);
      this.t += dt;
      const m = this.m, L = this.loop, vis = m.phone ? 4 : 6.5;
      for (let i = 0; i < this.n; i++) {
        const nd = this.nodes[i];
        const d = L.offset(i), a = Math.abs(d);
        if (a > vis) {
          if (nd.vis !== false) { nd.el.style.visibility = "hidden"; nd.vis = false; }
          continue;
        }
        if (nd.vis !== true) { nd.el.style.visibility = "visible"; nd.vis = true; }
        const { x, z, ry } = arc(d, m.gapC, m.gapS, m.R);
        const p = smooth(clamp(1 - a, 0, 1));
        nd.el.style.transform = `translate3d(${x.toFixed(1)}px,0,${z.toFixed(1)}px) rotateY(${deg(ry).toFixed(2)}deg)`;
        nd.el.style.zIndex = 100 - Math.round(a * 10);
        nd.el.style.opacity = clamp(vis - a, 0, 1).toFixed(3);
        nd.el.style.setProperty("--pop", p.toFixed(3));
        const bob = CR.reducedMotion ? 0 : Math.sin(this.t * 1.3 + nd.ph) * (3 + 6 * p);
        const turn = CR.reducedMotion ? 0 : Math.sin(this.t * 0.6 + nd.ph) * 9 * p - L.v * 4;
        nd.obj.style.transform = `translate3d(0,${(bob - p * m.base * 0.12).toFixed(1)}px,0) rotateY(${turn.toFixed(2)}deg) scale(${(1 + m.pop * p).toFixed(4)})`;
      }
    }
  }

  CR.Scenes = { clothes: Rack, bags: Wall, watches: Box, accessories: Vitrine };
})();
