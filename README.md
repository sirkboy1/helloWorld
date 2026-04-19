# Trading Strategy Simulation Lab

Interactive browser app to explore three intraday strategy ideas and their combinations:

1. Opening Range Breakout (ORB)
2. VWAP + 9 EMA
3. ICT Killzones + Pivots

## What this app does

- Runs synthetic simulations for one selected asset class at a time (Stocks, Crypto, Indices, Futures, Commodities).
- Lets you select one, two, or all three strategies.
- Shows key metrics (return, drawdown, win rate, Sharpe, trades, etc.).
- Draws equity and drawdown charts.
- Runs a cross-asset matrix comparing all strategy combinations.

## Important limitations

- This is an educational simulator, **not** a broker-connected or exchange-historical backtester.
- The logic is simplified and does not replicate proprietary internals of third-party indicators.
- Use this to generate hypotheses, then validate with real historical data before live trading.

## Run locally

Because this is a static app, you can either:

- Open `index.html` directly in your browser, or
- Serve the folder with a tiny web server:

```bash
python3 -m http.server 8000
```

Then visit: `http://localhost:8000`
