// Concept G: one thread.
// Every trace of the survey, in file order, laid end to end along one Archimedean
// spiral: along the thread = trace order (inline after inline), across it = time within
// a thin slab, colour = amplitude. The spiral is painted per pixel by inverting the
// spiral (which turn, how far along, how far across), as the rings sketch does, so it
// has no SVG. Ticks mark inlines; callouts name the brightest traces and the loudest and
// quietest inline, from numbers in the export.
(async function () {
  const canvas = document.getElementById("c");
  const captionEl = document.getElementById("caption");
  let P;
  try {
    P = await Art.load(Art.param("data", "data/synthetic/thread.json"));
  } catch (e) {
    document.getElementById("error").textContent = String(e);
    return;
  }
  const th = Art.theme, paper = th.name === "paper";
  const FONT = "system-ui, 'Segoe UI', Helvetica, Arial, sans-serif";
  const [N, M] = P.shape;
  const decode = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const amp = new Int8Array(decode(P.amp_b64).buffer);
  const inline = new Int32Array(decode(P.inline_b64).buffer);
  const crossline = new Int32Array(decode(P.crossline_b64).buffer);
  const gamma = +Art.param("gamma", 1.2);
  const pitch = +Art.param("pitch", 9); // css px per turn (the slab's width)
  const nAnnot = +Art.param("annot", 4);
  const u = (P.domain && P.domain.vertical_unit) || "", axis = P.domain && P.domain.vertical === "time" ? "TWT" : "depth";
  const stops = d3.scaleLinear().domain([-1, -0.5, 0, 0.5, 1])
    .range(paper ? ["#12376b", "#6fa3cf", th.bg, "#e0a566", "#7a2f08"] : ["#8fd8ff", "#1d5f9c", "#0e1118", "#c9772a", "#ffeab0"])
    .interpolate(d3.interpolateLab);
  const LUT = new Uint8ClampedArray(513 * 3);
  for (let i = 0; i <= 512; i++) { const c = d3.rgb(stops(i / 256 - 1)); LUT[i * 3] = c.r; LUT[i * 3 + 1] = c.g; LUT[i * 3 + 2] = c.b; }
  const shape = (v) => Math.sign(v) * Math.pow(Math.abs(v), gamma);

  // spiral geometry: r = rIn + b * theta, b = pitch / 2 pi; arc length s = rIn theta + b theta^2 / 2
  function geometry(W, H) {
    const cy = (H - 150) / 2 + 8, cx = W / 2;
    const Rmax = Math.min(W / 2 - 20, cy - 10);
    const rIn = 3 * pitch, b = pitch / (2 * Math.PI);
    const Ltot = (Rmax * Rmax - rIn * rIn) / (2 * b); // arc length to the outer edge
    const ds = Ltot / N;                               // css px per trace
    const thetaOf = (s) => (-rIn + Math.sqrt(rIn * rIn + 2 * b * s)) / b;
    const point = (s, across = 0) => { const t = thetaOf(s), r = rIn + b * t + across; return [cx + r * Math.cos(t), cy - r * Math.sin(t)]; };
    return { cx, cy, Rmax, rIn, b, ds, thetaOf, point };
  }

  function captionLines() {
    const lines = [
      `One thread: all ${N.toLocaleString("en-GB")} traces of the survey${P.stride > 1 ? ` (every ${P.stride}th)` : ""} in file order, wound along one spiral from the centre outwards; across the thread = ${axis} ${P.samples[0]} to ${P.samples[M - 1]} ${u} (a fixed slab, not a horizon); colour = amplitude (relative)`,
      `the rhythm along the thread is the inline length (${P.inlines[0].n} traces): ${P.inlines.length} inlines, ticks every few; where the structure dips the slab cuts other layers`,
    ];
    if (nAnnot) lines.push("callouts: the brightest traces in the slab (RMS) and the loudest and quietest inline, from the export");
    return lines;
  }

  function paint(ctx, W, H, dpr) {
    ctx.fillStyle = th.bg;
    ctx.fillRect(0, 0, W, H);
    const G = geometry(W, H);
    const { cx, cy, Rmax, rIn, b, ds } = G;
    const TAU = 2 * Math.PI;
    const pw = Math.round(2 * Rmax * dpr) + 2;
    const px0 = Math.round((cx - Rmax) * dpr) - 1, py0 = Math.round((cy - Rmax) * dpr) - 1;
    const img = ctx.createImageData(pw, pw), d = img.data, mid = pw / 2;
    for (let y = 0; y < pw; y++) {
      for (let x = 0; x < pw; x++) {
        const dx = (x - mid) / dpr, dy = (mid - y) / dpr;
        const rho = Math.hypot(dx, dy), o = (y * pw + x) * 4;
        if (rho < rIn - pitch / 2 || rho > Rmax) { d[o + 3] = 0; continue; }
        let phi = Math.atan2(dy, dx); if (phi < 0) phi += TAU;
        const n = Math.round((rho - rIn - b * phi) / pitch);
        const theta = phi + TAU * n;
        if (theta < 0) { d[o + 3] = 0; continue; }
        const across = rho - (rIn + b * theta);
        const s = rIn * theta + (b * theta * theta) / 2;
        const i = Math.floor(s / ds);
        if (i < 0 || i >= N) { d[o + 3] = 0; continue; }
        const fj = ((across + pitch / 2) / pitch) * (M - 1);
        const j0 = Math.max(0, Math.min(M - 2, Math.floor(fj))), w = Math.max(0, Math.min(1, fj - j0));
        const v = ((1 - w) * amp[i * M + j0] + w * amp[i * M + j0 + 1]) / 127;
        const li = Math.round((shape(Math.max(-1, Math.min(1, v))) + 1) * 256) * 3;
        d[o] = LUT[li]; d[o + 1] = LUT[li + 1]; d[o + 2] = LUT[li + 2]; d[o + 3] = 255;
      }
    }
    const off = document.createElement("canvas");
    off.width = off.height = pw;
    off.getContext("2d").putImageData(img, 0, 0);
    ctx.drawImage(off, px0 / dpr, py0 / dpr, pw / dpr, pw / dpr);

    // inline ticks on the outer edge of the thread
    const every = Math.max(1, Math.round(P.inlines.length / 14));
    ctx.font = `10px ${FONT}`;
    ctx.strokeStyle = paper ? "rgba(29,35,46,0.6)" : "rgba(230,233,239,0.55)";
    ctx.fillStyle = th.dim;
    ctx.lineWidth = 0.8;
    P.inlines.forEach((r, k) => {
      if (k % every) return;
      const [x1, y1] = G.point(r.start * ds, pitch / 2), [x2, y2] = G.point(r.start * ds, pitch / 2 + 6);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      const [tx, ty] = G.point(r.start * ds, pitch / 2 + 9);
      ctx.textAlign = tx > cx ? "left" : "right";
      ctx.fillText(`${r.inline}`, tx, ty + 3);
    });
    ctx.textAlign = "left";

    // callouts
    if (nAnnot) {
      const items = [];
      const [sx, sy] = G.point(0);
      items.push({ x: sx, y: sy, r: 6, lines: [`thread starts: inline ${P.inlines[0].inline}`, `${P.inlines[0].n} traces per inline`] });
      P.brightest.slice(0, Math.max(0, nAnnot - 2)).forEach((t, k) => {
        const [x, y] = G.point(t.index * ds);
        items.push({ x, y, r: 5, lines: [`${k ? "" : "brightest trace: "}IL ${t.inline} / XL ${t.crossline}`, `slab RMS ${t.rms.toFixed(3)} (x${(t.rms / P.rms_median).toFixed(1)} the median trace)`] });
      });
      [["loudest", P.loudest_inline, "up"], ["quietest", P.quietest_inline, "down"]].forEach(([word, r, mark]) => {
        const [x, y] = G.point((r.start + r.n / 2) * ds);
        items.push({ x, y, r: 5, mark, lines: [`${mark === "up" ? "▲" : "▼"} ${word} inline: ${r.inline}`, `mean slab RMS ${r.mean_rms.toFixed(3)} (x${(r.mean_rms / P.rms_median).toFixed(1)} the median trace)`] });
      });
      ctx.strokeStyle = th.fg; ctx.lineWidth = 1.2;
      items.forEach((it) => { ctx.beginPath(); ctx.arc(it.x, it.y, it.r + 2, 0, TAU); ctx.stroke(); });
      Art.annotate(ctx, W, H, items.slice(0, nAnnot + 1), items.map((it) => ({ x: it.x, y: it.y, r: 10 })), "boxed");
    }

    // key
    const kx = W - 16, ky = H - 16, kw = 150;
    for (let i = 0; i < kw; i++) { ctx.fillStyle = stops(-1 + (2 * i) / (kw - 1)); ctx.fillRect(kx - kw + i, ky - 10, 1.5, 6); }
    ctx.font = `11px ${FONT}`; ctx.fillStyle = th.dim; ctx.textAlign = "right";
    ctx.fillText("colour: amplitude, negative to positive (relative)", kx, ky - 16);
    ctx.textAlign = "left";
  }

  function render() {
    const { W, H } = Art.size();
    Art.caption(captionEl, P, captionLines());
    const { ctx, dpr } = Art.fit(canvas, W, H);
    paint(ctx, W, H, dpr);
    Art.finish(ctx, W, H);
  }

  render();
  window.addEventListener("resize", render);
  window.addEventListener("keydown", (e) => {
    if (e.key === "s") Art.savePNG(canvas, "one-thread.png");
  });
})();
