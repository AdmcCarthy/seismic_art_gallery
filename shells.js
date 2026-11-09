// Concept E: trace shells.
// Each trace is drawn from its analytic signal: angle = unwrapped instantaneous phase
// (one turn per cycle of the wavelet), radius = time, stroke width = envelope, colour =
// instantaneous frequency (muted where the envelope is weak, because the phase rate is
// noise there). The same rule gives every trace its own shell. Shells sit on a grid by
// inline (rows) and crossline (columns). One routine paints to canvas or the SVG
// recorder; callouts (?annot=N) and highs/lows come from numbers in the export.
(async function () {
  const canvas = document.getElementById("c");
  const captionEl = document.getElementById("caption");
  let P;
  try {
    P = await Art.load(Art.param("data", "data/synthetic/shells.json"));
  } catch (e) {
    document.getElementById("error").textContent = String(e);
    return;
  }
  const th = Art.theme, paper = th.name === "paper";
  const FONT = "system-ui, 'Segoe UI', Helvetica, Arial, sans-serif";
  const nAnnot = +Art.param("annot", 3);
  const S = P.shells, ns = P.samples.length;
  const t0 = P.samples[0], t1 = P.samples[ns - 1], u = (P.domain && P.domain.vertical_unit) || "";
  const axis = P.domain && P.domain.vertical === "time" ? "TWT" : "depth";
  const rows = [...new Set(S.map((s) => s.inline))].sort((a, b) => a - b);
  const cols = [...new Set(S.map((s) => s.crossline))].sort((a, b) => a - b);
  // a second vintage per shell (shells_pair): the monitor's phase on the same radius,
  // coloured by the opening between the spirals instead of by frequency
  const hasPair = !!(P.pair && S[0].monitor_phase) && Art.param("pair", "1") !== "0";
  const OPEN_MAX = Math.PI / 2;  // a quarter turn either way saturates the colour
  const openRamp = d3.scaleLinear().domain([-OPEN_MAX, 0, OPEN_MAX])
    .range(paper ? ["#1b3f8a", "#8d8577", "#8a3a08"] : ["#7aa6ff", "#d8d2c4", "#ffb45c"]).interpolate(d3.interpolateLab).clamp(true);
  const hasFreq = !hasPair && !!(S[0].inst_freq_hz && P.freq_range_hz);
  const [f0, f1] = hasFreq ? P.freq_range_hz : [0, 1];
  const fLo = Math.max(0, f0 - 8), fHi = f1 + 8; // a little room either side of the shells' means
  // low frequency warm, high frequency cool; paper darkens
  const ramp = d3.scaleLinear().domain([fLo, (fLo + fHi) / 2, fHi])
    .range(paper ? ["#8a3a08", "#2f6f6b", "#1b3f8a"] : ["#ffb45c", "#6fd6c7", "#7aa6ff"]).interpolate(d3.interpolateLab).clamp(true);

  function captionLines() {
    if (hasPair) {
      const lines = [
        `Unwinding shells: ${S.length} traces on a ${rows.length} x ${cols.length} grid, each drawn twice from the same radius (${axis} ${t0} at the centre to ${t1} ${u} at the edge): the grey spiral is ${P.pair.base_label}'s instantaneous phase, the coloured one ${P.pair.monitor_label}'s at the same trace; where the earth did not change the two lie on each other`,
        `colour = the opening between the spirals (monitor phase minus base phase): blue where the monitor leads, orange where it lags, saturated at a quarter turn; width = the monitor's envelope; muted where the base's envelope is below ${(P.env_floor * 100).toFixed(0)}% of its maximum. The monitor was moved by ${P.pair.bulk_shift_ms >= 0 ? "+" : ""}${P.pair.bulk_shift_ms} ms and scaled by ${P.pair.scale.toFixed(2)} first (notes)`,
      ];
      if (nAnnot) lines.push("callouts: the shells whose spirals open most and least (median opening over the strong part), from the export");
      return lines;
    }
    const lines = [
      `Trace shells: ${S.length} traces on a ${rows.length} x ${cols.length} grid (rows = inline, columns = crossline). Angle = unwrapped instantaneous phase, one turn per cycle of the wavelet; radius = ${axis} from ${t0} (centre) to ${t1} ${u} (edge)`,
      `stroke width = envelope (relative); colour = instantaneous frequency${hasFreq ? ` (${fLo.toFixed(0)} warm to ${fHi.toFixed(0)} Hz cool)` : ""}, muted where the envelope is below ${(P.env_floor * 100).toFixed(0)}% of the trace's maximum (the phase rate is noise there)`,
    ];
    if (nAnnot) lines.push("callouts: turns = total phase / 2 pi; mean frequency is envelope-weighted over the strong part; ▲ / ▼ = highest / lowest mean frequency; all computed from the export");
    return lines;
  }

  // one spiral: angle from `ph`, width from `env`, colour from `colourAt(j)`
  function spiral(ctx, x, y, radiusOf, ph, env, emax, strong, colourAt, widthK, alphaStrong) {
    const SUB = 4;
    let px = x + radiusOf(t0) * Math.cos(ph[0]), py = y - radiusOf(t0) * Math.sin(ph[0]);
    for (let j = 1; j < ns; j++) {
      const e = env[j] / 255, on = strong(j);
      const c = d3.rgb(colourAt(j, on));
      ctx.strokeStyle = `rgba(${c.r},${c.g},${c.b},${on ? alphaStrong : 0.18})`;
      ctx.lineWidth = on ? (0.5 + 2.6 * Math.pow(e, 0.8)) * widthK : 0.45;
      ctx.beginPath(); ctx.moveTo(px, py);
      for (let k = 1; k <= SUB; k++) {
        const f = k / SUB;
        const t = P.samples[j - 1] + f * (P.samples[j] - P.samples[j - 1]);
        const a = ph[j - 1] + f * (ph[j] - ph[j - 1]), r = radiusOf(t);
        px = x + r * Math.cos(a); py = y - r * Math.sin(a);
        ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    void emax;
  }

  function paint(ctx, W, H) {
    ctx.fillStyle = th.bg;
    ctx.fillRect(0, 0, W, H);
    const top = 40, bottom = Math.max(180, captionEl.offsetHeight + 36), side = 36;
    const aw = W - 2 * side, ah = H - top - bottom;
    const cw = aw / cols.length, chh = ah / rows.length;
    const R = Math.min(cw, chh) * 0.44, r0 = R * 0.08;
    const radiusOf = (t) => r0 + ((R - r0) * (t - t0)) / (t1 - t0);
    const nodes = S.map((s) => ({
      s,
      x: side + (cols.indexOf(s.crossline) + 0.5) * cw,
      y: top + (rows.indexOf(s.inline) + 0.5) * chh,
    }));
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalCompositeOperation = th.blend;
    const neutral = paper ? "#9a948a" : "#3a4150";
    nodes.forEach(({ s, x, y }) => {
      const env = s.envelope, ph = s.phase, fq = s.inst_freq_hz;
      const emax = d3.max(env) || 1;
      const strong = (j) => env[j] >= P.env_floor * emax;  // relative to this trace
      if (hasPair) {
        // the base in grey underneath, the monitor on top coloured by the opening
        spiral(ctx, x, y, radiusOf, ph, env, emax, strong, () => (paper ? "#6f6a60" : "#8a93a6"), 0.7, 0.55);
        spiral(ctx, x, y, radiusOf, s.monitor_phase, s.monitor_envelope, emax, strong, (j, on) => (on ? openRamp(s.opening[j]) : neutral), 1, 0.9);
      } else {
        spiral(ctx, x, y, radiusOf, ph, env, emax, strong, (j, on) => (hasFreq && on ? ramp(fq[j]) : neutral), 1, 0.95);
      }
    });
    ctx.globalCompositeOperation = "source-over";

    // labels under each shell
    ctx.font = `11px ${FONT}`;
    ctx.textAlign = "center";
    nodes.forEach(({ s, x, y }) => {
      ctx.fillStyle = th.dim;
      ctx.fillText(`IL ${s.inline} · XL ${s.crossline}`, x, y + R + 13);
      if (s.peak_layer) { ctx.fillStyle = th.faint; ctx.fillText(s.peak_layer, x, y + R + 25); }
    });
    ctx.textAlign = "left";

    // pair callouts: the shells that open most and least
    if (nAnnot && hasPair) {
      const withOpen = nodes.filter((n) => n.s.opening_strong_median != null).sort((a, b) => a.s.opening_strong_median - b.s.opening_strong_median);
      const pick = [withOpen[withOpen.length - 1], withOpen[0]].filter((n, i, arr) => n && arr.indexOf(n) === i).slice(0, nAnnot);
      const items = pick.map((n, i) => ({
        x: n.x, y: n.y, r: R,
        lines: [
          `IL ${n.s.inline} / XL ${n.s.crossline}`,
          i === 0 ? "opens most" : "opens least",
          `median opening ${(n.s.opening_strong_median * 180 / Math.PI).toFixed(0)} deg over the strong part (${n.s.opening_strong_median >= 0 ? "monitor lags" : "monitor leads"})`,
          `${n.s.cycles.toFixed(1)} turns over ${t1 - t0} ${u}; strongest at ${axis} ${n.s.peak_time.toFixed(0)} ${u}`,
        ],
      }));
      const captionBlock = { x: 240, y: H - bottom / 2 + 18, r: bottom / 2 + 120 };  // keep labels off the caption
      Art.annotate(ctx, W, H, items, [...nodes.map((n) => ({ x: n.x, y: n.y, r: R + 14 })), captionBlock], "boxed");
      // key
      const kx = W - 16, ky = H - 16, kw = 150;
      for (let i = 0; i < kw; i++) { ctx.fillStyle = openRamp(-OPEN_MAX + (2 * OPEN_MAX * i) / (kw - 1)); ctx.fillRect(kx - kw + i, ky - 10, 1.5, 6); }
      ctx.font = `11px ${FONT}`; ctx.fillStyle = th.dim; ctx.textAlign = "right";
      ctx.fillText("colour: opening, monitor leads (blue) to lags (orange), a quarter turn", kx, ky - 16);
      ctx.fillText("width: the monitor's envelope (relative)", kx, ky - 30);
      ctx.textAlign = "left";
    }

    // callouts: highest and lowest mean frequency, strongest envelope
    if (nAnnot && hasFreq) {
      const byF = nodes.filter((n) => n.s.mean_freq_hz != null).sort((a, b) => a.s.mean_freq_hz - b.s.mean_freq_hz);
      const byE = nodes.slice().sort((a, b) => b.s.peak_envelope - a.s.peak_envelope);
      const pick = new Map();
      [byF[byF.length - 1], byF[0], byE[0]].forEach((n) => n && pick.set(n.s, n));
      const items = [...pick.values()].slice(0, nAnnot).map((n) => {
        const s = n.s, tag = s === byF[byF.length - 1].s ? "▲ highest mean frequency" : s === byF[0].s ? "▼ lowest mean frequency" : "strongest envelope";
        return {
          x: n.x, y: n.y, r: R, mark: tag[0] === "▲" ? "up" : tag[0] === "▼" ? "down" : "",
          lines: [
            `IL ${s.inline} / XL ${s.crossline}`,
            tag,
            `${s.cycles.toFixed(1)} turns over ${t1 - t0} ${u}; mean ${s.mean_freq_hz.toFixed(1)} Hz over the strong ${(s.strong_share * 100).toFixed(0)}%`,
            `strongest at ${axis} ${s.peak_time.toFixed(0)} ${u}${s.peak_layer ? ` (${s.peak_layer})` : ""}`,
          ],
        };
      });
      items.forEach((it) => {
        if (!it.mark) return;
        const up = it.mark === "up", sz = 6, d = up ? -1 : 1, y = it.y - it.r - 8;
        ctx.beginPath(); ctx.moveTo(it.x, y + d * sz); ctx.lineTo(it.x - sz, y - d * sz); ctx.lineTo(it.x + sz, y - d * sz); ctx.closePath();
        ctx.fillStyle = th.fg; ctx.fill();
      });
      Art.annotate(ctx, W, H, items, nodes.map((n) => ({ x: n.x, y: n.y, r: R + 14 })), "boxed");
    }

    // key: colour = frequency, width = envelope
    if (hasFreq) {
      const kx = W - 16, ky = H - 16, kw = 150;
      for (let i = 0; i < kw; i++) {
        ctx.fillStyle = ramp(fLo + ((fHi - fLo) * i) / (kw - 1));
        ctx.fillRect(kx - kw + i, ky - 10, 1.5, 6);
      }
      ctx.font = `11px ${FONT}`; ctx.fillStyle = th.dim; ctx.textAlign = "right";
      ctx.fillText(`colour: instantaneous frequency ${fLo.toFixed(0)} to ${fHi.toFixed(0)} Hz`, kx, ky - 16);
      ctx.fillText("width: envelope (relative)", kx, ky - 30);
      ctx.textAlign = "left";
    }
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
    svg.meta.title = P.title || "Trace shells";
    svg.meta.desc = [P.attribution, `polarity: ${P.polarity}`, ...(P.notes || []).slice(0, 4)].join(" | ");
    return svg.toString();
  }

  render();
  window.addEventListener("resize", render);
  window.addEventListener("keydown", (e) => {
    if (e.key === "s") Art.savePNG(canvas, "trace-shells.png");
    else if (e.key === "v") Art.saveText(svgString(), "trace-shells.svg", "image/svg+xml");
  });
})();
