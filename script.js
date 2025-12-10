function parseNumber(value) {
  if (value === null || value === undefined) return NaN;
  const n = parseFloat(String(value).replace(/,/g, "").trim());
  return isNaN(n) ? NaN : n;
}

function setCell(row, index, value) {
  const cell = row.cells[index];
  if (!cell) return;
  cell.textContent = value !== null && value !== undefined ? value : "";
}

function getFinancialRows() {
  const tbody = document.querySelector("#financialTable tbody");
  return Array.from(tbody.querySelectorAll("tr"));
}

async function fetchFinancialData(ticker) {
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(
    ticker
  )}?modules=financialData`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Network response was not ok");
  const json = await res.json();

  const fd =
    json?.quoteSummary?.result &&
    json.quoteSummary.result[0] &&
    json.quoteSummary.result[0].financialData;

  if (!fd) throw new Error("No financialData available for ticker");

  const revenue = fd.totalRevenue?.raw ?? null;
  const ebitda = fd.ebitda?.raw ?? null;
  const netIncome = fd.netIncomeToCommon?.raw ?? null;
  const operatingCashflow = fd.operatingCashflow?.raw ?? null;
  const totalDebt = fd.totalDebt?.raw ?? null;
  const cash = fd.totalCash?.raw ?? null;
  const equity =
    fd.totalAssets?.raw && fd.totalDebt?.raw
      ? fd.totalAssets.raw - fd.totalDebt.raw
      : null;

  const rows = getFinancialRows();
  rows.forEach((row) => {
    setCell(row, 1, revenue);
    setCell(row, 2, ebitda);
    setCell(row, 3, netIncome);
    setCell(row, 4, operatingCashflow);
    setCell(row, 5, "");
    setCell(row, 6, "");
    setCell(row, 7, cash);
    setCell(row, 8, equity);
    setCell(row, 9, totalDebt);
    setCell(row, 10, "");
    setCell(row, 11, "");
    setCell(row, 12, "");
    setCell(row, 13, "");
  });
}

function readFinancialData() {
  const rows = getFinancialRows();
  const years = [];
  rows.forEach((row) => {
    const label = row.cells[0].textContent.trim();
    const year = row.dataset.year || label.replace("FY", "");
    const revenue = parseNumber(row.cells[1].textContent);
    const ebitda = parseNumber(row.cells[2].textContent);
    const pat = parseNumber(row.cells[3].textContent);
    const ocf = parseNumber(row.cells[4].textContent);
    const fcf = parseNumber(row.cells[5].textContent);
    const ar = parseNumber(row.cells[6].textContent);
    const cash = parseNumber(row.cells[7].textContent);
    const equity = parseNumber(row.cells[8].textContent);
    const debt = parseNumber(row.cells[9].textContent);
    const invAdv = parseNumber(row.cells[10].textContent);
    const dividend = parseNumber(row.cells[11].textContent);
    const inventory = parseNumber(row.cells[12].textContent);
    const payables = parseNumber(row.cells[13].textContent);

    years.push({
      year,
      label,
      revenue,
      ebitda,
      pat,
      ocf,
      fcf,
      ar,
      cash,
      equity,
      debt,
      invAdv,
      dividend,
      inventory,
      payables
    });
  });
  return years;
}

function calculateMetrics() {
  const data = readFinancialData();
  const metricsBody = document.querySelector("#metricsTable tbody");
  metricsBody.innerHTML = "";

  data.forEach((row, idx) => {
    const prev = idx > 0 ? data[idx - 1] : null;
    const ebitdaMargin =
      row.revenue && !isNaN(row.revenue) && !isNaN(row.ebitda)
        ? (row.ebitda / row.revenue) * 100
        : null;
    const patMargin =
      row.revenue && !isNaN(row.revenue) && !isNaN(row.pat)
        ? (row.pat / row.revenue) * 100
        : null;
    const cashConversion =
      row.ebitda && !isNaN(row.ebitda) && !isNaN(row.ocf)
        ? row.ocf / row.ebitda
        : null;
    const dso =
      row.revenue && !isNaN(row.revenue) && !isNaN(row.ar)
        ? (row.ar / row.revenue) * 365
        : null;
    const equityGrowth =
      prev && !isNaN(prev.equity) && !isNaN(row.equity) && prev.equity !== 0
        ? ((row.equity - prev.equity) / prev.equity) * 100
        : null;
    const cashEquityRatio =
      row.equity && !isNaN(row.equity) && !isNaN(row.cash)
        ? row.cash / row.equity
        : null;
    const revYoy =
      prev && !isNaN(prev.revenue) && !isNaN(row.revenue) && prev.revenue !== 0
        ? ((row.revenue - prev.revenue) / prev.revenue) * 100
        : null;

    const tr = document.createElement("tr");
    const cells = [
      row.label,
      ebitdaMargin != null && !isNaN(ebitdaMargin)
        ? ebitdaMargin.toFixed(1) + " %"
        : "",
      patMargin != null && !isNaN(patMargin) ? patMargin.toFixed(1) + " %" : "",
      cashConversion != null && !isNaN(cashConversion)
        ? cashConversion.toFixed(2) + " x"
        : "",
      dso != null && !isNaN(dso) ? dso.toFixed(0) + " days" : "",
      equityGrowth != null && !isNaN(equityGrowth)
        ? equityGrowth.toFixed(1) + " %"
        : "",
      cashEquityRatio != null && !isNaN(cashEquityRatio)
        ? cashEquityRatio.toFixed(2) + " x"
        : "",
      revYoy != null && !isNaN(revYoy) ? revYoy.toFixed(1) + " %" : ""
    ];
    cells.forEach((val, i) => {
      const td = document.createElement("td");
      td.textContent = val;
      if (i === 0) td.style.textAlign = "left";
      tr.appendChild(td);
    });
    metricsBody.appendChild(tr);
  });

  return data;
}

function detectAnomalies() {
  const data = calculateMetrics();
  const anomalyBody = document.querySelector("#anomalyTable tbody");
  anomalyBody.innerHTML = "";

  data.forEach((row, idx) => {
    const prev = idx > 0 ? data[idx - 1] : null;
    const anomalies = [];

    if (
      row.revenue &&
      row.ebitda &&
      row.revenue > 0 &&
      row.ebitda / row.revenue < 0.1
    ) {
      anomalies.push({
        color: "red",
        condition: "EBITDA margin < 10%",
        interpretation:
          "Operating profitability is structurally weak; investigate pricing, input costs and overheads."
      });
    }

    if (
      row.revenue &&
      row.pat &&
      row.revenue > 0 &&
      row.pat / row.revenue < 0.03
    ) {
      anomalies.push({
        color: "orange",
        condition: "PAT margin < 3%",
        interpretation:
          "Net profitability is thin; tax, interest or exceptional items may be depressing earnings."
      });
    }

    if (row.ebitda && row.ocf && row.ebitda > 0 && row.ocf / row.ebitda < 0.7) {
      anomalies.push({
        color: "yellow",
        condition: "Cash conversion < 0.7x",
        interpretation:
          "Accrual profits are not translating into cash; monitor working capital and provisions closely."
      });
    }

    if (
      row.revenue &&
      row.ar &&
      row.revenue > 0 &&
      (row.ar / row.revenue) * 365 > 120
    ) {
      anomalies.push({
        color: "red",
        condition: "DSO > 120 days",
        interpretation:
          "Receivable cycle is stretched; collection risk and customer quality need deeper review."
      });
    }

    if (
      prev &&
      prev.revenue &&
      row.revenue &&
      prev.revenue > 0 &&
      (row.revenue - prev.revenue) / prev.revenue > 0.25 &&
      prev.pat &&
      row.pat &&
      prev.pat > 0 &&
      (row.pat - prev.pat) / prev.pat < 0.05
    ) {
      anomalies.push({
        color: "purple",
        condition: "Revenue jumps but PAT lags",
        interpretation:
          "Growth appears volume-led with limited profit conversion; review mix, discounts and execution risks."
      });
    }

    if (
      row.cash &&
      row.equity &&
      row.equity > 0 &&
      row.cash / row.equity > 0.5
    ) {
      anomalies.push({
        color: "blue",
        condition: "Cash/Equity > 0.5x",
        interpretation:
          "Balance sheet is cash rich; management has scope for dividends, buybacks or reinvestment."
      });
    }

    if (anomalies.length === 0) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td style="text-align:left">${row.label}</td><td>-</td><td>No major flags</td><td>Financial profile looks broadly balanced for this year.</td>`;
      anomalyBody.appendChild(tr);
    } else {
      anomalies.forEach((a, idxA) => {
        const tr = document.createElement("tr");
        tr.classList.add(`flag-${a.color}`);
        if (idxA === 0) {
          const tdYear = document.createElement("td");
          tdYear.textContent = row.label;
          tdYear.style.textAlign = "left";
          tdYear.rowSpan = anomalies.length;
          tr.appendChild(tdYear);
        }
        const tdFlag = document.createElement("td");
        tdFlag.textContent =
          a.color.charAt(0).toUpperCase() + a.color.slice(1) + " flag";
        const tdCond = document.createElement("td");
        tdCond.textContent = a.condition;
        const tdInterp = document.createElement("td");
        tdInterp.textContent = a.interpretation;
        tr.appendChild(tdFlag);
        tr.appendChild(tdCond);
        tr.appendChild(tdInterp);
        anomalyBody.appendChild(tr);
      });
    }
  });
}

let waterfallChart, revOcfChart, equityCashChart, dsoChart;

function destroyIfExists(chart) {
  if (chart && chart.destroy) chart.destroy();
}

function generateCharts() {
  const data = readFinancialData();
  const ctxWaterfall = document
    .getElementById("waterfallChart")
    .getContext("2d");
  const ctxRevOcf = document.getElementById("revOcfChart").getContext("2d");
  const ctxEquityCash = document
    .getElementById("equityCashChart")
    .getContext("2d");
  const ctxDso = document.getElementById("dsoChart").getContext("2d");

  destroyIfExists(waterfallChart);
  destroyIfExists(revOcfChart);
  destroyIfExists(equityCashChart);
  destroyIfExists(dsoChart);

  const latest = [...data].reverse().find(
    (r) =>
      !isNaN(r.revenue) &&
      !isNaN(r.ebitda) &&
      !isNaN(r.pat) &&
      !isNaN(r.ocf) &&
      !isNaN(r.cash)
  );
  if (latest) {
    const steps = [
      { label: "Revenue", value: latest.revenue },
      { label: "EBITDA", value: latest.ebitda },
      { label: "PAT", value: latest.pat },
      { label: "OCF", value: latest.ocf },
      { label: "Cash", value: latest.cash }
    ];

    const base = [];
    const values = [];
    let running = 0;
    steps.forEach((s, i) => {
      if (i === 0) {
        base.push(0);
        values.push(s.value);
        running = s.value;
      } else {
        const change = s.value - running;
        base.push(change >= 0 ? running : running + change);
        values.push(Math.abs(change));
        running = s.value;
      }
    });

    const colors = steps.map((s, i) => {
      if (i === 0) return "#3b82f6";
      const change = steps[i].value - steps[i - 1].value;
      return change >= 0 ? "#22c55e" : "#ef4444";
    });

    waterfallChart = new Chart(ctxWaterfall, {
      type: "bar",
      data: {
        labels: steps.map((s) => s.label),
        datasets: [
          {
            label: "Base",
            data: base,
            backgroundColor: "rgba(0,0,0,0)",
            borderWidth: 0,
            stack: "waterfall"
          },
          {
            label: "Step",
            data: values,
            backgroundColor: colors,
            stack: "waterfall"
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: { stacked: true },
          y: {
            stacked: true,
            ticks: { callback: (v) => v.toLocaleString() }
          }
        }
      }
    });

    const revToOcfRatio =
      latest.revenue && latest.ocf ? latest.ocf / latest.revenue : null;
    const caption = document.getElementById("waterfallCaption");
    caption.textContent =
      revToOcfRatio && revToOcfRatio > 0.2
        ? "Value chain shows healthy conversion from revenue to cash, with operating cash flows supporting the closing cash balance."
        : "Value chain indicates leakage between earnings and cash; review working capital and non-cash charges for the latest year.";
  } else {
    document.getElementById("waterfallCaption").textContent =
      "Insufficient data to render waterfall chart.";
  }

  const labels = data.map((r) => r.label);
  const revSeries = data.map((r) =>
    !isNaN(r.revenue) ? r.revenue : null
  );
  const ocfSeries = data.map((r) => (!isNaN(r.ocf) ? r.ocf : null));

  revOcfChart = new Chart(ctxRevOcf, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Revenue",
          data: revSeries,
          borderColor: "#3b82f6",
          backgroundColor: "rgba(59,130,246,0.2)",
          tension: 0.2
        },
        {
          label: "OCF",
          data: ocfSeries,
          borderColor: "#22c55e",
          backgroundColor: "rgba(34,197,94,0.2)",
          tension: 0.2
        }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: "bottom" } },
      scales: {
        y: { ticks: { callback: (v) => v.toLocaleString() } }
      }
    }
  });

  const revOcfCaption = document.getElementById("revOcfCaption");
  const avgConv =
    revSeries && ocfSeries && revSeries.length
      ? (() => {
          let num = 0;
          let den = 0;
          data.forEach((r) => {
            if (!isNaN(r.revenue) && !isNaN(r.ocf) && r.revenue !== 0) {
              num += r.ocf / r.revenue;
              den += 1;
            }
          });
          return den ? num / den : null;
        })()
      : null;
  revOcfCaption.textContent =
    avgConv && avgConv > 0.2
      ? "Operating cash flow broadly tracks revenue, suggesting reasonable earnings quality over the 5-year period."
      : "Operating cash flow lags revenue growth, indicating potential working capital build-up or non-cash earnings.";

  const equitySeries = data.map((r) =>
    !isNaN(r.equity) ? r.equity : null
  );
  const cashSeries = data.map((r) =>
    !isNaN(r.cash) ? r.cash : null
  );

  equityCashChart = new Chart(ctxEquityCash, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Equity",
          data: equitySeries,
          backgroundColor: "rgba(59,130,246,0.7)"
        },
        {
          label: "Cash",
          data: cashSeries,
          backgroundColor: "rgba(34,197,94,0.7)"
        }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: "bottom" } },
      scales: {
        y: {
          ticks: { callback: (v) => v.toLocaleString() }
        }
      }
    }
  });

  const equityCashCaption = document.getElementById("equityCashCaption");
  const latestIdx = data.length - 1;
  const latestEquity = equitySeries[latestIdx];
  const latestCash = cashSeries[latestIdx];
  const ceRatio =
    latestEquity && latestCash ? latestCash / latestEquity : null;
  equityCashCaption.textContent =
    ceRatio && ceRatio > 0.3
      ? "Cash represents a meaningful share of equity, supporting balance sheet strength and optionality for capital allocation."
      : "Cash balance is modest relative to equity; growth is likely funded by reinvested profits and external capital.";

  const dsoSeries = data.map((r) =>
    r.revenue && r.ar ? (r.ar / r.revenue) * 365 : null
  );
  dsoChart = new Chart(ctxDso, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "DSO",
          data: dsoSeries,
          borderColor: "#f97316",
          backgroundColor: "rgba(249,115,22,0.2)",
          tension: 0.2
        }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: "bottom" } }
    }
  });

  const dsoCaption = document.getElementById("dsoCaption");
  const dsoFiltered = dsoSeries.filter((v) => v != null && !isNaN(v));
  const avgDso =
    dsoFiltered.length > 0
      ? dsoFiltered.reduce((a, b) => a + b, 0) / dsoFiltered.length
      : null;
  dsoCaption.textContent =
    avgDso && avgDso < 90
      ? "Receivable cycle appears efficient, with DSO broadly within a comfortable range for most industries."
      : "Receivable cycle is extended, and cash is tied up in working capital; credit risk and customer terms warrant attention.";
}

function exportCSV() {
  const data = readFinancialData();
  const header = [
    "Year",
    "Revenue",
    "EBITDA",
    "PAT",
    "OCF",
    "FCF",
    "AR",
    "Cash",
    "Equity",
    "Debt",
    "InvestmentsAdvances",
    "DividendsPaid",
    "Inventory",
    "TradePayables"
  ];
  const rows = data.map((r) => [
    r.label,
    r.revenue,
    r.ebitda,
    r.pat,
    r.ocf,
    r.fcf,
    r.ar,
    r.cash,
    r.equity,
    r.debt,
    r.invAdv,
    r.dividend,
    r.inventory,
    r.payables
  ]);

  const csvLines = [header.join(",")].concat(
    rows.map((row) => row.map((v) => (v != null ? v : "")).join(","))
  );
  const blob = new Blob([csvLines.join("\n")], {
    type: "text/csv;charset=utf-8;"
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "financials_5y.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportPDF() {
  window.print();
}

function initThemeToggle() {
  const toggle = document.getElementById("modeToggle");
  toggle.addEventListener("change", () => {
    document.body.classList.toggle("dark", toggle.checked);
    document.body.classList.toggle("light", !toggle.checked);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initThemeToggle();

  const searchBtn = document.getElementById("searchBtn");
  const calcBtn = document.getElementById("calcBtn");
  const anomalyBtn = document.getElementById("anomalyBtn");
  const chartBtn = document.getElementById("chartBtn");
  const exportCsvBtn = document.getElementById("exportCsvBtn");
  const exportPdfBtn = document.getElementById("exportPdfBtn");
  const tickerInput = document.getElementById("ticker");

  searchBtn.addEventListener("click", async () => {
    const ticker = tickerInput.value.trim();
    if (!ticker) return;
    searchBtn.disabled = true;
    searchBtn.textContent = "Loading...";
    try {
      await fetchFinancialData(ticker);
    } catch (err) {
      console.error("Error fetching data:", err);
      alert("Unable to fetch financial data. Please adjust the inputs manually.");
    } finally {
      searchBtn.disabled = false;
      searchBtn.textContent = "Search";
    }
  });

  calcBtn.addEventListener("click", () => {
    calculateMetrics();
  });

  anomalyBtn.addEventListener("click", () => {
    detectAnomalies();
  });

  chartBtn.addEventListener("click", () => {
    generateCharts();
  });

  exportCsvBtn.addEventListener("click", exportCSV);
  exportPdfBtn.addEventListener("click", exportPDF);

  fetchFinancialData("NEWGEN").catch(() => {});
});
