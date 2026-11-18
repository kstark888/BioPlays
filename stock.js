"use strict";

const profile = document.getElementById("profile");

function element(tag, text, parent, className) {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  parent.append(node);
  return node;
}

const money = value => Number.isFinite(value) ? new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2
}).format(value) : "—";
const number = value => Number.isFinite(value) ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value) : "—";
const percent = value => Number.isFinite(value) ? `${value.toFixed(1)}%` : "—";

function safeLink(parent, href, label) {
  try {
    const url = new URL(href);
    if (url.protocol !== "https:") return;
    const link = element("a", label, parent);
    link.href = url.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  } catch {}
}

function metric(parent, label, value) {
  const row = element("div", "", parent, "metric");
  element("span", label, row);
  element("strong", value, row);
}

function addChart(parent, symbol) {
  if (!symbol) {
    element("p", "No exchange-qualified symbol is available for this chart.", parent, "description");
    return;
  }
  const frame = element("div", "", parent, "chart tradingview-widget-container");
  frame.style.height = "400px";
  frame.style.minHeight = "400px";
  frame.style.maxHeight = "400px";
  const host = element("div", "", frame, "tradingview-widget-container__widget");
  host.style.width = "100%";
  host.style.height = "400px";
  const script = document.createElement("script");
  script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
  script.async = true;
  script.textContent = JSON.stringify({
    symbol, autosize: false, width: "100%", height: 400,
    interval: "D", timezone: "America/New_York", style: "2",
    theme: "dark", locale: "en", allow_symbol_change: false, hide_side_toolbar: true,
    calendar: false, support_host: "https://www.tradingview.com"
  });
  frame.append(script);
}

function render(stock) {
  document.title = `${stock.ticker} · Biotech Research`;
  const hero = element("section", "", profile, "panel hero");
  const identity = element("div", "", hero, "identity");
  element("div", (stock.ticker || "?").slice(0, 2), identity, "company-mark");
  const identityText = element("div", "", identity);
  element("h1", stock.name || stock.ticker || "Stock profile", identityText);
  const symbolLine = element("div", "", identityText, "symbol-line");
  element("span", stock.ticker || "—", symbolLine, "ticker");
  element("span", stock.symbol?.split(":")[0] || "Exchange unavailable", symbolLine);

  const heroGrid = element("div", "", hero, "hero-grid");
  const heroPrice = element("div", "", heroGrid, "hero-price");
  element("span", "Current snapshot", heroPrice, "eyebrow");
  element("div", Number.isFinite(stock.price) ? money(stock.price) : stock.ticker, heroPrice, "headline-value");
  for (const [label, value] of [
    ["Catalyst date", stock.catalystDate || "TBD"],
    ["Market cap", money(stock.marketCap)],
    ["Trailing P/E", Number.isFinite(stock.pe) && stock.pe > 0 ? `${stock.pe.toFixed(1)}×` : "N/M"],
    ["Cash runway", Number.isFinite(stock.runwayMonths) ? `${stock.runwayMonths.toFixed(1)} mo` : "—"]
  ]) {
    const stat = element("div", "", heroGrid, "stat");
    element("strong", value, stat);
    element("span", label, stat);
  }

  const content = element("div", "", profile, "content-grid");
  const overview = element("section", "", content, "panel section");
  element("h2", "Company & catalyst", overview);
  element("p", stock.description || `${stock.name || stock.ticker} is included in the BioPlays catalyst watchlist. Add a description field to the watchlist snapshot to display a fuller company profile here.`, overview, "description");
  const catalyst = element("div", "", overview, "catalyst");
  element("span", "Upcoming catalyst", catalyst, "eyebrow");
  element("strong", stock.catalyst || "Catalyst details unavailable", catalyst);
  element("span", stock.catalystDate || "Date TBD", catalyst, "catalyst-date");
  if (stock.catalystNote) element("p", stock.catalystNote, catalyst, "description");
  const links = element("div", "", overview, "links");
  safeLink(links, stock.catalystSource, "Catalyst source");
  safeLink(links, stock.secSource, "SEC filings");
  safeLink(links, stock.source, "Financial filing");

  const fundamentals = element("section", "", content, "panel section");
  element("h2", "Financial snapshot", fundamentals);
  const metrics = element("div", "", fundamentals, "metrics");
  metric(metrics, "Market cap", money(stock.marketCap));
  metric(metrics, "Revenue", money(stock.revenue));
  metric(metrics, "Net income", money(stock.netIncome));
  metric(metrics, "Revenue growth", percent(stock.revenueGrowth));
  metric(metrics, "Cash", money(stock.cash));
  metric(metrics, "Total debt", money(stock.totalDebt));
  metric(metrics, "Current debt", money(stock.currentDebt));
  metric(metrics, "Dividend yield", percent(stock.dividendYield));
  metric(metrics, "Trailing P/E", Number.isFinite(stock.pe) ? number(stock.pe) : "—");
  metric(metrics, "SEC filing date", stock.secFilingDate || stock.filingDate || "—");

  const chartPanel = element("section", "", profile, "panel chart-panel");
  element("h2", "Price history", chartPanel);
  addChart(chartPanel, stock.symbol);
}

async function load() {
  const ticker = new URLSearchParams(location.search).get("ticker")?.trim().toUpperCase();
  if (!ticker || !/^[A-Z0-9.\-]+$/.test(ticker)) throw new Error("Choose a stock from the watchlist.");
  const response = await fetch("./watchlist.json", { cache: "no-cache" });
  if (!response.ok) throw new Error("The watchlist could not be loaded.");
  const data = await response.json();
  const stock = data.stocks?.find(item => item.ticker?.toUpperCase() === ticker);
  if (!stock) throw new Error(`${ticker} is not in the current watchlist.`);
  render(stock);
}

load().catch(error => {
  const card = element("div", "", profile, "panel error");
  element("h1", "Stock unavailable", card);
  element("p", error.message, card, "description");
});
