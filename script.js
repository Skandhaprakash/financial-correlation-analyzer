// ----- CONFIG -----
const AV_API_KEY = "NW3UXNYOJGUSJCR2"; // Alpha Vantage key
const AV_BASE = "https://www.alphavantage.co/query";

const FMP_API_KEY = "MQ2qInX7K7T26UMDJA2R9Q43zHccjTDn"; // FMP key
const FMP_BASE = "https://financialmodelingprep.com/api/v3";

// ---------- Utility helpers ----------
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

// ---------- Alpha Vantage fetch ----------
async function fetchAV(functionName, symbol) {
  const url = `${AV_BASE}?function=${functionName}&symbol=${symbol}&apikey=${AV_API_KEY}`;
  const res = await fetch(url);
  return res.json();
}

// ---------- Financial Modeling Prep fetch ----------
async function fetchFMPIncome(symbol) {
  const url = `${FMP_BASE}/income-statement/${symbol}?limit=5&apikey=${FMP_API_KEY}`;
  const res = await fetch(url);
  return res.json();
}
async function fetchFMPBalance(symbol) {
  const url = `${FMP_BASE}/balance-sheet-statement/${symbol}?limit=5&apikey=${FMP_API_KEY}`;
  const res = await fetch(url);
  return res.json();
}
async function fetchFMPCash(symbol) {
  const url = `${FMP_BASE}/cash-flow-statement/${symbol}?limit=5&apikey=${FMP_API_KEY}`;
  const res = await fetch(url);
  return res.json();
}
async function fetchFMPProfile(symbol) {
  const url = `${FMP_BASE}/profile/${symbol}?apikey=${FMP_API_KEY}`;
  const res = await fetch(url);
  return res.json();
}

// ---------- Alpha Vantage parser ----------
async function parseAVData(incomeJson, balanceJson, cashJson) {
  const incomeReports = incomeJson.annualReports || [];
  const balanceReports = balanceJson.annualReports || [];
  const cashReports = cashJson.annualReports || [];

  const yearsMap = new Map();
  function ensureYear(year) {
    if (!yearsMap.has(year)) yearsMap.set(year, { year });
    return yearsMap.get(year);
  }

  // Income
  incomeReports.slice(0, 5).forEach(r => {
    const year = r.fiscalDateEnding?.slice(0, 4);
    if (!year) return;
    const y = ensureYear(year);
    y.revenue = parseNumber(r.totalRevenue);
    const opInc = parseNumber(r.operatingIncome);
    const dep = parseNumber(r.depreciationAndAmortization);
    y.ebitda = (!isNaN(opInc) && !isNaN(dep)) ? opInc + dep : opInc;
    y.pat = parseNumber(r.netIncome);
  });

  // Balance
  balanceReports.slice(0, 5).forEach(r => {
    const year = r.fiscalDateEnding?.slice(0, 4);
    if (!year) return;
    const y = ensureYear(year);
    y.equity = parseNumber(r.totalShareholderEquity);
    const shortDebt = parseNumber(r.shortTermDebt);
    const longDebt = parseNumber(r.longTermDebtNoncurrent);
    const totalDebt = [shortDebt, longDebt].filter(v => !isNaN(v)).reduce((a,b)=>a+b,0);
    y.debt = isNaN(totalDebt) ? parseNumber(r.totalLiabilities) : totalDebt;
    y.ar = parseNumber(r.currentNetReceivables);
    y.inventory = parseNumber(r.inventory);
    y.cash = parseNumber(r.cashAndCashEquivalentsAtCarryingValue);
    const invSec = parseNumber(r.shortTermInvestments);
    const longInv = parseNumber(r.longTermInvestments);
    const adv = [invSec, longInv].filter(v=>!isNaN(v)).reduce((a,b)=>a+b,0);
    y.invAdv = isNaN(adv) ? undefined : adv;
    y.payables = parseNumber(r.currentAccountsPayable);
  });

  // Cash flow
  cashReports.slice(0, 5).forEach(r => {
    const year = r.fiscalDateEnding?.slice(0, 4);
    if (!year) return;
    const y = ensureYear(year);
    y.ocf = parseNumber(r.operatingCashflow);
    const capex = parseNumber(r.capitalExpenditures);
    if (!isNaN(y.ocf) && !isNaN(capex)) y.fcf = y.ocf - capex;
    y.dividend = parseNumber(r.dividendPayout);
  });

  return Array.from(yearsMap.values())
    .filter(y => !!y.year)
    .sort((a,b)=>a.year-b.year)
    .slice(-5);
}

// ---------- Data fetch / auto-fill ----------
async function fetchFinancialData(symbol, source) {
  let combined = [];

  if (source === "av") {
    const [income, balance, cash] = await Promise.all([
      fetchAV("INCOME_STATEMENT", symbol),
      fetchAV("BALANCE_SHEET", symbol),
      fetchAV("CASH_FLOW", symbol)
    ]);
    combined = await parseAVData(income, balance, cash);
    document.getElementById("companyName").textContent = `Source: Alpha Vantage (${symbol})`;
  } else if (source === "fmp") {
    const [income, balance, cash, profile] = await Promise.all([
      fetchFMPIncome(symbol),
      fetchFMPBalance(symbol),
      fetchFMPCash(symbol),
      fetchFMPProfile(symbol)
    ]);

    combined = income.map((r, idx) => ({
      year: r.date.slice(0,4),
      revenue: parseNumber(r.revenue),
      ebitda: parseNumber(r.ebitda),
      pat: parseNumber(r.netIncome),
      ocf: parseNumber(cash[idx]?.operatingCashFlow),
      fcf: parseNumber(cash[idx]?.freeCashFlow),
      ar: parseNumber(balance[idx]?.receivables),
      cash: parseNumber(balance[idx]?.cashAndCashEquivalents),
      equity: parseNumber(balance[idx]?.totalStockholdersEquity),
      debt: parseNumber(balance[idx]?.totalDebt),
      invAdv: parseNumber(balance[idx]?.otherInvestments),
      dividend: parseNumber(cash[idx]?.dividendsPaid),
      inventory: parseNumber(balance[idx]?.inventory),
      payables: parseNumber(balance[idx]?.accountPayables)
    }));

    if (profile && profile[0]) {
      document.getElementById("companyName").textContent = `${profile[0].companyName} (${symbol})`;
    } else {
      document.getElementById("companyName").textContent = `Source: FMP (${symbol})`;
    }
  }

  if (!combined.length) {
    throw new Error(`No financial data returned from ${source === "av" ? "Alpha Vantage" : "FMP"}`);
  }

  // Fill table
  const rows = getFinancialRows();
  combined.forEach(y => {
    let targetRow = rows.find(r => r.dataset.year === y.year);
    if (!targetRow) targetRow = rows.find(r => !r.dataset.filled);
    if (!targetRow) return;
    targetRow.dataset.filled = "1";
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
}

// ---------- Theme toggle ----------
function initThemeToggle() {
  const toggle = document.getElementById("modeToggle");
  toggle.addEventListener("change", () => {
    document.body.classList.toggle("dark", toggle.checked);
    document.body.classList.toggle("light", !toggle.checked);
  });
}

// ---------- Event wiring ----------
document.addEventListener("DOMContentLoaded", () => {
  initThemeToggle();

  const search
