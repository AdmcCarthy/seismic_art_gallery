// Shared helpers for the sketches. Needs d3 (loaded first).
//
// URL options understood by the sketches:
//   ?scale=N      render the canvas at N device pixels per css pixel (print resolution),
//                 limited to what the browser can allocate
//   ?size=WxH     fixed layout size in css pixels instead of the window size
//   ?print=1      draw the caption onto the canvas, so the canvas is exactly the
//                 deliverable (the HTML caption is kept only to reserve the space)
//   ?theme=dark|paper   dark (default) or a light "paper" style for printing on white
//   ?data=PATH    another export to load
// Cities also understands ?annot=N ?akey=FEATURE ?astyle=clean|boxed (static callouts)
// and ?format=svg (show the SVG export in place of the canvas); press v to save SVG.
(function (global) {
  const Art = {};
  const MAX_SIDE = 16384, MAX_AREA = 2.0e8; // conservative browser canvas limits
  const FONT = "system-ui, 'Segoe UI', Helvetica, Arial, sans-serif";

  Art.param = (name, fallback) => {
    const v = new URLSearchParams(location.search).get(name);
    return v === null ? fallback : v;
  };

  Art.load = async (url) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Could not load ${url} (${r.status})`);
    return r.json();
  };

  // ---- themes -----------------------------------------------------------------
  // blend: how overlapping lines combine. Dark uses additive light; paper uses plain
  // alpha. ink() darkens a colour that was chosen for a dark background.
  const THEMES = {
    dark: {
      name: "dark", bg: "#0b0d12", fg: "#e6e9ef", dim: "#9aa3b2", faint: "#6c7686",
      panel: "rgba(11,13,18,0.78)", blend: "lighter", ink: (c) => c, spokeAlpha: 0.5, diskAlpha: [0.1, 0.02],
    },
    paper: {
      name: "paper", bg: "#f5f1e8", fg: "#1d232e", dim: "#4a5262", faint: "#767d8c",
      panel: "rgba(245,241,232,0.85)", blend: "source-over",
      ink: (c) => d3.color(c).darker(1.3).formatRgb(), spokeAlpha: 0.8, diskAlpha: [0.14, 0.05],
    },
  };
  Art.theme = THEMES[Art.param("theme", "dark")] || THEMES.dark;
  document.documentElement.dataset.theme = Art.theme.name;

  Art.printMode = Art.param("print", "0") === "1";
  if (Art.printMode) {
    // the canvas is the deliverable: no interface text on top of it
    document.addEventListener("DOMContentLoaded", () => {
      const hint = document.getElementById("hint");
      if (hint) hint.style.display = "none";
    });
  }

  // Layout size in css pixels: ?size=WxH, else the window.
  Art.size = () => {
    const m = /^(\d+)x(\d+)$/.exec(Art.param("size", ""));
    if (m) {
      document.body.style.overflow = "auto";
      return { W: +m[1], H: +m[2] };
    }
    return { W: window.innerWidth, H: window.innerHeight };
  };

  // A canvas of css size w x h, drawn at a device pixel ratio: ?scale=N if given, else
  // the display's (capped at 2). Never beyond the browser's canvas limits.
  Art.fit = (canvas, w, h) => {
    const wanted = +Art.param("scale", 0) || Math.min(window.devicePixelRatio || 1, 2);
    const dpr = Math.max(0.25, Math.min(wanted, MAX_SIDE / Math.max(w, h), Math.sqrt(MAX_AREA / (w * h))));
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    canvas._dpr = dpr;
    return { ctx, dpr };
  };

  // Small seeded generator so a sketch renders identically every time.
  Art.rng = (seed) => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  Art.domainLabel = (d) => {
    const axis = d.vertical === "time" ? "TWT" : "Depth";
    const ref = d.reference ? " " + d.reference : "";
    const q = d.quantity === "other" ? d.quantity_name : d.quantity;
    return `${axis}${ref} [${d.vertical_unit}] · ${q} [${d.quantity_unit}] (${d.origin})`;
  };

  // ---- caption: what, whose, how it was decided ------------------------------
  Art.captionParts = (payload, lines) => ({
    title: payload.title || "",
    lines: [
      ...lines,
      `${Art.domainLabel(payload.domain)} · polarity: ${payload.polarity}`,
      `${payload.attribution} · source: ${payload.source_label ? `${payload.source_label} (${payload.source_file})` : payload.source_file}`,
    ],
    notes: (payload.notes || []).slice(0, 4).join(" · "),
  });

  Art.caption = (el, payload, lines) => {
    const p = Art.captionParts(payload, lines);
    Art._last = p;
    const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    el.innerHTML =
      `<strong>${esc(p.title)}</strong><br>` +
      p.lines.map(esc).join("<br>") +
      `<br><span class="dim">${esc(p.notes)}</span>`;
    // in print mode the canvas carries the caption; keep this element only so layout
    // code that measures it still reserves the room
    if (Art.printMode) el.style.visibility = "hidden";
  };

  // Draw the last caption bottom-left onto a canvas or SVG context (css units).
  Art.drawCaption = (ctx, W, H) => {
    const p = Art._last, th = Art.theme;
    if (!p) return;
    const maxW = Math.min(W - 32, 470), lh = 17;
    ctx.save();
    ctx.textAlign = "left";
    const wrap = (text, font) => {
      ctx.font = font;
      const out = [];
      let line = "";
      for (const word of text.split(/\s+/)) {
        const test = line ? line + " " + word : word;
        if (ctx.measureText(test).width > maxW && line) { out.push(line); line = word; } else line = test;
      }
      if (line) out.push(line);
      return out;
    };
    const bold = `600 13px ${FONT}`, plain = `12px ${FONT}`;
    const rows = [];
    wrap(p.title, bold).forEach((t) => rows.push([t, bold, th.fg]));
    p.lines.forEach((l) => wrap(l, plain).forEach((t) => rows.push([t, plain, th.dim])));
    wrap(p.notes, plain).forEach((t) => rows.push([t, plain, th.faint]));
    const y0 = H - 12 - (rows.length - 1) * lh;
    ctx.fillStyle = th.panel;
    ctx.fillRect(8, y0 - 16, maxW + 16, rows.length * lh + 10);
    rows.forEach(([t, font, colour], i) => {
      ctx.font = font; ctx.fillStyle = colour; ctx.fillText(t, 16, y0 + i * lh);
    });
    ctx.restore();
  };

  // Every sketch calls this last: in print mode the caption goes onto the canvas.
  Art.finish = (ctx, W, H) => { if (Art.printMode) Art.drawCaption(ctx, W, H); };

  // ---- static annotations (callouts) -----------------------------------------
  // items: [{x, y, r, lines:[text...]}] anchored on a circle of radius r. Each label is
  // placed at the best of eight directions: inside the canvas, off the other labels and
  // off the circles in `obstacles` ({x, y, r}). Style: ?astyle=clean (text with a halo)
  // or boxed (text on a panel). Leader line, anchor dot and colours follow the theme.
  Art.annotate = (ctx, W, H, items, obstacles, styleDefault = "clean") => {
    const th = Art.theme, style = Art.param("astyle", styleDefault);
    const font = `11.5px ${FONT}`, strong = `600 11.5px ${FONT}`, lh = 14;
    const gaps = [16, 36, 60]; // how far from the city a label may sit, nearest first
    ctx.save();
    ctx.textAlign = "left";
    const placed = [];
    const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
      Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    const angles = [-45, 45, -135, 135, 0, 180, -90, 90].map((d) => (d * Math.PI) / 180);
    items.forEach((it) => {
      ctx.font = strong;
      const w = d3.max(it.lines.map((l, i) => { ctx.font = i ? font : strong; return ctx.measureText(l).width; })) + 10;
      const h = it.lines.length * lh + 6;
      let best = null;
      gaps.forEach((gap) => angles.forEach((a) => {
        const ca = Math.cos(a), sa = Math.sin(a);
        const ax = it.x + it.r * ca, ay = it.y + it.r * sa;
        const box = {
          x: ax + ca * gap + (ca < -0.2 ? -w : ca > 0.2 ? 0 : -w / 2),
          y: ay + sa * gap + (sa < -0.2 ? -h : sa > 0.2 ? 0 : -h / 2),
          w, h,
        };
        let score = 0;
        if (box.x < 4 || box.y < 4 || box.x + w > W - 4 || box.y + h > H - 4) score += 1e6;
        placed.forEach((p) => { score += overlap(box, p) * 4; });
        obstacles.forEach((o) => {
          const dx = Math.max(box.x - o.x, 0, o.x - (box.x + w)), dy = Math.max(box.y - o.y, 0, o.y - (box.y + h));
          const d = Math.hypot(dx, dy);
          if (d < o.r && !(o.x === it.x && o.y === it.y)) score += (o.r - d) * 200;
        });
        score += Math.abs(a + Math.PI / 4) * 2 + gap * 0.4; // prefer the upper right, and close
        if (!best || score < best.score) best = { score, box, ax, ay };
      }));
      const { box, ax, ay } = best;
      placed.push(box);
      const lx = Math.max(box.x, Math.min(ax, box.x + box.w)), ly = Math.max(box.y, Math.min(ay, box.y + box.h));
      ctx.strokeStyle = th.dim; ctx.lineWidth = 0.8; ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(lx, ly); ctx.stroke();
      ctx.fillStyle = th.fg;
      ctx.beginPath(); ctx.arc(ax, ay, 2.2, 0, 2 * Math.PI); ctx.fill();
      if (style === "boxed") {
        ctx.fillStyle = th.panel; ctx.fillRect(box.x, box.y, box.w, box.h);
        ctx.strokeStyle = th.faint; ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.rect(box.x, box.y, box.w, box.h); ctx.stroke();
      }
      it.lines.forEach((l, i) => {
        const tx = box.x + 5, ty = box.y + 3 + (i + 1) * lh - 4;
        ctx.font = i ? font : strong;
        if (style !== "boxed") {
          ctx.strokeStyle = th.bg; ctx.lineWidth = 3.2; ctx.lineJoin = "round";
          ctx.strokeText(l, tx, ty);
        }
        ctx.fillStyle = i ? th.dim : th.fg;
        ctx.fillText(l, tx, ty);
      });
    });
    ctx.restore();
  };

  // ---- SVG recorder -----------------------------------------------------------
  // Offers the part of the Canvas 2D API the sketches use and writes SVG instead, so one
  // drawing routine gives both a raster canvas and a vector file. Not supported: images,
  // rotation/scaling transforms, clipping. Additive blending ('lighter') is written as
  // mix-blend-mode:screen, which browsers and Inkscape honour but Illustrator ignores;
  // ?svgblend=normal writes plain alpha instead.
  class SvgCtx {
    constructor(W, H) {
      this.isSvg = true; // lets a sketch choose a vector-friendly way to draw
      this.W = W; this.H = H; this.out = []; this.defs = []; this.stack = []; this.d = [];
      this.tx = 0; this.ty = 0; this.gid = 0;
      this.fillStyle = "#000"; this.strokeStyle = "#000"; this.lineWidth = 1; this.globalAlpha = 1;
      this.globalCompositeOperation = "source-over"; this.font = "10px sans-serif";
      this.textAlign = "left"; this.lineCap = "butt"; this.lineJoin = "miter";
      this._m = document.createElement("canvas").getContext("2d");
      this.meta = { title: "", desc: "" };
    }
    static f(n) { return (+n).toFixed(2).replace(/\.?0+$/, ""); }
    save() { this.stack.push([this.fillStyle, this.strokeStyle, this.lineWidth, this.globalAlpha, this.globalCompositeOperation, this.font, this.textAlign, this.lineCap, this.lineJoin, this.tx, this.ty]); }
    restore() { [this.fillStyle, this.strokeStyle, this.lineWidth, this.globalAlpha, this.globalCompositeOperation, this.font, this.textAlign, this.lineCap, this.lineJoin, this.tx, this.ty] = this.stack.pop(); }
    translate(x, y) { this.tx += x; this.ty += y; }
    setTransform() { throw new Error("SvgCtx: setTransform is not supported"); }
    beginPath() { this.d = []; }
    moveTo(x, y) { this.d.push(`M${SvgCtx.f(x + this.tx)} ${SvgCtx.f(y + this.ty)}`); }
    lineTo(x, y) { this.d.push(`L${SvgCtx.f(x + this.tx)} ${SvgCtx.f(y + this.ty)}`); }
    bezierCurveTo(x1, y1, x2, y2, x, y) {
      const f = SvgCtx.f, X = this.tx, Y = this.ty;
      this.d.push(`C${f(x1 + X)} ${f(y1 + Y)} ${f(x2 + X)} ${f(y2 + Y)} ${f(x + X)} ${f(y + Y)}`);
    }
    closePath() { this.d.push("Z"); }
    rect(x, y, w, h) { this.moveTo(x, y); this.lineTo(x + w, y); this.lineTo(x + w, y + h); this.lineTo(x, y + h); this.closePath(); }
    arc(x, y, r, a0, a1, anticlockwise = false) {
      const f = SvgCtx.f, X = x + this.tx, Y = y + this.ty;
      const full = Math.abs(a1 - a0) >= 2 * Math.PI - 1e-9;
      const sx = X + r * Math.cos(a0), sy = Y + r * Math.sin(a0);
      this.d.push(this.d.length ? `L${f(sx)} ${f(sy)}` : `M${f(sx)} ${f(sy)}`);
      if (full) {
        this.d.push(`A${f(r)} ${f(r)} 0 1 1 ${f(X - r * Math.cos(a0))} ${f(Y - r * Math.sin(a0))}`);
        this.d.push(`A${f(r)} ${f(r)} 0 1 1 ${f(sx)} ${f(sy)}`);
      } else {
        let sweep = a1 - a0;
        if (!anticlockwise && sweep < 0) sweep += 2 * Math.PI;
        if (anticlockwise && sweep > 0) sweep -= 2 * Math.PI;
        this.d.push(`A${f(r)} ${f(r)} 0 ${Math.abs(sweep) > Math.PI ? 1 : 0} ${anticlockwise ? 0 : 1} ${f(X + r * Math.cos(a1))} ${f(Y + r * Math.sin(a1))}`);
      }
    }
    createRadialGradient(x0, y0, r0, x1, y1, r1) {
      return { kind: "radial", x0, y0, r0, x1, y1, r1, stops: [], addColorStop(o, c) { this.stops.push([o, c]); } };
    }
    measureText(t) { this._m.font = this.font; return this._m.measureText(t); }
    _colour(style, alpha) {
      const c = d3.color(style);
      if (!c) return { c: "#000", o: alpha };
      return { c: `rgb(${c.r},${c.g},${c.b})`, o: +(c.opacity * alpha).toFixed(4) };
    }
    _blend() {
      return this.globalCompositeOperation === "lighter" && Art.param("svgblend", "screen") !== "normal"
        ? ' style="mix-blend-mode:screen"' : "";
    }
    _fillAttr() {
      if (typeof this.fillStyle === "object") {
        const g = this.fillStyle, id = `g${this.gid++}`, f = SvgCtx.f;
        this.defs.push(`<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${f(g.x1 + this.tx)}" cy="${f(g.y1 + this.ty)}" r="${f(g.r1)}" fx="${f(g.x0 + this.tx)}" fy="${f(g.y0 + this.ty)}">` +
          g.stops.map(([o, c]) => { const k = this._colour(c, 1); return `<stop offset="${o}" stop-color="${k.c}" stop-opacity="${k.o}"/>`; }).join("") + "</radialGradient>");
        return `fill="url(#${id})" fill-opacity="${this.globalAlpha}"`;
      }
      const k = this._colour(this.fillStyle, this.globalAlpha);
      return `fill="${k.c}" fill-opacity="${k.o}"`;
    }
    fill(rule) {
      if (!this.d.length) return;
      const r = rule === "evenodd" ? ' fill-rule="evenodd"' : "";
      this.out.push(`<path d="${this.d.join(" ")}" ${this._fillAttr()}${r} stroke="none"${this._blend()}/>`);
    }
    stroke() {
      if (!this.d.length) return;
      const k = this._colour(this.strokeStyle, this.globalAlpha);
      this.out.push(`<path d="${this.d.join(" ")}" fill="none" stroke="${k.c}" stroke-opacity="${k.o}" stroke-width="${SvgCtx.f(this.lineWidth)}" stroke-linecap="${this.lineCap}" stroke-linejoin="${this.lineJoin === "miter" ? "miter" : "round"}"${this._blend()}/>`);
    }
    fillRect(x, y, w, h) {
      this.out.push(`<rect x="${SvgCtx.f(x + this.tx)}" y="${SvgCtx.f(y + this.ty)}" width="${SvgCtx.f(w)}" height="${SvgCtx.f(h)}" ${this._fillAttr()}${this._blend()}/>`);
    }
    _text(t, x, y, attrs) {
      const m = /(?:(\d{3}|bold|normal)\s+)?(\d+(?:\.\d+)?)px\s+(.*)/.exec(this.font) || [];
      const anchor = { left: "start", start: "start", center: "middle", right: "end", end: "end" }[this.textAlign] || "start";
      const esc = String(t).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
      const fam = (m[3] || "sans-serif").replace(/"/g, "'");
      this.out.push(`<text x="${SvgCtx.f(x + this.tx)}" y="${SvgCtx.f(y + this.ty)}" font-family="${fam}" font-size="${m[2] || 10}" font-weight="${m[1] || "normal"}" text-anchor="${anchor}" ${attrs}>${esc}</text>`);
    }
    fillText(t, x, y) { this._text(t, x, y, `${this._fillAttr()} stroke="none"`); }
    strokeText(t, x, y) {
      const k = this._colour(this.strokeStyle, this.globalAlpha);
      this._text(t, x, y, `fill="none" stroke="${k.c}" stroke-opacity="${k.o}" stroke-width="${SvgCtx.f(this.lineWidth)}" stroke-linejoin="round"`);
    }
    toString() {
      const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
      return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${this.W}" height="${this.H}" viewBox="0 0 ${this.W} ${this.H}">\n` +
        `<title>${esc(this.meta.title)}</title>\n<desc>${esc(this.meta.desc)}</desc>\n<defs>${this.defs.join("")}</defs>\n${this.out.join("\n")}\n</svg>\n`;
    }
  }
  Art.svg = (W, H) => new SvgCtx(W, H);

  // ---- saving -----------------------------------------------------------------
  Art.saveBlob = (blob, name) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  Art.saveText = (text, name, mime) => Art.saveBlob(new Blob([text], { type: mime }), name);

  // Save the canvas as PNG. Outside print mode the caption is composited in first, so
  // an exported image always carries its attribution and polarity statement.
  Art.savePNG = (canvas, name) => {
    let target = canvas;
    if (!Art.printMode && Art._last) {
      target = document.createElement("canvas");
      target.width = canvas.width;
      target.height = canvas.height;
      const ctx = target.getContext("2d");
      const dpr = canvas._dpr || 1;
      ctx.drawImage(canvas, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      Art.drawCaption(ctx, canvas.width / dpr, canvas.height / dpr);
    }
    target.toBlob((blob) => Art.saveBlob(blob, name));
  };

  global.Art = Art;
})(window);
