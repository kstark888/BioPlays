# Biotech Catalyst Watchlist

Create a dedicated GitHub repository, upload the contents of this folder to its main branch, then select Settings → Pages → Deploy from a branch → main → / (root). The site requires no build or API keys.

The site reads watchlist.json when opened. The agent's ranked workbook needs a JSON export for this site. Use an object with asOf in YYYY-MM-DD format and stocks as an array of objects. Commit the export as watchlist.json to update the published site, or use Load watchlist JSON for a browser-only preview.

Each stock requires ticker and symbol (TradingView exchange-qualified, e.g. NASDAQ:XYZ). Optional fields are rank, name, catalyst, catalystDate, catalystSource, pe (trailing), revenueGrowth (percent such as 15, not 0.15), revenueComparable (false for distorted or one-off revenue), currentDebt, totalDebt, cash, runwayMonths, marketCap, quoteDate, filingDate (financial period end), and source (SEC filing URL). Dollar amounts are USD, with no scaling. Omit unknown fields. Use equivalent periods for year-over-year revenue. Use cash and cash equivalents consistently, and retain the reported measurement date.

The charts use TradingView; quote delays depend on exchange coverage. The financial cards are dated snapshots. Color thresholds are explicitly shown on the relevant cards. Negative earnings make P/E non-meaningful; positive P/E requires valuation context.
