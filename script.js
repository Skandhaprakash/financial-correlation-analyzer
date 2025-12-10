// ----- CONFIG -----
const AV_API_KEY = "NW3UXNYOJGUSJCR2"; // your Alpha Vantage key
const AV_BASE = "https://www.alphavantage.co/query";

// ---------- Utility helpers ----------
function parseNumber(value) {
if (value === null || value === undefined) return NaN;
  const n = parseFloat(String(value).replace(/,/g, "").trim());
  const n = parseFloat(
    String(value)
      .replace(/,/g, "")
      .trim()
  );
return isNaN(n) ? NaN : n;
}

@@ -15,50 +24,161 @@ function getFinancialRows() {
return Array.from(tbody.querySelectorAll("tr"));
}

async function fetchFinancialData(ticker) {
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(
    ticker
  )}?modules=financialData`;
// ---------- Alpha Vantage fetch helpers ----------
// Each returns the ARRAY of annual reports, newest first, as per docs.[web:70][web:79]
async function fetchAV(functionName, symbol) {
  const url = `${AV_BASE}?function=${encodeURIComponent(
    functionName
  )}&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(
    AV_API_KEY
  )}`;
const res = await fetch(url);
  if (!res.ok) throw new Error("Network response was not ok");
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
const json = await res.json();
  if (json["Information"] || json["Note"] || json["Error Message"]) {
    console.warn("Alpha Vantage message:", json);
  }
  return json;
}

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
async function fetchIncomeStatement(symbol) {
  const json = await fetchAV("INCOME_STATEMENT", symbol);
  return json.annualReports || [];
}

async function fetchBalanceSheet(symbol) {
  const json = await fetchAV("BALANCE_SHEET", symbol);
  return json.annualReports || [];
}

async function fetchCashFlow(symbol) {
  const json = await fetchAV("CASH_FLOW", symbol);
  return json.annualReports || [];
}

// ---------- Data fetch / auto-fill from Alpha Vantage ----------
async function fetchFinancialData(symbol) {
  // Fetch all three statements in parallel.[web:70][web:79]
  const [incomeReports, balanceReports, cashReports] = await Promise.all([
    fetchIncomeStatement(symbol),
    fetchBalanceSheet(symbol),
    fetchCashFlow(symbol)
  ]);

  if (!incomeReports.length && !balanceReports.length && !cashReports.length) {
    throw new Error("No financial data returned from Alpha Vantage");
  }

  // Alpha Vantage returns latest first; take up to 5 years.
  const yearsMap = new Map();

  // Helper to ensure an object per fiscal year
  function ensureYear(year) {
    if (!yearsMap.has(year)) {
      yearsMap.set(year, { year });
    }
    return yearsMap.get(year);
  }

  // Income statement: revenue, EBITDA approximation, net income.[web:70]
  incomeReports.slice(0, 5).forEach((r) => {
    const year = r.fiscalDateEnding?.slice(0, 4);
    if (!year) return;
    const y = ensureYear(year);
    y.revenue = parseNumber(r.totalRevenue);
    // EBITDA approximation: operatingIncome + depreciation + amortization if available.
    const operatingIncome = parseNumber(r.operatingIncome);
    const depreciation = parseNumber(r.depreciationAndAmortization);
    if (!isNaN(operatingIncome) && !isNaN(depreciation)) {
      y.ebitda = operatingIncome + depreciation;
    } else {
      y.ebitda = operatingIncome; // fallback
    }
    y.pat = parseNumber(r.netIncome); // Net income as PAT
  });

  // Balance sheet: equity, debt, AR, inventory, cash, payables, investments/advances.[web:70][web:82]
  balanceReports.slice(0, 5).forEach((r) => {
    const year = r.fiscalDateEnding?.slice(0, 4);
    if (!year) return;
    const y = ensureYear(year);
    // Shareholder equity (total stockholder equity)
    y.equity = parseNumber(r.totalShareholderEquity);
    // Short-term + long-term debt
    const shortDebt = parseNumber(r.shortTermDebt);
    const longDebt = parseNumber(r.longTermDebtNoncurrent);
    const totalDebt = [shortDebt, longDebt]
      .filter((v) => !isNaN(v))
      .reduce((a, b) => a + b, 0);
    y.debt = isNaN(totalDebt) ? parseNumber(r.totalLiabilities) : totalDebt;
    y.ar = parseNumber(r.currentNetReceivables);
    y.inventory = parseNumber(r.inventory);
    y.cash = parseNumber(r.cashAndCashEquivalentsAtCarryingValue);
    // Investments / advances (very rough proxy)
    const invSec = parseNumber(r.shortTermInvestments);
    const longInv = parseNumber(r.longTermInvestments);
    const adv = [invSec, longInv].filter((v) => !isNaN(v)).reduce((a, b) => a + b, 0);
    y.invAdv = isNaN(adv) ? undefined : adv;
    // Trade payables
    y.payables = parseNumber(r.currentAccountsPayable);
  });

  // Cash flow: OCF, FCF (OCF - capex), dividends.[web:70][web:79]
  cashReports.slice(0, 5).forEach((r) => {
    const year = r.fiscalDateEnding?.slice(0, 4);
    if (!year) return;
    const y = ensureYear(year);
    y.ocf = parseNumber(r.operatingCashflow);
    const capex = parseNumber(r.capitalExpenditures);
    if (!isNaN(y.ocf) && !isNaN(capex)) {
      y.fcf = y.ocf - capex;
    }
    y.dividend = parseNumber(r.dividendPayout);
  });

  // Convert to array and sort by fiscal year ascending (older → newer).
  const combined = Array.from(yearsMap.values())
    .filter((y) => !!y.year)
    .sort((a, b) => a.year - b.year)
    .slice(-5); // last 5

  // Map into your FY21–FY25 rows by closest year.
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
  combined.forEach((y) => {
    // find row whose data-year matches, or best-effort match
    let targetRow = rows.find((r) => r.dataset.year === y.year);
    if (!targetRow) {
      targetRow = rows.find((r) => !r.dataset.filled);
    }
    if (!targetRow) return;

    targetRow.dataset.filled = "1";

    // col indexes: 1=Revenue,2=EBITDA,3=PAT,4=OCF,5=FCF,6=AR,7=Cash,8=Equity,
    // 9=Debt,10=Inv/Adv,11=Div,12=Inventory,13=Payables
    setCell(targetRow, 1, y.revenue ?? "");
    setCell(targetRow, 2, y.ebitda ?? "");
    setCell(targetRow, 3, y.pat ?? "");
    setCell(targetRow, 4, y.ocf ?? "");
    setCell(targetRow, 5, y.fcf ?? "");
    setCell(targetRow, 6, y.ar ?? "");
    setCell(targetRow, 7, y.cash ?? "");
    setCell(targetRow, 8, y.equity ?? "");
    setCell(targetRow, 9, y.debt ?? "");
    setCell(targetRow, 10, y.invAdv ?? "");
    setCell(targetRow, 11, y.dividend ?? "");
    setCell(targetRow, 12, y.inventory ?? "");
    setCell(targetRow, 13, y.payables ?? "");
});

  if (!combined.length) {
    throw new Error("Unable to map Alpha Vantage data into 5-year view");
  }
}

// ---------- Metrics ----------
function readFinancialData() {
const rows = getFinancialRows();
const years = [];
@@ -167,6 +287,7 @@ function calculateMetrics() {
return data;
}

// ---------- Anomaly detection ----------
function detectAnomalies() {
const data = calculateMetrics();
const anomalyBody = document.querySelector("#anomalyTable tbody");
@@ -291,6 +412,7 @@ function detectAnomalies() {
});
}

// ---------- Charts ----------
let waterfallChart, revOcfChart, equityCashChart, dsoChart;

function destroyIfExists(chart) {
@@ -299,13 +421,9 @@ function destroyIfExists(chart) {

function generateCharts() {
const data = readFinancialData();
  const ctxWaterfall = document
    .getElementById("waterfallChart")
    .getContext("2d");
  const ctxWaterfall = document.getElementById("waterfallChart").getContext("2d");
const ctxRevOcf = document.getElementById("revOcfChart").getContext("2d");
  const ctxEquityCash = document
    .getElementById("equityCashChart")
    .getContext("2d");
  const ctxEquityCash = document.getElementById("equityCashChart").getContext("2d");
const ctxDso = document.getElementById("dsoChart").getContext("2d");

destroyIfExists(waterfallChart);
@@ -483,9 +601,7 @@ function generateCharts() {
responsive: true,
plugins: { legend: { position: "bottom" } },
scales: {
        y: {
          ticks: { callback: (v) => v.toLocaleString() }
        }
        y: { ticks: { callback: (v) => v.toLocaleString() } }
}
}
});
@@ -536,6 +652,7 @@ function generateCharts() {
: "Receivable cycle is extended, and cash is tied up in working capital; credit risk and customer terms warrant attention.";
}

// ---------- Export ----------
function exportCSV() {
const data = readFinancialData();
const header = [
@@ -591,6 +708,7 @@ function exportPDF() {
window.print();
}

// ---------- Theme ----------
function initThemeToggle() {
const toggle = document.getElementById("modeToggle");
toggle.addEventListener("change", () => {
@@ -599,6 +717,7 @@ function initThemeToggle() {
});
}

// ---------- Event wiring ----------
document.addEventListener("DOMContentLoaded", () => {
initThemeToggle();

@@ -619,7 +738,9 @@ document.addEventListener("DOMContentLoaded", () => {
await fetchFinancialData(ticker);
} catch (err) {
console.error("Error fetching data:", err);
      alert("Unable to fetch financial data. Please adjust the inputs manually.");
      alert(
        "Unable to fetch financial data from Alpha Vantage. Please check the symbol or API limits, or fill the table manually."
      );
} finally {
searchBtn.disabled = false;
searchBtn.textContent = "Search";
@@ -641,5 +762,8 @@ document.addEventListener("DOMContentLoaded", () => {
exportCsvBtn.addEventListener("click", exportCSV);
exportPdfBtn.addEventListener("click", exportPDF);

  fetchFinancialData("NEWGEN").catch(() => {});
  // Optional: attempt an initial fetch for sample ticker
  fetchFinancialData("IBM").catch(() => {
    // ignore; user can search
  });
});
