// Concept D: flow over a surface.
// Water on a horizon runs downhill, so streamlines follow the steepest descent of the
// picked time (toward increasing time); `d` reverses them to run updip. Line WIDTH is
// the apparent dip (time change per map distance, NOT converted to depth) and colour is
// the amplitude attribute, so anomalies glow where they sit on the structure. Lines are
// evenly spaced (Jobard-Lefer), seeded so the picture is identical every run. A faint
// shading of the time surface underneath gives the structural context.
//
// One routine (paint) draws onto a Canvas 2D context OR the SVG recorder from common.js,
// so the picture can be saved as PNG (s) or vector SVG (v). Two things differ for SVG:
// the shading is drawn as stacked contour bands instead of a raster image, and each
// streamline is written as chunks (?svgchunk=N points, default 12) that take the colour,
// width and brightness at their middle, instead of one path per 1.4 px step, which
// would make an enormous file.
(async function () {
  const canvas = document.getElementById("c");
  const captionEl = document.getElementById("caption");
  let P;
  try {
    P = await Art.load(Art.param("data", "data/synthetic/flow.json"));
  } catch (e) {
    document.getElementById("error").textContent = String(e);
    return;
  }
  const { nx, ny } = P.grid;
  const flat = (rows, fill = NaN) => {
    const a = new Float32Array(nx * ny);
    rows.forEach((row, j) => row.forEach((v, i) => { a[j * nx + i] = v === null ? fill : v; }));
    return a;
  };
  const GX = flat(P.gx), GY = flat(P.gy), V = flat(P.value), T = flat(P.time);
  const sep = +Art.param("sep", 6);
  const showBg = Art.param("bg", "1") !== "0";
  const shade = Art.param("shade", "auto"); // auto: raster on canvas, bands in SVG; or bands
  const cps = P.critical_points || [];
  const nAnnot = Math.min(+Art.param("annot", cps.length), cps.length); // 0 turns callouts off
  const validValues = Array.from(V).filter(Number.isFinite).sort((a, b) => a - b);
  const background = validValues[Math.floor(validValues.length / 2)] || 1; // median attribute
  const th = Art.theme;
  const FONT = "system-ui, 'Segoe UI', Helvetica, Arial, sans-serif";
  let dirSign = Art.param("dir", "down") === "up" ? -1 : 1;

  // bilinear sample of a grid in fractional cell coordinates; NaN if any corner is invalid
  function sample(arr, fx, fy) {
    if (fx < 0 || fy < 0 || fx > nx - 1 || fy > ny - 1) return NaN;
    const i = Math.min(Math.floor(fx), nx - 2), j = Math.min(Math.floor(fy), ny - 2);
    const u = fx - i, v = fy - j;
    const a = arr[j * nx + i], b = arr[j * nx + i + 1], c = arr[(j + 1) * nx + i], d = arr[(j + 1) * nx + i + 1];
    return (1 - v) * ((1 - u) * a + u * b) + v * ((1 - u) * c + u * d);
  }

  const ramp = d3.interpolateRgbBasis(["#26396b", "#3a78c9", "#38c4b0", "#f4e07a", "#ff9a5a"]);
  const valueColour = (v) => th.ink(ramp(Math.pow(Math.max(0, Math.min(1, v / P.value_clip)), 0.8)));

  function captionLines() {
    const lines = [
      `Flow over "${P.horizon}": lines follow steepest ${dirSign > 0 ? "descent (toward increasing" : "ASCENT (toward decreasing"} ${P.domain.vertical}); width = apparent dip, colour = ${P.attribute} (relative)`,
      `dip is time change per map distance (${P.slope_unit}), not converted to depth; structure smoothed by a local plane fit`,
      `streamlines evenly spaced (Jobard-Lefer, spacing ${sep}px), direction: ${dirSign > 0 ? "downdip" : "UPDIP (reversed)"}`,
    ];
    if (nAnnot) {
      lines.push(`callouts: structural highs (local ${P.domain.vertical} minima), lows (maxima)${cps.some((c) => c.kind === "saddle") ? " and saddles (two deeper and two shallower lobes; azimuth = map bearing of the deeper lobes)" : ""} of the smoothed surface, found automatically; relief = how far each stands from the median of a surrounding ring; × = ${P.attribute} near it compared with the surface median${cps.some((c) => c.truth) ? "; 'truth' is what was built into the synthetic cube" : ""}`);
    }
    return lines;
  }

  function paint(ctx, W, H) {
    ctx.fillStyle = th.bg;
    ctx.fillRect(0, 0, W, H);
    const top = 40, bottom = Math.max(150, captionEl.offsetHeight + 36), side = 24;
    const aw = W - 2 * side, ah = H - top - bottom;
    const s = Math.min(aw / ((nx - 1) * P.grid.cell), ah / ((ny - 1) * P.grid.cell)); // px per map unit
    const gw = (nx - 1) * P.grid.cell * s, gh = (ny - 1) * P.grid.cell * s;
    const ox = side + (aw - gw) / 2, oy = top + (ah - gh) / 2; // pixel of grid cell (0, ny-1) = north-west corner
    const cellPx = P.grid.cell * s;
    const toFrac = (px, py) => [(px - ox) / cellPx, (oy + gh - py) / cellPx]; // north is up

    // faint shading of the time surface: shallow lighter on dark, deep darker on paper
    if (showBg) {
      const tvals = Array.from(T).filter(Number.isFinite);
      const t0 = d3.min(tvals), t1 = d3.max(tvals);
      const paper = th.name === "paper";
      if (shade !== "bands" && typeof ctx.drawImage === "function") {
        const off = document.createElement("canvas");
        off.width = nx; off.height = ny;
        const octx = off.getContext("2d");
        const img = octx.createImageData(nx, ny);
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
          const t = T[j * nx + i], o = ((ny - 1 - j) * nx + i) * 4;
          if (!Number.isFinite(t)) { img.data[o + 3] = 0; continue; }
          const k = (t - t0) / (t1 - t0 || 1);
          if (paper) { img.data[o] = 238 - 30 * k; img.data[o + 1] = 233 - 28 * k; img.data[o + 2] = 222 - 22 * k; }
          else { img.data[o] = 18 + 14 * (1 - k); img.data[o + 1] = 26 + 30 * (1 - k); img.data[o + 2] = 44 + 44 * (1 - k); }
          img.data[o + 3] = 255;
        }
        octx.putImageData(img, 0, 0);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(off, ox - cellPx / 2, oy - cellPx / 2, nx * cellPx, ny * cellPx);
      } else {
        // vector: nested contour regions, each a translucent layer, so shading deepens
        // where more layers overlap. Invalid cells sit below every level and stay empty.
        const sign = paper ? 1 : -1, LEVELS = 10;
        const values = Float64Array.from(T, (t) => (Number.isFinite(t) ? sign * t : -1e9));
        const lo = sign > 0 ? t0 : -t1, hi = sign > 0 ? t1 : -t0;
        const thresholds = d3.range(1, LEVELS + 1).map((q) => lo + ((hi - lo) * q) / (LEVELS + 1));
        const polys = d3.contours().size([nx, ny]).thresholds(thresholds)(values);
        const to = d3.geoTransform({
          point(cx, cy) { this.stream.point(ox + (cx - 0.5) * cellPx, oy + gh - (cy - 0.5) * cellPx); },
        });
        const path = d3.geoPath(to, ctx);
        ctx.fillStyle = paper ? "rgba(70,70,60,0.055)" : "rgba(120,165,235,0.06)";
        polys.forEach((poly) => { ctx.beginPath(); path(poly); ctx.fill("evenodd"); });
      }
    }

    const slopeMin = 0.04 * P.slope_clip;
    // unit direction (canvas pixels, y down) and slope at a pixel; null where undefined
    function field(px, py) {
      const [fx, fy] = toFrac(px, py);
      const gx = sample(GX, fx, fy), gy = sample(GY, fx, fy);
      if (!Number.isFinite(gx) || !Number.isFinite(gy)) return null;
      const m = Math.hypot(gx, gy);
      if (m < slopeMin) return null;
      return [(dirSign * gx) / m, (-dirSign * gy) / m, m];
    }

    // Jobard-Lefer evenly spaced streamlines
    const rng = Art.rng(11);
    const dtest = 0.55 * sep, h = 1.4;
    const hash = new Map();
    const key = (cx, cy) => cx * 100003 + cy;
    const addPoint = (p, line) => {
      const k = key(Math.floor(p[0] / sep), Math.floor(p[1] / sep));
      if (!hash.has(k)) hash.set(k, []);
      hash.get(k).push([p[0], p[1], line]);
    };
    const near = (p, dist, ownLine) => {
      const cx = Math.floor(p[0] / sep), cy = Math.floor(p[1] / sep);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const cell = hash.get(key(cx + a, cy + b));
        if (!cell) continue;
        for (const q of cell) {
          if (q[2] === ownLine) continue;
          if (Math.hypot(q[0] - p[0], q[1] - p[1]) < dist) return true;
        }
      }
      return false;
    };
    function trace(seed, sign, lineId) {
      const pts = [];
      let p = seed.slice();
      for (let n = 0; n < 1400; n++) {
        const d1 = field(p[0], p[1]);
        if (!d1) break;
        const mid = [p[0] + (sign * d1[0] * h) / 2, p[1] + (sign * d1[1] * h) / 2];
        const d2 = field(mid[0], mid[1]);
        if (!d2) break;
        p = [p[0] + sign * d2[0] * h, p[1] + sign * d2[1] * h];
        if (near(p, dtest, lineId)) break;
        pts.push([p[0], p[1], d2[2]]);
      }
      return pts;
    }
    const lines = [];
    const queue = [];
    function tryLine(seed) {
      if (!field(seed[0], seed[1]) || near(seed, sep, -1)) return;
      const id = lines.length;
      const fwd = trace(seed, +1, id), bwd = trace(seed, -1, id);
      const m0 = field(seed[0], seed[1]);
      const pts = [...bwd.reverse(), [seed[0], seed[1], m0[2]], ...fwd]; // ordered along the flow when dirSign is +
      if (pts.length < 8) return;
      lines.push(pts);
      pts.forEach((p) => addPoint(p, id));
      queue.push(id);
    }
    // first seed: a valid pixel near the middle, then grow outward from every accepted line
    const first = [];
    for (let k = 0; k < 4000 && !first.length; k++) {
      const p = [ox + rng() * gw, oy + rng() * gh];
      if (field(p[0], p[1])) first.push(p);
    }
    if (first.length) tryLine(first[0]);
    while (queue.length) {
      const line = lines[queue.shift()];
      for (let i = 2; i < line.length - 2; i += 3) {
        const dx = line[i + 1][0] - line[i - 1][0], dy = line[i + 1][1] - line[i - 1][1];
        const m = Math.hypot(dx, dy) || 1;
        const nx_ = -dy / m, ny_ = dx / m;
        tryLine([line[i][0] + nx_ * sep, line[i][1] + ny_ * sep]);
        tryLine([line[i][0] - nx_ * sep, line[i][1] - ny_ * sep]);
      }
    }
    // islands the growth never reached
    for (let k = 0; k < 6000; k++) {
      tryLine([ox + rng() * gw, oy + rng() * gh]);
      while (queue.length) {
        const line = lines[queue.shift()];
        for (let i = 2; i < line.length - 2; i += 3) {
          const dx = line[i + 1][0] - line[i - 1][0], dy = line[i + 1][1] - line[i - 1][1];
          const m = Math.hypot(dx, dy) || 1;
          tryLine([line[i][0] - (dy / m) * sep, line[i][1] + (dx / m) * sep]);
          tryLine([line[i][0] + (dy / m) * sep, line[i][1] - (dx / m) * sep]);
        }
      }
    }

    const baseAlpha = th.name === "paper" ? 0.4 : 0.18, rangeAlpha = th.name === "paper" ? 0.55 : 0.62;
    const chunk = Math.max(2, +Art.param("svgchunk", 12));
    const colourAt = (x, y) => {
      const [fx, fy] = toFrac(x, y), v = sample(V, fx, fy);
      return d3.rgb(Number.isFinite(v) ? valueColour(v) : th.ink("#26396b"));
    };
    // SVG chunks share their end points, so butt caps meet exactly; round caps would
    // overlap at every join and show as beads wherever the stroke is translucent
    ctx.lineCap = ctx.isSvg ? "butt" : "round";
    ctx.globalCompositeOperation = th.blend;
    lines.forEach((pts) => {
      // when flow is reversed the polyline still runs downdip->updip order; keep the head
      // (brightest end) at the end the water flows toward
      const ordered = dirSign > 0 ? pts : pts.slice().reverse();
      const n = ordered.length;
      if (!ctx.isSvg) {
        for (let i = 1; i < n; i++) {
          const [x0, y0] = ordered[i - 1], [x1, y1, m] = ordered[i];
          const c = colourAt(x1, y1);
          ctx.strokeStyle = `rgba(${c.r},${c.g},${c.b},${baseAlpha + rangeAlpha * (i / n)})`;
          ctx.lineWidth = 0.6 + 2.0 * Math.min(1.2, m / P.slope_clip);
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        }
      } else {
        // vector: one path per chunk, with the colour, width and brightness at its middle
        for (let a = 0; a < n - 1; a += chunk) {
          const b = Math.min(a + chunk, n - 1), mid = Math.floor((a + b) / 2);
          let slope = 0;
          for (let i = a + 1; i <= b; i++) slope += ordered[i][2];
          slope /= b - a;
          const c = colourAt(ordered[mid][0], ordered[mid][1]);
          ctx.strokeStyle = `rgba(${c.r},${c.g},${c.b},${baseAlpha + rangeAlpha * (mid / n)})`;
          ctx.lineWidth = 0.6 + 2.0 * Math.min(1.2, slope / P.slope_clip);
          ctx.beginPath();
          ctx.moveTo(ordered[a][0], ordered[a][1]);
          for (let i = a + 1; i <= b; i++) ctx.lineTo(ordered[i][0], ordered[i][1]);
          ctx.stroke();
        }
      }
    });
    ctx.globalCompositeOperation = "source-over";

    // static callouts at the structural highs and lows found in the data. The flow
    // wording follows the direction in use: water runs away from a high and toward a
    // low when going downdip, and the reverse when going updip.
    if (nAnnot) {
      const toPx = (c) => [ox + ((c.x - P.grid.x0) / P.grid.cell) * cellPx, oy + gh - ((c.y - P.grid.y0) / P.grid.cell) * cellPx];
      const items = cps.slice(0, nAnnot).map((c) => {
        const [x, y] = toPx(c);
        const diverges = (c.kind === "high") === (dirSign > 0);
        const u = P.domain.vertical_unit, axis = P.domain.vertical === "time" ? "TWT" : "depth";
        const saddle = c.kind === "saddle";
        // map azimuth (clockwise from north) of the line through the deeper lobes
        const az = saddle ? String(Math.round((((90 - c.axis_deg) % 180) + 180) % 180)).padStart(3, "0") : "";
        const flowLine = saddle
          ? (dirSign > 0
            ? `flow arrives from two sides, leaves along azimuth ${az}°`
            : `flow arrives along azimuth ${az}°, leaves toward two sides`)
          : diverges ? "flow diverges from it" : "flow converges on it";
        return {
          x, y, r: 9,
          lines: [
            saddle ? "Saddle" : c.kind === "high" ? "Structural high" : "Structural low",
            flowLine,
            `${axis} ${c.time.toFixed(0)} ${u} · ${saddle ? "weakest lobe" : "relief"} ${c.relief.toFixed(0)} ${u} within ${c.relief_radius.toFixed(0)} map units`,
            `${P.attribute} ×${(c.value / background).toFixed(1)} the surface median`,
            c.truth ? `synthetic truth: ${c.truth}` : "",
          ].filter(Boolean),
        };
      });
      ctx.strokeStyle = th.fg; ctx.lineWidth = 1.4; ctx.globalAlpha = 1;
      items.forEach((it) => { ctx.beginPath(); ctx.arc(it.x, it.y, it.r, 0, 2 * Math.PI); ctx.stroke(); });
      Art.annotate(ctx, W, H, items, items.map((it) => ({ x: it.x, y: it.y, r: 14 })), "boxed");
    }

    // key: colour = attribute, width = dip
    const kx = W - 16, ky = H - 16;
    ctx.font = `11px ${FONT}`;
    ctx.textAlign = "right";
    ctx.fillStyle = th.dim;
    ctx.fillText(`colour: ${P.attribute} (relative), low to high`, kx, ky - 44);
    for (let i = 0; i < 60; i++) { ctx.fillStyle = valueColour((i / 59) * P.value_clip); ctx.fillRect(kx - 120 + i * 2, ky - 38, 2, 8); }
    ctx.fillStyle = th.dim;
    ctx.fillText("width: apparent dip, gentle to steep", kx, ky - 12);
    for (let i = 0; i < 6; i++) {
      ctx.strokeStyle = th.dim; ctx.lineWidth = 0.6 + 2.0 * (i / 5);
      ctx.beginPath(); ctx.moveTo(kx - 120 + i * 20, ky - 2); ctx.lineTo(kx - 120 + i * 20 + 14, ky - 2); ctx.stroke();
    }
    ctx.textAlign = "left";
  }

  function render() {
    const { W, H } = Art.size();
    Art.caption(captionEl, P, captionLines()); // first, so layout can measure it
    if (Art.param("format", "") === "svg") {
      canvas.style.display = "none";
      captionEl.style.visibility = "hidden";
      let host = document.getElementById("svgout");
      if (!host) { host = document.createElement("div"); host.id = "svgout"; document.body.appendChild(host); }
      host.innerHTML = svgString();
      return;
    }
    const { ctx } = Art.fit(canvas, W, H);
    paint(ctx, W, H);
    Art.finish(ctx, W, H);
  }

  // The vector file: the same painting, with the caption always included.
  function svgString() {
    const { W, H } = Art.size();
    Art.caption(captionEl, P, captionLines());
    const svg = Art.svg(W, H);
    paint(svg, W, H);
    Art.drawCaption(svg, W, H);
    svg.meta.title = P.title || "Flow over a surface";
    svg.meta.desc = [P.attribution, `polarity: ${P.polarity}`, `source: ${P.source_file}`, ...(P.notes || []).slice(0, 4)].join(" | ");
    return svg.toString();
  }

  render();
  window.addEventListener("resize", render);
  window.addEventListener("keydown", (e) => {
    if (e.key === "d") { dirSign = -dirSign; render(); }
    else if (e.key === "s") Art.savePNG(canvas, "flow-over-a-surface.png");
    else if (e.key === "v") Art.saveText(svgString(), "flow-over-a-surface.svg", "image/svg+xml");
  });
})();
