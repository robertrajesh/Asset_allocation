const DEFAULT_TARGETS = [
  { name: "Indian Stocks", target: 30 },
  { name: "US Stocks", target: 15 },
  { name: "Mutual Funds", target: 20 },
  { name: "Fixed Deposits", target: 10 },
  { name: "Bonds", target: 5 },
  { name: "Gold", target: 10 },
  { name: "Real Estate", target: 10 }
];

const INCOME_CATEGORIES = ["Salary", "Bond Interest", "Rent", "Dividends", "Others"];
const EXPENSE_CATEGORIES = ["Food", "EMI", "Others"];
const INFLATION_RATE = 0.07; // 7% Annual Inflation

let currentUser = null;
let userData = {
  targets: DEFAULT_TARGETS,
  holdings: [], // Each holding is a Sub-Category Account (e.g. Zerodha 1, Schwab US)
  goals: [],
  cashflow: [],
  trades: [] // Individual line items attached to a holding/sub-category
};
let usdToInrRate = 84.0;
let currentModalHoldingId = null;

// --- Live Currency Exchange ---
async function fetchLiveExchangeRate() {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    const data = await res.json();
    if (data && data.rates && data.rates.INR) {
      usdToInrRate = parseFloat(data.rates.INR.toFixed(2));
      const el = document.getElementById("fxRateDisplay");
      if (el) el.innerText = "1 USD = ₹" + usdToInrRate;
    }
  } catch (err) {
    console.warn("Using fallback rate:", err);
    const el = document.getElementById("fxRateDisplay");
    if (el) el.innerText = "1 USD = ₹" + usdToInrRate + " (offline)";
  }
  render();
}

function getUsersDb() {
  return JSON.parse(localStorage.getItem('registered_users') || '{}');
}

// --- Dynamic Category & Sub-Category Dropdown Syncing ---
function populateCategoryDropdowns() {
  const targetNames = (userData.targets || DEFAULT_TARGETS).map(t => t.name);

  // 1. Asset Account Creation Dropdown
  const assetCat = document.getElementById("assetCategory");
  if (assetCat) {
    const curr = assetCat.value;
    assetCat.innerHTML = "";
    targetNames.forEach(name => {
      assetCat.innerHTML += '<option value="' + name + '">' + name + '</option>';
    });
    if (curr && targetNames.includes(curr)) assetCat.value = curr;
  }

  // 2. CSV Import Main Category
  const importMainCat = document.getElementById("importMainCatSelect");
  if (importMainCat) {
    const curr = importMainCat.value;
    importMainCat.innerHTML = "";
    targetNames.forEach(name => {
      importMainCat.innerHTML += '<option value="' + name + '">' + name + '</option>';
    });
    if (curr && targetNames.includes(curr)) importMainCat.value = curr;
    updateImportSubCatDropdown();
  }

  // 3. Trade Entry Main Category
  const tradeMainCat = document.getElementById("tradeMainCategory");
  if (tradeMainCat) {
    const curr = tradeMainCat.value;
    tradeMainCat.innerHTML = "";
    targetNames.forEach(name => {
      tradeMainCat.innerHTML += '<option value="' + name + '">' + name + '</option>';
    });
    if (curr && targetNames.includes(curr)) tradeMainCat.value = curr;
    updateTradeSubCatDropdown();
  }

  // 4. Ledger Filter Account Dropdown
  const filterAcc = document.getElementById("ledgerFilterAccount");
  if (filterAcc) {
    const curr = filterAcc.value;
    filterAcc.innerHTML = '<option value="">Filter by Account: All Accounts</option>';
    (userData.holdings || []).forEach(h => {
      filterAcc.innerHTML += '<option value="' + h.id + '">' + h.name + ' (' + h.category + ')</option>';
    });
    filterAcc.value = curr;
  }
}

window.updateImportSubCatDropdown = function () {
  const mainCat = document.getElementById("importMainCatSelect").value;
  const subCatSelect = document.getElementById("importSubCatSelect");
  if (!subCatSelect) return;

  subCatSelect.innerHTML = "";
  const subAccounts = (userData.holdings || []).filter(h => h.category === mainCat);

  if (subAccounts.length === 0) {
    subCatSelect.innerHTML = '<option value="">(No account created yet - create one first)</option>';
  } else {
    subAccounts.forEach(h => {
      subCatSelect.innerHTML += '<option value="' + h.id + '">' + h.name + '</option>';
    });
  }
};

window.updateTradeSubCatDropdown = function () {
  const mainCat = document.getElementById("tradeMainCategory").value;
  const subCatSelect = document.getElementById("tradeSubCategory");
  if (!subCatSelect) return;

  subCatSelect.innerHTML = "";
  const subAccounts = (userData.holdings || []).filter(h => h.category === mainCat);

  if (subAccounts.length === 0) {
    subCatSelect.innerHTML = '<option value="">(Create an account in Portfolio first)</option>';
  } else {
    subAccounts.forEach(h => {
      subCatSelect.innerHTML += '<option value="' + h.id + '">' + h.name + '</option>';
    });
  }
};

// --- Navigation Tabs ---
window.switchTab = function (tab) {
  const pView = document.getElementById("viewPortfolio");
  const tView = document.getElementById("viewTransactions");
  const cView = document.getElementById("viewCashflow");

  const pBtn = document.getElementById("tabBtnPortfolio");
  const tBtn = document.getElementById("tabBtnTransactions");
  const cBtn = document.getElementById("tabBtnCashflow");

  pView.style.display = tab === "portfolio" ? "block" : "none";
  tView.style.display = tab === "transactions" ? "block" : "none";
  cView.style.display = tab === "cashflow" ? "block" : "none";

  pBtn.classList.toggle("active", tab === "portfolio");
  tBtn.classList.toggle("active", tab === "transactions");
  cBtn.classList.toggle("active", tab === "cashflow");

  if (tab === "cashflow") {
    updateCashflowCategories();
    setDefaultCashflowDate();
    renderCashflow();
  } else if (tab === "transactions") {
    populateCategoryDropdowns();
    setDefaultTradeDate();
    renderTrades();
  } else if (tab === "portfolio") {
    populateCategoryDropdowns();
    render();
  }
};

// --- Authentication & Password Management ---
window.toggleForgotView = function (showForgot) {
  document.getElementById("authForm").style.display = showForgot ? "none" : "flex";
  document.getElementById("forgotForm").style.display = showForgot ? "flex" : "none";
  document.getElementById("authHeading").innerText = showForgot ? "Reset Password" : "Sign In or Register";
  document.getElementById("authError").innerText = "";
};

window.handleAuth = function (isSignUp) {
  const email = document.getElementById("authEmail").value.trim().toLowerCase();
  const password = document.getElementById("authPassword").value;
  const errorEl = document.getElementById("authError");
  errorEl.innerText = "";

  if (!email || !password || password.length < 6) {
    errorEl.innerText = "Please provide email and password (min 6 characters).";
    return;
  }

  const users = getUsersDb();

  if (isSignUp) {
    if (users[email]) {
      errorEl.innerText = "Account already exists. Click Login.";
      return;
    }
    users[email] = {
      password: password,
      targets: DEFAULT_TARGETS,
      holdings: [],
      goals: [],
      cashflow: [],
      trades: []
    };
    localStorage.setItem('registered_users', JSON.stringify(users));
    loginUser(email, users[email]);
  } else {
    if (!users[email]) {
      errorEl.innerText = "Account not found. Sign up first.";
      return;
    }
    if (users[email].password !== password) {
      errorEl.innerText = "Incorrect password.";
      return;
    }
    loginUser(email, users[email]);
  }
};

window.sendPasswordReset = function () {
  const email = document.getElementById("resetEmail").value.trim().toLowerCase();
  const errorEl = document.getElementById("authError");
  errorEl.innerText = "";

  if (!email) {
    errorEl.innerText = "Please enter your registered email.";
    return;
  }

  const users = getUsersDb();
  if (!users[email]) {
    errorEl.innerText = "No user found with this email.";
    return;
  }

  const newPass = prompt("Password recovery for " + email + ":\nEnter your new password (min 6 characters):");
  if (newPass && newPass.length >= 6) {
    users[email].password = newPass;
    localStorage.setItem('registered_users', JSON.stringify(users));
    alert("Password updated successfully! Please log in with your new password.");
    toggleForgotView(false);
  } else if (newPass !== null) {
    alert("Password must be at least 6 characters.");
  }
};

function loginUser(email, data) {
  currentUser = email;
  userData = {
    targets: Array.isArray(data.targets) ? data.targets : DEFAULT_TARGETS,
    holdings: Array.isArray(data.holdings) ? data.holdings : [],
    goals: Array.isArray(data.goals) ? data.goals : [],
    cashflow: Array.isArray(data.cashflow) ? data.cashflow : [],
    trades: Array.isArray(data.trades) ? data.trades : []
  };
  sessionStorage.setItem('current_user', email);
  document.getElementById("authScreen").style.display = "none";
  document.getElementById("appScreen").style.display = "block";
  document.getElementById("userGreeting").innerText = email;

  populateCategoryDropdowns();
  setDefaultCashflowDate();
  setDefaultTradeDate();
  updateCashflowCategories();
  fetchLiveExchangeRate();
  render();
}

window.handleSignOut = function () {
  currentUser = null;
  sessionStorage.removeItem('current_user');
  document.getElementById("authScreen").style.display = "block";
  document.getElementById("appScreen").style.display = "none";
  document.getElementById("authPassword").value = "";
};

function persistData() {
  if (!currentUser) return;
  const users = getUsersDb();
  if (users[currentUser]) {
    users[currentUser] = {
      password: users[currentUser].password,
      ...userData
    };
    localStorage.setItem('registered_users', JSON.stringify(users));
  }
  recomputeAccountValuesFromTrades();
  populateCategoryDropdowns();
  render();
}

// Automatically recalculates each Holding account's balance from its attached items
function recomputeAccountValuesFromTrades() {
  (userData.holdings || []).forEach(h => {
    const items = (userData.trades || []).filter(t => t.holdingId == h.id);
    if (items.length > 0) {
      const sumValue = items.reduce((acc, it) => acc + (it.qty * (it.currentPrice || it.buyPrice)), 0);
      h.value = Math.round(sumValue);
    }
  });
}

function getNormalizedINR(holding) {
  return holding.currency === "USD" ? holding.value * usdToInrRate : holding.value;
}

// --- Target Allocations ---
window.updateTarget = function (catName, newTarget) {
  const val = Math.max(0, parseFloat(newTarget) || 0);
  const item = userData.targets.find(t => t.name === catName);
  if (item) item.target = val;
  persistData();
};

window.autoBalanceTargets = function () {
  const currentSum = userData.targets.reduce((sum, t) => sum + (Number(t.target) || 0), 0);
  if (currentSum === 0) return;
  let runningSum = 0;
  userData.targets.forEach((t, index) => {
    if (index === userData.targets.length - 1) {
      t.target = Math.max(0, Math.round((100 - runningSum) * 10) / 10);
    } else {
      t.target = Math.round(((t.target / currentSum) * 100) * 10) / 10;
      runningSum += t.target;
    }
  });
  persistData();
};

// --- Goal Operations with 7% Inflation Calculator ---
window.calculateFutureTargetPreview = function () {
  const costToday = parseFloat(document.getElementById("goalCostToday").value) || 0;
  const years = parseFloat(document.getElementById("goalYears").value) || 0;
  const futureValue = costToday * Math.pow(1 + INFLATION_RATE, years);
  
  const previewEl = document.getElementById("inflationPreview");
  if (costToday > 0 && years > 0) {
    previewEl.innerText = "Future Target @ 7% Inflation (" + years + " yrs): ₹" + Math.round(futureValue).toLocaleString('en-IN');
  } else {
    previewEl.innerText = "Target at 7% inflation: ₹0";
  }
};

window.saveGoal = function () {
  const id = document.getElementById("goalEditId").value;
  const title = document.getElementById("goalTitle").value.trim();
  const costToday = parseFloat(document.getElementById("goalCostToday").value);
  const years = parseFloat(document.getElementById("goalYears").value) || 1;
  const expectedReturn = parseFloat(document.getElementById("goalReturn").value) || 0;

  if (!title || isNaN(costToday) || costToday <= 0) {
    alert("Please enter a valid goal name and current cost.");
    return;
  }

  const targetFuture = costToday * Math.pow(1 + INFLATION_RATE, years);

  if (id) {
    const goal = userData.goals.find(g => g.id == id);
    if (goal) {
      goal.title = title;
      goal.costToday = costToday;
      goal.target = targetFuture;
      goal.years = years;
      goal.expectedReturn = expectedReturn;
    }
  } else {
    userData.goals.push({
      id: Date.now(),
      title: title,
      costToday: costToday,
      target: targetFuture,
      years: years,
      expectedReturn: expectedReturn
    });
  }

  resetGoalForm();
  persistData();
};

window.editGoal = function (id) {
  const goal = userData.goals.find(g => g.id == id);
  if (!goal) return;
  document.getElementById("goalEditId").value = goal.id;
  document.getElementById("goalTitle").value = goal.title;
  document.getElementById("goalCostToday").value = goal.costToday || Math.round(goal.target);
  document.getElementById("goalYears").value = goal.years || 1;
  document.getElementById("goalReturn").value = goal.expectedReturn || 0;
  document.getElementById("goalSubmitBtn").innerText = "Update Goal";
  document.getElementById("goalCancelBtn").style.display = "inline-block";
  calculateFutureTargetPreview();
};

window.cancelGoalEdit = function () {
  resetGoalForm();
};

function resetGoalForm() {
  document.getElementById("goalEditId").value = "";
  document.getElementById("goalTitle").value = "";
  document.getElementById("goalCostToday").value = "";
  document.getElementById("goalYears").value = "";
  document.getElementById("goalReturn").value = "";
  document.getElementById("goalSubmitBtn").innerText = "Save Goal";
  document.getElementById("goalCancelBtn").style.display = "none";
  document.getElementById("inflationPreview").innerText = "Target at 7% inflation: ₹0";
}

window.removeGoal = function (id) {
  userData.goals = userData.goals.filter(g => g.id !== id);
  userData.holdings.forEach(h => {
    if (h.goalId == id) delete h.goalId;
  });
  persistData();
};

// --- Investment Accounts / Sub-Categories ---
window.saveHolding = function () {
  const id = document.getElementById("holdingEditId").value;
  const name = document.getElementById("holdingName").value.trim();
  const category = document.getElementById("assetCategory").value;
  const currency = document.getElementById("holdingCurrency").value;
  const manualVal = parseFloat(document.getElementById("holdingValue").value) || 0;
  const goalId = document.getElementById("holdingGoal").value || null;

  if (!name) {
    alert("Please enter a name for this Account / Sub-Category (e.g. Zerodha Demat).");
    return;
  }

  if (id) {
    const holding = userData.holdings.find(h => h.id == id);
    if (holding) {
      holding.name = name;
      holding.category = category;
      holding.currency = currency;
      holding.value = manualVal;
      holding.goalId = goalId;
    }
  } else {
    userData.holdings.push({
      id: Date.now(),
      name: name,
      category: category,
      currency: currency,
      value: manualVal,
      goalId: goalId
    });
  }

  cancelHoldingEdit();
  persistData();
};

window.editHolding = function (id) {
  const holding = userData.holdings.find(h => h.id == id);
  if (!holding) return;

  document.getElementById("holdingEditId").value = holding.id;
  document.getElementById("holdingName").value = holding.name;
  document.getElementById("assetCategory").value = holding.category;
  document.getElementById("holdingCurrency").value = holding.currency;
  document.getElementById("holdingValue").value = holding.value;
  document.getElementById("holdingGoal").value = holding.goalId || "";

  document.getElementById("holdingFormHeading").innerText = "Edit Investment Account";
  document.getElementById("holdingSubmitBtn").innerText = "Update Account";
  document.getElementById("holdingCancelBtn").style.display = "inline-block";
};

window.cancelHoldingEdit = function () {
  document.getElementById("holdingEditId").value = "";
  document.getElementById("holdingName").value = "";
  document.getElementById("holdingValue").value = "";
  document.getElementById("holdingGoal").value = "";
  document.getElementById("holdingFormHeading").innerText = "Create / Edit Investment Account (Sub-Category)";
  document.getElementById("holdingSubmitBtn").innerText = "Save Account";
  document.getElementById("holdingCancelBtn").style.display = "none";
};

window.removeHolding = function (id) {
  if (confirm("Are you sure? This will delete this account and all items inside it.")) {
    userData.holdings = userData.holdings.filter(h => h.id !== id);
    userData.trades = userData.trades.filter(t => t.holdingId != id);
    persistData();
  }
};

// --- DEDICATED SEPARATE PORTFOLIO VIEW (MODAL) ---
window.openPortfolioModal = function (holdingId) {
  currentModalHoldingId = holdingId;
  const holding = userData.holdings.find(h => h.id == holdingId);
  if (!holding) return;

  document.getElementById("modalPortfolioTitle").innerText = holding.name;
  document.getElementById("modalPortfolioSubtitle").innerText = "Main Category: " + holding.category + " • Currency: " + holding.currency;

  const items = (userData.trades || []).filter(t => t.holdingId == holdingId);
  const isUSD = holding.currency === "USD";
  const sym = isUSD ? "$" : "₹";

  let totalCost = 0;
  let totalCur = 0;

  const tbody = document.querySelector("#modalItemsTable tbody");
  tbody.innerHTML = "";

  if (items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--muted); padding:16px;">No items inside this account yet. Click "+ Add New Item" or import a CSV file.</td></tr>';
  } else {
    items.forEach(it => {
      const cost = it.qty * it.buyPrice;
      const cur = it.qty * (it.currentPrice || it.buyPrice);
      const pnl = cur - cost;
      const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;

      totalCost += cost;
      totalCur += cur;

      const pnlColor = pnl >= 0 ? "color: #4ade80;" : "color: #f87171;";
      const pnlSign = pnl >= 0 ? "+" + sym : "-" + sym;

      tbody.innerHTML += '<tr>' +
        '<td><strong>' + it.ticker + '</strong></td>' +
        '<td>' + it.qty + '</td>' +
        '<td>' + sym + Number(it.buyPrice).toLocaleString() + '</td>' +
        '<td>' + sym + Number(it.currentPrice || it.buyPrice).toLocaleString() + '</td>' +
        '<td>' + sym + Math.round(cur).toLocaleString() + '</td>' +
        '<td style="' + pnlColor + ' font-weight:600;">' + pnlSign + Math.round(Math.abs(pnl)).toLocaleString() + ' (' + pnlPct.toFixed(1) + '%)</td>' +
        '<td style="text-align: right;">' +
          '<button type="button" class="btn-sm btn-danger" onclick="removeTradeFromModal(' + it.id + ')">×</button>' +
        '</td>' +
      '</tr>';
    });
  }

  const totPnl = totalCur - totalCost;
  const totPnlPct = totalCost > 0 ? (totPnl / totalCost) * 100 : 0;

  document.getElementById("modalInvestedVal").innerText = sym + Math.round(totalCost).toLocaleString();
  document.getElementById("modalCurrentVal").innerText = sym + Math.round(totalCur).toLocaleString();
  const pnlEl = document.getElementById("modalPnlVal");
  const sign = totPnl >= 0 ? "+" + sym : "-" + sym;
  pnlEl.innerText = sign + Math.round(Math.abs(totPnl)).toLocaleString() + " (" + totPnlPct.toFixed(1) + "%)";
  pnlEl.style.color = totPnl >= 0 ? "#4ade80" : "#f87171";

  document.getElementById("portfolioModal").style.display = "block";
};

window.closePortfolioModal = function () {
  document.getElementById("portfolioModal").style.display = "none";
  currentModalHoldingId = null;
};

window.removeTradeFromModal = function (tradeId) {
  userData.trades = userData.trades.filter(t => t.id !== tradeId);
  persistData();
  if (currentModalHoldingId) openPortfolioModal(currentModalHoldingId);
};

window.jumpToLedgerForAccount = function () {
  const hId = currentModalHoldingId;
  closePortfolioModal();
  switchTab("transactions");
  if (hId) {
    const filter = document.getElementById("ledgerFilterAccount");
    if (filter) {
      filter.value = hId;
      renderTrades();
    }
    const tradeSub = document.getElementById("tradeSubCategory");
    if (tradeSub) tradeSub.value = hId;
  }
};

// --- Transactions & Trade Ledger Operations ---
function setDefaultTradeDate() {
  const el = document.getElementById("tradeDate");
  if (el && !el.value) {
    el.value = new Date().toISOString().split("T")[0];
  }
}

window.calculateTradePreview = function () {
  const qty = parseFloat(document.getElementById("tradeQty").value) || 0;
  const buy = parseFloat(document.getElementById("tradeBuyPrice").value) || 0;
  const curr = parseFloat(document.getElementById("tradeCurrentPrice").value) || buy;

  const invested = qty * buy;
  const currentVal = qty * curr;
  const pnl = currentVal - invested;
  const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;

  const sign = pnl >= 0 ? "+₹" : "-₹";
  const preview = document.getElementById("tradePreview");
  if (preview) {
    preview.innerText = "Invested: ₹" + Math.round(invested).toLocaleString('en-IN') +
      " • Current: ₹" + Math.round(currentVal).toLocaleString('en-IN') +
      " • P&L: " + sign + Math.round(Math.abs(pnl)).toLocaleString('en-IN') + " (" + pnlPct.toFixed(1) + "%)";
  }
};

// --- Live Ticker Price Discovery ---
async function fetchPriceForSymbol(symbol, category) {
  const sym = symbol.trim().toUpperCase();
  if (!sym) return null;

  try {
    const querySymbol = (category === "Indian Stocks" && !sym.includes(".")) ? sym + ".NS" : sym;
    const url = "https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(querySymbol) + "?interval=1d&range=1d";
    const proxyUrl = "https://api.allorigins.win/get?url=" + encodeURIComponent(url);
    const res = await fetch(proxyUrl);
    const json = await res.json();
    const data = JSON.parse(json.contents);
    const quote = data.chart.result[0].meta.regularMarketPrice;
    if (quote && !isNaN(quote)) {
      return parseFloat(quote);
    }
  } catch (e) {
    console.warn("Live fetch failed for " + symbol, e);
  }
  return null;
}

window.fetchSingleTickerPrice = async function () {
  const ticker = document.getElementById("tradeTicker").value.trim();
  const category = document.getElementById("tradeMainCategory").value;
  if (!ticker) {
    alert("Please enter a ticker symbol first.");
    return;
  }

  const btn = event.target;
  const orig = btn.innerText;
  btn.innerText = "Fetching...";
  const price = await fetchPriceForSymbol(ticker, category);
  btn.innerText = orig;

  if (price) {
    document.getElementById("tradeCurrentPrice").value = price.toFixed(2);
    calculateTradePreview();
    alert("Fetched live market price for " + ticker + ": " + price.toFixed(2));
  } else {
    alert("Could not fetch market price for '" + ticker + "'. You can enter the LTP manually.");
  }
};

window.refreshAllQuotes = async function () {
  if (!userData.trades || userData.trades.length === 0) {
    alert("No items in ledger to refresh.");
    return;
  }

  let count = 0;
  for (let t of userData.trades) {
    if (t.ticker && (t.category === "Indian Stocks" || t.category === "US Stocks")) {
      const price = await fetchPriceForSymbol(t.ticker, t.category);
      if (price) {
        t.currentPrice = price;
        count++;
      }
    }
  }

  persistData();
  renderTrades();
  alert("Refreshed live market quotes for " + count + " items!");
};

// --- TARGETED CSV IMPORT (Main Category -> Sub-Category Account) ---
window.handlePortfolioCsvUpload = function () {
  const fileInput = document.getElementById("portfolioCsvInput");
  const mainCat = document.getElementById("importMainCatSelect").value;
  const holdingId = document.getElementById("importSubCatSelect").value;

  if (!holdingId) {
    alert("Please create an Account / Sub-Category under '" + mainCat + "' first in the Portfolio tab.");
    return;
  }

  const file = fileInput.files[0];
  if (!file) {
    alert("Please select a CSV file.");
    return;
  }

  const targetAccount = userData.holdings.find(h => h.id == holdingId);
  if (!targetAccount) {
    alert("Selected target account could not be found.");
    return;
  }

  const reader = new FileReader();
  reader.onload = function (e) {
    const text = e.target.result;
    parseAndImportIntoSubCategory(text, targetAccount);
  };
  reader.readAsText(file);
};

function parseAndImportIntoSubCategory(csvText, targetAccount) {
  const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) {
    alert("CSV file is empty.");
    return;
  }

  // Check File Format 1: Zerodha Kite Holdings Export (sample2.csv)
  const headerIdx = lines.findIndex(l => l.includes("Instrument") && (l.includes("Qty") || l.includes("LTP")));

  if (headerIdx !== -1) {
    let count = 0;
    const today = new Date().toISOString().split("T")[0];

    for (let i = headerIdx + 1; i < lines.length; i++) {
      const row = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(v => v.replace(/^"|"$/g, '').trim());
      if (row.length < 5 || !row[0]) continue;

      const ticker = row[0];
      const qty = parseFloat(row[1].replace(/,/g, ''));
      const avgCost = parseFloat(row[2].replace(/,/g, ''));
      const ltp = parseFloat(row[3].replace(/,/g, '')) || avgCost;

      if (!isNaN(qty) && qty > 0) {
        // Upsert into this holding's list
        const existing = userData.trades.find(t => t.holdingId == targetAccount.id && t.ticker.toUpperCase() === ticker.toUpperCase());
        if (existing) {
          existing.qty = qty;
          existing.buyPrice = avgCost;
          existing.currentPrice = ltp;
          existing.date = today;
        } else {
          userData.trades.push({
            id: Date.now() + Math.floor(Math.random() * 10000),
            holdingId: targetAccount.id,
            category: targetAccount.category,
            date: today,
            ticker: ticker,
            qty: qty,
            buyPrice: avgCost,
            currentPrice: ltp
          });
        }
        count++;
      }
    }

    persistData();
    renderTrades();
    alert("Successfully imported " + count + " items into '" + targetAccount.name + "'!");
    return;
  }

  // Check File Format 2: Account balance summary (sample1.csv or USA_SAMPLE1.CSV)
  if (csvText.includes("Value_curve") || csvText.includes("Balances for account")) {
    alert("This file is an account summary. You can record its total balance directly into the Account Value field in Portfolio.");
    return;
  }

  alert("CSV format not recognized. Please provide a standard holdings CSV (with Instrument, Qty, LTP columns).");
}

window.saveTrade = function () {
  const id = document.getElementById("tradeEditId").value;
  const date = document.getElementById("tradeDate").value || new Date().toISOString().split("T")[0];
  const mainCat = document.getElementById("tradeMainCategory").value;
  const holdingId = document.getElementById("tradeSubCategory").value;
  const ticker = document.getElementById("tradeTicker").value.trim().toUpperCase();
  const qty = parseFloat(document.getElementById("tradeQty").value);
  const buyPrice = parseFloat(document.getElementById("tradeBuyPrice").value);
  const currentPrice = parseFloat(document.getElementById("tradeCurrentPrice").value) || buyPrice;

  if (!holdingId) {
    alert("Please select or create an account (sub-category) first.");
    return;
  }
  if (!ticker || isNaN(qty) || qty <= 0 || isNaN(buyPrice) || buyPrice < 0) {
    alert("Please enter a valid ticker, quantity, and buy price.");
    return;
  }

  if (id) {
    const trade = userData.trades.find(t => t.id == id);
    if (trade) {
      trade.date = date;
      trade.category = mainCat;
      trade.holdingId = holdingId;
      trade.ticker = ticker;
      trade.qty = qty;
      trade.buyPrice = buyPrice;
      trade.currentPrice = currentPrice;
    }
  } else {
    userData.trades.push({
      id: Date.now(),
      holdingId: holdingId,
      date: date,
      category: mainCat,
      ticker: ticker,
      qty: qty,
      buyPrice: buyPrice,
      currentPrice: currentPrice
    });
  }

  cancelTradeEdit();
  persistData();
  renderTrades();
};

window.editTrade = function (id) {
  const trade = userData.trades.find(t => t.id == id);
  if (!trade) return;

  document.getElementById("tradeEditId").value = trade.id;
  document.getElementById("tradeDate").value = trade.date;
  document.getElementById("tradeMainCategory").value = trade.category;
  updateTradeSubCatDropdown();
  document.getElementById("tradeSubCategory").value = trade.holdingId;
  document.getElementById("tradeTicker").value = trade.ticker;
  document.getElementById("tradeQty").value = trade.qty;
  document.getElementById("tradeBuyPrice").value = trade.buyPrice;
  document.getElementById("tradeCurrentPrice").value = trade.currentPrice;

  document.getElementById("tradeFormHeading").innerText = "Edit Line Item";
  document.getElementById("tradeSubmitBtn").innerText = "Update Item";
  document.getElementById("tradeCancelBtn").style.display = "inline-block";
  calculateTradePreview();
};

window.cancelTradeEdit = function () {
  document.getElementById("tradeEditId").value = "";
  document.getElementById("tradeTicker").value = "";
  document.getElementById("tradeQty").value = "";
  document.getElementById("tradeBuyPrice").value = "";
  document.getElementById("tradeCurrentPrice").value = "";
  document.getElementById("tradeFormHeading").innerText = "Add Item to Portfolio / Trade Ledger";
  document.getElementById("tradeSubmitBtn").innerText = "Record Line Item";
  document.getElementById("tradeCancelBtn").style.display = "none";
  setDefaultTradeDate();
  calculateTradePreview();
};

window.removeTrade = function (id) {
  userData.trades = userData.trades.filter(t => t.id !== id);
  persistData();
  renderTrades();
};

window.clearAllTrades = function () {
  if (confirm("Are you sure you want to clear all individual line items from the ledger?")) {
    userData.trades = [];
    persistData();
    renderTrades();
  }
};

function renderTrades() {
  const filterAccount = document.getElementById("ledgerFilterAccount") ? document.getElementById("ledgerFilterAccount").value : "";
  const tbody = document.querySelector("#tradeTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  let totalInvestedINR = 0;
  let totalCurrentINR = 0;

  const items = (userData.trades || []).filter(t => {
    if (!filterAccount) return true;
    return t.holdingId == filterAccount;
  });

  items.forEach(t => {
    const parentAccount = (userData.holdings || []).find(h => h.id == t.holdingId);
    const accName = parentAccount ? parentAccount.name : "Unassigned";
    const isUSD = parentAccount && parentAccount.currency === "USD";
    const multiplier = isUSD ? usdToInrRate : 1;
    const sym = isUSD ? "$" : "₹";

    const invested = t.qty * t.buyPrice;
    const current = t.qty * (t.currentPrice || t.buyPrice);
    const pnl = current - invested;
    const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;

    totalInvestedINR += invested * multiplier;
    totalCurrentINR += current * multiplier;

    const pnlColor = pnl >= 0 ? "color: #4ade80;" : "color: #f87171;";
    const pnlSign = pnl >= 0 ? "+" + sym : "-" + sym;

    tbody.innerHTML += '<tr>' +
      '<td><span class="stat-label">' + (t.date || "-") + '</span></td>' +
      '<td><strong>' + t.ticker + '</strong></td>' +
      '<td><span class="stat-label">' + accName + '</span></td>' +
      '<td><span class="stat-label">' + t.category + '</span></td>' +
      '<td>' + t.qty + '</td>' +
      '<td>' + sym + Number(t.buyPrice).toLocaleString() + '</td>' +
      '<td>' + sym + Number(t.currentPrice || t.buyPrice).toLocaleString() + '</td>' +
      '<td>' + sym + Math.round(current).toLocaleString() + '</td>' +
      '<td style="' + pnlColor + ' font-weight:600;">' + pnlSign + Math.round(Math.abs(pnl)).toLocaleString() + ' (' + pnlPct.toFixed(1) + '%)</td>' +
      '<td style="text-align: right;">' +
        '<button type="button" class="btn-sm btn-secondary" onclick="editTrade(' + t.id + ')">Edit</button> ' +
        '<button type="button" class="btn-sm btn-danger" onclick="removeTrade(' + t.id + ')">×</button>' +
      '</td>' +
    '</tr>';
  });

  const totPnlINR = totalCurrentINR - totalInvestedINR;
  const totPnlPct = totalInvestedINR > 0 ? (totPnlINR / totalInvestedINR) * 100 : 0;

  const invEl = document.getElementById("totalTradeInvestedDisplay");
  const curEl = document.getElementById("totalTradeCurrentDisplay");
  const pnlEl = document.getElementById("totalTradePnlDisplay");

  if (invEl) invEl.innerText = "₹" + Math.round(totalInvestedINR).toLocaleString('en-IN');
  if (curEl) curEl.innerText = "₹" + Math.round(totalCurrentINR).toLocaleString('en-IN');
  if (pnlEl) {
    const sign = totPnlINR >= 0 ? "+₹" : "-₹";
    pnlEl.innerText = "Unrealized P&L: " + sign + Math.round(Math.abs(totPnlINR)).toLocaleString('en-IN') + " (" + totPnlPct.toFixed(1) + "%)";
    pnlEl.style.color = totPnlINR >= 0 ? "#4ade80" : "#f87171";
  }
}

// --- Income and Expenses ---
function setDefaultCashflowDate() {
  const dateEl = document.getElementById("cashflowDate");
  const monthEl = document.getElementById("cashflowMonthFilter");
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const monthStr = today.toISOString().slice(0, 7);

  if (dateEl && !dateEl.value) dateEl.value = todayStr;
  if (monthEl && !monthEl.value) monthEl.value = monthStr;
}

window.resetMonthFilter = function () {
  const monthEl = document.getElementById("cashflowMonthFilter");
  if (monthEl) monthEl.value = "";
  renderCashflow();
};

window.updateCashflowCategories = function () {
  const typeEl = document.getElementById("cashflowType");
  const catSelect = document.getElementById("cashflowCategory");
  if (!typeEl || !catSelect) return;

  const type = typeEl.value;
  catSelect.innerHTML = "";
  const list = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  list.forEach(c => {
    catSelect.innerHTML += '<option value="' + c + '">' + c + '</option>';
  });
};

window.addCashflowItem = function () {
  const date = document.getElementById("cashflowDate").value || new Date().toISOString().split("T")[0];
  const frequency = document.getElementById("cashflowFrequency").value;
  const type = document.getElementById("cashflowType").value;
  const category = document.getElementById("cashflowCategory").value;
  const desc = document.getElementById("cashflowDesc").value.trim() || category;
  const amount = parseFloat(document.getElementById("cashflowAmount").value);

  if (isNaN(amount) || amount <= 0) {
    alert("Please enter a valid amount.");
    return;
  }

  userData.cashflow.push({
    id: Date.now(),
    date: date,
    frequency: frequency,
    type: type,
    category: category,
    desc: desc,
    amount: amount
  });

  document.getElementById("cashflowDesc").value = "";
  document.getElementById("cashflowAmount").value = "";
  persistData();
  renderCashflow();
};

window.removeCashflowItem = function (id) {
  userData.cashflow = userData.cashflow.filter(c => c.id !== id);
  persistData();
  renderCashflow();
};

function renderCashflow() {
  const monthFilter = document.getElementById("cashflowMonthFilter") ? document.getElementById("cashflowMonthFilter").value : "";
  const tbody = document.querySelector("#cashflowTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const filtered = (userData.cashflow || []).filter(c => {
    if (!monthFilter) return true;
    if (c.frequency === "monthly") return true;
    return c.date && c.date.startsWith(monthFilter);
  });

  const totalIncome = filtered
    .filter(c => c.type === "income")
    .reduce((sum, c) => sum + c.amount, 0);

  const totalExpense = filtered
    .filter(c => c.type === "expense")
    .reduce((sum, c) => sum + c.amount, 0);

  const netSurplus = totalIncome - totalExpense;

  const incEl = document.getElementById("totalIncomeDisplay");
  const expEl = document.getElementById("totalExpenseDisplay");
  const surpEl = document.getElementById("netSurplusDisplay");

  if (incEl) incEl.innerText = "₹" + Math.round(totalIncome).toLocaleString('en-IN');
  if (expEl) expEl.innerText = "₹" + Math.round(totalExpense).toLocaleString('en-IN');
  if (surpEl) {
    surpEl.innerText = "₹" + Math.round(netSurplus).toLocaleString('en-IN');
    surpEl.style.color = netSurplus >= 0 ? "#38bdf8" : "#f87171";
  }

  filtered.forEach(c => {
    const color = c.type === "income" ? "color: #4ade80;" : "color: #f87171;";
    const prefix = c.type === "income" ? "+₹" : "-₹";
    const freqLabel = c.frequency === "monthly" ? "Monthly" : "One-time";

    tbody.innerHTML += '<tr>' +
      '<td><span class="stat-label">' + (c.date || "-") + '<br/>(' + freqLabel + ')</span></td>' +
      '<td><strong>' + c.desc + '</strong></td>' +
      '<td><span class="stat-label">' + c.category + '</span></td>' +
      '<td style="' + color + ' font-weight: 600;">' + prefix + c.amount.toLocaleString('en-IN') + '</td>' +
      '<td style="text-align: right;"><button type="button" class="btn-sm btn-danger" onclick="removeCashflowItem(' + c.id + ')">Delete</button></td>' +
    '</tr>';
  });
}

// --- Main Dashboard Render ---
function render() {
  recomputeAccountValuesFromTrades();

  // 1. Net Worth Totals
  const totalNetWorthINR = (userData.holdings || []).reduce((sum, h) => sum + getNormalizedINR(h), 0);
  const totalNetWorthUSD = totalNetWorthINR / usdToInrRate;

  const nwEl = document.getElementById("netWorthDisplay");
  const nwSubEl = document.getElementById("netWorthSubDisplay");
  if (nwEl) nwEl.innerText = "₹" + Math.round(totalNetWorthINR).toLocaleString('en-IN');
  if (nwSubEl) nwSubEl.innerText = "≈ $" + Math.round(totalNetWorthUSD).toLocaleString('en-US');

  // 2. Goal Options Dropdown
  const goalSelect = document.getElementById("holdingGoal");
  if (goalSelect) {
    const currentSelected = goalSelect.value;
    goalSelect.innerHTML = '<option value="">General Portfolio (No Goal)</option>';
    (userData.goals || []).forEach(g => {
      goalSelect.innerHTML += '<option value="' + g.id + '">' + g.title + '</option>';
    });
    goalSelect.value = currentSelected;
  }

  // 3. Allocations Breakdown
  const catTotalsINR = {};
  (userData.targets || []).forEach(t => { catTotalsINR[t.name] = 0; });
  (userData.holdings || []).forEach(h => {
    if (catTotalsINR[h.category] !== undefined) {
      catTotalsINR[h.category] += getNormalizedINR(h);
    }
  });

  const targetSum = (userData.targets || []).reduce((acc, t) => acc + (Number(t.target) || 0), 0);
  const isTargetBalanced = Math.abs(targetSum - 100) < 0.01;

  const allocListEl = document.getElementById("allocationList");
  if (allocListEl) {
    const bgStyle = isTargetBalanced ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.15)';
    const borderColor = isTargetBalanced ? '#22c55e' : '#ef4444';
    const textColor = isTargetBalanced ? '#4ade80' : '#f87171';

    let bannerHtml = '<div style="background:' + bgStyle + '; border:1px solid ' + borderColor + '; border-radius:8px; padding:10px; margin-bottom:14px;">';
    bannerHtml += '<div class="row-between">';
    bannerHtml += '<span style="font-weight:600; color:' + textColor + ';">Total Target: ' + targetSum.toFixed(1) + '% / 100%</span>';
    if (!isTargetBalanced) {
      bannerHtml += '<button type="button" onclick="autoBalanceTargets()" class="btn-sm btn-danger">Auto-Balance to 100%</button>';
    } else {
      bannerHtml += '<span style="color:#4ade80; font-size:0.8rem; font-weight:600;">✓ Balanced</span>';
    }
    bannerHtml += '</div>';
    if (!isTargetBalanced) {
      bannerHtml += '<p style="font-size:0.8rem; color:#fca5a5; margin-top:4px;">Rebalancing alerts paused until total equals 100%.</p>';
    }
    bannerHtml += '</div>';

    allocListEl.innerHTML = bannerHtml;

    (userData.targets || []).forEach(t => {
      const valINR = catTotalsINR[t.name] || 0;
      const actualPct = totalNetWorthINR > 0 ? (valINR / totalNetWorthINR) * 100 : 0;
      const drift = actualPct - t.target;

      let badgeHtml = "";
      if (isTargetBalanced) {
        if (drift >= 5) {
          const excess = Math.round((drift / 100) * totalNetWorthINR).toLocaleString('en-IN');
          badgeHtml = '<div class="badge badge-red">⚠️ Reduce Asset: Overweight by +' + drift.toFixed(1) + '% (~₹' + excess + ')</div>';
        } else if (drift <= -5) {
          const shortage = Math.round((Math.abs(drift) / 100) * totalNetWorthINR).toLocaleString('en-IN');
          badgeHtml = '<div class="badge badge-green">⚡ Add to Asset: Underweight by ' + drift.toFixed(1) + '% (~₹' + shortage + ')</div>';
        }
      }

      allocListEl.innerHTML += '<div class="alloc-item">' +
        '<div class="row-between">' +
          '<strong>' + t.name + '</strong>' +
          '<span>₹' + Math.round(valINR).toLocaleString('en-IN') + ' (' + actualPct.toFixed(1) + '%)</span>' +
        '</div>' +
        '<div class="row-between" style="margin-top:4px;">' +
          '<span class="stat-label">Target %:</span>' +
          '<span><input type="number" step="0.5" value="' + t.target + '" onchange="updateTarget(\'' + t.name + '\', this.value)" style="width:75px;" /> %</span>' +
        '</div>' +
        badgeHtml +
      '</div>';
    });
  }

  // 4. Investment Accounts / Portfolios Card List (with "Open Portfolio" drilldown)
  const cardsContainer = document.getElementById("holdingsCardsContainer");
  if (cardsContainer) {
    cardsContainer.innerHTML = "";

    if ((userData.holdings || []).length === 0) {
      cardsContainer.innerHTML = '<p style="color:var(--muted); font-size:0.85rem;">No investment accounts added yet. Create one above (e.g. Zerodha Demat 1, HDFC Mutual Funds).</p>';
    }

    (userData.holdings || []).forEach(h => {
      const valINR = getNormalizedINR(h);
      const itemsCount = (userData.trades || []).filter(t => t.holdingId == h.id).length;
      const mappedGoal = (userData.goals || []).find(g => g.id == h.goalId);
      const goalLabel = mappedGoal ? mappedGoal.title : "General";

      const displayCurrency = h.currency === "USD" 
        ? "$" + Number(h.value).toLocaleString('en-US') 
        : "₹" + Number(h.value).toLocaleString('en-IN');

      cardsContainer.innerHTML += '<div style="background: #0b1120; border: 1px solid var(--border); border-radius: 8px; padding: 12px;">' +
        '<div class="row-between">' +
          '<div>' +
            '<strong style="font-size: 1rem; color: #fff;">' + h.name + '</strong>' +
            '<span class="stat-label" style="display:block; margin-top:2px;">' + h.category + ' • Goal: ' + goalLabel + ' • ' + itemsCount + ' item(s)</span>' +
          '</div>' +
          '<div style="text-align: right;">' +
            '<div style="font-weight: 700; color: var(--accent); font-size: 1.1rem;">' + displayCurrency + '</div>' +
            (h.currency === "USD" ? '<span class="stat-label">≈ ₹' + Math.round(valINR).toLocaleString('en-IN') + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<div style="display: flex; gap: 6px; margin-top: 10px; justify-content: flex-end;">' +
          '<button type="button" class="btn-sm" onclick="openPortfolioModal(' + h.id + ')">📂 Open Portfolio / View Items</button>' +
          '<button type="button" class="btn-sm btn-secondary" onclick="editHolding(' + h.id + ')">Edit</button>' +
          '<button type="button" class="btn-sm btn-danger" onclick="removeHolding(' + h.id + ')">×</button>' +
        '</div>' +
      '</div>';
    });
  }

  // 5. Goals with Inflation
  const goalsEl = document.getElementById("goalsList");
  if (goalsEl) {
    goalsEl.innerHTML = "";
    (userData.goals || []).forEach(g => {
      const goalAllocatedINR = (userData.holdings || [])
        .filter(h => h.goalId == g.id)
        .reduce((sum, h) => sum + getNormalizedINR(h), 0);

      const targetVal = g.target || 0;
      const pct = Math.min(100, targetVal > 0 ? (goalAllocatedINR / targetVal) * 100 : 0);
      const remainingTarget = Math.max(0, targetVal - goalAllocatedINR);

      const years = Math.max(0.1, g.years || 1);
      const annualRate = (g.expectedReturn || 0) / 100;
      const monthlyRate = annualRate / 12;
      const totalMonths = Math.round(years * 12);

      const lumpsumNeeded = remainingTarget / Math.pow(1 + annualRate, years);

      let monthlySipNeeded = 0;
      if (remainingTarget > 0) {
        if (monthlyRate === 0) {
          monthlySipNeeded = remainingTarget / totalMonths;
        } else {
          monthlySipNeeded = (remainingTarget * monthlyRate) / (Math.pow(1 + monthlyRate, totalMonths) - 1);
        }
      }

      let planHtml = '';
      if (remainingTarget > 0) {
        planHtml = '<div class="goal-plan-box">' +
          '<div>' +
            '<div class="stat-label">Way 1: One-time Lump-sum</div>' +
            '<div class="plan-metric">₹' + Math.round(lumpsumNeeded).toLocaleString('en-IN') + '</div>' +
            '<div style="font-size:0.75rem; color:var(--muted);">invested today @ ' + (g.expectedReturn || 0) + '%</div>' +
          '</div>' +
          '<div>' +
            '<div class="stat-label">Way 2: Monthly SIP</div>' +
            '<div class="plan-metric">₹' + Math.round(monthlySipNeeded).toLocaleString('en-IN') + '/mo</div>' +
            '<div style="font-size:0.75rem; color:var(--muted);">for ' + totalMonths + ' months</div>' +
          '</div>' +
        '</div>';
      } else {
        planHtml = '<div style="margin-top:8px; color:#4ade80; font-size:0.85rem; font-weight:600;">🎉 Goal fully funded with allocated assets!</div>';
      }

      goalsEl.innerHTML += '<div style="margin-bottom:16px; padding-bottom:14px; border-bottom:1px solid var(--border);">' +
        '<div class="row-between">' +
          '<div>' +
            '<strong style="font-size:1rem;">' + g.title + '</strong>' +
            '<span class="stat-label" style="display:block;">' +
              'Today\'s Cost: ₹' + Math.round(g.costToday || targetVal).toLocaleString('en-IN') + 
              ' • Target (7% Inf): ₹' + Math.round(targetVal).toLocaleString('en-IN') +
            '</span>' +
            '<span class="stat-label" style="display:block;">' +
              'Timeline: ' + (g.years || 1) + ' Yr(s) • Exp Return: ' + (g.expectedReturn || 0) + '% p.a.' +
            '</span>' +
          '</div>' +
          '<div>' +
            '<button type="button" class="btn-sm btn-secondary" onclick="editGoal(' + g.id + ')">Edit</button> ' +
            '<button type="button" class="btn-sm btn-danger" onclick="removeGoal(' + g.id + ')">×</button>' +
          '</div>' +
        '</div>' +
        '<div class="row-between stat-label" style="margin-top:6px;">' +
          '<span>Allocated: ₹' + Math.round(goalAllocatedINR).toLocaleString('en-IN') + ' of ₹' + Math.round(targetVal).toLocaleString('en-IN') + '</span>' +
          '<span>' + pct.toFixed(1) + '%</span>' +
        '</div>' +
        '<div class="progress-bar-bg"><div class="progress-bar-fill" style="width:' + pct + '%;"></div></div>' +
        planHtml +
      '</div>';
    });
  }

  renderCashflow();
  renderTrades();
}

// Restore active session
const active = sessionStorage.getItem('current_user');
if (active && getUsersDb()[active]) {
  loginUser(active, getUsersDb()[active]);
}