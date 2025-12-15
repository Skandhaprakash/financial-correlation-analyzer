async function fetchFinancialData(symbol) {
  const searchBtn = document.getElementById("searchBtn");
  
  // 1. Fetch all three statements in parallel.
  try {
    const [incomeReports, balanceReports, cashReports] = await Promise.all([
      fetchIncomeStatement(symbol),
      fetchBalanceSheet(symbol),
      fetchCashFlow(symbol)
    ]);

    if (!incomeReports.length && !balanceReports.length && !cashReports.length) {
      throw new Error("No financial data returned from Alpha Vantage");
    }

    // 2. Process Data: Map by year
    const yearsMap = new Map();

    function ensureYear(year) {
      if (!yearsMap.has(year)) {
        yearsMap.set(year, { year });
      }
      return yearsMap.get(year);
    }

    // --- Process Income Statement ---
    incomeReports.forEach((r) => {
      const year = r.fiscalDateEnding?.slice(0, 4);
      if (!year) return;
      const y = ensureYear(year);
      y.revenue = parseNumber(r.totalRevenue);
      const operatingIncome = parseNumber(r.operatingIncome);
      const depreciation = parseNumber(r.depreciationAndAmortization);
      // Logic: EBITDA = Op Income + D&A
      if (!isNaN(operatingIncome) && !isNaN(depreciation)) {
        y.ebitda = operatingIncome + depreciation;
      } else {
        y.ebitda = operatingIncome;
      }
      y.pat = parseNumber(r.netIncome);
    });

    // --- Process Balance Sheet ---
    balanceReports.forEach((r) => {
      const year = r.fiscalDateEnding?.slice(0, 4);
      if (!year) return;
      const y = ensureYear(year);
      y.equity = parseNumber(r.totalShareholderEquity);
      
      const shortDebt = parseNumber(r.shortTermDebt);
      const longDebt = parseNumber(r.longTermDebtNoncurrent);
      const totalDebt = [shortDebt, longDebt]
        .filter((v) => !isNaN(v))
        .reduce((a, b) => a + b, 0);
      
      // Fallback to totalLiabilities if granular debt is missing, otherwise use calc debt
      y.debt = isNaN(totalDebt) || totalDebt === 0 ? parseNumber(r.totalLiabilities) : totalDebt;
      
      y.ar = parseNumber(r.currentNetReceivables);
      y.inventory = parseNumber(r.inventory);
      y.cash = parseNumber(r.cashAndCashEquivalentsAtCarryingValue);
      y.payables = parseNumber(r.currentAccountsPayable);
      
      // Investments proxy
      const invSec = parseNumber(r.shortTermInvestments);
      const longInv = parseNumber(r.longTermInvestments);
      const adv = [invSec, longInv].filter((v) => !isNaN(v)).reduce((a, b) => a + b, 0);
      y.invAdv = adv;
    });

    // --- Process Cash Flow ---
    cashReports.forEach((r) => {
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

    // 3. Prepare Data: Sort oldest to newest, take last 5
    const combined = Array.from(yearsMap.values())
      .filter((y) => !!y.year)
      .sort((a, b) => parseInt(a.year) - parseInt(b.year))
      .slice(-5); // Get strictly the last 5 available years

    if (!combined.length) {
      throw new Error("Unable to map Alpha Vantage data into 5-year view");
    }

    // 4. Map to Table (Dynamic Row Filling)
    const rows = getFinancialRows();
    
    // Clear table first to prevent stale data
    rows.forEach(row => {
      Array.from(row.cells).forEach((cell, idx) => {
        if(idx > 0) cell.textContent = ""; // Clear data cells
      });
      delete row.dataset.filled;
    });

    // Loop through the data and fill rows sequentially (0 to 4)
    combined.forEach((y, index) => {
      if (index >= rows.length) return; // Safety check
      
      const row = rows[index];
      
      // DYNAMICALLY UPDATE THE YEAR LABEL
      row.cells[0].textContent = `FY${y.year}`; 
      row.dataset.year = y.year;
      row.dataset.filled = "1";

      // Fill Data Columns
      setCell(row, 1, y.revenue);
      setCell(row, 2, y.ebitda);
      setCell(row, 3, y.pat);
      setCell(row, 4, y.ocf);
      setCell(row, 5, y.fcf);
      setCell(row, 6, y.ar);
      setCell(row, 7, y.cash);
      setCell(row, 8, y.equity);
      setCell(row, 9, y.debt);
      setCell(row, 10, y.invAdv);
      setCell(row, 11, y.dividend);
      setCell(row, 12, y.inventory);
      setCell(row, 13, y.payables);
    });

  } catch (error) {
    console.error(error);
    alert(error.message);
  }
}
