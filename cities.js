// Concept B: waveform cities.
// Each group of picks with a similar waveform SHAPE (a SOM node, or a k-means class)
// is a city. Area is proportional to the number of picks. Inside, every pick is a
// spoke: its waveform runs outward along the spoke and wiggles sideways by its
// amplitude, so strong picks are wavier. Spokes are ordered by RMS strength round the
// city. SOM cities stay near their SOM grid position (neighbours look alike) and a
// collision force keeps them from overlapping.
//
// One routine (paint) draws onto a Canvas 2D context OR the SVG recorder from common.js,
// so the same picture can be saved as PNG (s) or vector SVG (v). Static callouts
// (?annot=N) label the largest cities and the extremes of one feature (?akey=...) with
// means computed from the exported data over every pick in the city.
(async function () {
  const canvas = document.getElementById("c");
  const captionEl = document.getElementById("caption");
  let P;
  try {
    P = await Art.load(Art.param("data", "data/synthetic/cities_wedge.json"));
  } catch (e) {
    document.getElementById("error").textContent = String(e);
    return;
  }
  let by = Art.param("by", "som");
  if (by === "som" && !P.som) by = "kmeans";
  if (by === "kmeans" && !P.kmeans) by = "som";
  const th = Art.theme;
  const nAnnot = +Art.param("annot", 6);
  const FONT = "system-ui, 'Segoe UI', Helvetica, Arial, sans-serif";

  const m = P.offsets.length;
  const rows = P.waveform_rows;
  const wf = P.waveforms;
  const rms = P.features.rms;
  const absAll = [];
  wf.forEach((w) => w.forEach((v) => absAll.push(Math.abs(v))));
  absAll.sort((a, b) => a - b);
  const ampRef = absAll[Math.floor(absAll.length * 0.98)] || 1;

  // 2D colour over the SOM grid: four corners blended in Lab, so neighbours match.
  const corners = ["#ff8a5b", "#f2d16b", "#5b8cff", "#41d6a5"]; // TL TR BL BR
  const lab = d3.interpolateLab;
  const gridColour = (u, v) => lab(lab(corners[0], corners[1])(u), lab(corners[2], corners[3])(u))(v);

  function build(kind) {
    let n, counts, labelOf, labels, anchor, colour;
    if (kind === "som") {
      const [R, C] = P.som.shape;
      n = R * C;
      counts = P.som.counts;
      labels = P.som.bmu;
      anchor = (j) => [((j % C) + 0.5) / C, (Math.floor(j / C) + 0.5) / R];
      colour = (j) => gridColour(((j % C) + 0.5) / C, (Math.floor(j / C) + 0.5) / R);
    } else {
      n = P.kmeans.k;
      counts = P.kmeans.counts;
      labels = P.kmeans.labels;
      anchor = (j) => [0.5 + 0.22 * Math.cos((2 * Math.PI * j) / n - 1), 0.5 + 0.22 * Math.sin((2 * Math.PI * j) / n - 1)];
      colour = (j) => d3.schemeTableau10[j % 10];
    }
    labelOf = (row) => labels[row];
    const members = Array.from({ length: n }, () => []);
    rows.forEach((row, k) => members[labelOf(row)].push(k));
    return { n, counts, labels, anchor, colour, members, total: d3.sum(counts) };
  }

  // ---- callouts: what to say about which cities --------------------------------
  const FMT = {
    thickness_truth: (v) => `bed ${v.toFixed(0)} ms (synthetic truth)`,
    rms: (v) => `rms ${v.toFixed(2)}`,
    signed_peak: (v) => `peak ${v >= 0 ? "+" : ""}${v.toFixed(2)}`,
    dominant_frequency_hz: (v) => `${v.toFixed(0)} Hz`,
    envelope_peak: (v) => `env ${v.toFixed(2)}`,
    pick_residual: (v) => `pick resid. ${v.toFixed(1)} ms`,
  };
  const akey = Art.param("akey", P.features.thickness_truth ? "thickness_truth" : P.features.rms ? "rms" : "");
  const detail = ["rms", "signed_peak", "dominant_frequency_hz"].filter((k) => P.features[k] && k !== akey);

  function groupMeans(g, key) {
    const sum = new Float64Array(g.n), cnt = new Float64Array(g.n), a = P.features[key];
    g.labels.forEach((j, i) => { sum[j] += a[i]; cnt[j] += 1; });
    return Array.from(sum, (s, j) => (cnt[j] ? s / cnt[j] : NaN));
  }

  function callouts(g, nodes) {
    if (!nAnnot || !akey || !P.features[akey]) return [];
    const means = {};
    [akey, ...detail].forEach((k) => (means[k] = groupMeans(g, k)));
    const big = nodes.filter((d) => d.count >= 0.01 * g.total);
    const byKey = big.slice().sort((a, b) => means[akey][a.id] - means[akey][b.id]);
    const pick = new Map();
    const add = (d) => d && pick.set(d.id, d);
    nodes.slice().sort((a, b) => b.count - a.count).slice(0, 2).forEach(add); // the two largest
    add(byKey[0]); add(byKey[byKey.length - 1]);                               // the extremes
    for (let q = 1; pick.size < nAnnot && q < nAnnot; q++) add(byKey[Math.round((q * (byKey.length - 1)) / nAnnot)]);
    // highs and lows: which cities have the highest and lowest MEAN of the key feature
    // (among cities of at least 1% of the picks), and within a city the spread of its
    // picks and the single highest and lowest pick with where they are. The extreme
    // picks are outliers by construction; the middle 90% is the city's typical range.
    const stats = ((by === "som" ? P.som : P.kmeans).stats || {})[akey];
    const unit = akey === "thickness_truth" ? " ms" : "";
    const num = (v) => (akey === "thickness_truth" ? v.toFixed(0) : v.toFixed(2)) + unit;
    const hiCity = byKey[byKey.length - 1], loCity = byKey[0];
    return [...pick.values()].slice(0, nAnnot).map((d) => {
      const s = stats && stats[d.id];
      const tag = d === hiCity ? "▲ highest mean of the cities" : d === loCity ? "▼ lowest mean of the cities" : "";
      return {
        x: d.x, y: d.y, r: d.R, mark: d === hiCity ? "up" : d === loCity ? "down" : "",
        lines: [
          tag,
          `n = ${d.count.toLocaleString("en-GB")} (${((100 * d.count) / g.total).toFixed(0)}%)`,
          FMT[akey] ? FMT[akey](means[akey][d.id]) : `${akey} ${means[akey][d.id].toFixed(2)}`,
          s ? `middle 90%: ${num(s.p_low)} to ${num(s.p_high)}` : "",
          s ? `highest pick ${num(s.high)} at IL ${s.high_inline} / XL ${s.high_crossline}` : "",
          s ? `lowest pick ${num(s.low)} at IL ${s.low_inline} / XL ${s.low_crossline}` : "",
          detail.map((k) => (FMT[k] ? FMT[k](means[k][d.id]) : k)).join(" · "),
        ].filter(Boolean),
      };
    });
  }

  function captionLines() {
    const lines = [
      `Cities = ${by === "som" ? "SOM nodes" : "k-means classes"} of waveform SHAPE along horizon "${P.horizon}"; area ∝ number of picks (n=${P.n})`,
      `spoke = one pick: its ${P.offsets[0]}…+${P.offsets[m - 1]} ${P.offset_unit} window runs outward and wiggles by amplitude (relative); spokes ordered by RMS`,
      by === "som" ? "colour = position on the SOM grid; cities stay near it, nudged apart by a collision force" : "k-means classes are unordered; the number of classes is a choice, not a finding",
    ];
    if (nAnnot && akey && P.features[akey]) {
      lines.push(`callouts: n = picks in the city; means over every pick in it${akey === "thickness_truth" ? "; thickness is the bed thickness built into the synthetic cube, not observable in real data" : ""}`);
      if ((by === "som" ? P.som : P.kmeans).stats) {
        lines.push(`▲ / ▼ mark the cities with the highest / lowest mean of ${akey}; "middle 90%" is the 5th to 95th percentile over the picks in the city, and the highest and lowest single picks (with where) are outliers, often mis-tracked picks`);
      }
    }
    return lines;
  }

  function paint(ctx, W, H) {
    ctx.fillStyle = th.bg;
    ctx.fillRect(0, 0, W, H);
    const g = build(by);
    const top = 56, bottom = Math.max(190, captionEl.offsetHeight + 36), side = 40;
    const aw = W - 2 * side, ah = H - top - bottom;
    const rng = Art.rng(7);

    const nodes = [];
    for (let j = 0; j < g.n; j++) {
      if (g.counts[j] <= 0) continue;
      const [ax, ay] = g.anchor(j);
      nodes.push({
        id: j,
        count: g.counts[j],
        R: Math.sqrt((0.26 * aw * ah * g.counts[j]) / g.total / Math.PI),
        tx: side + ax * aw,
        ty: top + ay * ah,
        x: side + ax * aw + (rng() - 0.5) * 4,
        y: top + ay * ah + (rng() - 0.5) * 4,
        members: g.members[j],
        colour: g.colour(j),
      });
    }
    const sim = d3.forceSimulation(nodes)
      .force("x", d3.forceX((d) => d.tx).strength(by === "som" ? 0.1 : 0.04))
      .force("y", d3.forceY((d) => d.ty).strength(by === "som" ? 0.1 : 0.04))
      .force("collide", d3.forceCollide((d) => d.R + 5).iterations(6))
      .stop();
    for (let i = 0; i < 500; i++) sim.tick();

    ctx.globalCompositeOperation = th.blend;
    nodes.forEach((d) => {
      const c = d3.rgb(th.ink(d.colour));
      // soft disk and boundary
      const grad = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.R);
      grad.addColorStop(0, `rgba(${c.r},${c.g},${c.b},${th.diskAlpha[0]})`);
      grad.addColorStop(1, `rgba(${c.r},${c.g},${c.b},${th.diskAlpha[1]})`);
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(d.x, d.y, d.R, 0, 2 * Math.PI); ctx.fill();
      ctx.strokeStyle = `rgba(${c.r},${c.g},${c.b},0.3)`;
      ctx.lineWidth = 0.8;
      ctx.stroke();

      // spokes: members ordered by RMS, thinned to a number that suits the size
      const ordered = d.members.slice().sort((a, b) => rms[rows[a]] - rms[rows[b]]);
      // few enough spokes that each waveform's wiggle can be seen
      const nS = Math.min(ordered.length, Math.max(14, Math.round(0.5 * d.R)));
      if (!nS) return;
      const phase = rng() * 2 * Math.PI;
      const rho0 = d.R * 0.06;
      const spacing = (2 * Math.PI * d.R * 0.6) / nS;
      const K = (1.4 * spacing) / ampRef; // a typical strong pick sways ~1.4 spokes
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = `rgba(${c.r},${c.g},${c.b},${th.spokeAlpha})`;
      ctx.beginPath(); // all spokes of a city in ONE path: far fewer calls and a smaller SVG
      for (let s = 0; s < nS; s++) {
        const member = ordered[Math.min(ordered.length - 1, Math.floor(((s + 0.5) * ordered.length) / nS))];
        const w = wf[member];
        const phi = phase + (2 * Math.PI * s) / nS;
        const cs = Math.cos(phi), sn = Math.sin(phi);
        for (let j = 0; j < m; j++) {
          const rho = rho0 + ((d.R - rho0) * j) / (m - 1);
          const off = Math.max(-2.2 * spacing, Math.min(2.2 * spacing, w[j] * K));
          const x = d.x + rho * cs - off * sn, y = d.y + rho * sn + off * cs;
          j ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
      }
      ctx.stroke();
    });
    ctx.globalCompositeOperation = "source-over";

    // static callouts
    const notes = callouts(g, nodes);
    notes.forEach((it) => {  // ▲ / ▼ above the cities with the highest / lowest mean
      if (!it.mark) return;
      const up = it.mark === "up", s = 6, d = up ? -1 : 1, y = it.y - it.r - 9;
      ctx.beginPath();
      ctx.moveTo(it.x, y + d * s); ctx.lineTo(it.x - s, y - d * s); ctx.lineTo(it.x + s, y - d * s);
      ctx.closePath();
      ctx.fillStyle = th.fg; ctx.fill();
      ctx.strokeStyle = th.bg; ctx.lineWidth = 1.2; ctx.stroke();
    });
    if (notes.length) Art.annotate(ctx, W, H, notes, nodes.map((d) => ({ x: d.x, y: d.y, r: d.R })));

    // key: what each colour / position means
    const keyX = W - 16, keyY = H - 16;
    ctx.font = `11px ${FONT}`;
    if (by === "som") {
      const [R, C] = P.som.shape;
      const cell = Math.min(28, Math.min(W * 0.26, 180) / C);
      const x0 = keyX - C * cell, y0 = keyY - R * cell;
      ctx.fillStyle = th.dim;
      ctx.textAlign = "right";
      ctx.fillText("SOM key: waveform shape of each node", keyX, y0 - 22);
      ctx.fillText("(neighbouring squares look alike)", keyX, y0 - 8);
      ctx.textAlign = "left";
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
        const j = r * C + c, cb = P.som.codebook[j];
        ctx.strokeStyle = th.ink(gridColour((c + 0.5) / C, (r + 0.5) / R));
        ctx.lineWidth = 1;
        ctx.globalAlpha = P.som.counts[j] > 0 ? 1 : 0.25;
        ctx.beginPath();
        const mx = d3.max(cb, Math.abs) || 1;
        cb.forEach((v, i) => {
          const px = x0 + c * cell + 3 + (i / (cb.length - 1)) * (cell - 6);
          const py = y0 + r * cell + cell / 2 - (v / mx) * (cell * 0.38);
          i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        });
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    } else {
      P.kmeans.centroids.forEach((cen, j) => {
        const x0 = keyX - 110, y0 = keyY - 30 - (P.kmeans.k - 1 - j) * 34;
        ctx.strokeStyle = th.ink(d3.schemeTableau10[j % 10]); ctx.lineWidth = 1.2;
        ctx.beginPath();
        const mx = d3.max(cen, Math.abs) || 1;
        cen.forEach((v, i) => {
          const px = x0 + (i / (cen.length - 1)) * 100, py = y0 - (v / mx) * 13;
          i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        });
        ctx.stroke();
        ctx.fillStyle = th.dim;
        ctx.fillText(`class ${j} · n=${P.kmeans.counts[j]}`, x0 - 100, y0 + 4);
      });
    }
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
    svg.meta.title = P.title || "Waveform cities";
    svg.meta.desc = [P.attribution, `polarity: ${P.polarity}`, `source: ${P.source_file}`, ...(P.notes || []).slice(0, 4)].join(" | ");
    return svg.toString();
  }

  render();
  window.addEventListener("resize", render);
  window.addEventListener("keydown", (e) => {
    if (e.key === "g") { by = by === "som" ? "kmeans" : "som"; render(); }
    else if (e.key === "s") Art.savePNG(canvas, `waveform-cities-${by}.png`);
    else if (e.key === "v") Art.saveText(svgString(), `waveform-cities-${by}.svg`, "image/svg+xml");
  });
})();
