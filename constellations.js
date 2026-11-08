// Concept F: fault constellations.
// Map view of a horizon. Every pick is a grain of dust; picks whose waveform differs
// from their neighbours' (high discontinuity, found in Python) are stars, sized by how
// much they differ; stars near one another are joined into constellations. Reference
// lines (the interpreters' faults, or a synthetic cube's built-in fault) can be shown
// for comparison (?ref=1, key r). Callouts name the largest constellations with their
// length and azimuth, and the check against the reference, all from the export.
(async function () {
  const canvas = document.getElementById("c");
  const captionEl = document.getElementById("caption");
  let P;
  try {
    P = await Art.load(Art.param("data", "data/synthetic/constellations.json"));
  } catch (e) {
    document.getElementById("error").textContent = String(e);
    return;
  }
  const th = Art.theme, paper = th.name === "paper";
  const FONT = "system-ui, 'Segoe UI', Helvetica, Arial, sans-serif";
  const nAnnot = +Art.param("annot", 3);
  let showRef = Art.param("ref", "1") !== "0" && !!P.reference;
  const ST = P.stars, groups = P.constellations;
  const dMin = P.disc_percentiles["90"], dMax = d3.max(ST.disc) || 1;
  const starR = (d) => 1.2 + 4.5 * Math.pow(Math.max(0, (d - dMin) / (dMax - dMin || 1)), 0.7);
  const starColour = paper ? "#1d232e" : "#fff4d6";
  const lineColour = paper ? "rgba(29,35,46,0.45)" : "rgba(255,244,214,0.35)";

  function captionLines() {
    const lines = [
      `Fault constellations on "${P.horizon}": ${P.n.toLocaleString("en-GB")} picks as dust; ${ST.x.length} stars = picks whose waveform differs most from their neighbours' (discontinuity above the 97th percentile, ${P.disc_percentiles["97"].toFixed(2)}; 50th ${P.disc_percentiles["50"].toFixed(2)}); star size = discontinuity`,
      `${groups.length} constellations: stars joined to their nearest neighbours; star brightness = signal strength of the window (a faint star differs from its neighbours partly because noise never correlates); a star marks a lateral change of waveform (fault, edge, pinch-out or mis-tracked pick), not a fault as such`,
    ];
    if (P.truth) {
      lines.push(`check against ${P.truth.label}: ${(P.truth.stars_near * 100).toFixed(0)}% of the stars lie near it, against ${(P.truth.all_picks_near * 100).toFixed(0)}% of all picks${P.truth.stars_near_strong != null ? `; of the ${P.truth.n_strong} stars whose window carries at least ${P.truth.strong_threshold}x the median signal, ${(P.truth.stars_near_strong * 100).toFixed(0)}% lie near it` : ""}`);
    }
    if (P.reference && showRef) lines.push(`dashed lines: ${P.reference.label}`);
    return lines;
  }

  function paint(ctx, W, H) {
    ctx.fillStyle = th.bg;
    ctx.fillRect(0, 0, W, H);
    const top = 30, bottom = Math.max(170, captionEl.offsetHeight + 36), side = 40;
    const [x0, y0, x1, y1] = P.bbox;
    const sc = Math.min((W - 2 * side) / (x1 - x0), (H - top - bottom) / (y1 - y0));
    const ox = (W - sc * (x1 - x0)) / 2, oy = top + ((H - top - bottom) - sc * (y1 - y0)) / 2;
    const X = (x) => ox + (x - x0) * sc, Y = (y) => oy + (y1 - y) * sc;

    // dust: every pick, faintly, a little brighter where the discontinuity is higher
    const D = P.dust;
    for (let i = 0; i < D.x.length; i++) {
      const d = D.disc[i];
      const a = d == null ? 0.08 : 0.08 + 0.35 * Math.min(1, d / (dMin || 1));
      ctx.fillStyle = paper ? `rgba(29,35,46,${a * 0.6})` : `rgba(200,210,230,${a})`;
      ctx.fillRect(X(D.x[i]) - 0.6, Y(D.y[i]) - 0.6, 1.2, 1.2);
    }

    // reference lines
    if (showRef && P.reference) {
      ctx.save();
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = paper ? "rgba(122,47,8,0.7)" : "rgba(255,160,90,0.6)";
      ctx.lineWidth = 1.1;
      P.reference.lines.forEach((pl) => {
        ctx.beginPath();
        pl.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1]))));
        ctx.stroke();
      });
      ctx.restore();
    }

    // constellation lines
    ctx.strokeStyle = lineColour;
    ctx.lineWidth = 0.9;
    groups.forEach((g) => {
      g.edges.forEach(([a, b]) => {
        ctx.beginPath(); ctx.moveTo(X(ST.x[a]), Y(ST.y[a])); ctx.lineTo(X(ST.x[b]), Y(ST.y[b])); ctx.stroke();
      });
    });

    // stars: size = discontinuity, brightness = signal strength (a weak-signal star
    // differs from its neighbours partly because noise never correlates)
    const sc3 = d3.rgb(starColour);
    const bright = (i) => 0.3 + 0.7 * Math.min(1, (ST.rms_ratio ? ST.rms_ratio[i] : 1) / 1.5);
    // a crowded sky (a thousand stars 25 m apart along the fault zones) would burn out
    // under additive glows: scale the glow and the core down with the star count
    const dense = Math.min(1, 300 / ST.x.length);
    const glowA = 0.55 * (0.3 + 0.7 * dense), coreK = 0.6 + 0.4 * dense;
    ctx.globalCompositeOperation = th.blend;
    for (let i = 0; i < ST.x.length; i++) {
      const r = starR(ST.disc[i]) * coreK, x = X(ST.x[i]), y = Y(ST.y[i]), a = bright(i);
      if (!paper) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
        g.addColorStop(0, `rgba(255,244,214,${glowA * a})`); g.addColorStop(1, "rgba(255,244,214,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 3, 0, 2 * Math.PI); ctx.fill();
      }
      ctx.fillStyle = `rgba(${sc3.r},${sc3.g},${sc3.b},${a})`; ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";

    // callouts: the largest constellations, and the brightest star
    if (nAnnot) {
      const items = groups.slice(0, Math.max(0, nAnnot - 1)).map((g, k) => ({
        x: X(g.cx), y: Y(g.cy), r: 10,
        lines: [
          `Constellation ${k + 1}: ${g.members.length} stars`,
          `length ${g.length.toFixed(0)} map units${g.azimuth_deg == null ? "" : ` · azimuth ${String(Math.round(g.azimuth_deg)).padStart(3, "0")}°`}`,
          `discontinuity ${d3.min(g.members, (m) => ST.disc[m]).toFixed(2)} to ${d3.max(g.members, (m) => ST.disc[m]).toFixed(2)}${ST.rms_ratio ? `; signal x${d3.median(g.members, (m) => ST.rms_ratio[m]).toFixed(1)} the median window` : ""}`,
        ],
      }));
      const b = d3.maxIndex(ST.disc);
      items.push({
        x: X(ST.x[b]), y: Y(ST.y[b]), r: starR(ST.disc[b]) + 2,
        lines: [`Most discontinuous star`, `IL ${ST.inline[b]} / XL ${ST.crossline[b]} · ${ST.time[b].toFixed(0)} ms`, `discontinuity ${ST.disc[b].toFixed(2)} (median pick ${P.disc_percentiles["50"].toFixed(2)})${ST.rms_ratio ? `; signal x${ST.rms_ratio[b].toFixed(1)} the median window` : ""}`],
      });
      ctx.strokeStyle = th.fg; ctx.lineWidth = 1;
      items.forEach((it) => { ctx.beginPath(); ctx.arc(it.x, it.y, it.r + 3, 0, 2 * Math.PI); ctx.stroke(); });
      Art.annotate(ctx, W, H, items, items.map((it) => ({ x: it.x, y: it.y, r: it.r + 6 })), "boxed");
    }

    // key
    ctx.font = `11px ${FONT}`; ctx.fillStyle = th.dim; ctx.textAlign = "right";
    const kx = W - 16, ky = H - 16;
    ctx.fillText("star size: discontinuity (1 - lower-quartile shape correlation with neighbours)", kx, ky - 6);
    ctx.textAlign = "left";
    [dMin, (dMin + dMax) / 2, dMax].forEach((d, i) => {
      const x = kx - 190 + i * 64;
      ctx.fillStyle = starColour; ctx.beginPath(); ctx.arc(x, ky - 28, starR(d), 0, 2 * Math.PI); ctx.fill();
      ctx.fillStyle = th.dim; ctx.fillText(d.toFixed(2), x + 10, ky - 24);
    });
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
    svg.meta.title = P.title || "Fault constellations";
    svg.meta.desc = [P.attribution, `polarity: ${P.polarity}`, `source: ${P.source_file}`, ...(P.notes || []).slice(0, 4)].join(" | ");
    return svg.toString();
  }

  render();
  window.addEventListener("resize", render);
  window.addEventListener("keydown", (e) => {
    if (e.key === "r") { showRef = !showRef; render(); }
    else if (e.key === "s") Art.savePNG(canvas, "fault-constellations.png");
    else if (e.key === "v") Art.saveText(svgString(), "fault-constellations.svg", "image/svg+xml");
  });
})();
