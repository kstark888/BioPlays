"use strict";

// Cache references to the page controls that JavaScript updates.
const search = document.getElementById("search");
const list = document.getElementById("list");
const status = document.getElementById("status");
let snapshot = { stocks: [] };

// Create an element, set its optional text and CSS class, then add it to a parent.
function element(tag, text, parent, className) {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  parent.append(node);
  return node;
}

// Add external source links only when the URL is valid and HTTPS.
function sourceLink(parent, href, label) {
  try {
    const url = new URL(href);
    if (url.protocol !== "https:") return;
    const link = element("a", label, parent, "source");
    link.href = url.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  } catch {
    // Omit missing or invalid source URLs.
  }
}

// Shared number formatters used in metric values and chart labels.
const money = n => new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2
}).format(n);
const price = n => new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", maximumFractionDigits: 2
}).format(n);
const multiple = n => `${n.toFixed(1)}×`;
const tier = (n, good, fair) => n >= good ? "good" : n >= fair ? "fair" : "poor";

function stageDetails(stock) {
  const catalyst = stock.catalyst || "";
  const match = catalyst.match(/\b(Phase\s+\d(?:[ab])?|Preclinical|FDA)\b/i);
  const stage = match ? match[1].replace(/phase/i, "Phase") : "Milestone";
  const event = catalyst.replace(match?.[0] || "", "").replace(/^\s*[·:-]\s*/, "").trim() || "Catalyst event";
  const stageNumber = Number(match?.[1]?.match(/\d/)?.[0]);
  const progress = stage.toLowerCase().startsWith("phase") ? stageNumber * 25 : stage === "FDA" ? 100 : 15;
  const tone = stage.toLowerCase().startsWith("phase") ? `phase-${stageNumber}` : stage.toLowerCase() === "fda" ? "fda" : "milestone";
  return { stage, event, progress: Math.min(progress, 100), tone };
}

function displayDate(value) {
  if (!value) return "Date TBD";
  const parsed = new Date(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parsed.valueOf())
    ? parsed.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })
    : value;
}

function addPopover(parent, triggerText, label, buildContent, triggerClass = "info-trigger") {
  const trigger = element("button", triggerText, parent, triggerClass);
  trigger.type = "button";
  trigger.setAttribute("aria-label", label);
  trigger.setAttribute("aria-expanded", "false");
  const popover = element("div", "", parent, "table-popover");
  popover.hidden = true;
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-label", label);
  buildContent(popover);

  function close() {
    popover.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  }

  trigger.addEventListener("click", event => {
    event.stopPropagation();
    const open = popover.hidden;
    document.querySelectorAll(".table-popover:not([hidden])").forEach(node => {
      node.hidden = true;
      node.parentElement?.querySelector("[aria-expanded='true']")?.setAttribute("aria-expanded", "false");
    });
    popover.hidden = !open;
    trigger.setAttribute("aria-expanded", String(open));
  });
  parent.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      close();
      trigger.focus();
    }
  });
  document.addEventListener("click", event => {
    if (!parent.contains(event.target)) close();
  });
  return trigger;
}


// Metric labels, formatting functions, and optional color thresholds.
const metricDefinitions = {
  dividendYield: ["Dividend yield", percent],
  pe: ["Trailing P/E", n => n > 0 ? multiple(n) : "N/M"],
  revenue: ["Revenue", money],
  netIncome: ["Net income to company", money],
  revenueGrowth: ["YoY revenue growth", percent, (n, s) => s.revenueComparable !== false ? tier(n, 15, 0) : ""],
  cash: ["Cash", money],
  currentDebt: ["Current debt", money],
  totalDebt: ["Total debt", money],
  cashToDebt: ["Cash / total debt", multiple, n => tier(n, 2, 1)],
  runwayMonths: ["Cash runway", n => n.toFixed(1) + " mo", n => tier(n, 18, 12)],
  marketCap: ["Market cap", money]
};
const defaultPins = ["dividendYield", "pe", "revenue", "netIncome", "revenueGrowth", "cashToDebt", "runwayMonths", "marketCap"];
const metricPinsKey = "bioplays.metric-pins.v1";
let metricPins = {};
try { metricPins = JSON.parse(localStorage.getItem(metricPinsKey)) || {}; } catch {}

function percent(n) { return n.toFixed(1) + "%"; }

function sparkline(parent, points, format) {
  const data = Array.isArray(points) ? points.filter(p => p && typeof p.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(p.date) && Number.isFinite(p.value))
    .sort((a, b) => a.date.localeCompare(b.date)) : [];
  const unique = [...new Map(data.map(p => [p.date, p])).values()];
  if (unique.length < 2) {
    element("small", "No history", parent);
    return;
  }
  const canvas = element("canvas", "", parent);
  canvas.width = 320;
  canvas.height = 78;
  canvas.style.cssText = "display:block;width:100%;max-width:160px;height:39px";
  const label = unique[0].date + " " + format(unique[0].value) + " to " +
    unique.at(-1).date + " " + format(unique.at(-1).value);
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", label);
  canvas.title = label;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const values = unique.map(p => p.value);
  let low = Math.min(...values, 0);
  let high = Math.max(...values, 0);
  if (low === high) high = low + 1;
  const y = n => 72 - (n - low) * 66 / (high - low);
  const x = i => 2 + i * 316 / (values.length - 1);
  const baseline = y(0);
  const trace = () => values.forEach((v, i) => i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v)));
  for (const [top, bottom, fill] of [[0, baseline, "#79e3bd66"], [baseline, 78, "#ff929677"]]) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, top, 320, bottom - top);
    ctx.clip();
    ctx.beginPath();
    trace();
    ctx.lineTo(x(values.length - 1), baseline);
    ctx.lineTo(x(0), baseline);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.restore();
  }
  ctx.beginPath();
  ctx.moveTo(0, baseline);
  ctx.lineTo(320, baseline);
  ctx.strokeStyle = "#54707f";
  ctx.stroke();
  ctx.beginPath();
  trace();
  ctx.strokeStyle = "#d7e9ee";
  ctx.lineWidth = 2.5;
  ctx.stroke();
}

function showMetrics(parent, stock) {
  const panel = element("section", "", parent);
  panel.setAttribute("aria-label", "Data Explorer");
  panel.style.cssText = "background:#0c1820;border:1px solid #263a44;border-radius:12px;padding:16px;margin:16px 0";
  const heading = element("h3", "Data Explorer", panel);
  heading.style.margin = "0 0 12px";
  const query = element("input", "", panel);
  query.type = "search";
  query.placeholder = "Search for metrics to pin…";
  query.setAttribute("aria-label", "Search metrics for " + stock.ticker);
  query.style.cssText = "width:100%;margin-bottom:10px";
  const edit = element("button", "Edit pins", panel);
  edit.type = "button";
  edit.setAttribute("aria-expanded", "false");
  const picker = element("div", "", panel);
  picker.hidden = true;
  const table = element("table", "", panel);
  table.style.cssText = "width:100%;table-layout:fixed;text-align:left;border-collapse:collapse;margin-top:10px;overflow-wrap:anywhere";
  const header = element("tr", "", element("thead", "", table));
  for (const [label, width] of [["Metric name", "46%"], ["Value", "24%"], ["Trend", "30%"]]) {
    const cell = element("th", label, header);
    cell.scope = "col";
    cell.style.cssText = "padding:8px 6px;width:" + width;
  }
  const rows = element("tbody", "", table);
  const message = element("small", "", panel);
  message.setAttribute("role", "status");
  const saved = metricPins[stock.symbol];
  let pins = Array.isArray(saved) ? saved.filter(key => Object.hasOwn(metricDefinitions, key)) : [...defaultPins];

  function drawRows() {
    rows.replaceChildren();
    message.textContent = pins.length ? "" : "Pin a metric to add it to the table.";
    const values = { ...stock, cashToDebt: Number.isFinite(stock.cash) && stock.totalDebt > 0 ? stock.cash / stock.totalDebt : null };
    for (const key of pins) {
      const [label, format, color] = metricDefinitions[key];
      const value = values[key];
      const noDebt = key === "cashToDebt" && stock.totalDebt === 0;
      const row = element("tr", "", rows);
      row.style.borderTop = "1px solid #263a44";
      const name = element("th", label, row);
      name.scope = "row";
      name.style.fontWeight = "normal";
      const grade = noDebt ? "good" : Number.isFinite(value) ? color?.(value, stock) : "";
      const cell = element("td", noDebt ? "No debt" : Number.isFinite(value) ? format(value) : "—", row, grade);
      if (grade) {
        const note = element("small", { good: "Strong", fair: "Watch", poor: "Weak" }[grade], cell);
        note.style.display = "block";
      }
      if (key === "marketCap" && stock.quoteDate) {
        element("small", stock.quoteDate, cell).style.display = "block";
      }
      const trend = element("td", "", row);
      sparkline(trend, stock.metricHistory?.[key], format);
      for (const item of [name, cell, trend]) item.style.padding = "10px 6px";
    }
  }

  function drawPicker() {
    picker.replaceChildren();
    const filter = query.value.trim().toLowerCase();
    picker.hidden = !filter && edit.getAttribute("aria-expanded") !== "true";
    if (picker.hidden) return;
    let matches = 0;
    for (const [key, [label]] of Object.entries(metricDefinitions)) {
      if (!label.toLowerCase().includes(filter)) continue;
      matches++;
      const option = element("label", "", picker);
      option.style.cssText = "display:inline-flex;align-items:center;gap:6px;margin:8px 12px 8px 0";
      const box = element("input", "", option);
      box.type = "checkbox";
      box.checked = pins.includes(key);
      option.append(document.createTextNode(label));
      box.addEventListener("change", () => {
        pins = box.checked ? [...pins, key] : pins.filter(pin => pin !== key);
        metricPins[stock.symbol] = pins;
        try { localStorage.setItem(metricPinsKey, JSON.stringify(metricPins)); } catch {}
        drawRows();
      });
    }
    if (!matches) element("small", "No matching metrics.", picker);
  }

  query.addEventListener("input", drawPicker);
  edit.addEventListener("click", () => {
    const open = edit.getAttribute("aria-expanded") !== "true";
    edit.setAttribute("aria-expanded", String(open));
    edit.textContent = open ? "Done" : "Edit pins";
    if (!open) query.value = "";
    drawPicker();
  });
  drawRows();
}

function addChart(parent, symbol) {
  const frame = element("div", "", parent, "chart tradingview-widget-container");
  const host = element("div", "", frame, "tradingview-widget-container__widget");
  host.style.height = "calc(100% - 32px)";
  const script = document.createElement("script");
  script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
  script.async = true;
  script.textContent = JSON.stringify({
    symbol, autosize: true, interval: "D", timezone: "America/New_York", style: "2",
    theme: "dark", locale: "en", allow_symbol_change: false,
    hide_side_toolbar: true, calendar: false, support_host: "https://www.tradingview.com"
  });
  frame.append(script);
  sourceLink(parent, `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}`, "Open chart on TradingView");
}

function render() {
  const filter = search.value.trim().toLowerCase();
  list.replaceChildren();
  const rows = [...snapshot.stocks].sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity))
    .filter(s => [s.ticker, s.name, s.catalyst].join(" ").toLowerCase().includes(filter));
  status.textContent = snapshot.asOf ? `Snapshot ${snapshot.asOf} · ${rows.length} stocks` : "";
  if (!rows.length) {
    element("div", snapshot.stocks.length ? "No matching stocks." : "No agent snapshot loaded. Load a watchlist JSON to see ranked stocks.", list, "empty");
    return;
  }

  const table = element("div", "", list, "stock-list");
  const header = element("div", "", table, "stock-list-header");
  const rankHeading = element("div", "", header, "column-heading rank-heading");
  element("strong", "Rank", rankHeading);
  addPopover(rankHeading, "i", "About ranking", popover => {
    element("p", "Ranking based on BioPlays scoring", popover);
  });
  for (const label of ["Company", "Market Cap", "Drug & Indication", "Stage & Event", "Catalyst Date", "Probability Score"]) {
    const heading = element("div", "", header, "column-heading");
    element("strong", label, heading);
  }

  for (const s of rows) {
    const row = element("article", "", table, "stock-row");
    const title = element("div", "", row, "stock-summary");
    const rank = element("div", "", title, "stock-rank");
    element("span", "Rank", rank, "mobile-column-label");
    element("strong", Number.isFinite(s.rank) ? `#${s.rank}` : "—", rank);

    const company = element("div", "", title, "stock-company");
    element("strong", s.name || "Company name unavailable", company, "company-name");
    const companyLink = element("a", s.ticker || "Ticker unavailable", company, "company-ticker");
    companyLink.href = `./stock.html?ticker=${encodeURIComponent(s.ticker || "")}`;
    companyLink.setAttribute("aria-label", `View ${s.name || s.ticker || "company"} profile`);

    const market = element("div", "", title, "stock-market");
    element("strong", Number.isFinite(s.marketCap) ? money(s.marketCap) : "N/A", market);
    if (Number.isFinite(s.price)) element("span", price(s.price), market, "share-price");

    const drug = element("div", "", title, "stock-drug");
    element("strong", s.drug || s.drugName || "Drug not provided", drug);
    element("em", s.indication || "Indication not provided", drug);

    const details = stageDetails(s);
    const stage = element("div", "", title, "stock-stage");
    element("strong", details.stage, stage, `stage-pill ${details.tone}`);
    element("span", details.event, stage, "event-label");
    const progress = element("span", "", stage, "event-progress");
    const progressFill = element("span", "", progress, "event-progress-fill");
    progressFill.style.width = `${details.progress}%`;

    const date = element("div", "", title, "stock-date");
    element("strong", displayDate(s.catalystDate), date);
    if (s.catalystNote) element("p", s.catalystNote, date);
    sourceLink(date, s.catalystSource, "View source");

    const scoreCell = element("div", "", title, "stock-score");
    element("span", "Probability Score", scoreCell, "mobile-column-label");
    const score = Number.isFinite(s.probabilityScore) ? s.probabilityScore : Number.isFinite(s.score) ? s.score : null;
    addPopover(scoreCell, score === null ? "—/100" : `${Math.round(score)}/100`, "BioPlays score breakdown", popover => {
      element("strong", "Score includes", popover, "popover-title");
      for (const item of [
        "Clinical evidence",
        "Valuation and asymmetry",
        "Catalyst materiality and timing confidence",
        "Financial condition and dilution risk",
        "Verified specialist ownership"
      ]) {
        element("span", item, popover, "score-factor");
      }
      element("small", "This is a comparative research score, not a calibrated probability of clinical or regulatory success.", popover);
    }, "score-trigger");
  }
}

function load(data) {
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data.asOf) || !Array.isArray(data.stocks) ||
      data.stocks.some(s => !s || typeof s.ticker !== "string" || !/^[A-Z0-9_-]+:[A-Z0-9.\-]+$/.test(s.symbol))) {
    throw Error("Use a dated snapshot with stocks and exchange-qualified symbols such as NASDAQ:XYZ.");
  }
  snapshot = data;
  render();
}

search.addEventListener("input", render);
render();
fetch(`./watchlist.json?v=${Date.now()}`, { cache: "no-store" })
  .then(response => { if (!response.ok) throw Error(); return response.json(); })
  .then(data => { if (!snapshot.asOf && data.asOf) load(data); })
  .catch(() => { if (!snapshot.asOf) status.textContent = "The published snapshot could not be loaded."; });
