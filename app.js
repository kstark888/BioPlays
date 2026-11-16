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

function metric(parent, label, value, color, note) {
  const card = element("div", "", parent, "metric");
  element("small", label, card);
  element("b", value, card, color);
  const names = { good: "Strong", fair: "Watch", poor: "Weak" };
  element("small", [names[color], note].filter(Boolean).join(" · "), card);
}

function showMetrics(parent, s) {
  const grid = element("div", "", parent, "metrics");
  const has = Number.isFinite;
  const pe = s.pe;
  const growth = s.revenueGrowth;
  const runway = s.runwayMonths;
  const debt = s.totalDebt;
  const cash = s.cash;
  const ratio = has(cash) && debt > 0 ? cash / debt : null;
  const growthComparable = has(growth) && s.revenueComparable !== false;
  metric(grid, "Trailing P/E", has(pe) ? pe > 0 ? multiple(pe) : "N/M" : "—", "", "Context dependent");
  metric(grid, "YoY revenue growth", has(growth) ? `${growth.toFixed(1)}%` : "—",
    growthComparable ? tier(growth, 15, 0) : "", "Strong ≥15% · Watch ≥0%");
  metric(grid, "Current debt", has(s.currentDebt) ? money(s.currentDebt) : "—", "", "Due within 12 months");
  metric(grid, "Total debt", has(debt) ? money(debt) : "—", "", "Short- and long-term");
  metric(grid, "Cash / total debt", debt === 0 ? "No debt" : has(ratio) ? multiple(ratio) : "—",
    debt === 0 ? "good" : has(ratio) ? tier(ratio, 2, 1) : "", "Strong ≥2× · Watch ≥1×");
  metric(grid, "Cash runway", has(runway) ? `${runway.toFixed(1)} mo` : "—",
    has(runway) ? tier(runway, 18, 12) : "", "Strong ≥18 mo · Watch ≥12 mo");
  metric(grid, "Market cap", has(s.marketCap) ? money(s.marketCap) : "—", "", s.quoteDate || "Snapshot");
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
