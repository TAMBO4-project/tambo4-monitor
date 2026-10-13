/* All dashboard UI copy lives here. Add another dictionary to translate the UI. */
const EN = {
  title: "TAMBO-4", pageTitle: "TAMBO-4 · Experiment monitoring", subtitle: "Experiment monitoring",
  eyebrow: "TAMBO OBSERVATORY / MONITORING", instrument: "Four panels. One experiment.",
  channelStatus: "Channel status", temperature: "Temperature", setup: "TAMBO-4 setup",
  selectInstructions: "Select panels to explore individual signals or coincidences.",
  selectedPanels: "Selected panels", selectAll: "Select all", clearAll: "Clear all",
  selectionHelp: "Combine any of the four panels to inspect a coincidence set.",
  arrayView: "Detector array", schematic: "Placeholder · positions are approximate",
  satelliteCaption: "TAMBO-4 · detector positions", logoAlt: "TAMBO-4 logo placeholder",
  satelliteAlt: "TAMBO-4 satellite map", placeholderAlt: "Placeholder diagram of the four-panel setup",
  analysisWorkspace: "Analysis workspace", openPlot: "Open plot", latest: "Latest",
  history: "History (Last 24h)", retention: "24-hour dataset window", footer: "TAMBO-4 / Experiment monitoring",
  celsius: "°C", lastReading: "Last reading", mock: "Mock data", sensorData: "Sensor data",
  temperatureError: "Sensor unavailable", temperatureEmpty: "Waiting for temperature readings",
  selectedDataset: "Selected: {id}", selectedPeriodEmpty: "No temperature readings in the selected period",
  temperaturePeriod: "24-hour temperature series", mockCaption: "Illustrative readings · sensor not connected",
  mockSensor: "Demo sensor", pt100: "PT100", allPanels: "All four panels", panel: "Panel {panel}", panels: "Panels {panels}",
  selectPanel: "Select panel {panel}", single: "Single-panel analysis", coincidence: "{count}-panel coincidence",
  noSelection: "No panels selected", noSelectionDescription: "Choose one or more panels on the setup map to view their plots.",
  plots: "Plots", noPlots: "No plots available", waitingTitle: "Waiting for the next dataset",
  waitingDescription: "Completed datasets will appear here after the receiver creates a newer timestamped directory.",
  noSetTitle: "This panel set is unavailable", noSetDescription: "The selected dataset has missing or unusable panel data.",
  missingPlotTitle: "Plot unavailable for this dataset", missingPlotDescription: "Your plot selection is preserved. Choose another plot or dataset to continue.",
  loadingTitle: "Loading plot", loadingDescription: "Opening the selected analysis result.",
  failedTitle: "Could not load this plot", failedDescription: "The file may still be publishing. Try selecting it again or wait for the next refresh.",
  noHistory: "No analyzed datasets in the last 24 hours.", noDataset: "No analyzed dataset",
  historyExpired: "This dataset has left the 24-hour window. Select another timestamp or Latest.",
  missingHistory: "Dataset no longer available", statusWaiting: "Waiting for acquisition data",
  statusObserved: "Observed {id} · newest dataset held", statusLatest: "Latest analyzed: {id}",
  autoRefresh: "Auto-refresh · {seconds}s", connectionError: "Update unavailable · retrying",
  lastUpdated: "Published {time}", notPublished: "Awaiting first publication", scrollLeft: "Scroll plot tabs left",
  scrollRight: "Scroll plot tabs right", plotFrame: "Analysis plot for {panels}",
  running: "Running", waiting: "Waiting", error: "Error", availablePlots: "{count} available plots",
  plotNames: {
    "04_baseline_estimation": "Baseline", "05_plot_coincidences": "Coincident pulses",
    "08_adc_peak_histogram": "ADC peak", "09_charge_calculation": "Charge calculation",
    "10_charge_histogram": "Charge histogram", "10_charge_histogram_individual": "Individual charge",
    "11_plot_random_samples": "Pulse samples", "12_pulse_duration_histogram": "Pulse duration",
    "16_multipulse_visualizer": "Multi-pulse events", "16_plot_pulse_rates": "Pulse rate",
    "17_inter_pulse_time_difference": "Inter-pulse timing", "17_coincidence_time_difference": "Coincidence timing"
  },
  details: {
    receiving_data: "Recent data-file activity", awaiting_data: "Waiting for data-file activity",
    missing_data: "No panel file", empty_data: "Empty panel file", incomplete_record: "Incomplete binary record",
    insufficient_baseline: "Insufficient baseline samples", no_usable_pulses: "No pulses pass the sample cut",
    analysis_failed: "Analysis failed; retry pending"
  }
};

const CONFIG = {
  // Place your real images at these paths, or change the paths here.
  // The SVG placeholders are used automatically until the PNG files exist.
  logoPath: "assets/logo.png",
  logoFallback: "assets/logo-placeholder.svg",
  satellitePath: "assets/satellite_map.png",
  satelliteFallback: "assets/satellite-placeholder.svg",
  // Percentage coordinates refer to the displayed image. Replace with surveyed positions.
  panelPositions: { A: [40, 20], B: [25, 70], C: [80, 60], D: [50, 50] },
  refreshMs: 10000,
  temperatureTransitionMs: 300,
  // Acquisition duration in seconds. Keep this in sync with the receiver
  // --chunk-size setting (600 seconds = 10 minutes).
  chunkSizeSeconds: 600,
  timezone: "America/Lima",
  dataRoot: "data/",
  panelColors: { A: "#398a6b", B: "#558cbb", C: "#bd9147", D: "#9475ad" }
};
const I18N = EN;
const $ = (id) => document.getElementById(id);
const t = (key, values = {}) => Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), I18N[key]);
const state = { selected: new Set(["A"]), mode: "latest", historyId: null, plotId: null,
  history: { datasets: [] }, status: null, temperature: null, frameUrl: null, frameRequest: 0, manifestSignature: null };
let frameAbort;
const panels = Object.keys(CONFIG.panelPositions).sort();
const selection = () => [...state.selected].sort().join("-");
const element = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
const stamp = (id) => /^\d{6}_\d{6}$/.test(id || "") ? `20${id.slice(0,2)}-${id.slice(2,4)}-${id.slice(4,6)} ${id.slice(7,9)}:${id.slice(9,11)}:${id.slice(11,13)}` : I18N.noDataset;
const formatTime = (date, options) => new Intl.DateTimeFormat("en-GB", { timeZone: state.history.timezone || CONFIG.timezone, ...options }).format(date);

function currentDataset() {
  return state.mode === "latest" ? state.history.datasets[0] : state.history.datasets.find(item => item.id === state.historyId);
}
function datasetStartTime(dataset) {
  // Directory names describe wall-clock time at the experiment, not the browser's timezone.
  const parts = /^(\d{2})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/.exec(dataset?.id || "");
  if (!parts) return NaN;
  const [,year,month,day,hour,minute,second] = parts;
  const iso = `20${year}-${month}-${day}T${hour}:${minute}:${second}`;
  const wallTime = Date.UTC(2000+Number(year), Number(month)-1, Number(day), Number(hour), Number(minute), Number(second));
  if (new Date(wallTime).toISOString().slice(0,19) !== iso) return NaN;
  // The manifest's explicit offset also disambiguates repeated times around DST changes.
  if (typeof dataset.timestamp === "string" && dataset.timestamp.startsWith(iso) && /(?:Z|[+-]\d{2}:\d{2})$/.test(dataset.timestamp)) {
    const timestamp = Date.parse(dataset.timestamp);
    if (Number.isFinite(timestamp)) return timestamp;
  }
  try {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: state.history.timezone || CONFIG.timezone, hourCycle:"h23",
      year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", second:"2-digit"
    });
    let timestamp = wallTime;
    for (let attempt=0; attempt<4; attempt++) {
      const local = Object.fromEntries(formatter.formatToParts(new Date(timestamp)).map(part => [part.type,part.value]));
      const offset = wallTime - Date.UTC(Number(local.year), Number(local.month)-1, Number(local.day), Number(local.hour), Number(local.minute), Number(local.second));
      if (!offset) return timestamp;
      timestamp += offset;
    }
  } catch { /* An invalid timezone cannot produce a reliable selection band. */ }
  return NaN; // Includes nonexistent local times during a DST clock jump.
}
function selectedDatasetInterval() {
  const dataset = currentDataset();
  const start = datasetStartTime(dataset), duration = Number(CONFIG.chunkSizeSeconds)*1000;
  if (!Number.isFinite(start) || !Number.isFinite(duration) || duration <= 0) return null;
  const end = start + duration;
  return Number.isFinite(new Date(end).getTime()) ? {id:dataset.id, start, end} : null;
}

function initialize() {
  document.title = I18N.pageTitle;
  document.querySelectorAll("[data-i18n]").forEach(node => { node.textContent = I18N[node.dataset.i18n]; });
  $("plot-tabs").setAttribute("aria-label", I18N.plots);
  $("scroll-left").setAttribute("aria-label", I18N.scrollLeft);
  $("scroll-right").setAttribute("aria-label", I18N.scrollRight);
  $("temperature-chart").setAttribute("aria-label", I18N.temperaturePeriod);
  imageWithFallback($("logo"), CONFIG.logoPath, CONFIG.logoFallback, I18N.logoAlt);
  imageWithFallback($("satellite"), CONFIG.satellitePath, CONFIG.satelliteFallback, I18N.satelliteAlt, () => {
    $("map-caption").textContent = I18N.schematic;
    $("satellite").alt = I18N.placeholderAlt;
  });
  $("map-caption").textContent = I18N.satelliteCaption;
  panels.forEach(panel => {
    const marker = element("button", "panel-marker", panel);
    marker.type = "button";
    marker.style.left = `${CONFIG.panelPositions[panel][0]}%`;
    marker.style.top = `${CONFIG.panelPositions[panel][1]}%`;
    marker.dataset.panel = panel;
    marker.setAttribute("aria-label", t("selectPanel", {panel}));
    marker.addEventListener("click", () => togglePanel(panel));
    $("panel-markers").append(marker);
    const chip = element("button", "chip", panel);
    chip.type = "button"; chip.dataset.panel = panel;
    chip.setAttribute("aria-label", t("selectPanel", {panel}));
    chip.addEventListener("click", () => togglePanel(panel));
    $("selection-chips").append(chip);
  });
  $("select-all").addEventListener("click", () => { state.selected = new Set(state.selected.size === panels.length ? [] : panels); renderSelection(); renderViewer(); });
  $("latest-tab").addEventListener("click", () => { state.mode = "latest"; state.historyId = null; showHistory(false); renderViewer(); });
  $("history-tab").addEventListener("click", () => showHistory($("history-list").hidden));
  $("scroll-left").addEventListener("click", () => $("plot-tabs").scrollBy({left:-240, behavior:"smooth"}));
  $("scroll-right").addEventListener("click", () => $("plot-tabs").scrollBy({left:240, behavior:"smooth"}));
  $("plot-tabs").addEventListener("scroll", updateScrollButtons);
  $("plot-tabs").addEventListener("keydown", event => {
    const tabs = [...$("plot-tabs").querySelectorAll("button")];
    const current = tabs.indexOf(document.activeElement);
    if (current < 0 || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].click();
    $("plot-tabs").querySelectorAll("button")[next].focus();
  });
  window.addEventListener("resize", updateScrollButtons);
  document.addEventListener("click", event => { if (!event.target.closest(".time-controls")) showHistory(false); });
  document.addEventListener("keydown", event => { if (event.key === "Escape") { showHistory(false); $("history-tab").focus(); } });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
  renderSelection(); renderStatus(); renderTemperature(); renderViewer();
  refresh();
  setInterval(refresh, CONFIG.refreshMs);
}

function imageWithFallback(img, desired, fallback, alt, onFallback) {
  img.alt = alt;
  // Probe first so a missing PNG never leaves a broken-image icon on screen.
  const probe = new Image();
  probe.onload = () => { img.src = desired; };
  probe.onerror = () => { img.src = fallback; if (onFallback) onFallback(); };
  probe.src = desired;
}
function togglePanel(panel) { state.selected.has(panel) ? state.selected.delete(panel) : state.selected.add(panel); renderSelection(); renderViewer(); }
function renderSelection() {
  document.querySelectorAll("[data-panel]").forEach(node => {
    const selected = state.selected.has(node.dataset.panel);
    node.setAttribute("aria-pressed", String(selected)); node.classList.toggle("selected", selected);
  });
  $("select-all").textContent = state.selected.size === panels.length ? I18N.clearAll : I18N.selectAll;
  $("selection-summary").textContent = state.selected.size === 1 ? I18N.single : state.selected.size ? t("coincidence", {count:state.selected.size}) : I18N.noSelection;
}
function renderStatus() {
  $("panel-status").replaceChildren();
  panels.forEach(panel => {
    const info = state.status?.panels?.[panel] || {status:"Waiting"};
    const value = ["Running", "Waiting", "Error"].includes(info.status) ? info.status.toLowerCase() : "waiting";
    const row = element("div", "status-item");
    row.title = I18N.details[info.detail] || I18N[value];
    row.append(element("span", "panel-letter", panel), element("span", `state ${value}`, I18N[value]));
    row.setAttribute("aria-label", `${t("panel", {panel})}: ${I18N[value]}. ${row.title}`);
    $("panel-status").append(row);
  });
  $("status-note").textContent = state.status?.observed_dataset ? t("statusObserved", {id:state.status.observed_dataset}) : I18N.statusWaiting;
  const updated = state.status?.updated_at ? new Date(state.status.updated_at) : null;
  $("updated-at").textContent = updated && Number.isFinite(+updated) ? t("lastUpdated", {time:formatTime(updated, {month:"short", day:"2-digit", hour:"2-digit", minute:"2-digit", second:"2-digit"})}) : I18N.notPublished;
}
function plotLabel(id) {
  if (I18N.plotNames[id]) return I18N.plotNames[id];
  const prefix = Object.keys(I18N.plotNames).sort((a,b) => b.length-a.length).find(key => id.startsWith(key + "_"));
  if (prefix) {
    const suffix = id.slice(prefix.length + 1);
    return suffix === "ALL" ? I18N.plotNames[prefix] : `${I18N.plotNames[prefix]} · ${suffix.replace(/^Channel_/, "").replaceAll("_", "-")}`;
  }
  return id; // Unknown filenames are data supplied by the analysis manifest.
}
function showHistory(open) {
  $("history-list").hidden = !open;
  $("history-tab").setAttribute("aria-expanded", String(open));
  if (open) renderHistory();
}
function renderHistory() {
  const container = $("history-list"); container.replaceChildren();
  if (!state.history.datasets.length) container.append(element("p", "", I18N.noHistory));
  for (const dataset of state.history.datasets) {
    const button = element("button"); button.type = "button";
    button.append(element("span", "", stamp(dataset.id)), element("small", "", dataset.id));
    button.setAttribute("aria-current", String(state.mode === "history" && state.historyId === dataset.id));
    button.addEventListener("click", () => { state.mode = "history"; state.historyId = dataset.id; showHistory(false); renderViewer(); });
    container.append(button);
  }
}
function renderViewer() {
  const key = selection();
  const dataset = currentDataset();
  renderTemperature(); // Keep the acquisition band synchronized even when no plot is available.
  const set = dataset?.panel_sets?.[key];
  const plots = (set?.plots || []).filter(plot => /^[\w.-]+\.html$/.test(plot.filename) && plot.id);
  // Preserve the exact plot across history changes. Fall back only on a panel change.
  if (!state.plotId || state.lastPanelKey !== key) {
    if (!plots.some(plot => plot.id === state.plotId)) state.plotId = plots[0]?.id || null;
  }
  state.lastPanelKey = key;
  $("viewer-title").textContent = !key ? I18N.noSelection : t(state.selected.size === 1 ? "panel" : "panels", {panel:key, panels:key.replaceAll("-", " + ")});
  $("latest-tab").setAttribute("aria-selected", String(state.mode === "latest"));
  $("history-tab").setAttribute("aria-selected", String(state.mode === "history"));
  $("dataset-label").textContent = dataset ? stamp(dataset.id) : I18N.noDataset;
  $("plot-caption").textContent = plots.length ? t("availablePlots", {count:plots.length}) : I18N.noPlots;
  const tabs = $("plot-tabs"); const oldScroll = tabs.scrollLeft; tabs.replaceChildren();
  for (const plot of plots) {
    const button = element("button", "plot-tab", plotLabel(plot.id));
    button.type = "button"; button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(plot.id === state.plotId));
    button.addEventListener("click", () => { state.plotId = plot.id; state.frameUrl = null; renderViewer(); });
    tabs.append(button);
  }
  if (!plots.length) tabs.append(element("span", "empty-tabs", I18N.noPlots));
  tabs.scrollLeft = oldScroll;
  const active = tabs.querySelector('[aria-selected="true"]');
  if (active) {
    const tabBounds = active.getBoundingClientRect(), barBounds = tabs.getBoundingClientRect();
    if (tabBounds.left < barBounds.left) tabs.scrollLeft += tabBounds.left - barBounds.left;
    else if (tabBounds.right > barBounds.right) tabs.scrollLeft += tabBounds.right - barBounds.right;
  }
  updateScrollButtons();
  if (!key) return emptyPlot("noSelection", "noSelectionDescription");
  if (!dataset) return emptyPlot(state.mode === "history" ? "missingHistory" : "waitingTitle", state.mode === "history" ? "historyExpired" : "waitingDescription");
  if (!set || set.state === "unavailable") return emptyPlot("noSetTitle", "noSetDescription");
  const plot = plots.find(item => item.id === state.plotId);
  if (!plot) return emptyPlot("missingPlotTitle", "missingPlotDescription");
  if (!/^\d{6}_\d{6}$/.test(dataset.id)) return emptyPlot("failedTitle", "failedDescription");
  const url = `${CONFIG.dataRoot}plots/${dataset.id}/${key}/${encodeURIComponent(plot.filename)}`;
  loadPlot(url, key);
}
function updateScrollButtons() {
  const tabs = $("plot-tabs");
  $("scroll-left").disabled = tabs.scrollLeft <= 1;
  $("scroll-right").disabled = tabs.scrollLeft + tabs.clientWidth >= tabs.scrollWidth - 1;
}
function emptyPlot(title, description) {
  frameAbort?.abort(); state.frameRequest++;
  state.frameUrl = null; $("plot-frame").hidden = true; $("plot-frame").removeAttribute("src");
  $("open-plot").hidden = true; $("plot-empty").hidden = false;
  $("empty-title").textContent = I18N[title]; $("empty-description").textContent = I18N[description];
}
async function loadPlot(url, key) {
  if (url === state.frameUrl) return;
  emptyPlot("loadingTitle", "loadingDescription");
  const request = ++state.frameRequest;
  frameAbort = new AbortController();
  try {
    const response = await fetch(url, {method:"HEAD", cache:"no-cache", signal:frameAbort.signal});
    if (!response.ok) throw new Error(String(response.status));
    if (request !== state.frameRequest) return;
    state.frameUrl = url;
    const frame = $("plot-frame"); frame.title = t("plotFrame", {panels:key});
    frame.src = url; frame.hidden = false; $("plot-empty").hidden = true;
    $("open-plot").href = url; $("open-plot").hidden = false;
  } catch (error) {
    if (error.name !== "AbortError" && request === state.frameRequest) emptyPlot("failedTitle", "failedDescription");
  }
}
function svgNode(tag, attributes, text) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  if (text !== undefined) node.textContent = text;
  return node;
}
// Keep the same SVG line and point nodes across polls. Only coordinates change.
let temperatureChart;
function getTemperatureChart() {
  if (temperatureChart) return temperatureChart;
  const svg = $("temperature-chart");
  const axes = svgNode("g", {}), dots = svgNode("g", {});
  const yLabels = [], xLabels = [];
  for (let i=0; i<3; i++) {
    const y = 112 - i * 49;
    axes.append(svgNode("line", {x1:30,y1:y,x2:628,y2:y,stroke:"#e9eee8","stroke-dasharray":"3 5"}));
    const label = svgNode("text", {x:20,y:y+3,"text-anchor":"end"});
    yLabels.push(label); axes.append(label);
  }
  for (let i=0; i<4; i++) {
    const label = svgNode("text", {x:30+594*i/3,y:139,"text-anchor":i===0?"start":i===3?"end":"middle"});
    xLabels.push(label); axes.append(label);
  }
  const line = svgNode("polyline", {id:"temperature-line",fill:"none",stroke:CONFIG.panelColors.A,"stroke-width":2,"stroke-linejoin":"round"});
  const band = svgNode("rect", {id:"temperature-dataset-band",y:14,height:98,fill:"#d6ac4e","fill-opacity":0.23,"pointer-events":"none"});
  const bandLabel = svgNode("text", {id:"temperature-dataset-label",y:10,"text-anchor":"middle","pointer-events":"none"});
  bandLabel.style.fill = "#8b6720";
  bandLabel.style.fontWeight = "600";
  // The duration rectangle sits behind the grid and readings; its label sits above them.
  svg.append(band, axes, line, dots, bandLabel);
  temperatureChart = {axes, line, dots, band, bandLabel, bandPosition:null,
    yLabels, xLabels, nodes:new Map(), positions:new Map(), animation:null, signature:null};
  return temperatureChart;
}
function renderTemperature() {
  const chart = getTemperatureChart(), data = state.temperature;
  const interval = selectedDatasetInterval();
  const signature = JSON.stringify([data, state.history.timezone || CONFIG.timezone, interval]);
  if (signature === chart.signature) return; // No redraw or animation for identical data.
  chart.signature = signature;
  cancelAnimationFrame(chart.animation);
  const samples = (data?.samples || []).map(row => ({...row, time:+new Date(row.timestamp)}))
    .filter(row => Number.isFinite(row.time) && Number.isFinite(row.celsius)).sort((a,b) => a.time-b.time);
  const mock = data?.source_state === "mock";
  const seriesName = mock ? I18N.mockSensor : I18N.pt100;
  $("temperature-badge").textContent = mock ? I18N.mock : data?.source_state === "error" ? I18N.temperatureError : I18N.sensorData;
  const intervalHasReadings = interval && samples.some(row => row.time >= interval.start && row.time <= interval.end);
  $("temperature-caption").textContent = interval && !intervalHasReadings ? I18N.selectedPeriodEmpty : mock ? I18N.mockCaption : I18N.temperaturePeriod;
  $("chart-empty").textContent = samples.length ? "" : I18N.temperatureEmpty;
  $("temperature-value").textContent = samples.length ? samples.at(-1).celsius.toFixed(1) : "—";
  $("temperature-legend").textContent = samples.length ? seriesName : "";
  chart.band.style.display = chart.bandLabel.style.display = interval ? "" : "none";
  chart.bandLabel.textContent = interval ? t("selectedDataset", {id:interval.id}) : "";
  if (!interval) chart.bandPosition = null;
  chart.axes.style.display = samples.length || interval ? "" : "none";
  if (!samples.length && !interval) {
    chart.line.removeAttribute("points");
    chart.dots.replaceChildren(); chart.nodes.clear(); chart.positions.clear();
    return;
  }
  const minimum = samples.length ? Math.floor(samples.reduce((value,row) => Math.min(value,row.celsius), Infinity) - 1) : 0;
  const maximum = samples.length ? Math.ceil(samples.reduce((value,row) => Math.max(value,row.celsius), -Infinity) + 1) : 1;
  // Include the entire selected interval, even when it extends beyond available readings.
  // This changes only the display range; sensor data retention remains independent.
  const first = Math.min(samples[0]?.time ?? Infinity, interval?.start ?? Infinity);
  const last = Math.max(samples.at(-1)?.time ?? -Infinity, interval?.end ?? -Infinity);
  const x = time => 30 + (time - first) / Math.max(1,last - first) * 594;
  const y = value => 112 - (value - minimum) / (maximum - minimum) * 98;
  chart.yLabels.forEach((label,i) => { label.textContent = samples.length ? Math.round(minimum + (maximum-minimum)*i/2) : ""; });
  const timeLabelOptions = last-first >= 86400000 ? {month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit"} : {hour:"2-digit",minute:"2-digit"};
  chart.xLabels.forEach((label,i) => { label.textContent = formatTime(new Date(first+(last-first)*i/3), timeLabelOptions); });
  const previousEnd = [...chart.positions.values()].at(-1);
  const targets = new Map(samples.map(row => [row.time, {x:x(row.time), y:y(row.celsius)}]));
  const starts = new Map();
  for (const [key, node] of chart.nodes) {
    if (!targets.has(key)) { node.remove(); chart.nodes.delete(key); }
  }
  for (const row of samples) {
    starts.set(row.time, chart.positions.get(row.time) || previousEnd || targets.get(row.time));
    let dot = chart.nodes.get(row.time);
    if (!dot) {
      dot = svgNode("circle", {r:2.5,fill:CONFIG.panelColors.A,opacity:.8,"data-time":row.time});
      dot.append(svgNode("title", {})); chart.dots.append(dot); chart.nodes.set(row.time,dot);
    }
    dot.firstChild.textContent = `${seriesName} · ${row.celsius.toFixed(1)} ${I18N.celsius} · ${formatTime(new Date(row.time), {month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit"})}`;
  }
  const bandTarget = interval ? {x:x(interval.start), width:x(interval.end)-x(interval.start)} : null;
  const bandStart = chart.bandPosition || bandTarget;
  const labelHalfWidth = interval ? Math.min(chart.bandLabel.getComputedTextLength()/2, 297) : 0;
  const duration = (previousEnd || chart.bandPosition) && !matchMedia("(prefers-reduced-motion: reduce)").matches ? CONFIG.temperatureTransitionMs : 0;
  const began = performance.now();
  function draw(now) {
    const progress = duration ? Math.min(1,(now-began)/duration) : 1;
    const fraction = 1 - (1-progress)**3;
    const points = [];
    chart.positions.clear();
    for (const [key, target] of targets) {
      const start = starts.get(key);
      const point = {x:start.x+(target.x-start.x)*fraction, y:start.y+(target.y-start.y)*fraction};
      chart.positions.set(key,point);
      points.push(`${point.x.toFixed(2)},${point.y.toFixed(2)}`);
      const dot = chart.nodes.get(key);
      dot.setAttribute("cx",point.x); dot.setAttribute("cy",point.y);
    }
    chart.line.setAttribute("points",points.join(" "));
    if (bandTarget) {
      const position = {x:bandStart.x+(bandTarget.x-bandStart.x)*fraction,
        width:bandStart.width+(bandTarget.width-bandStart.width)*fraction};
      chart.bandPosition = position;
      chart.band.setAttribute("x",position.x);
      chart.band.setAttribute("width",position.width);
      chart.bandLabel.setAttribute("x",Math.max(30+labelHalfWidth, Math.min(624-labelHalfWidth, position.x+position.width/2)));
    }
    chart.animation = progress < 1 ? requestAnimationFrame(draw) : null;
  }
  draw(began);
}
let refreshing = false;
async function refresh() {
  if (refreshing || document.hidden) return;
  refreshing = true;
  const requests = ["history_index.json", "status.json", "temperature.json"];
  try {
    const results = await Promise.allSettled(requests.map(async file => {
      const response = await fetch(CONFIG.dataRoot + file, {cache:"no-store", signal:AbortSignal.timeout(15000)});
      if (!response.ok) throw new Error(String(response.status));
      const data = await response.json();
      if (file === "temperature.json") {
        state.temperature = data;
        renderTemperature();
      }
      return data;
    }));
    const manifest = results[0].status === "fulfilled" ? results[0].value : null;
    // A deployment reset publishes []: clear open dashboards as well as fresh pages.
    const resetHistory = Array.isArray(manifest) && manifest.length === 0;
    const history = resetHistory
      ? {datasets:[], latest:null, timezone:state.history.timezone || CONFIG.timezone} : manifest;
    if (Array.isArray(history?.datasets)) {
      const signature = JSON.stringify(history);
      if (signature !== state.manifestSignature) {
        state.manifestSignature = signature; state.history = history;
        if (resetHistory) {
          state.mode = "latest"; state.historyId = null; state.plotId = null;
          showHistory(false);
        }
        renderHistory(); renderViewer();
      } else if (!state.frameUrl) renderViewer();
    }
    if (results[1].status === "fulfilled") { state.status = results[1].value; renderStatus(); }
    if (results[2].status === "fulfilled") renderTemperature(); // Also catch a changed display timezone.
    const failed = results.some(result => result.status === "rejected");
    $("connection").textContent = failed ? I18N.connectionError : t("autoRefresh", {seconds:CONFIG.refreshMs/1000});
    $("connection").classList.toggle("error", failed);
  } finally { refreshing = false; }
}
initialize();
