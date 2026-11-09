// Concept K: the engraving of what changed.
// A section through the survey. The monitor is drawn as fine wiggle lines, then
// everything the base also has is erased: what remains is monitor minus base after the
// two were aligned (bulk shift and scale found in a quiet shallow window, stated in the
// export). The same grain of noise is in every part of the plate, so a mark counts only
// where it stands out from the grain above. Black ink on paper by default; a faint ghost
// of the monitor can be left under the strokes (?ghost=1, key g).
(async function () {
  const canvas = document.getElementById("c");
  const captionEl = document.getElementById("caption");
  let P;
  try {
    P = await Art.load(Art.param("data", "data/synthetic/engraving.json"));
  } catch (e) {
    document.getElementById("error").textContent = String(e);
    return;
  }
  const th = Art.theme, paper = th.name === "paper";
  const FONT = "system-ui, 'Segoe UI', Helvetica, Arial, sans-serif";
  const decode = (b64) => new Int8Array(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer);
  const n = P.n_traces, ns = P.n_samples;
  const diff = decode(P.difference_b64), mon = decode(P.monitor_b64);
  let ghost = Art.param("ghost", "1") !== "0";
  const gainK = +Art.param("gain", 1);
  const t = P.samples, t0 = t[0], t1 = t[ns - 1];
  const q = P.pair.window;
  const ink = paper ? "rgba(20,22,28,0.9)" : "rgba(236,232,220,0.9)";
  const inkFill = paper ? "rgba(20,22,28,0.85)" : "rgba(236,232,220,0.8)";
  const ghostInk = paper ? "rgba(20,22,28,0.10)" : "rgba(236,232,220,0.10)";

  function captionLines() {
    const r = P.difference_rms_ratio;
    return [
      `${P.section_kind} section, ${n} traces, ${t0} to ${t1} ${P.domain.vertical_unit}: ${P.pair.monitor_label} minus ${P.pair.base_label}, drawn as wiggles with the positive side filled; what both vintages share is erased${ghost ? "; the monitor itself is left as a faint ghost" : ""}`,
      `the grain: in the quiet window ${q[0]}-${q[1]} the difference is ${(r.quiet_window * 100).toFixed(0)}% of the base's RMS after the alignment${r.below_it != null ? `; below it ${(r.below_it * 100).toFixed(0)}%` : ""}. The bracket on the left marks that window`,
    ];
  }

  function paint(ctx, W, H) {
    ctx.fillStyle = th.bg;
    ctx.fillRect(0, 0, W, H);
    const top = 28, bottom = Math.max(150, captionEl.offsetHeight + 30), left = 64, right = 20;
    const w = W - left - right, h = H - top - bottom;
    const every = Math.max(1, +Art.param("every", 0) || Math.ceil(n / Math.min(n, w / 4.5)));
    const drawn = Math.floor((n - 1) / every) + 1;
    const dx = w / drawn;
    const X = (i) => left + (Math.floor(i / every) + 0.5) * dx;
    const Y = (j) => top + ((t[j] - t0) / (t1 - t0)) * h;
    const gain = dx * 1.7 * gainK;
    const wiggle = (arr, i, stroke, fill, fillSide) => {
      const x0 = X(i);
      ctx.strokeStyle = stroke; ctx.lineWidth = 0.7; ctx.lineJoin = "round";
      ctx.beginPath();
      for (let j = 0; j < ns; j++) {
        const v = arr[i * ns + j] / 127;
        const px = x0 + gain * v, py = Y(j);
        j ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.stroke();
      if (!fill) return;
      // variable area: fill the positive lobes between the curve and the trace line
      ctx.fillStyle = fill;
      let run = -1;
      const flush = (end) => {
        if (run < 0) return;
        ctx.beginPath();
        ctx.moveTo(x0, Y(run));
        for (let j = run; j < end; j++) ctx.lineTo(x0 + gain * (arr[i * ns + j] / 127), Y(j));
        ctx.lineTo(x0, Y(end - 1));
        ctx.closePath(); ctx.fill();
        run = -1;
      };
      for (let j = 0; j < ns; j++) {
        const v = arr[i * ns + j] / 127;
        if (v * fillSide > 0.04) { if (run < 0) run = j; } else flush(j);
      }
      flush(ns);
    };
    if (ghost) for (let i = 0; i < n; i += every) wiggle(mon, i, ghostInk, null, 1);
    for (let i = 0; i < n; i += every) wiggle(diff, i, ink, inkFill, 1);

    // the quiet window, bracketed on the left; time ticks
    ctx.strokeStyle = th.dim; ctx.lineWidth = 1; ctx.fillStyle = th.dim;
    ctx.font = `10.5px ${FONT}`; ctx.textAlign = "right";
    const yq0 = top + ((q[0] - t0) / (t1 - t0)) * h, yq1 = top + ((q[1] - t0) / (t1 - t0)) * h;
    ctx.beginPath(); ctx.moveTo(left - 10, yq0); ctx.lineTo(left - 14, yq0); ctx.lineTo(left - 14, yq1); ctx.lineTo(left - 10, yq1); ctx.stroke();
    ctx.save(); ctx.translate(left - 18, (yq0 + yq1) / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = "center";
    ctx.fillText("quiet window: the grain", 0, 0); ctx.restore();
    const tick = (t1 - t0) > 2000 ? 500 : (t1 - t0) > 600 ? 200 : 100;
    ctx.textAlign = "right";
    for (let tt = Math.ceil(t0 / tick) * tick; tt <= t1; tt += tick) {
      const y = top + ((tt - t0) / (t1 - t0)) * h;
      ctx.beginPath(); ctx.moveTo(left - 6, y); ctx.lineTo(left - 2, y); ctx.stroke();
      ctx.fillText(`${tt}`, left - 8, y + 4);
    }
    ctx.textAlign = "left";
    ctx.fillText(`IL ${P.inline[0]} / XL ${P.crossline[0]}`, left, top + h + 14);
    ctx.textAlign = "right";
    ctx.fillText(`IL ${P.inline[n - 1]} / XL ${P.crossline[n - 1]}`, left + w, top + h + 14);
    ctx.textAlign = "left";
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
    svg.meta.title = P.title || "Engraving of what changed";
    svg.meta.desc = [P.attribution, `polarity: ${P.polarity}`, `source: ${P.source_file}`, ...(P.notes || []).slice(0, 4)].join(" | ");
    return svg.toString();
  }

  render();
  window.addEventListener("resize", render);
  window.addEventListener("keydown", (e) => {
    if (e.key === "g") { ghost = !ghost; render(); }
    else if (e.key === "s") Art.savePNG(canvas, "engraving.png");
    else if (e.key === "v") Art.saveText(svgString(), "engraving.svg", "image/svg+xml");
  });
})();
