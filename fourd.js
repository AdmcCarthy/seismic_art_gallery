// Concept H: 4D, class change and time shift.
// Two vintages of one survey read at the same picks (Python). Left: the map of picks
// coloured by their waveform class in the base; a pick whose class differs in the
// monitor is drawn as a disc (ring = base class, fill = monitor class), faint when
// either assignment was undecided. Right: the time shift of the monitor against the
// base on the same horizon, and the same shift on a shallow control horizon where
// nothing should have changed, on one colour scale; then the numbers of both, side by
// side. Everything shown is in the export; a declared bulk shift is stated.
(async function () {
  const canvas = document.getElementById("c");
  const captionEl = document.getElementById("caption");
  let P;
  try {
    P = await Art.load(Art.param("data", "data/synthetic/fourd.json"));
  } catch (e) {
    document.getElementById("error").textContent = String(e);
    return;
  }
  const th = Art.theme, paper = th.name === "paper";
  const FONT = "system-ui, 'Segoe UI', Helvetica, Arial, sans-serif";
  const nAnnot = +Art.param("annot", 3);
  let showRef = Art.param("ref", "1") !== "0" && !!P.reference;
  const R = P.picks, C = P.control, S = P.summary, K = P.k;
  const PAL = paper
    ? ["#1f5f8b", "#b3541e", "#3a7d44", "#7b3f9e", "#8a6d1a", "#8a2d4a"]
    : ["#6fb3ff", "#ffa05c", "#7fd48a", "#c79cff", "#e8d36a", "#ff8fb0"];
  const colourOf = (k) => PAL[k % PAL.length];
  // one symmetric shift scale for both maps, from the reservoir's own spread
  const SMAX = Math.max(0.5, Math.abs(S.reservoir.shift_p10), Math.abs(S.reservoir.shift_p90));
  // picks are exported as an even sample; size the dots to that spacing, not the grid
  const [bx0, by0, bx1, by1] = P.bbox;
  const spacingOf = (D) => Math.sqrt(((bx1 - bx0) * (by1 - by0)) / Math.max(1, D.x.length));
  const shiftColour = d3.scaleDiverging((t) => (paper ? d3.interpolateRdBu(1 - t) : d3.interpolateRdBu(1 - t))).domain([-SMAX, 0, SMAX]).clamp(true);
  const pct = (v) => (v == null ? "n/a" : (v * 100).toFixed(1) + "%");
  const ms = (v) => (v == null ? "n/a" : (v >= 0 ? "+" : "") + v.toFixed(1) + " ms");
  const labelOf = (v) => (v && v.label) || "";

  function captionLines() {
    const r = S.reservoir, c = S.control;
    const lines = [
      `4D on the ${P.horizon_label || P.horizon}: ${labelOf(P.vintages.base)} against ${labelOf(P.vintages.monitor)}, ${r.n.toLocaleString("en-GB")} picks in both${R.x.length < r.n ? ` (${R.x.length.toLocaleString("en-GB")} drawn)` : ""}. Dot = waveform class in the base (${K} classes learnt on the base); disc = the class differs in the monitor with both assignments decisive (ring = base, fill = monitor)`,
      `right: time shift of the monitor against the base after a declared bulk shift of ${ms(P.bulk_shift_ms)} (positive = later), and the same on the control horizon (${P.control_label || "control"}), one colour scale`,
    ];
    if (c) lines.push(`control, where nothing should have changed: ${pct(c.changed_share)} of ${c.n.toLocaleString("en-GB")} picks changed class, median |shift| ${c.abs_shift_median.toFixed(1)} ms; reservoir ${pct(r.changed_share)} and ${r.abs_shift_median.toFixed(1)} ms`);
    if (P.truth && P.truth.changed_inside != null) {
      lines.push(`check against ${P.truth.label}: ${pct(P.truth.changed_inside)} inside changed class, ${pct(P.truth.changed_outside)} outside; median shift inside ${ms(P.truth.shift_inside)}, outside ${ms(P.truth.shift_outside)}`);
    }
    if (P.reference && showRef) lines.push(`dashed lines: ${P.reference.label}`);
    return lines;
  }

  // fit a set of picks (its own extent: the control horizon may cover more ground
  // than the reservoir) into a rectangle, keeping the aspect
  const extent = (D) => [d3.min(D.x), d3.min(D.y), d3.max(D.x), d3.max(D.y)];
  function projector(rect, bbox) {
    const [x0, y0, x1, y1] = bbox || P.bbox;
    const sc = Math.min(rect.w / (x1 - x0), rect.h / (y1 - y0));
    const ox = rect.x + (rect.w - sc * (x1 - x0)) / 2, oy = rect.y + (rect.h - sc * (y1 - y0)) / 2;
    return { X: (x) => ox + (x - x0) * sc, Y: (y) => oy + (y1 - y) * sc, sc };
  }

  function drawReference(ctx, pr) {
    if (!(showRef && P.reference)) return;
    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = paper ? "rgba(122,47,8,0.7)" : "rgba(255,160,90,0.6)";
    ctx.lineWidth = 1.1;
    P.reference.lines.forEach((pl) => {
      ctx.beginPath();
      pl.forEach((p, i) => (i ? ctx.lineTo(pr.X(p[0]), pr.Y(p[1])) : ctx.moveTo(pr.X(p[0]), pr.Y(p[1]))));
      ctx.stroke();
    });
    ctx.restore();
  }

  function shiftMap(ctx, rect, D, title, sum) {
    const pr = projector({ x: rect.x + 6, y: rect.y + 22, w: rect.w - 12, h: rect.h - 50 }, extent(D));
    ctx.font = `600 11.5px ${FONT}`; ctx.fillStyle = th.fg; ctx.textAlign = "left";
    ctx.fillText(title, rect.x + 6, rect.y + 12);
    const dot = Math.max(1, Math.min(3, pr.sc * spacingOf(D) * 0.95));
    for (let i = 0; i < D.x.length; i++) {
      ctx.fillStyle = shiftColour(D.shift[i]);
      ctx.fillRect(pr.X(D.x[i]) - dot / 2, pr.Y(D.y[i]) - dot / 2, dot, dot);
    }
    drawReference(ctx, pr);
    ctx.font = `10.5px ${FONT}`; ctx.fillStyle = th.dim;
    ctx.fillText(`median ${ms(sum.shift_median)} · p10 ${ms(sum.shift_p10)} · p90 ${ms(sum.shift_p90)} · corr ${sum.corr_median.toFixed(2)} · NRMS ${sum.nrms_median.toFixed(2)}`, rect.x + 6, rect.y + rect.h - 8);
    return pr;
  }

  function paint(ctx, W, H) {
    ctx.fillStyle = th.bg;
    ctx.fillRect(0, 0, W, H);
    const top = 30, bottom = Math.max(190, captionEl.offsetHeight + 36), side = 24, gap = 18;
    const innerW = W - 2 * side;
    const mainW = Math.round(innerW * 0.56), rightW = innerW - mainW - gap;
    const rx = side + mainW + gap;
    const main = { x: side, y: top, w: mainW, h: H - top - bottom };
    const pr = projector(main, extent(R));

    // main map: every pick in its base class (a changed but undecided pick too);
    // clear changes as discs on top
    const dot = Math.max(1.2, Math.min(3.2, pr.sc * spacingOf(R) * 0.95));
    const baseA = paper ? 0.42 : 0.4;
    const isClearChange = (i) => R.base_class[i] !== R.monitor_class[i] && R.clear[i] === 1;
    for (let i = 0; i < R.x.length; i++) {
      if (isClearChange(i)) continue;
      const c = d3.rgb(colourOf(R.base_class[i]));
      ctx.fillStyle = `rgba(${c.r},${c.g},${c.b},${baseA})`;
      ctx.fillRect(pr.X(R.x[i]) - dot / 2, pr.Y(R.y[i]) - dot / 2, dot, dot);
    }
    drawReference(ctx, pr);
    // a crowded map (thousands of changes) gets smaller discs, so they stay discs
    let nChanged = 0;
    for (let i = 0; i < R.x.length; i++) if (isClearChange(i)) nChanged++;
    const crowd = Math.min(1, 800 / Math.max(1, nChanged));
    const rr = Math.max(1.6, dot * (0.8 + 0.7 * crowd));
    for (let i = 0; i < R.x.length; i++) {
      if (!isClearChange(i)) continue;
      const x = pr.X(R.x[i]), y = pr.Y(R.y[i]);
      const f = d3.rgb(colourOf(R.monitor_class[i])), s = d3.rgb(colourOf(R.base_class[i]));
      ctx.fillStyle = `rgba(${f.r},${f.g},${f.b},0.95)`;
      ctx.beginPath(); ctx.arc(x, y, rr, 0, 2 * Math.PI); ctx.fill();
      ctx.strokeStyle = `rgba(${s.r},${s.g},${s.b},0.95)`; ctx.lineWidth = Math.max(0.8, rr * 0.4);
      ctx.beginPath(); ctx.arc(x, y, rr + 0.7, 0, 2 * Math.PI); ctx.stroke();
    }

    // right column: two shift maps and the numbers
    const colH = H - top - bottom;
    const mapH = Math.round(colH * 0.37);
    const pr1 = shiftMap(ctx, { x: rx, y: top, w: rightW, h: mapH }, R, `time shift on the ${P.horizon_label || "reservoir"}`, S.reservoir);
    if (C && S.control) shiftMap(ctx, { x: rx, y: top + mapH + 16, w: rightW, h: mapH }, C, "the same on the control horizon (see caption)", S.control);
    // shift colour key
    const ky = top + 2 * mapH + 34, kw = Math.min(160, rightW - 40);
    for (let i = 0; i < kw; i++) {
      ctx.fillStyle = shiftColour(-SMAX + (2 * SMAX * i) / (kw - 1));
      ctx.fillRect(rx + 6 + i, ky, 1.5, 7);
    }
    ctx.font = `10.5px ${FONT}`; ctx.fillStyle = th.dim; ctx.textAlign = "left";
    ctx.fillText(`${ms(-SMAX)} earlier`, rx + 6, ky + 19);
    ctx.textAlign = "right"; ctx.fillText(`${ms(SMAX)} later`, rx + 6 + kw, ky + 19);
    ctx.textAlign = "left";

    // numbers, reservoir against control
    const r = S.reservoir, c = S.control;
    let y = ky + 42;
    const line = (t, strong) => { ctx.font = `${strong ? "600 " : ""}11px ${FONT}`; ctx.fillStyle = strong ? th.fg : th.dim; ctx.fillText(t, rx + 6, y); y += 15; };
    line("reservoir against control", true);
    line(`changed class: ${pct(r.changed_share)} of ${r.n.toLocaleString("en-GB")}${c ? ` · control ${pct(c.changed_share)} of ${c.n.toLocaleString("en-GB")}` : ""}`);
    line(`clear changes only: ${pct(r.changed_clear_share)}${c ? ` · control ${pct(c.changed_clear_share)}` : ""} (both assignments decisive)`);
    line(`median |shift|: ${r.abs_shift_median.toFixed(1)} ms${c ? ` · control ${c.abs_shift_median.toFixed(1)} ms` : ""} · bulk shift removed first: ${ms(P.bulk_shift_ms)}`);
    line(`NRMS median: ${r.nrms_median.toFixed(2)}${c ? ` · control ${c.nrms_median.toFixed(2)}` : ""} · amplitude ratio monitor/base: ${r.rms_ratio_median.toFixed(2)}${c ? ` · control ${c.rms_ratio_median.toFixed(2)}` : ""}`);
    if (P.commonest_change) line(`commonest change: class ${P.commonest_change.from} to ${P.commonest_change.to}, ${P.commonest_change.n.toLocaleString("en-GB")} picks`);

    // class key: the base centroids as small wiggles
    y += 6;
    line(`the ${K} classes (base centroids, shape only; count base to monitor)`, true);
    const off = P.core_offsets, n = off.length, span = Math.min(110, (rightW - 30) / 2 - 10);
    const amp = 13;
    P.classes.forEach((cl, m) => {
      const col = m % 2, row = Math.floor(m / 2);
      const x0 = rx + 6 + col * (span + 60), yc = y + row * 38 + 12;
      ctx.strokeStyle = colourOf(m); ctx.lineWidth = 1.6; ctx.beginPath();
      const vmax = d3.max(cl.centroid, (v) => Math.abs(v)) || 1;
      cl.centroid.forEach((v, i) => { const px = x0 + (i / (n - 1)) * span, py = yc - (v / vmax) * amp; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
      ctx.stroke();
      ctx.font = `10.5px ${FONT}`; ctx.fillStyle = th.dim;
      ctx.fillText(`${m}: ${cl.count_base.toLocaleString("en-GB")} to ${cl.count_monitor.toLocaleString("en-GB")}`, x0 + span + 6, yc + 4);
    });

    // callouts on the main map, all from the export's hotspots
    if (nAnnot && P.hotspots) {
      const items = [];
      const h = P.hotspots;
      if (h.change) items.push({ x: pr.X(h.change.cx), y: pr.Y(h.change.cy), r: 10, lines: [`Most changed ${h.cell.toFixed(0)} m cell`, `${h.change.n} of ${h.change.n_all} picks changed class clearly (${pct(h.change.share)})`, P.commonest_change ? `commonest change over the horizon: class ${P.commonest_change.from} to ${P.commonest_change.to}` : ""].filter(Boolean) });
      if (h.shift_earlier) items.push({ x: pr.X(h.shift_earlier.cx), y: pr.Y(h.shift_earlier.cy), r: 10, lines: [`Earliest cell`, `${h.shift_earlier.n} of ${h.shift_earlier.n_all} picks in the earliest 5% of shifts`] });
      if (h.shift_later) items.push({ x: pr.X(h.shift_later.cx), y: pr.Y(h.shift_later.cy), r: 10, lines: [`Latest cell`, `${h.shift_later.n} of ${h.shift_later.n_all} picks in the latest 5% of shifts`] });
      const use = items.slice(0, nAnnot);
      ctx.strokeStyle = th.fg; ctx.lineWidth = 1;
      use.forEach((it) => { ctx.beginPath(); ctx.arc(it.x, it.y, it.r + 3, 0, 2 * Math.PI); ctx.stroke(); });
      Art.annotate(ctx, W, H, use, use.map((it) => ({ x: it.x, y: it.y, r: it.r + 6 })), "boxed");
    }
    void pr1;
  }

  function render() {
    const { W, H } = Art.size();
    Art.caption(captionEl, P, captionLines());
    if (Art.param("format", "") === "svg") {
      canvas.style.display = "none"; captionEl.style.visibility = "hidden";
      let host = document.getElementById("svgout");
      if (!host) { host = document.createElement("div"); host.id = "svgout"; document.body.appendChild(host); }
      host.innerHTML = svgString();
      return;
    }
    const { ctx } = Art.fit(canvas, W, H);
    paint(ctx, W, H);
    Art.finish(ctx, W, H);
  }

  function svgString() {
    const { W, H } = Art.size();
    Art.caption(captionEl, P, captionLines());
    const svg = Art.svg(W, H);
    paint(svg, W, H);
    Art.drawCaption(svg, W, H);
    svg.meta.title = P.title || "4D: class change and time shift";
    svg.meta.desc = [P.attribution, `polarity: ${P.polarity}`, `source: ${P.source_file}`, P.bulk_note, ...(P.notes || []).slice(0, 4)].join(" | ");
    return svg.toString();
  }

  render();
  window.addEventListener("resize", render);
  window.addEventListener("keydown", (e) => {
    if (e.key === "r") { showRef = !showRef; render(); }
    else if (e.key === "s") Art.savePNG(canvas, "fourd.png");
    else if (e.key === "v") Art.saveText(svgString(), "fourd.svg", "image/svg+xml");
  });
})();
