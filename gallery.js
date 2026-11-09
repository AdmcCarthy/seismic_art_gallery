// The gallery: tiles from the stills' manifests. The Volve set is present only when the
// gallery was published with the real-data exports; a missing manifest is not an error.
(async function () {
  const root = document.documentElement;
  const button = document.getElementById("scheme");
  const apply = (s) => { root.dataset.colourScheme = s; button.textContent = s === "dark" ? "light" : "dark"; };
  let scheme = "dark";
  try { scheme = localStorage.getItem("seismic-art-scheme") || scheme; } catch (e) { /* private window */ }
  apply(scheme);
  button.addEventListener("click", () => {
    scheme = scheme === "dark" ? "light" : "dark";
    apply(scheme);
    try { localStorage.setItem("seismic-art-scheme", scheme); } catch (e) { /* ignore */ }
  });

  const load = async (url) => {
    try {
      const r = await fetch(url);
      return r.ok ? await r.json() : null;
    } catch (e) {
      return null;
    }
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const tile = (it, lead, tag) => `
    <a class="g-tile${lead ? " g-lead" : ""}" href="${esc(it.href)}">
      <img src="${esc(it.image)}" alt="${esc(it.title)}" loading="${lead ? "eager" : "lazy"}">
      <div class="g-text"><h3>${esc(it.title)}</h3><p>${esc(it.line)}</p><span class="g-tag">${esc(tag)}</span></div>
    </a>`;

  const [volve, synthetic] = await Promise.all([load("data/volve/gallery/manifest.json"), load("gallery/manifest.json")]);
  const vEl = document.getElementById("volve"), sEl = document.getElementById("synthetic");
  if (volve && volve.items.length) {
    vEl.querySelector(".g-grid").innerHTML = volve.items.map((it, i) => tile(it, i === 0, "Volve, real data")).join("");
    document.getElementById("volve-attribution").textContent = volve.attribution;
  } else {
    vEl.style.display = "none";
    document.getElementById("volve-foot").style.display = "none";
  }
  if (synthetic && synthetic.items.length) {
    const lead = !(volve && volve.items.length);
    sEl.querySelector(".g-grid").innerHTML = synthetic.items.map((it, i) => tile(it, lead && i === 0, "synthetic model")).join("");
  } else {
    sEl.querySelector(".g-grid").innerHTML = '<p class="g-empty">No stills yet: run scripts/render_gallery.py.</p>';
  }
})();
