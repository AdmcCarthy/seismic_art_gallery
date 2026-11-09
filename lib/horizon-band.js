// The horizon band: a page header cut from real seismic, with its interpreted surfaces.
//
// Draws a `header` export (seismic_art.header) into an element as a wide, short canvas:
// amplitude as a soft texture in the page's shale ladder (positive dark, negative light,
// over the page's canvas colour), the interpreted surfaces as thin lines, the one the
// page is about in the highlight colour, and the band fading into the page at its
// ends and foot. Every colour is read from SubScout's tokens on the element at draw
// time, so the band follows the scheme and the palette like any other figure.
//
// Use as a plain module:
//   import { horizonBand } from "./lib/horizon-band.js";
//   const band = horizonBand(el, payload, { height: 160 });   // el gets a canvas
//   band.observe();                                            // redraw on resize/scheme
// or as a SubScout custom figure (default export, the story-figure contract).
const decode = (b64) => new Int8Array(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer);

export function horizonBand(el, P, { height = 160, highlight = P.highlight, fade = true, caption = true, strength = 0.9, gamma = 0.75 } = {}) {
  const n = P.n_traces, ns = P.n_samples, amp = decode(P.amp_b64);
  const t = P.samples, t0 = t[0], t1 = t[ns - 1];
  el.classList.add("hz-band");
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", `${P.label || P.title || "seismic section"}. ${P.attribution}`);
  let canvas = el.querySelector("canvas");
  if (!canvas) { canvas = document.createElement("canvas"); canvas.style.display = "block"; el.appendChild(canvas); }
  let lastW = 0;

  const tok = (name, fallback) => {
    const v = getComputedStyle(el).getPropertyValue(name).trim();
    return v || fallback;
  };
  const rgb = (css) => {
    // resolve any css colour through a scratch element
    const s = document.createElement("span");
    s.style.color = css; document.body.appendChild(s);
    const m = /rgba?\(([^)]+)\)/.exec(getComputedStyle(s).color) || [];
    document.body.removeChild(s);
    const p = (m[1] || "0,0,0").split(",").map(Number);
    return [p[0] || 0, p[1] || 0, p[2] || 0];
  };

  function draw(W) {
    if (!W) return;
    lastW = W;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pw = Math.round(W * dpr), ph = Math.round(height * dpr);
    canvas.width = pw; canvas.height = ph;
    canvas.style.width = `${W}px`; canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    const bg = rgb(tok("--ss-canvas", "#f3f7fb"));
    const dark = rgb(tok("--ss-data-seq-shale-7", "#272f35"));
    const light = rgb(tok("--ss-data-seq-shale-2", "#c2d0dc"));
    const img = ctx.createImageData(pw, ph);
    const d = img.data;
    const fx0 = 0.08 * pw, fy0 = 0.62 * ph;
    for (let y = 0; y < ph; y++) {
      const fj = (y / (ph - 1)) * (ns - 1), j0 = Math.min(Math.floor(fj), ns - 2), wj = fj - j0;
      const fy = fade ? (y < fy0 ? 1 : 1 - Math.pow((y - fy0) / (ph - fy0), 1.4)) : 1;
      for (let x = 0; x < pw; x++) {
        const fi = (x / (pw - 1)) * (n - 1), i0 = Math.min(Math.floor(fi), n - 2), wi = fi - i0;
        const a00 = amp[i0 * ns + j0], a01 = amp[i0 * ns + j0 + 1], a10 = amp[(i0 + 1) * ns + j0], a11 = amp[(i0 + 1) * ns + j0 + 1];
        const a = ((1 - wi) * ((1 - wj) * a00 + wj * a01) + wi * ((1 - wj) * a10 + wj * a11)) / 127;
        const fxl = fade ? Math.min(1, x / fx0, (pw - 1 - x) / fx0) : 1;
        const alpha = Math.min(1, Math.pow(Math.abs(a), gamma) * strength) * fy * Math.max(0, fxl);
        const ink = a > 0 ? dark : light;
        const o = (y * pw + x) * 4;
        d[o] = bg[0] + (ink[0] - bg[0]) * alpha;
        d[o + 1] = bg[1] + (ink[1] - bg[1]) * alpha;
        d[o + 2] = bg[2] + (ink[2] - bg[2]) * alpha;
        d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // the surfaces: thin lines; the page's own in the highlight colour, on top
    const X = (i) => ((i / (n - 1)) * (pw - 1)) / dpr;
    const Y = (tt) => (((tt - t0) / (t1 - t0)) * (ph - 1)) / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    const lineColour = tok("--ss-border-strong", "#596c7b"), hiColour = tok("--ss-data-highlight", "#cc6700");
    const ordered = [...P.surfaces.filter((s) => s.label !== highlight), ...P.surfaces.filter((s) => s.label === highlight)];
    ordered.forEach((s) => {
      const hi = s.label === highlight;
      ctx.strokeStyle = hi ? hiColour : lineColour;
      ctx.globalAlpha = hi ? 1 : 0.65;
      ctx.lineWidth = hi ? 1.8 : 0.9;
      ctx.beginPath();
      let pen = false;
      s.time.forEach((tt, i) => {
        if (tt == null || tt < t0 || tt > t1) { pen = false; return; }
        const x = X(i), y = Y(tt);
        const fxl = fade ? Math.min(1, x / (fx0 / dpr), (W - x) / (fx0 / dpr)) : 1;
        if (fxl <= 0.02) { pen = false; return; }
        pen ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        pen = true;
      });
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
    // the strong baseline: a hairline along the top edge, as the motif has
    ctx.strokeStyle = tok("--ss-border", "#95a7b6"); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, 0.5); ctx.lineTo(W, 0.5); ctx.stroke();
    if (caption && P.label) {
      ctx.font = `500 11px ${tok("--ss-font-body", "system-ui, sans-serif")}`;
      ctx.fillStyle = tok("--ss-text-muted", "#596c7b");
      ctx.textAlign = "left";
      ctx.fillText(P.label, 8, height - 8);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  const api = {
    draw,
    repaint: () => draw(lastW),
    observe() {
      new ResizeObserver(([e]) => { const nw = Math.round(e.contentRect.width); if (nw && nw !== lastW) draw(nw); }).observe(el);
      new MutationObserver(() => draw(lastW)).observe(document.documentElement, { attributes: true, attributeFilter: ["data-colour-scheme", "data-palette", "data-surface"] });
      return api;
    },
  };
  return api;
}

// SubScout custom-figure contract: (el, datasets, opts) => { draw(width, state, {animate}), repaint() }
export default function create(el, datasets, opts = {}) {
  const P = Object.values(datasets)[0];
  const band = horizonBand(el, P, (opts.spec && opts.spec.band) || {});
  return { draw: (W) => band.draw(W), repaint: () => band.repaint() };
}
