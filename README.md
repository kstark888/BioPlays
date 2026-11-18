# Biotech Catalyst Watchlist

Create a dedicated GitHub repository, upload the contents of this folder to its main branch, then select Settings → Pages → Deploy from a branch → main → / (root). The site requires no build or API keys.

The site requests the latest `watchlist.json` whenever the homepage opens. The agent's ranked workbook needs a JSON export for this site. Use an object with `asOf` in YYYY-MM-DD format and `stocks` as an array of objects. The agent workflow should commit the generated file as `/watchlist.json` on the `main` branch. GitHub Pages then publishes the new snapshot, and the homepage loads it automatically without a manual upload control.

To keep that update path automatic, configure the agent workflow to: generate the complete JSON, validate it, replace the repository-root `watchlist.json`, commit only that file, and push to `main`. If GitHub Pages is configured to deploy from `main` and `/ (root)`, every accepted push triggers a new deployment. The homepage uses a cache-busting request so browsers do not keep showing an older snapshot after deployment.

Each stock requires ticker and symbol (TradingView exchange-qualified, e.g. NASDAQ:XYZ). Optional fields are rank, name, catalyst, catalystDate, catalystSource, pe (trailing), revenueGrowth (percent such as 15, not 0.15), revenueComparable (false for distorted or one-off revenue), currentDebt, totalDebt, cash, runwayMonths, marketCap, quoteDate, filingDate (financial period end), and source (SEC filing URL). Dollar amounts are USD, with no scaling. Omit unknown fields. Use equivalent periods for year-over-year revenue. Use cash and cash equivalents consistently, and retain the reported measurement date.

The charts use TradingView; quote delays depend on exchange coverage. The financial cards are dated snapshots. Color thresholds are explicitly shown on the relevant cards. Negative earnings make P/E non-meaningful; positive P/E requires valuation context.

## SEC EDGAR enrichment

Run `SEC_USER_AGENT="BioPlays admin@example.com" npm run enrich:sec` to look up each stock's SEC CIK and fill missing SEC-backed fields in `watchlist.json`. The script preserves values already present in the snapshot and can fill revenue, net income, revenue growth, cash, debt, and estimated cash runway. Market cap, P/E, and dividend yield require market-price data and are not supplied by this enrichment.

The GitHub Actions workflow runs when `watchlist.json` changes or when manually dispatched. Add a repository secret named `SEC_USER_AGENT` containing an identifying name and contact email before enabling it. SEC's `data.sec.gov` APIs do not support browser CORS, so the enrichment runs server-side in Node rather than from `index.html`.
