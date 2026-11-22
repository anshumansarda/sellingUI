/* Infinite loop input engine: wheel / trackpad, drag + flick, keys, taps, snapping.
   Position is measured in "items" (float). Scenes read loop.pos each frame. */
(function () {
  const CR = window.CR;

  class Loop {
    constructor(opts) {
      this.el = opts.el;
      this.axis = opts.axis || "x"; // which drag/scroll direction moves the loop
      this.count = opts.count;
      this.stepPx = opts.stepPx; // fn -> pixels per item when dragging
      this.onTap = opts.onTap || (() => {});
      this.onCenter = opts.onCenter || (() => {});
      this.pos = opts.start || 0;
      this.target = this.pos;
      this.v = 0; // items / s
      this.drag = null;
      this.wheelTimer = 0;
      this.lastCenter = null;
      this.enabled = true;
      this.interacted = false;
      this._bind();
    }

    get center() {
      return CR.mod(Math.round(this.pos), this.count);
    }

    // signed distance (items) of item i from the current position, wrapped to [-n/2, n/2)
    offset(i) {
      const n = this.count;
      let d = CR.mod(i - this.pos + n / 2, n) - n / 2;
      return d;
    }

    goTo(i, instant) {
      const n = this.count;
      const diff = CR.mod(i - this.target + n / 2, n) - n / 2;
      this.target = Math.round(this.target + diff);
      if (instant) {
        this.pos = this.target;
        this.v = 0;
      }
    }

    nudge(k) {
      this.target = Math.round(this.target) + k;
    }

    _touched() {
      if (!this.interacted) {
        this.interacted = true;
        this.el.dispatchEvent(new CustomEvent("loop:touched", { bubbles: true }));
      }
    }

    _bind() {
      const el = this.el;
      el.addEventListener(
        "wheel",
        (e) => {
          if (!this.enabled) return;
          e.preventDefault();
          let dx = e.deltaX, dy = e.deltaY;
          if (e.deltaMode === 1) { dx *= 16; dy *= 16; }
          // Use whichever direction the user is actually scrolling; both map to the loop.
          const d = Math.abs(dx) > Math.abs(dy) ? dx : dy;
          const step = this.stepPx();
          this.target += CR.clamp(d / step, -1.2, 1.2) * 0.85;
          this._touched();
          clearTimeout(this.wheelTimer);
          this.wheelTimer = setTimeout(() => (this.target = Math.round(this.target)), 140);
        },
        { passive: false }
      );

      el.addEventListener("pointerdown", (e) => {
        if (!this.enabled || e.button > 0) return;
        if (e.target.closest("[data-noloop]")) return;
        this.drag = {
          id: e.pointerId,
          x: e.clientX, y: e.clientY,
          pos0: this.pos,
          moved: 0,
          t0: performance.now(),
          samples: [[performance.now(), this.axis === "x" ? e.clientX : e.clientY]],
          target: e.target,
        };
      });
      window.addEventListener("pointermove", (e) => {
        const d = this.drag;
        if (!d || e.pointerId !== d.id) return;
        const delta = this.axis === "x" ? e.clientX - d.x : e.clientY - d.y;
        d.moved = Math.max(d.moved, Math.hypot(e.clientX - d.x, e.clientY - d.y));
        if (d.moved > 6) {
          if (!d.captured) {
            d.captured = true;
            try { this.el.setPointerCapture(e.pointerId); } catch (_) {}
            this.el.classList.add("is-dragging");
            this._touched();
          }
          const nextPos = d.pos0 - delta / this.stepPx();
          this.pos = nextPos;
          this.target = nextPos;
          const now = performance.now();
          d.samples.push([now, this.axis === "x" ? e.clientX : e.clientY]);
          if (d.samples.length > 6) d.samples.shift();
        }
      });
      const end = (e) => {
        const d = this.drag;
        if (!d || e.pointerId !== d.id) return;
        this.drag = null;
        this.el.classList.remove("is-dragging");
        if (d.moved <= 6 && performance.now() - d.t0 < 600) {
          const hit = d.target.closest && d.target.closest("[data-i]");
          this.onTap(hit ? +hit.dataset.i : null, hit, e);
          return;
        }
        // flick
        const s = d.samples;
        let vpx = 0;
        if (s.length > 1) {
          const [t1, p1] = s[0], [t2, p2] = s[s.length - 1];
          vpx = (p2 - p1) / Math.max(16, t2 - t1); // px per ms
        }
        const items = (-vpx * 260) / this.stepPx();
        this.target = Math.round(this.pos + CR.clamp(items, -7, 7));
        this.v = (-vpx * 1000) / this.stepPx() * 0.6;
      };
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
    }

    key(dir) {
      this._touched();
      this.nudge(dir);
    }

    step(dt) {
      if (!this.drag) {
        const k = 70, c = 2 * Math.sqrt(k) * 1.02;
        const a = k * (this.target - this.pos) - c * this.v;
        this.v += a * dt;
        this.pos += this.v * dt;
        if (Math.abs(this.target - this.pos) < 0.0004 && Math.abs(this.v) < 0.002) {
          this.pos = this.target;
          this.v = 0;
        }
      } else {
        // derive velocity while dragging, for physics (swing)
        this.v = this._lastPos === undefined ? 0 : (this.pos - this._lastPos) / Math.max(dt, 1 / 240);
      }
      this._lastPos = this.pos;
      const c = this.center;
      if (c !== this.lastCenter) {
        this.lastCenter = c;
        this.onCenter(c);
      }
    }

    get settled() {
      return !this.drag && this.pos === this.target;
    }
  }

  CR.Loop = Loop;

  /* Damped spring for swinging hangers etc. */
  class Spring {
    constructor(k = 38, damp = 3.2) {
      this.k = k; this.damp = damp; this.x = 0; this.v = 0;
    }
    step(dt, force) {
      const a = -this.k * this.x - this.damp * this.v + force;
      this.v += a * dt;
      this.x += this.v * dt;
      return this.x;
    }
  }
  CR.Spring = Spring;
})();
