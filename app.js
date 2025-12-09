
let globalData = null;
let metricsChart = null;
let varianceChart = null;

const BACKEND_URL = 'https://financial-analyzer-backend.herokuapp.com'; // Or your backend

async function searchTicker() {
    const ticker = document.getElementById('tickerInput').value.toUpperCase().trim();
    if (!ticker) {
        showError('Please enter a ticker symbol');
        return;
    }
    
    showLoading(true);
    try {
        // Try to fetch from backend or use alternative API
        const response = await fetchFinancialData(ticker);
        if (!response) throw new Error('Ticker not found');
        
        globalData = response;
        displayResults(response);
        showLoading(false);
    } catch (error) {
        showError('Error fetching data: ' + error.message + '. Make sure ticker symbol is correct.');
        showLoading(false);
    }
}

async function fetchFinancialData(ticker) {
    // Method 1: Try backend API
    try {
        const response = await axios.get(`${BACKEND_URL}/api/financials/${ticker}`);
        return response.data;
    } catch (e) {
        console.log('Backend unavailable, using sample data');
    }
    
    // Method 2: Return sample data for demo
    return getSampleData(ticker);
}

function getSampleData(ticker) {
    // Sample data for demonstration
    return {
        ticker: ticker,
        company_name: ticker + ' Corp',
        period: 'FY2020-FY2025',
        years: ['FY20', 'FY21', 'FY22', 'FY23', 'FY24', 'FY25'],
        data: [
            {year: 'FY20', revenue: 1000, ebitda: 200, pat: 100, ocf: 120, fcf: 80, ar: 150, cash: 500, equity: 1500, debt: 500, investments: 100},
            {year: 'FY21', revenue: 1200, ebitda: 250, pat: 130, ocf: 140, fcf: 100, ar: 180, cash: 550, equity: 1700, debt: 450, investments: 120},
            {year: 'FY22', revenue: 1400, ebitda: 310, pat: 170, ocf: 100, fcf: 60, ar: 250, cash: 450, equity: 1900, debt: 400, investments: 180},
            {year: 'FY23', revenue: 1650, ebitda: 380, pat: 200, ocf: 180, fcf: 120, ar: 280, cash: 480, equity: 2100, debt: 350, investments: 200},
            {year: 'FY24', revenue: 1900, ebitda: 450, pat: 240, ocf: 220, fcf: 160, ar: 300, cash: 520, equity: 2300, debt: 300, investments: 220},
        ]
    };
}

function displayResults(data) {
    // Show results section
    document.getElementById('resultsSection').style.display = 'block';
    document.getElementById('companyName').textContent = data.company_name;
    document.getElementById('companyPeriod').textContent = 'Period: ' + data.period;
    
    // Display metrics
    displayMetrics(data);
    displayAnomalies(data);
    displayVarianceBridge(data);
    displayIRNotes(data);
}

function displayMetrics(data) {
    const metricsGrid = document.getElementById('metricsGrid');
    metricsGrid.innerHTML = '';
    
    const metrics = calculateMetrics(data.data);
    metrics.slice(-4).forEach(m => {
        const card = document.createElement('div');
        card.className = 'metric-card';
        card.innerHTML = `
            <h4>${m.metric}</h4>
            <div class="value">${m.value}</div>
            <div class="year">${m.year}</div>
        `;
        metricsGrid.appendChild(card);
    });
}

function calculateMetrics(data) {
    const metrics = [];
    data.forEach((year, idx) => {
        if (year.revenue > 0) {
            metrics.push({metric: 'EBITDA Margin %', value: ((year.ebitda/year.revenue)*100).toFixed(1) + '%', year: year.year});
            metrics.push({metric: 'PAT Margin %', value: ((year.pat/year.revenue)*100).toFixed(1) + '%', year: year.year});
            if (year.pat > 0) metrics.push({metric: 'Cash Conversion', value: ((year.ocf/year.pat)*100).toFixed(0) + '%', year: year.year});
            metrics.push({metric: 'DSO (days)', value: ((year.ar/year.revenue)*365).toFixed(1), year: year.year});
        }
    });
    return metrics;
}

function displayAnomalies(data) {
    const anomaliesList = document.getElementById('anomaliesList');
    anomaliesList.innerHTML = '';
    
    const anomalies = detectAnomalies(data.data);
    anomalies.forEach(a => {
        const item = document.createElement('div');
        item.className = 'anomaly-item' + (a.detected ? ' true' : '');
        item.innerHTML = `<h4>${a.name}</h4><p>${a.interpretation}</p>`;
        anomaliesList.appendChild(item);
    });
}

function detectAnomalies(data) {
    const anomalies = [];
    
    for (let i = 1; i < data.length; i++) {
        const curr = data[i], prev = data[i-1];
        const patChange = curr.pat - prev.pat;
        const cashChange = curr.cash - prev.cash;
        const arGrowth = (curr.ar - prev.ar) / prev.ar;
        const revGrowth = (curr.revenue - prev.revenue) / prev.revenue;
        const ebitdaMarginChange = (curr.ebitda/curr.revenue) - (prev.ebitda/prev.revenue);
        
        // Profit Up, Cash Down
        if (patChange > 0 && cashChange < 0) {
            anomalies.push({name: 'Profit ↑ Cash ↓', detected: true, interpretation: 'Earnings quality risk: tighten AR policy'});
        }
        
        // AR growing faster than revenue
        if (arGrowth > revGrowth + 0.05) {
            anomalies.push({name: 'AR Growing Faster', detected: true, interpretation: 'Collections lag: enforce AR aging thresholds'});
        }
        
        // Revenue spike but margins flat/down
        if (revGrowth > 0.15 && ebitdaMarginChange <= 0) {
            anomalies.push({name: 'Revenue Spike, Margins Flat', detected: true, interpretation: 'Potential discount-led growth: audit recognition'});
        }
    }
    
    if (anomalies.length === 0) {
        anomalies.push({name: 'Overall Health', detected: false, interpretation: 'No major anomalies detected. Financial metrics appear healthy.'});
    }
    
    return anomalies;
}

function displayVarianceBridge(data) {
    const insights = document.getElementById('varianceInsights');
    insights.innerHTML = '';
    
    for (let i = 1; i < data.data.length; i++) {
        const curr = data.data[i], prev = data.data[i-1];
        const dRevenue = curr.revenue - prev.revenue;
        const dOCF = curr.ocf - prev.ocf;
        const dPAT = curr.pat - prev.pat;
        
        let insight = '';
        if (dRevenue > 0 && dPAT > 0 && dOCF < 0) {
            insight = 'Cash conversion leaking: investigate AR and WC';
        } else if (dRevenue > 0 && dPAT <= 0) {
            insight = 'Profitability not keeping pace: margin compression';
        } else if (dPAT > 0 && (curr.cash - prev.cash) < 0) {
            insight = 'Liquidity stress: profits not translating to cash';
        } else {
            insight = 'Healthy bridge alignment';
        }
        
        const card = document.createElement('div');
        card.className = 'insight-card';
        card.innerHTML = `<h4>${curr.year}</h4><p>${insight}</p>`;
        insights.appendChild(card);
    }
}

function displayIRNotes(data) {
    const irNotes = document.getElementById('irNotes');
    irNotes.innerHTML = '';
    
    data.data.forEach((year, idx) => {
        if (idx > 0) {
            const prev = data.data[idx-1];
            const note = `
                <div class="ir-note-item">
                    <h4>${year.year}</h4>
                    <p><strong>Revenue Growth:</strong> ${(((year.revenue-prev.revenue)/prev.revenue)*100).toFixed(1)}%</p>
                    <p><strong>Profitability:</strong> PAT Margin ${((year.pat/year.revenue)*100).toFixed(1)}%</p>
                    <p><strong>Cash Position:</strong> ${year.cash > prev.cash ? 'Strong' : 'Declining'}</p>
                </div>
            `;
            irNotes.innerHTML += note;
        }
    });
}

function switchTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
    
    // Show selected tab
    document.getElementById(tabName).classList.add('active');
    event.target.classList.add('active');
}

function downloadExcel() {
    alert('Excel export feature requires backend. Coming soon!');
}

function showLoading(show) {
    document.getElementById('loading').style.display = show ? 'inline-block' : 'none';
}

function showError(msg) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = msg;
    errorDiv.style.display = 'block';
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('tickerInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') searchTicker();
    });
});
