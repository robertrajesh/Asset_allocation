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
  holdings: [],
  goals: [],
  cashflow: []
};
let usdToInrRate = 84.0;

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

// --- Navigation Tabs ---
window.switchTab = function (tab) {
  const pView = document.getElementById("viewPortfolio");
  const cView = document.getElementById("viewCashflow");
  const pBtn = document.getElementById("tabBtnPortfolio");
  const cBtn = document.getElementById("tabBtnCashflow");

  if (!pView || !cView || !pBtn || !cBtn) return;

  if (tab === "portfolio") {
    pView.style.display = "block";
    cView.style.display = "none";
    pBtn.classList.add("active");
    cBtn.classList.remove("active");
  } else {
    pView.style.display = "none";
    cView.style.display = "block";
    pBtn.classList.remove("active");
    cBtn.classList.add("active");
    updateCashflowCategories();
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
    users[email] = { password: password, targets: DEFAULT_TARGETS, holdings: [], goals: [], cashflow: [] };
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

  const newPass = prompt("Password recovery for " + email + ":\nEnter your new password (minimum 6 characters):");
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
  // Fallbacks guarantee backward compatibility for existing user accounts
  userData = {
    targets: Array.isArray(data.targets) ? data.targets : DEFAULT_TARGETS,
    holdings: Array.isArray(data.holdings) ? data.holdings : [],
    goals: Array.isArray(data.goals) ? data.goals : [],
    cashflow: Array.isArray(data.cashflow) ? data.cashflow : []
  };
  sessionStorage.setItem('current_user', email);
  document.getElementById("authScreen").style.display = "none";
  document.getElementById("appScreen").style.display = "block";
  document.getElementById("userGreeting").innerText = email;
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
  render();
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

  // Future target compounded by 7% inflation
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

// --- Holdings ---
window.addHolding = function () {
  const name = document.getElementById("holdingName").value.trim();
  const category = document.getElementById("assetCategory").value;
  const currency = document.getElementById("holdingCurrency").value;
  const value = parseFloat(document.getElementById("holdingValue").value);
  const goalId = document.getElementById("holdingGoal").value || null;

  if (!name || isNaN(value) || value <= 0) {
    alert("Please enter valid holding name and value.");
    return;
  }

  userData.holdings.push({ id: Date.now(), name: name, category: category, currency: currency, value: value, goalId: goalId });
  document.getElementById("holdingName").value = "";
  document.getElementById("holdingValue").value = "";
  persistData();
};

window.removeHolding = function (id) {
  userData.holdings = userData.holdings.filter(h => h.id !== id);
  persistData();
};

// --- Income and Expense Management ---
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
  const type = document.getElementById("cashflowType").value;
  const category = document.getElementById("cashflowCategory").value;
  const desc = document.getElementById("cashflowDesc").value.trim() || category;
  const amount = parseFloat(document.getElementById("cashflowAmount").value);

  if (isNaN(amount) || amount <= 0) {
    alert("Please enter a valid monthly amount.");
    return;
  }

  if (!Array.isArray(userData.cashflow)) {
    userData.cashflow = [];
  }

  userData.cashflow.push({ id: Date.now(), type: type, category: category, desc: desc, amount: amount });
  document.getElementById("cashflowDesc").value = "";
  document.getElementById("cashflowAmount").value = "";
  persistData();
};

window.removeCashflowItem = function (id) {
  userData.cashflow = (userData.cashflow || []).filter(c => c.id !== id);
  persistData();
};

// --- Dashboard Render ---
function render() {
  // 1. Net Worth Totals
  const totalNetWorthINR = (userData.holdings || []).reduce((sum, h) => sum + getNormalizedINR(h), 0);
  const totalNetWorthUSD = totalNetWorthINR / usdToInrRate;

  const nwEl = document.getElementById("netWorthDisplay");
  const nwSubEl = document.getElementById("netWorthSubDisplay");
  if (nwEl) nwEl.innerText = "₹" + Math.round(totalNetWorthINR).toLocaleString('en-IN');
  if (nwSubEl) nwSubEl.innerText = "≈ $" + Math.round(totalNetWorthUSD).toLocaleString('en-US');

  // 2. Goal Options in Holdings Dropdown
  const goalSelect = document.getElementById("holdingGoal");
  if (goalSelect) {
    const currentSelected = goalSelect.value;
    goalSelect.innerHTML = '<option value="">General Portfolio (No Goal)</option>';
    (userData.goals || []).forEach(g => {
      goalSelect.innerHTML += '<option value="' + g.id + '">' + g.title + '</option>';
    });
    goalSelect.value = currentSelected;
  }

  // 3. Allocations
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

  // 4. Holdings Table
  const tableBody = document.querySelector("#holdingsTable tbody");
  if (tableBody) {
    tableBody.innerHTML = "";
    (userData.holdings || []).forEach(h => {
      const valINR = getNormalizedINR(h);
      const mappedGoal = (userData.goals || []).find(g => g.id == h.goalId);
      const goalName = mappedGoal ? mappedGoal.title : "General";

      const displayCurrency = h.currency === "USD" 
        ? "$" + h.value.toLocaleString('en-US') 
        : "₹" + h.value.toLocaleString('en-IN');

      tableBody.innerHTML += '<tr>' +
        '<td><strong>' + h.name + '</strong><br/><span class="stat-label">' + h.category + ' • ' + goalName + '</span></td>' +
        '<td>' + displayCurrency + '<br/><span class="stat-label">≈ ₹' + Math.round(valINR).toLocaleString('en-IN') + '</span></td>' +
        '<td><button type="button" class="btn-sm btn-danger" onclick="removeHolding(' + h.id + ')">Delete</button></td>' +
      '</tr>';
    });
  }

  // 5. Goals
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

  // 6. Income & Expenses Cashflow Summary
  const cashflowArr = Array.isArray(userData.cashflow) ? userData.cashflow : [];
  const totalIncome = cashflowArr
    .filter(c => c.type === "income")
    .reduce((sum, c) => sum + c.amount, 0);

  const totalExpense = cashflowArr
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

  const cashTableBody = document.querySelector("#cashflowTable tbody");
  if (cashTableBody) {
    cashTableBody.innerHTML = "";
    cashflowArr.forEach(c => {
      const color = c.type === "income" ? "color: #4ade80;" : "color: #f87171;";
      const prefix = c.type === "income" ? "+₹" : "-₹";

      cashTableBody.innerHTML += '<tr>' +
        '<td><strong>' + c.desc + '</strong></td>' +
        '<td><span class="stat-label">' + c.category + ' (' + c.type + ')</span></td>' +
        '<td style="' + color + ' font-weight: 600;">' + prefix + c.amount.toLocaleString('en-IN') + '</td>' +
        '<td><button type="button" class="btn-sm btn-danger" onclick="removeCashflowItem(' + c.id + ')">Delete</button></td>' +
      '</tr>';
    });
  }
}

// Restore active session if present
const active = sessionStorage.getItem('current_user');
if (active && getUsersDb()[active]) {
  loginUser(active, getUsersDb()[active]);
}