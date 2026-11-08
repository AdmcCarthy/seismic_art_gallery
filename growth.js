// Concept C: rings per horizon.
// Each SITE (a map location, here an amplitude anomaly) is a tree-ring form: one band
// per horizon, the oldest (deepest) in the middle and the youngest outside. As in a
// tree, a band's WIDTH is that horizon's "growth": at every angle it is proportional to
// the attribute read round a circle of fixed map radius about the site on that horizon.
// Bands stack outward, so a site whose anomaly grows toward the present gets wide
// outer bands and a large overall size, and a shrinking one gets narrow outer bands.
// Sites sit near their map position, nudged apart by a collision force.
//
// One routine (paint) draws onto a Canvas 2D context OR the SVG recorder from common.js,
// so the picture can be saved as PNG (s) or vector SVG (v). Static callouts (?annot=N,
// default all sites) give each site's growth (outer vs inner band mean, computed from
// the data), and the synthetic truth when the data carries it.
(async function () {
  const canvas = document.getElementById("c");
  const captionEl = document.getElementById("caption");
  let P;
  try {
    P = await Art.load(Art.param("data", "data/synthetic/growth.json"));
  } catch (e) {
    document.getElementById("error").textContent = String(e);
    return;
  }
  const H = P.horizons.length, A = P.n_angles, S = P.sites.length;
  const th = Art.theme;
  const nAnnot = Math.min(+Art.param("annot", S), S);
  const FONT = "system-ui, 'Segoe UI', Helvetica, Arial, sans-serif";

  // deepest (oldest) first = innermost; colour runs from deep violet to pale gold
  const ramp = d3.interpolateRgbBasis(["#4b2a8a", "#2f6fc4", "#27b39a", "#f2e27a"]);
  const colour = (h) => th.ink(ramp(H > 1 ? h / (H - 1) : 0.5));

  // mean value of the outermost vs innermost band, per site: how much it grew
  const inner = P.profiles.map((site) => d3.mean(site[0]));
  const outer = P.profiles.map((site) => d3.mean(site[H - 1]));
  const ratio = inner.map((v, i) => outer[i] / v);
  const arrowOf = (g) => (g > 1.25 ? "↑" : g < 0.8 ? "↓" : "≈");

  // a horizon is named from the interpreters' file name when the export carries it
  const hlabel = (h) => (P.horizon_labels && P.horizon_labels[h]) || P.horizons[h];
  const xs = P.sites.map((s) => s.x), ys = P.sites.map((s) => s.y);
  const x0 = d3.min(xs), x1 = d3.max(xs), y0 = d3.min(ys), y1 = d3.max(ys);
  const hasTruth = P.sites.some((s) => s.truth);
  const hasHL = +Art.param("hl", 1) > 0 && P.sites.every((s) => s.high && s.low);
  // map azimuth (clockwise from north) of an angle counter-clockwise from east
  const azimuth = (deg) => String(Math.round((((90 - deg) % 360) + 360) % 360)).padStart(3, "0");

  function captionLines() {
    const lines = [
      `Rings per horizon: ${S} sites, ${H} horizons. Band width at each angle ∝ ${P.attribute} on a circle of radius ${P.radius} (coordinate units) round the site`,
      "bands run from the oldest horizon (centre) to the youngest (outside); sites sit near their map position, nudged apart by a collision force",
    ];
    lines.push(nAnnot
      ? `callouts: outer vs inner band mean of ${P.attribute} (× = growth toward the present, computed from the data)${hasTruth ? "; 'truth' is what was built into the synthetic cube" : ""}`
      : "label: outer vs inner band mean (× = growth toward the present, computed from the data)");
    if (hasHL) {
      lines.push(`▲ high / ▼ low: the highest and lowest ${P.attribute} on any horizon and bearing round each site (profiles smoothed round the circle first); azimuth is the map bearing clockwise from north; contrast = high / low`);
    }
    return lines;
  }

  function paint(ctx, W, Hh) {
    ctx.fillStyle = th.bg;
    ctx.fillRect(0, 0, W, Hh);
    // reserve the bottom for the caption as it is actually laid out
    const top = 50, bottom = Math.max(160, captionEl.offsetHeight + 40), side = 60;
    const aw = W - 2 * side, ah = Hh - top - bottom;
    const target = Math.min(aw, ah) * 0.17;      // typical outer radius
    const r0 = target * 0.12;
    const wAvg = (target - r0) / H;              // average band width
    const w0 = 0.25 * wAvg, k = 1.5 * wAvg;      // band width = w0 + k * value / clip

    // cumulative radii: R[site][h][angle]; bands never cross
    const R = P.profiles.map((site) => {
      let prev = new Array(A).fill(r0);
      return site.map((row) => {
        prev = row.map((v, a) => prev[a] + w0 + (k * Math.max(v, 0)) / P.value_clip);
        return prev;
      });
    });

    const nodes = P.sites.map((s, i) => ({
      i,
      tx: side + ((s.x - x0) / (x1 - x0 || 1)) * aw,
      ty: top + (1 - (s.y - y0) / (y1 - y0 || 1)) * ah,
      r: d3.max(R[i][H - 1]),
    }));
    nodes.forEach((n) => { n.x = n.tx; n.y = n.ty; });
    const sim = d3.forceSimulation(nodes)
      .force("x", d3.forceX((d) => d.tx).strength(0.12))
      .force("y", d3.forceY((d) => d.ty).strength(0.12))
      .force("collide", d3.forceCollide((d) => d.r + 12).iterations(6))
      .stop();
    for (let t = 0; t < 400; t++) sim.tick();
    nodes.forEach((n) => {   // keep every site fully on the canvas
      n.x = Math.max(n.r + 10, Math.min(W - n.r - 10, n.x));
      n.y = Math.max(top + n.r, Math.min(Hh - bottom - 20 - n.r, n.y));
    });

    const line = d3.lineRadial().curve(d3.curveCatmullRomClosed.alpha(0.5)).context(ctx);
    const poly = (radii) =>
      radii.map((r, a) => [Math.PI / 2 - (2 * Math.PI * a) / A, r]); // 0 = east, counter-clockwise
    const bandAlpha = th.name === "paper" ? 0.72 : 0.55;

    nodes.forEach((n) => {
      ctx.save();
      ctx.translate(n.x, n.y);
      for (let h = 0; h < H; h++) {
        const outerR = poly(R[n.i][h]);
        const innerR = poly(h ? R[n.i][h - 1] : new Array(A).fill(r0));
        const c = d3.rgb(colour(h));
        ctx.beginPath();
        line(outerR); ctx.closePath();
        line(innerR); ctx.closePath();
        ctx.fillStyle = `rgba(${c.r},${c.g},${c.b},${bandAlpha})`;
        ctx.fill("evenodd");
        ctx.beginPath();
        line(outerR); ctx.closePath();
        ctx.strokeStyle = `rgba(${c.r},${c.g},${c.b},0.95)`;
        ctx.lineWidth = 1.3;
        ctx.stroke();
      }
      ctx.restore();
    });

    // highs and lows round each site: marks in the middle of the band of that horizon at
    // that bearing (▲ highest, ▼ lowest)
    if (hasHL) {
      const at = (n, e) => {
        const a = Math.round(((e.angle_deg % 360) / 360) * A) % A;
        const r = (R[n.i][e.horizon][a] + (e.horizon ? R[n.i][e.horizon - 1][a] : r0)) / 2;
        const phi = (e.angle_deg * Math.PI) / 180;
        return [n.x + r * Math.cos(phi), n.y - r * Math.sin(phi)];
      };
      const tri = (x, y, up) => {
        const s = 5.5, d = up ? -1 : 1;
        ctx.beginPath();
        ctx.moveTo(x, y + d * s); ctx.lineTo(x - s, y - d * s); ctx.lineTo(x + s, y - d * s);
        ctx.closePath();
      };
      nodes.forEach((n) => {
        [["high", true], ["low", false]].forEach(([k, up]) => {
          const [x, y] = at(n, P.sites[n.i][k]);
          tri(x, y, up);
          ctx.fillStyle = th.fg; ctx.fill();
          ctx.strokeStyle = th.bg; ctx.lineWidth = 1.2; ctx.stroke();
        });
      });
    }

    if (nAnnot) {
      // the sites whose growth departs most from "unchanged" come first when not all fit
      const order = nodes.map((n) => n.i).sort((a, b) => Math.abs(Math.log(ratio[b])) - Math.abs(Math.log(ratio[a])));
      const chosen = new Set(order.slice(0, nAnnot));
      const items = nodes.filter((n) => chosen.has(n.i)).map((n) => ({
        x: n.x, y: n.y, r: n.r,
        lines: [
          `${P.sites[n.i].name}  ${arrowOf(ratio[n.i])} ×${ratio[n.i].toFixed(1)}`,
          `${P.attribute}: oldest band${P.horizon_labels ? ` (${hlabel(0)})` : ""} ${inner[n.i].toFixed(2)} → youngest${P.horizon_labels ? ` (${hlabel(H - 1)})` : ""} ${outer[n.i].toFixed(2)}`,
          ...(hasHL ? (() => {
            const s = P.sites[n.i], t = (e) => P.horizon_labels ? hlabel(e.horizon) : `${P.mean_time[e.horizon].toFixed(0)} ${P.domain.vertical_unit} horizon`;
            return [
              `▲ high ${s.high.value.toFixed(2)} · ${t(s.high)} · azimuth ${azimuth(s.high.angle_deg)}°`,
              `▼ low ${s.low.value.toFixed(2)} · ${t(s.low)} · azimuth ${azimuth(s.low.angle_deg)}°`,
              s.contrast ? `contrast ×${s.contrast.toFixed(1)}${s.contrast < 1.6 ? " (little: a flat site)" : ""}` : "",
            ];
          })() : []),
          P.sites[n.i].truth ? `synthetic truth: ${P.sites[n.i].truth}` : "",
        ].filter(Boolean),
      }));
      Art.annotate(ctx, W, Hh, items, nodes.map((n) => ({ x: n.x, y: n.y, r: n.r })));
    } else {
      nodes.forEach((n) => {
        ctx.fillStyle = th.fg;
        ctx.font = `12px ${FONT}`;
        ctx.textAlign = "center";
        ctx.fillText(`${P.sites[n.i].name}  ${arrowOf(ratio[n.i])} ×${ratio[n.i].toFixed(1)}`, n.x, n.y + n.r + 15);
        ctx.textAlign = "left";
      });
    }

    // legend: band colour = horizon, innermost first
    const lx = W - 16, ly = Hh - 16;
    ctx.font = `11px ${FONT}`;
    ctx.textAlign = "right";
    ctx.fillStyle = th.dim;
    ctx.fillText("bands, centre to outside (older to younger)", lx, ly - H * 16 - 8);
    for (let h = 0; h < H; h++) {
      const y = ly - (H - 1 - h) * 16;
      ctx.fillStyle = th.dim;
      ctx.fillText(`${hlabel(h)} · ${P.mean_time[h].toFixed(0)} ${P.domain.vertical_unit}`, lx - 26, y);
      ctx.fillStyle = colour(h);
      ctx.fillRect(lx - 20, y - 8, 20, 4);
    }
    ctx.textAlign = "left";
  }

  function render() {
    const { W, H: Hh } = Art.size();
    Art.caption(captionEl, P, captionLines()); // first, so layout can measure it
    if (Art.param("format", "") === "svg") {
      canvas.style.display = "none";
      captionEl.style.visibility = "hidden";
      let host = document.getElementById("svgout");
      if (!host) { host = document.createElement("div"); host.id = "svgout"; document.body.appendChild(host); }
      host.innerHTML = svgString();
      return;
    }
    const { ctx } = Art.fit(canvas, W, Hh);
    paint(ctx, W, Hh);
    Art.finish(ctx, W, Hh);
  }

  // The vector file: the same painting, with the caption always included.
  function svgString() {
    const { W, H: Hh } = Art.size();
    Art.caption(captionEl, P, captionLines());
    const svg = Art.svg(W, Hh);
    paint(svg, W, Hh);
    Art.drawCaption(svg, W, Hh);
    svg.meta.title = P.title || "Rings per horizon";
    svg.meta.desc = [P.attribution, `polarity: ${P.polarity}`, `source: ${P.source_file}`, ...(P.notes || []).slice(0, 4)].join(" | ");
    return svg.toString();
  }

  render();
  window.addEventListener("resize", render);
  window.addEventListener("keydown", (e) => {
    if (e.key === "s") Art.savePNG(canvas, "rings-per-horizon.png");
    else if (e.key === "v") Art.saveText(svgString(), "rings-per-horizon.svg", "image/svg+xml");
  });
})();
