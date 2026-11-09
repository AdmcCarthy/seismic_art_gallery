// Concept A: seismic rings.
// A closed circle through the survey, wrapped into polar form: angle = position along
// the circle, radius = time. Layers become tree rings; lateral changes bend and
// brighten them. Amplitude is relative; the caption states domain and polarity.
(async function () {
  const canvas = document.getElementById("c");
  const captionEl = document.getElementById("caption");
  let P;
  try {
    P = await Art.load(Art.param("data", "data/synthetic/rings.json"));
  } catch (e) {
    document.getElementById("error").textContent = String(e);
    return;
  }

  let ringNo = Math.min(Math.max(+Art.param("ring", 1), 1), P.rings.length) - 1;
  // modes: image, wiggle; with a second vintage in the export (rings_pair) also
  // double (both vintages as two inks on one ring) and breathe (a slow cross-fade)
  const hasPair = !!(P.pair && P.rings[0].monitor_amp);
  let mode = Art.param("mode", hasPair ? "double" : "image");
  if (!hasPair && (mode === "double" || mode === "breathe")) mode = "image";
  // gamma > 1 suppresses weak amplitudes (noise) so strong reflectors stand out
  const gamma = +Art.param("gamma", 1.4);
  const ns = P.samples.length;
  let animation = null;

  // Uniform polar raster [theta][sample] from the (slightly uneven) traces, wrapped.
  function polarRaster(ring, key) {
    const nT = ring.n_traces;
    const nTheta = Math.max(720, nT * 2);
    const raster = new Float32Array(nTheta * ns);
    const a = ring.angles, amp = ring[key];
    const TAU = 2 * Math.PI;
    let k = 0;
    for (let t = 0; t < nTheta; t++) {
      const th = (TAU * t) / nTheta;
      while (k + 1 < nT && a[k + 1] <= th) k++;
      const k1 = (k + 1) % nT;
      const a0 = a[k];
      const a1 = k + 1 < nT ? a[k + 1] : a[0] + TAU;
      const w = a1 > a0 ? Math.min(Math.max((th - a0) / (a1 - a0), 0), 1) : 0;
      const A = amp[k], B = amp[k1];
      for (let j = 0; j < ns; j++) raster[t * ns + j] = ((1 - w) * A[j] + w * B[j]) / 127;
    }
    return { raster, nTheta };
  }
  const cache = new Map();
  const polar = (i, key = "amp") => {
    const id = `${i}:${key}`;
    if (!cache.has(id)) cache.set(id, polarRaster(P.rings[i], key));
    return cache.get(id);
  };

  // Colour: strong negative cyan, zero ~ background, strong positive cream-gold.
  // Paper theme: zero is the paper colour, strong amplitudes are dark blue and brown.
  const th = Art.theme, paper = th.name === "paper";
  const stops = d3.scaleLinear()
    .domain([-1, -0.5, 0, 0.5, 1])
    .range(paper
      ? ["#12376b", "#6fa3cf", th.bg, "#e0a566", "#7a2f08"]
      : ["#8fd8ff", "#1d5f9c", "#0e1118", "#c9772a", "#ffeab0"])
    .interpolate(d3.interpolateLab);
  const LUT = new Uint8ClampedArray(513 * 3);
  for (let i = 0; i <= 512; i++) {
    const c = d3.rgb(stops(i / 256 - 1));
    LUT[i * 3] = c.r; LUT[i * 3 + 1] = c.g; LUT[i * 3 + 2] = c.b;
  }
  const shape = (v) => Math.sign(v) * Math.pow(Math.abs(v), gamma);

  // Vector version of the image: the polar raster cut into LEVELS stacked contour bands
  // (d3.contours, region >= threshold, each painted in the colour of its band), with the
  // raster axes (angle, sample) mapped to the circle. The pixel image cannot be written
  // as SVG; this keeps the file vector at the price of banded colour.
  const LEVELS = +Art.param("levels", 14);
  function paintBands(ctx, cx, cy, Rmax, r0) {
    const { raster, nTheta } = polar(ringNo);
    const TAU = 2 * Math.PI;
    const vals = new Float64Array(nTheta * ns);  // row = sample, column = angle
    for (let t = 0; t < nTheta; t++) {
      for (let j = 0; j < ns; j++) vals[j * nTheta + t] = shape(Math.max(-1, Math.min(1, raster[t * ns + j])));
    }
    const colourOf = (v) => { const li = Math.round((v + 1) * 256) * 3; return `rgb(${LUT[li]},${LUT[li + 1]},${LUT[li + 2]})`; };
    const step = 2 / LEVELS;
    const thresholds = d3.range(1, LEVELS).map((q) => -1 + q * step);
    ctx.fillStyle = colourOf(-1 + step / 2);
    ctx.beginPath(); ctx.arc(cx, cy, Rmax, 0, TAU); ctx.fill();
    const to = d3.geoTransform({
      point(px, py) {
        const th = ((px - 0.5) / nTheta) * TAU;
        const r = r0 + ((Rmax - r0) * Math.max(py - 0.5, 0)) / (ns - 1);
        this.stream.point(cx + r * Math.cos(th), cy - r * Math.sin(th));
      },
    });
    const path = d3.geoPath(to, ctx);
    d3.contours().size([nTheta, ns]).thresholds(thresholds)(vals).forEach((poly, i) => {
      ctx.fillStyle = colourOf(-1 + (i + 1.5) * step);
      ctx.beginPath(); path(poly); ctx.fill();
    });
    ctx.fillStyle = th.bg;  // the empty centre
    ctx.beginPath(); ctx.arc(cx, cy, r0, 0, TAU); ctx.fill();
  }

  const captionLines = () => {
    const ring = P.rings[ringNo];
    const lines = [
      `Ring ${ringNo + 1} of ${P.rings.length}: a circle of radius ${ring.radius} (coordinate units), ${ring.n_traces} nearest traces, closed loop`,
    ];
    if (mode === "double") {
      lines.push(`double exposure: ${P.pair.base_label} and ${P.pair.monitor_label} on the same ring; what both have is laid down in a neutral ink, what only the base has in ${paper ? "blue" : "cyan"}, what only the monitor has in orange, so an event that moved or faded between the surveys leaves a coloured fringe and an unchanged one stays neutral; the monitor was moved by ${P.pair.bulk_shift_ms >= 0 ? "+" : ""}${P.pair.bulk_shift_ms} ms and scaled by ${P.pair.scale.toFixed(2)} first (notes)`);
    } else if (mode === "breathe") {
      lines.push(`breathing: the ring cross-fades between ${P.pair.base_label} and ${P.pair.monitor_label} every six seconds; the unchanged part holds still, the changed part moves (web only; s saves the frame shown)`);
    } else {
      lines.push(`angle = along the circle (counter-clockwise from east) · radius = ${P.domain.vertical} · colour = amplitude (relative), mode: ${mode}`);
    }
    if ((ring.reflectors || []).length && +Art.param("annot", 3) > 0) {
      lines.push(`callouts: layers seen as peaks of the loop-averaged |amplitude| (circle, with the brightest trace); ▲ high / ▼ low = the layer's shallowest / deepest ${P.domain.vertical} round the loop, from the envelope peak of each trace filtered along the loop; "at least" = the swing reached the search limit${(ring.reflectors || []).some((f) => f.surface) ? "; a layer takes the name of the interpreted surface (from its file name) whose picks along the circle lie within 25 ms, otherwise it stays unnamed" : ""}`);
    }
    return lines;
  };

  function draw() {
    const { W, H } = Art.size();
    Art.caption(captionEl, P, captionLines());
    if (animation) { cancelAnimationFrame(animation); animation = null; }
    if (mode === "breathe") {
      const { ctx, dpr } = Art.fit(canvas, W, H);
      const period = 6000, start = performance.now();
      const frame = (now) => {
        const phase = (1 - Math.cos((2 * Math.PI * (now - start)) / period)) / 2;
        paint(ctx, W, H, dpr, phase);
        Art.finish(ctx, W, H);
        animation = requestAnimationFrame(frame);
      };
      frame(start);
      return;
    }
    if (Art.param("format", "") === "svg") {  // show the SVG export in place of the canvas
      canvas.style.display = "none";
      captionEl.style.visibility = "hidden";
      let host = document.getElementById("svgout");
      if (!host) { host = document.createElement("div"); host.id = "svgout"; document.body.appendChild(host); }
      host.innerHTML = svgString();
      return;
    }
    const { ctx, dpr } = Art.fit(canvas, W, H);
    paint(ctx, W, H, dpr);
    Art.finish(ctx, W, H);
  }

  function svgString() {
    const { W, H } = Art.size();
    const svg = Art.svg(W, H);
    paint(svg, W, H, 1);
    Art.drawCaption(svg, W, H);
    svg.meta.title = P.title || "Seismic rings";
    svg.meta.desc = [P.attribution, `polarity: ${P.polarity}`, `source: ${P.source_file}`, ...(P.notes || []).slice(0, 4)].join(" | ");
    return svg.toString();
  }

  // Paint a polar raster to an offscreen canvas: `pixel(v, o, d)` writes the colour
  // of value v (or of the pair of values in double mode) at byte offset o of d.
  function rasterImage(Rmax, r0, dpr, pixel) {
    const pw = Math.round(2 * Rmax * dpr) + 2;
    const img = new ImageData(pw, pw);
    const d = img.data, mid = pw / 2, R = Rmax * dpr, R0 = r0 * dpr, TAU = 2 * Math.PI;
    const { nTheta } = polar(ringNo);
    for (let y = 0; y < pw; y++) {
      for (let x = 0; x < pw; x++) {
        const dx = x - mid, dy = mid - y;
        const r = Math.hypot(dx, dy);
        const o = (y * pw + x) * 4;
        if (r < R0 || r > R) { d[o + 3] = 0; continue; }
        let th = Math.atan2(dy, dx);
        if (th < 0) th += TAU;
        const ft = (th / TAU) * nTheta;
        const t0 = Math.floor(ft) % nTheta, t1 = (t0 + 1) % nTheta, wt = ft - Math.floor(ft);
        const fs = ((r - R0) / (R - R0)) * (ns - 1);
        const j0 = Math.min(Math.floor(fs), ns - 2), ws = fs - j0;
        pixel(o, d, t0, t1, wt, j0, ws);
      }
    }
    const off = document.createElement("canvas");
    off.width = off.height = pw;
    off.getContext("2d").putImageData(img, 0, 0);
    return { off, pw };
  }
  const sampleRaster = (raster, t0, t1, wt, j0, ws) => {
    const v00 = raster[t0 * ns + j0], v01 = raster[t0 * ns + j0 + 1];
    const v10 = raster[t1 * ns + j0], v11 = raster[t1 * ns + j0 + 1];
    return (1 - wt) * ((1 - ws) * v00 + ws * v01) + wt * ((1 - ws) * v10 + ws * v11);
  };
  const singleInk = (raster) => (o, d, t0, t1, wt, j0, ws) => {
    const v = sampleRaster(raster, t0, t1, wt, j0, ws);
    const li = Math.round((shape(Math.max(-1, Math.min(1, v))) + 1) * 256) * 3;
    d[o] = LUT[li]; d[o + 1] = LUT[li + 1]; d[o + 2] = LUT[li + 2]; d[o + 3] = 255;
  };
  // two exposures: what both vintages have (the smaller of the two densities) is laid
  // down in a neutral ink; what only the base has in excess goes down in blue/cyan,
  // what only the monitor has in orange. Where the vintages agree the ring is neutral;
  // an event that moved or faded leaves a coloured fringe. Density is |amplitude|^gamma,
  // the excess is boosted (?boost=2) so a small disagreement still reads.
  const BOOST = +Art.param("boost", 2.2);
  const INK_A = paper ? [31, 79, 156] : [82, 200, 255], INK_B = paper ? [194, 86, 26] : [255, 176, 77];
  const INK_C = paper ? [44, 46, 54] : [205, 205, 200];
  const BG = d3.rgb(th.bg);
  const doubleInk = (rA, rB) => (o, d, t0, t1, wt, j0, ws) => {
    const a = Math.min(1, Math.pow(Math.abs(sampleRaster(rA, t0, t1, wt, j0, ws)), gamma));
    const b = Math.min(1, Math.pow(Math.abs(sampleRaster(rB, t0, t1, wt, j0, ws)), gamma));
    const common = Math.min(a, b);
    const ea = Math.min(1, (a - common) * BOOST), eb = Math.min(1, (b - common) * BOOST);
    for (let c = 0; c < 3; c++) {
      const bg = [BG.r, BG.g, BG.b][c];
      d[o + c] = paper
        ? bg * (1 - common * (1 - INK_C[c] / 255)) * (1 - ea * (1 - INK_A[c] / 255)) * (1 - eb * (1 - INK_B[c] / 255))
        : Math.min(255, bg + common * (INK_C[c] - bg) + ea * INK_A[c] + eb * INK_B[c]);
    }
    d[o + 3] = 255;
  };
  const imageCache = new Map();
  const cachedImage = (key, Rmax, r0, dpr, pixel) => {
    const id = `${key}:${ringNo}:${Rmax}:${dpr}`;
    if (!imageCache.has(id)) imageCache.set(id, rasterImage(Rmax, r0, dpr, pixel));
    return imageCache.get(id);
  };

  function paint(ctx, W, H, dpr, breath = 0) {
    ctx.fillStyle = th.bg;
    ctx.fillRect(0, 0, W, H);
    const cx = W / 2, cy = (H - 150) / 2 + 8;  // leave the bottom for the caption
    const Rmax = Math.min(W / 2 - 20, cy - 10);
    const r0 = Rmax * 0.1;
    const { raster, nTheta } = polar(ringNo);
    const TAU = 2 * Math.PI;
    const place = ({ off, pw }, alpha = 1) => {
      const px0 = Math.round((cx - Rmax) * dpr) - 1, py0 = Math.round((cy - Rmax) * dpr) - 1;
      ctx.save(); ctx.globalAlpha = alpha;
      ctx.drawImage(off, px0 / dpr, py0 / dpr, pw / dpr, pw / dpr);
      ctx.restore();
    };

    if ((mode === "image" || mode === "double" || mode === "breathe") && ctx.isSvg) {
      paintBands(ctx, cx, cy, Rmax, r0);  // the vector file carries the base only
    } else if (mode === "double") {
      place(cachedImage("double", Rmax, r0, dpr, doubleInk(raster, polar(ringNo, "monitor_amp").raster)));
    } else if (mode === "breathe") {
      place(cachedImage("base", Rmax, r0, dpr, singleInk(raster)));
      place(cachedImage("monitor", Rmax, r0, dpr, singleInk(polar(ringNo, "monitor_amp").raster)), breath);
    } else if (mode === "image") {
      const pw = Math.round(2 * Rmax * dpr) + 2;
      const px0 = Math.round((cx - Rmax) * dpr) - 1, py0 = Math.round((cy - Rmax) * dpr) - 1;
      const img = ctx.createImageData(pw, pw);
      const d = img.data;
      const mid = pw / 2;
      const R = Rmax * dpr, R0 = r0 * dpr;
      for (let y = 0; y < pw; y++) {
        for (let x = 0; x < pw; x++) {
          const dx = x - mid, dy = mid - y;
          const r = Math.hypot(dx, dy);
          const o = (y * pw + x) * 4;
          if (r < R0 || r > R) { d[o + 3] = 0; continue; }
          let th = Math.atan2(dy, dx);
          if (th < 0) th += TAU;
          const ft = (th / TAU) * nTheta;
          const t0 = Math.floor(ft) % nTheta, t1 = (t0 + 1) % nTheta, wt = ft - Math.floor(ft);
          const fs = ((r - R0) / (R - R0)) * (ns - 1);
          const j0 = Math.min(Math.floor(fs), ns - 2), ws = fs - j0;
          const v00 = raster[t0 * ns + j0], v01 = raster[t0 * ns + j0 + 1];
          const v10 = raster[t1 * ns + j0], v11 = raster[t1 * ns + j0 + 1];
          const v = (1 - wt) * ((1 - ws) * v00 + ws * v01) + wt * ((1 - ws) * v10 + ws * v11);
          const li = Math.round((shape(Math.max(-1, Math.min(1, v))) + 1) * 256) * 3;
          d[o] = LUT[li]; d[o + 1] = LUT[li + 1]; d[o + 2] = LUT[li + 2]; d[o + 3] = 255;
        }
      }
      // transparent outside the ring: draw via an offscreen canvas so the page
      // background shows through (putImageData would overwrite it)
      const off = document.createElement("canvas");
      off.width = off.height = pw;
      off.getContext("2d").putImageData(img, 0, 0);
      ctx.drawImage(off, px0 / dpr, py0 / dpr, pw / dpr, pw / dpr);
    } else {
      // wiggle: one ring per sample step, pushed in and out by amplitude; positive
      // lobes filled (variable area), like a seismic section bent into a circle
      const step = 3;
      const gain = ((Rmax - r0) / (ns - 1)) * step * 1.8;
      ctx.lineWidth = 0.6;
      for (let j = 0; j < ns; j += step) {
        const rb = r0 + ((Rmax - r0) * j) / (ns - 1);
        const pts = [];
        for (let t = 0; t <= nTheta; t++) {
          const tt = t % nTheta;
          const v = shape(raster[tt * ns + j]);
          const th = (TAU * t) / nTheta;
          const r = rb + gain * v;
          pts.push([cx + r * Math.cos(th), cy - r * Math.sin(th), v, th]);
        }
        ctx.strokeStyle = paper ? "rgba(40,48,64,0.35)" : "rgba(232,214,170,0.32)";
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
        ctx.stroke();
        ctx.fillStyle = paper ? "rgba(90,40,10,0.6)" : "rgba(255,236,190,0.55)";
        let run = null;
        const flush = (endIdx) => {
          if (!run) return;
          ctx.beginPath();
          // explicit moveTo: a canvas treats a first lineTo as one, an SVG path does not
          ctx.moveTo(pts[run][0], pts[run][1]);
          for (let i = run + 1; i < endIdx; i++) ctx.lineTo(pts[i][0], pts[i][1]);
          for (let i = endIdx - 1; i >= run; i--) {
            ctx.lineTo(cx + rb * Math.cos(pts[i][3]), cy - rb * Math.sin(pts[i][3]));
          }
          ctx.closePath();
          ctx.fill();
          run = null;
        };
        pts.forEach((p, i) => {
          if (p[2] > 0.05) { if (run === null) run = i; } else flush(i);
        });
        flush(pts.length);
      }
    }

    // callouts: the clearest layers of this ring and the brightest trace on each. Every
    // number is read from the export (found in Python by ring_reflectors), none typed in.
    const ringData = P.rings[ringNo];
    const found = ringData.reflectors || [];
    const nAnnot = mode === "breathe" ? 0 : Math.min(+Art.param("annot", 3), found.length);
    if (nAnnot > 0) {
      const u = P.sample_unit, axis = P.domain.vertical === "time" ? "TWT" : "depth";
      const tt0 = P.samples[0], tt1 = P.samples[ns - 1];
      const radiusOf = (t) => r0 + ((Rmax - r0) * (t - tt0)) / (tt1 - tt0);
      const items = found.slice(0, nAnnot).map((f, i) => {
        const r = radiusOf(f.time);
        return {
          x: cx + r * Math.cos(f.peak_angle), y: cy - r * Math.sin(f.peak_angle), r: 7,
          lines: [
            f.surface ? `${f.surface.label} · ${axis} ${f.time.toFixed(0)} ${u}` : `Layer at ${axis} ${f.time.toFixed(0)} ${u}`,
            f.surface ? `named from the interpreted surface: picks ${f.surface.picked.toFixed(0)} ${u} (5-95% ${f.surface.swing.toFixed(0)} ${u})${f.surface.expanded ? `; ${f.surface.expanded}` : ""}` : "",
            `${f.truncated ? "at least " : ""}${f.undulation.toFixed(0)} ${u} swing round the loop`,
            `mean |amp| x${f.strength.toFixed(1)} the ring median`,
            `brightest at IL ${f.inline} / XL ${f.crossline}, ${(f.peak_angle * 180 / Math.PI).toFixed(0)} deg`,
            `x${f.peak_ratio.toFixed(1)} the median of this layer's trace maxima`,
          ].filter(Boolean),
        };
      });
      ctx.strokeStyle = paper ? th.fg : "#ffffff"; ctx.lineWidth = 1.4;
      items.forEach((it) => { ctx.beginPath(); ctx.arc(it.x, it.y, it.r, 0, TAU); ctx.stroke(); });
      // highs and lows along the loop of the first `hl` layers: the shallowest (▲) and
      // deepest (▼) point of each layer's tracked time
      const nHL = Math.min(+Art.param("hl", 1), nAnnot);
      const marks = [];
      found.slice(0, nHL).forEach((f) => {
        [["shallow", "high"], ["deep", "low"]].forEach(([k, word]) => {
          const t = f[`${k}_time`], a = f[`${k}_angle`], r = radiusOf(t);
          marks.push({
            x: cx + r * Math.cos(a), y: cy - r * Math.sin(a), r: 5, up: k === "shallow",
            lines: [`${word} of the ${f.surface ? f.surface.label : `${f.time.toFixed(0)} ${u} layer`}: ${t.toFixed(0)} ${u}`,
              `IL ${f[`${k}_inline`]} / XL ${f[`${k}_crossline`]}`],
          });
        });
      });
      marks.forEach((m) => {
        const s = 5, d = m.up ? -1 : 1;
        ctx.beginPath();
        ctx.moveTo(m.x, m.y + d * s); ctx.lineTo(m.x - s, m.y - d * s); ctx.lineTo(m.x + s, m.y - d * s);
        ctx.closePath();
        ctx.fillStyle = paper ? th.fg : "#ffffff"; ctx.fill();
      });
      const hole = [...items, ...marks].map((it) => ({ x: it.x, y: it.y, r: 12 }));
      Art.annotate(ctx, W, H, [...items, ...marks], hole, "boxed");
    }

    // time ticks along the east radius
    if (paper) {  // outline the disc, whose near-zero parts match the paper
      ctx.strokeStyle = "rgba(29,35,46,0.4)"; ctx.lineWidth = 0.8;
      [Rmax, r0].forEach((r) => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke(); });
    }
    ctx.fillStyle = paper ? "rgba(29,35,46,0.75)" : "rgba(230,233,239,0.6)";
    ctx.strokeStyle = paper ? "rgba(29,35,46,0.5)" : "rgba(230,233,239,0.35)";
    ctx.font = "11px system-ui, sans-serif";
    ctx.lineWidth = 1;
    const t0v = P.samples[0], t1v = P.samples[ns - 1];
    const tick = (t1v - t0v) > 2000 ? 500 : (t1v - t0v) > 600 ? 200 : 100;
    for (let t = Math.ceil(t0v / tick) * tick; t <= t1v; t += tick) {
      const r = r0 + ((Rmax - r0) * (t - t0v)) / (t1v - t0v);
      ctx.beginPath(); ctx.moveTo(cx + r, cy); ctx.lineTo(cx + r, cy + 6); ctx.stroke();
      ctx.fillText(`${t}`, cx + r - 8, cy + 18);
    }
    ctx.textAlign = "center";
    ctx.fillText(`radius = ${P.domain.vertical} [${P.sample_unit}]: centre ${t0v}, outer edge ${t1v}`, cx, cy + Rmax + 18);
    ctx.textAlign = "left";

  }

  draw();
  window.addEventListener("resize", draw);
  window.addEventListener("keydown", (e) => {
    if (e.key >= "1" && e.key <= String(P.rings.length)) { ringNo = +e.key - 1; draw(); }
    else if (e.key === "m") { mode = mode === "image" ? "wiggle" : "image"; draw(); }
    else if (e.key === "d" && hasPair) { mode = "double"; draw(); }
    else if (e.key === "b" && hasPair) { mode = mode === "breathe" ? "double" : "breathe"; draw(); }
    else if (e.key === "s") Art.savePNG(canvas, `seismic-rings-${ringNo + 1}-${mode}.png`);
    else if (e.key === "v") Art.saveText(svgString(), `seismic-rings-${ringNo + 1}-${mode}.svg`, "image/svg+xml");
  });
})();
