"use strict";

const search = document.getElementById("search");
const list = document.getElementById("list");
const status = document.getElementById("status");
const file = document.getElementById("file");
let snapshot = { stocks: [] };

function element(tag, text, parent, className) {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  parent.append(node);
  return node;
}

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

const money = n => new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2
}).format(n);
const multiple = n => `${n.toFixed(1)}×`;
const tier = (n, good, fair) => n >= good ? "good" : n >= fair ? "fair" : "poor";


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
    symbol, autosize: true, interval: "D", timezone: "America/New_York",
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
  for (const s of rows) {
    const row = element("details", "", list);
    const title = element("summary", "", row);
    element("strong", [s.rank && `#${s.rank}`, s.ticker].filter(Boolean).join(" "), title);
    title.append(document.createTextNode([s.name, s.catalyst, s.catalystDate].filter(Boolean).join(" · ")));
    const body = element("div", "", row, "body");
    showMetrics(body, s);
    if (s.filingDate) element("small", `Financial period ending ${s.filingDate}`, body);
    sourceLink(body, s.source, "Financial filing");
    sourceLink(body, s.catalystSource, "Catalyst source");
    row.addEventListener("toggle", () => {
      if (row.open && !body.querySelector(".chart")) addChart(body, s.symbol);
    });
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
document.getElementById("import").addEventListener("click", () => file.click());
file.addEventListener("change", async () => {
  if (!file.files.length) return;
  try { load(JSON.parse(await file.files[0].text())); }
  catch (error) { status.textContent = error.message; }
  file.value = "";
});
render();
fetch("./watchlist.json", { cache: "no-cache" })
  .then(response => { if (!response.ok) throw Error(); return response.json(); })
  .then(data => { if (!snapshot.asOf && data.asOf) load(data); })
  .catch(() => { if (!snapshot.asOf) status.textContent = "The published snapshot could not be loaded."; });
