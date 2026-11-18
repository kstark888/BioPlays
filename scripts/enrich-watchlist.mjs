import { readFile, writeFile } from "node:fs/promises";

const SEC_USER_AGENT = process.env.SEC_USER_AGENT;
const WATCHLIST_PATH = new URL("../watchlist.json", import.meta.url);
const SEC_HEADERS = { "User-Agent": SEC_USER_AGENT };
const SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers_exchange.json";
const SEC_FACTS_URL = cik => `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
const SEC_FORMS = new Set(["10-K", "10-Q", "20-F", "40-F", "6-K"]);
const QUARTER_DAYS = [70, 110];

if (!SEC_USER_AGENT || !/\S+\s+\S+@\S+/.test(SEC_USER_AGENT)) {
  throw new Error("Set SEC_USER_AGENT to an identifying value such as 'BioPlays admin@example.com'.");
}

async function getJson(url) {
  const response = await fetch(url, { headers: SEC_HEADERS });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

function asNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function daysBetween(start, end) {
  return (Date.parse(end) - Date.parse(start)) / 86_400_000;
}

function factsFor(companyFacts, tags, unit = "USD") {
  for (const tag of tags) {
    const fact = companyFacts.facts?.usgaap?.[tag]?.units?.[unit];
    if (Array.isArray(fact)) return fact;
  }
  return [];
}

function usableFact(fact) {
  return fact && SEC_FORMS.has(fact.form) && asNumber(fact.val) !== null &&
    /^\d{4}-\d{2}-\d{2}$/.test(fact.end);
}

function latestInstant(companyFacts, tags) {
  return factsFor(companyFacts, tags)
    .filter(fact => usableFact(fact) && !fact.start)
    .sort((a, b) => `${b.end}${b.filed}`.localeCompare(`${a.end}${a.filed}`))[0] ?? null;
}

function durationFacts(companyFacts, tags) {
  return factsFor(companyFacts, tags)
    .filter(fact => usableFact(fact) && fact.start && fact.end)
    .map(fact => ({ ...fact, days: daysBetween(fact.start, fact.end) }))
    .filter(fact => fact.days > 0)
    .sort((a, b) => `${b.end}${b.filed}`.localeCompare(`${a.end}${a.filed}`));
}

function latestQuarter(companyFacts, tags) {
  return durationFacts(companyFacts, tags)
    .filter(fact => fact.days >= QUARTER_DAYS[0] && fact.days <= QUARTER_DAYS[1])[0] ?? null;
}

function priorYearQuarter(companyFacts, tags, current) {
  if (!current) return null;
  return durationFacts(companyFacts, tags)
    .filter(fact => {
      const days = Math.abs(Date.parse(current.end) - Date.parse(fact.end)) / 86_400_000;
      return days >= 300 && days <= 430 && Math.abs(fact.days - current.days) <= 20;
    })[0] ?? null;
}

function fill(stock, key, value) {
  if (stock[key] === undefined && asNumber(value) !== null) stock[key] = value;
}

function enrichStock(stock, cik, companyFacts) {
  const revenueTags = ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet", "OperatingRevenues"];
  const netIncomeTags = ["NetIncomeLoss", "ProfitLoss"];
  const cashTags = ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"];
  const currentDebtTags = ["LongTermDebtCurrent", "LongTermDebtAndFinanceLeaseObligationsCurrent", "ShortTermBorrowings", "DebtCurrent"];
  const noncurrentDebtTags = ["LongTermDebtNoncurrent", "LongTermDebtAndFinanceLeaseObligationsNoncurrent", "LongTermDebt"];
  const operatingCashFlowTags = ["NetCashProvidedByUsedInOperatingActivities"];
  const revenue = latestQuarter(companyFacts, revenueTags) ?? durationFacts(companyFacts, revenueTags)[0];
  const priorRevenue = priorYearQuarter(companyFacts, revenueTags, revenue);
  const netIncome = latestQuarter(companyFacts, netIncomeTags) ?? durationFacts(companyFacts, netIncomeTags)[0];
  const operatingCashFlow = latestQuarter(companyFacts, operatingCashFlowTags);
  const cash = latestInstant(companyFacts, cashTags);
  const currentDebt = latestInstant(companyFacts, currentDebtTags);
  const noncurrentDebt = latestInstant(companyFacts, noncurrentDebtTags);

  fill(stock, "revenue", revenue?.val);
  fill(stock, "netIncome", netIncome?.val);
  fill(stock, "revenueGrowth", revenue && priorRevenue ? ((revenue.val / priorRevenue.val) - 1) * 100 : null);
  fill(stock, "cash", cash?.val);
  fill(stock, "currentDebt", currentDebt?.val);
  fill(stock, "totalDebt", (currentDebt && noncurrentDebt) ? currentDebt.val + noncurrentDebt.val : currentDebt?.val ?? noncurrentDebt?.val);
  if (stock.runwayMonths === undefined && cash && operatingCashFlow && operatingCashFlow.val < 0) {
    stock.runwayMonths = cash.val / (-operatingCashFlow.val / operatingCashFlow.days * 30.4375);
  }

  const filingDate = [revenue, netIncome, cash, currentDebt, noncurrentDebt]
    .filter(Boolean)
    .map(fact => fact.filed)
    .sort()
    .at(-1);
  stock.cik = cik;
  stock.secFilingDate = filingDate ?? stock.secFilingDate;
  stock.secSource = `https://www.sec.gov/edgar/browse/?CIK=${cik}`;
  return stock;
}

const watchlist = JSON.parse(await readFile(WATCHLIST_PATH, "utf8"));
if (!Array.isArray(watchlist.stocks)) throw new Error("watchlist.json must contain a stocks array.");
const stocksBefore = JSON.stringify(watchlist.stocks);

const tickerData = await getJson(SEC_TICKERS_URL);
const tickers = Object.values(tickerData).reduce((map, company) => {
  map.set(company.ticker.toUpperCase(), String(company.cik_str).padStart(10, "0"));
  return map;
}, new Map());

for (const stock of watchlist.stocks) {
  const ticker = stock.ticker?.toUpperCase();
  const cik = ticker && (stock.cik ?? tickers.get(ticker));
  if (!cik) {
    console.warn(`Skipping ${stock.ticker ?? "unknown stock"}: no SEC CIK found.`);
    continue;
  }
  try {
    const companyFacts = await getJson(SEC_FACTS_URL(String(cik).padStart(10, "0")));
    enrichStock(stock, String(cik).padStart(10, "0"), companyFacts);
    console.log(`Enriched ${stock.ticker} (${cik}).`);
  } catch (error) {
    console.warn(`Could not enrich ${stock.ticker}: ${error.message}`);
  }
}

if (stocksBefore !== JSON.stringify(watchlist.stocks)) watchlist.enrichedAt = new Date().toISOString();
await writeFile(WATCHLIST_PATH, `${JSON.stringify(watchlist, null, 2)}\n`);
