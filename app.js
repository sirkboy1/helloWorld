const ASSETS = {
  Stocks: {
    drift: 0.0003,
    vol: 0.012,
    sessionBias: "us",
    orbStrength: 0.85,
    vwapStrength: 0.7,
    ictStrength: 0.55,
  },
  Crypto: {
    drift: 0.0004,
    vol: 0.02,
    sessionBias: "global",
    orbStrength: 0.55,
    vwapStrength: 0.75,
    ictStrength: 0.85,
  },
  Indices: {
    drift: 0.00025,
    vol: 0.01,
    sessionBias: "us",
    orbStrength: 0.9,
    vwapStrength: 0.8,
    ictStrength: 0.6,
  },
  Futures: {
    drift: 0.0002,
    vol: 0.014,
    sessionBias: "us",
    orbStrength: 0.95,
    vwapStrength: 0.7,
    ictStrength: 0.65,
  },
  Commodities: {
    drift: 0.00015,
    vol: 0.016,
    sessionBias: "mixed",
    orbStrength: 0.8,
    vwapStrength: 0.6,
    ictStrength: 0.7,
  },
};

const STRATEGY_DEFS = {
  orb: { label: "ORB", winBase: 0.49, rr: 1.8, freq: 0.55 },
  vwap: { label: "VWAP+9EMA", winBase: 0.51, rr: 1.45, freq: 0.8 },
  ict: { label: "ICT KZ+Piv", winBase: 0.47, rr: 2.1, freq: 0.45 },
};

const $ = (id) => document.getElementById(id);

function init() {
  const select = $("assetClass");
  Object.keys(ASSETS).forEach((asset) => {
    const opt = document.createElement("option");
    opt.value = asset;
    opt.textContent = asset;
    select.appendChild(opt);
  });
  select.value = "Futures";

  $("runSim").addEventListener("click", runSingleSimulation);
  $("runMatrix").addEventListener("click", runMatrixSimulation);

  runSingleSimulation();
}

function getSelectedStrategies() {
  return [...document.querySelectorAll(".strategy:checked")].map((node) => node.value);
}

function gaussian() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function regimeShift(regime) {
  switch (regime) {
    case "trending": return { drift: 1.65, vol: 0.9 };
    case "range": return { drift: 0.55, vol: 0.85 };
    case "volatile": return { drift: 0.9, vol: 1.8 };
    default: return { drift: 1, vol: 1 };
  }
}

function strategyEdge(assetConfig, strategyId, regime) {
  const def = STRATEGY_DEFS[strategyId];
  const regimeAdj = {
    orb: { trending: 0.04, range: -0.03, volatile: -0.01, mixed: 0 },
    vwap: { trending: 0.03, range: 0.01, volatile: -0.02, mixed: 0 },
    ict: { trending: -0.01, range: 0.04, volatile: 0.02, mixed: 0 },
  };

  const strengthKey = strategyId === "orb" ? "orbStrength" : strategyId === "vwap" ? "vwapStrength" : "ictStrength";
  const strengthBoost = (assetConfig[strengthKey] - 0.7) * 0.12;

  return {
    winRate: Math.min(0.74, Math.max(0.3, def.winBase + strengthBoost + regimeAdj[strategyId][regime])),
    rr: def.rr + (assetConfig.vol - 0.012) * 10,
    freq: Math.max(0.12, Math.min(1, def.freq + (assetConfig.vol - 0.012) * 4)),
  };
}

function combineEdges(edges) {
  if (edges.length === 1) return edges[0];

  const avgWin = edges.reduce((sum, e) => sum + e.winRate, 0) / edges.length;
  const avgRR = edges.reduce((sum, e) => sum + e.rr, 0) / edges.length;
  const minFreq = Math.min(...edges.map((e) => e.freq));

  const confluenceBoost = 0.015 * (edges.length - 1);
  const frequencyPenalty = 0.78 - 0.08 * (edges.length - 2);

  return {
    winRate: Math.min(0.82, avgWin + confluenceBoost),
    rr: avgRR + 0.08 * edges.length,
    freq: Math.max(0.08, minFreq * frequencyPenalty),
  };
}

function simulate({ assetName, strategies, sessions, riskPct, startBalance, regime }) {
  const asset = ASSETS[assetName];
  const shift = regimeShift(regime);

  let balance = startBalance;
  let peak = startBalance;
  const equity = [startBalance];
  const drawdown = [0];

  let wins = 0;
  let losses = 0;
  let trades = 0;

  for (let day = 0; day < sessions; day += 1) {
    const dayDrift = asset.drift * shift.drift + gaussian() * asset.vol * 0.08;
    const regimeNoise = gaussian() * asset.vol * shift.vol;

    const edges = strategies.map((s) => strategyEdge(asset, s, regime));
    const setup = combineEdges(edges);
    const tradeChance = setup.freq * (0.75 + Math.min(0.4, Math.abs(regimeNoise) * 3));

    if (Math.random() < tradeChance) {
      trades += 1;
      const riskAmount = balance * (riskPct / 100);

      const randomFactor = gaussian() * 0.04;
      const winProb = Math.max(0.15, Math.min(0.9, setup.winRate + dayDrift * 30 + randomFactor));
      const won = Math.random() < winProb;

      if (won) {
        wins += 1;
        const pnl = riskAmount * (setup.rr + gaussian() * 0.18);
        balance += pnl;
      } else {
        losses += 1;
        const pnl = riskAmount * (1 + Math.abs(gaussian()) * 0.04);
        balance -= pnl;
      }
    }

    peak = Math.max(peak, balance);
    const dd = peak === 0 ? 0 : (peak - balance) / peak;
    equity.push(balance);
    drawdown.push(dd);
  }

  const returns = equity.slice(1).map((val, idx) => (val - equity[idx]) / equity[idx]);
  const meanReturn = returns.reduce((a, b) => a + b, 0) / Math.max(returns.length, 1);
  const vol = Math.sqrt(returns.reduce((s, r) => s + (r - meanReturn) ** 2, 0) / Math.max(returns.length, 1));
  const sharpe = vol === 0 ? 0 : (meanReturn / vol) * Math.sqrt(252);

  const totalReturn = (balance - startBalance) / startBalance;
  const maxDD = Math.max(...drawdown);
  const winRate = trades ? wins / trades : 0;
  const profitFactor = losses === 0 ? (wins ? 9.99 : 0) : (wins * 1.2) / losses;

  return {
    equity,
    drawdown,
    metrics: {
      asset: assetName,
      strategies: strategies.map((s) => STRATEGY_DEFS[s].label).join(" + "),
      endingBalance: balance,
      totalReturn,
      maxDD,
      trades,
      winRate,
      sharpe,
      profitFactor,
    },
  };
}

function formatPct(v) {
  return `${(v * 100).toFixed(2)}%`;
}

function drawLineChart(canvasId, series, { color = "#6da2ff", fill = false, invert = false } = {}) {
  const canvas = $(canvasId);
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);

  const min = Math.min(...series);
  const max = Math.max(...series);
  const pad = 20;
  const xStep = (width - pad * 2) / Math.max(1, series.length - 1);

  ctx.strokeStyle = "#2e3556";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = pad + ((height - pad * 2) * i) / 4;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(width - pad, y);
    ctx.stroke();
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  series.forEach((v, i) => {
    const norm = max === min ? 0.5 : (v - min) / (max - min);
    const y = invert ? pad + norm * (height - pad * 2) : height - pad - norm * (height - pad * 2);
    const x = pad + i * xStep;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  if (fill) {
    ctx.lineTo(width - pad, height - pad);
    ctx.lineTo(pad, height - pad);
    ctx.closePath();
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function renderSummary(metrics) {
  const summary = $("summary");
  const cells = [
    ["Asset", metrics.asset],
    ["Strategies", metrics.strategies],
    ["Ending Balance", `$${metrics.endingBalance.toFixed(2)}`],
    ["Total Return", formatPct(metrics.totalReturn)],
    ["Max Drawdown", formatPct(metrics.maxDD)],
    ["Trades", metrics.trades],
    ["Win Rate", formatPct(metrics.winRate)],
    ["Sharpe", metrics.sharpe.toFixed(2)],
    ["Profit Factor", metrics.profitFactor.toFixed(2)],
  ];

  summary.innerHTML = `<div class="summary-grid">${cells
    .map(([label, value]) => {
      const cls = label === "Total Return" ? (metrics.totalReturn >= 0 ? "good" : "bad") : "";
      return `<div class="kpi"><div class="label">${label}</div><div class="value ${cls}">${value}</div></div>`;
    })
    .join("")}</div>`;
}

function renderInsights(metrics) {
  const insights = [];
  if (metrics.maxDD > 0.2) insights.push("Drawdown is high; reduce risk % or require stronger confluence.");
  if (metrics.trades < 50) insights.push("Low trade count; sample may be statistically weak. Increase sessions.");
  if (metrics.winRate < 0.45 && metrics.profitFactor > 1) insights.push("Lower win rate is compensated by higher reward-to-risk.");
  if (metrics.winRate > 0.6 && metrics.profitFactor < 1.2) insights.push("High hit-rate but modest average winners; watch for overtrading.");

  const timingHint = {
    Stocks: "Best focus windows: U.S. open (first 90 minutes) for ORB and indices correlation plays.",
    Crypto: "Crypto trades 24/7; London + New York overlap tends to produce directional moves and killzone reactions.",
    Indices: "Major index momentum often appears around cash open and macro data releases.",
    Futures: "Futures respond strongly to session opens and economic events; ORB often shines when trend day emerges.",
    Commodities: "Commodities can be event-driven (inventory, weather, geopolitics); be selective around catalyst times.",
  };

  insights.push(timingHint[metrics.asset]);

  $("insights").innerHTML = `<ul>${insights.map((t) => `<li>${t}</li>`).join("")}</ul>`;
}

function runSingleSimulation() {
  const strategies = getSelectedStrategies();
  if (!strategies.length) {
    alert("Please select at least one strategy.");
    return;
  }

  const params = {
    assetName: $("assetClass").value,
    regime: $("regime").value,
    sessions: Number($("sessions").value),
    riskPct: Number($("risk").value),
    startBalance: Number($("startBalance").value),
    strategies,
  };

  const result = simulate(params);
  renderSummary(result.metrics);
  renderInsights(result.metrics);
  drawLineChart("equityChart", result.equity, { color: "#6da2ff", fill: true });
  drawLineChart("drawdownChart", result.drawdown, { color: "#ff7675", invert: false });
}

function strategyCombos() {
  return [
    ["orb"],
    ["vwap"],
    ["ict"],
    ["orb", "vwap"],
    ["orb", "ict"],
    ["vwap", "ict"],
    ["orb", "vwap", "ict"],
  ];
}

function runMatrixSimulation() {
  const sessions = Number($("sessions").value);
  const riskPct = Number($("risk").value);
  const startBalance = Number($("startBalance").value);
  const regime = $("regime").value;

  const rows = [];
  Object.keys(ASSETS).forEach((assetName) => {
    strategyCombos().forEach((combo) => {
      const runs = 20;
      let sumReturn = 0;
      let sumDD = 0;
      let sumSharpe = 0;

      for (let i = 0; i < runs; i += 1) {
        const result = simulate({ assetName, strategies: combo, sessions, riskPct, startBalance, regime });
        sumReturn += result.metrics.totalReturn;
        sumDD += result.metrics.maxDD;
        sumSharpe += result.metrics.sharpe;
      }

      rows.push({
        assetName,
        comboLabel: combo.map((id) => STRATEGY_DEFS[id].label).join(" + "),
        avgReturn: sumReturn / runs,
        avgDD: sumDD / runs,
        avgSharpe: sumSharpe / runs,
        score: (sumReturn / runs) * 100 - (sumDD / runs) * 50 + (sumSharpe / runs) * 6,
      });
    });
  });

  rows.sort((a, b) => b.score - a.score);
  const top = rows[0];

  const html = `
    <table>
      <thead>
        <tr>
          <th>Rank</th><th>Asset</th><th>Strategy Combo</th><th>Avg Return</th><th>Avg Max DD</th><th>Avg Sharpe</th><th>Composite Score</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map((r, idx) => `
            <tr>
              <td>${idx + 1}</td>
              <td>${r.assetName}</td>
              <td>${r.comboLabel}</td>
              <td class="${r.avgReturn >= 0 ? "good" : "bad"}">${formatPct(r.avgReturn)}</td>
              <td>${formatPct(r.avgDD)}</td>
              <td>${r.avgSharpe.toFixed(2)}</td>
              <td>${r.score.toFixed(2)}</td>
            </tr>
          `)
          .join("")}
      </tbody>
    </table>
    <p><strong>Best observed combo:</strong> ${top.assetName} with ${top.comboLabel}. Use this as a starting hypothesis, then validate on real data.</p>
  `;

  $("matrixTableWrap").innerHTML = html;
}

window.addEventListener("DOMContentLoaded", init);
