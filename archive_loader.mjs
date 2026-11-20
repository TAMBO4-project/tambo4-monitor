// The caller supplies the monitor's themedPlotDocument and its sandboxed iframe.
const chunkPattern = /^\d{6}_\d{6}$/;
const shaPattern = /^[a-f0-9]{40}$/;
const panelPattern = /^(?:[A-D](?:-[A-D]){0,3}|summary)$/;
const plotPattern = /^[\w.-]+\.html$/;
const bundlePattern = /^data\/assets\/plotly-[\d.]+-[a-f0-9]{64}\.min\.js$/;
const publicRaw = "https://raw.githubusercontent.com/TAMBO4-project/tambo4-monitor/";

async function read(url, signal) {
  const response = await fetch(url, {signal});
  if (!response.ok) throw new Error(`Archive request failed (${response.status}): ${url.pathname}`);
  return response;
}

export function archiveSource(entry, pageRoot = document.baseURI) {
  if (!chunkPattern.test(entry.id)) throw new Error("Invalid archive chunk");
  const path = `data/plots/${entry.id}/manifest.json`;
  if (entry.manifest !== path) throw new Error("Invalid manifest path");
  if (entry.storage === "current" && entry.commit === null) return new URL(path, pageRoot);
  if (entry.storage !== "git-history" || !shaPattern.test(entry.commit)) {
    throw new Error("Invalid historical commit");
  }
  return new URL(`${publicRaw}${entry.commit}/${path}`);
}

export async function archiveManifest(entry, {pageRoot = document.baseURI, signal} = {}) {
  const source = archiveSource(entry, pageRoot);
  const manifest = await (await read(source, signal)).json();
  if (manifest.id !== entry.id || !manifest.panel_sets) throw new Error("Archive manifest does not match");
  return manifest;
}

export async function archivePlot(entry, manifest, panel, filename, {
  pageRoot = document.baseURI, signal, themedPlotDocument,
} = {}) {
  const group = panel === "summary" ? manifest.summary : manifest.panel_sets?.[panel];
  if (manifest.id !== entry.id || !panelPattern.test(panel) || !plotPattern.test(filename) ||
      !group?.plots.some(plot => plot.filename === filename)) {
    throw new Error("Plot is absent from the archive manifest");
  }
  const source = new URL(`${panel}/${filename}`, archiveSource(entry, pageRoot));
  const html = await (await read(source, signal)).text();
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const bootstrap = [...parsed.querySelectorAll("script:not([src])")]
    .find(script => script.textContent.includes("Plotly.newPlot("));
  if (!bootstrap) throw new Error("Missing Plotly initialization");
  // If the shared bundle fails, the viewer reports its readiness timeout.
  bootstrap.textContent = `if (window.Plotly) {\n${bootstrap.textContent}\n}`;
  if (entry.storage === "git-history") {
    const snapshot = new URL(`${publicRaw}${entry.commit}/`);
    const scripts = [...parsed.querySelectorAll("script[src]")];
    if (scripts.length !== 1 || parsed.querySelector("base")) throw new Error("Invalid historical script reference");
    const original = new URL(scripts[0].getAttribute("src"), source);
    if (!original.href.startsWith(snapshot.href)) throw new Error("Unexpected historical asset location");
    const asset = entry.assets?.[original.href.slice(snapshot.href.length)];
    if (!bundlePattern.test(asset || "")) throw new Error("Historical Plotly asset is unavailable");
    scripts[0].setAttribute("src", new URL(asset, pageRoot).href);
  }
  return {url: source.href, srcdoc: themedPlotDocument(parsed.documentElement.outerHTML, source.href)};
}
