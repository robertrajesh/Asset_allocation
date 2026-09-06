const DEFAULT_TARGETS = [
  { name: "Indian Stocks", target: 30 },
  { name: "US Stocks", target: 15 },
  { name: "Mutual Funds", target: 20 },
  { name: "Fixed Deposits", target: 10 },
  { name: "Bonds", target: 5 },
  { name: "Gold", target: 10 },
  { name: "Real Estate", target: 10 }
];

let currentUser = null;
let userData = { targets: DEFAULT_TARGETS, holdings: [], goals: [] };
let usdToInrRate = 84.0;

// Fetch Live USD/INR Rate
async function fetchLiveExchangeRate() {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    const data = await res.json();
    if (data && data.rates && data.rates.INR) {
      usdToInrRate = parseFloat(data.rates.INR.toFixed(2));
      document.getElementById("fxRateDisplay").innerText = `1 USD = ₹${usdToInrRate}`;
    }
  } catch (err) {
    console.warn("Using fallback rate:", err);
    document.getElementById("fxRateDisplay").innerText = `1 USD = ₹${usdToInrRate} (offline)`;
  }
  render();
}

function getUsersDb() {
  return JSON.parse(localStorage.getItem('registered_users') || '{}');
}

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
    users[email] = { password, targets: DEFAULT_TARGETS, holdings: [], goals: [] };
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

function loginUser(email, data) {
  currentUser = email;
  userData = {
    targets: data.targets || DEFAULT_TARGETS,
    holdings: data.holdings || [],
    goals: data.goals || []
  };
  sessionStorage.setItem('current_user', email);
  document.getElementById("authScreen").style.display = "none";
  document.getElementById("appScreen").style.display = "block";
  document.getElementById("userGreeting").innerText = email;
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
  users[currentUser] = {
    password: users[currentUser].password,
    ...userData
  };
  localStorage.setItem('registered_users', JSON.stringify(users));
  render();
}

function getNormalizedINR(holding) {
  return holding.currency === "USD" ? holding.value * usdToInrRate : holding.value;
}

// Allocations
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

// Goals
window.saveGoal = function () {
  const id = document.getElementById("goalEditId").value;
  const title = document.getElementById("goalTitle").value.trim();
  const target = parseFloat(document.getElementById("goalTarget").value);
  const years = parseFloat(document.getElementById("goalYears").value) || 1;
  const expectedReturn = parseFloat(document.getElementById("goalReturn").value) || 0;

  if (!title || isNaN(target) || target <= 0) return alert("Enter valid goal title and target amount.");

  if (id) {
    const goal = userData.goals.find(g => g.id == id);
    if (goal) {
      goal.title = title;
      goal.target = target;
      goal.years = years;
      goal.expectedReturn = expectedReturn;
    }
  } else {
    userData.goals.push({ id: Date.now(), title, target, years, expectedReturn });
  }

  resetGoalForm();
  persistData();
};

window.editGoal = function (id) {
  const goal = userData.goals.find(g => g.id == id);
  if (!goal) return;
  document.getElementById("goalEditId").value = goal.id;
  document.getElementById("goalTitle").value = goal.title;
  document.getElementById("goalTarget").value = goal.target;
  document.getElementById("goalYears").value = goal.years || 1;
  document.getElementById("goalReturn").value = goal.expectedReturn || 0;
  document.getElementById("goalSubmitBtn").innerText = "Update Goal";
  document.getElementById("goalCancelBtn").style.display = "inline-block";
};

window.cancelGoalEdit = function () {
  resetGoalForm();
};

function resetGoalForm() {
  document.getElementById("goalEditId").value = "";
  document.getElementById("goalTitle").value = "";
  document.getElementById("goalTarget").value = "";
  document.getElementById("goalYears").value = "";
  document.getElementById("goalReturn").value = "";
  document.getElementById("goalSubmitBtn").innerText = "Save Goal";
  document.getElementById("goalCancelBtn").style.display = "none";
}

window.removeGoal = function (id) {
  userData.goals = userData.goals.filter(g => g.id !== id);
  userData.holdings.forEach(h => {
    if (h.goalId == id) delete h.goalId;
  });
  persistData();
};

// Holdings
window.addHolding = function () {
  const name = document.getElementById("holdingName").value.trim();
  const category = document.getElementById("assetCategory").value;
  const currency = document.getElementById("holdingCurrency").value;
  const value = parseFloat(document.getElementById("holdingValue").value);
  const goalId = document.getElementById("holdingGoal").value || null;

  if (!name || isNaN(value) || value <= 0) return alert("Enter valid holding details.");

  userData.holdings.push({ id: Date.now(), name, category, currency, value, goalId });
  document.getElementById("holdingName").value = "";
  document.getElementById("holdingValue").value = "";
  persistData();
};

window.removeHolding = function (id) {
  userData.holdings = userData.holdings.filter(h => h.id !== id);
  persistData();
};

// Render Dashboard
function render() {
  const totalNetWorthINR = userData.holdings.reduce((sum, h) => sum + getNormalizedINR(h), 0);
  const totalNetWorthUSD = totalNetWorthINR / usdToInrRate;

  document.getElementById("netWorthDisplay").innerText = `₹${Math.round(totalNetWorthINR).toLocaleString('en-IN')}`;
  document.getElementById("netWorthSubDisplay").innerText = `≈ $${Math.round(totalNetWorthUSD).toLocaleString('en-US')}`;

  const goalSelect = document.getElementById("holdingGoal");
  const currentSelected = goalSelect.value;
  goalSelect.innerHTML = `<option value="">General Portfolio (No Goal)</option>`;
  userData.goals.forEach(g => {
    goalSelect.innerHTML += `<option value="${g.id}">${g.title}</option>`;
  });
  goalSelect.value = currentSelected;

  const catTotalsINR = {};
  userData.targets.forEach(t => catTotalsINR[t.name] = 0);
  userData.holdings.forEach(h => {
    if (catTotalsINR[h.category] !== undefined) {
      catTotalsINR[h.category] += getNormalizedINR(h);
    }
  });

  const targetSum = userData.targets.reduce((acc, t) => acc + (Number(t.target) || 0), 0);
  const isTargetBalanced = Math.abs(targetSum - 100) < 0.01;

  const allocListEl = document.getElementById("allocationList");
  allocListEl.innerHTML = `
    <div style="background: ${isTargetBalanced ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.15)'}; 
                border: 1px solid ${isTargetBalanced ? '#22c55e' : '#ef4444'}; 
                border-radius: 8px; padding: 10px; margin-bottom: 14px;">
      <div class="row-between">
        <span style="font-weight: 600; color: ${isTargetBalanced ? '#4ade80' : '#f87171'};">
          Total Target: ${targetSum.toFixed(1)}\% / 100\%         </span>${!isTargetBalanced 
          ? `<button onclick="autoBalanceTargets()" class="btn-sm btn-danger">Auto-Balance to 100%</button>`
          : `<span style="color: #4ade80; font-size: 0.8rem; font-weight: 600;">✓ Balanced</span>`}
      </div>
      ${!isTargetBalanced ? `<p style="font-size: 0.8rem; color: #fca5a5; margin-top: 4px;">Rebalancing alerts paused until total equals 100%.</p>` : ''}
    </div>
  `;

  userData.targets.forEach(t => {
    const valINR = catTotalsINR[t.name] || 0;
    const actualPct = totalNetWorthINR > 0 ? (valINR / totalNetWorthINR) * 100 : 0;
    const drift = actualPct - t.target;

    let badgeHtml = "";
    if (isTargetBalanced) {
      if (drift >= 5) {
        const excess = Math.round((drift / 100) * totalNetWorthINR).toLocaleString('en-IN');
        badgeHtml = `<div class="badge badge-red">⚠️ Reduce Asset: Overweight by +${drift.toFixed(1)}\% (~₹${excess})</div>`;
      } else if (drift <= -5) {
        const shortage = Math.round((Math.abs(drift) / 100) * totalNetWorthINR).toLocaleString('en-IN');
        badgeHtml = `<div class="badge badge-green">⚡ Add to Asset: Underweight by ${drift.toFixed(1)}\% (~₹${shortage})</div>`;
      }
    }

    allocListEl.innerHTML += `
      <div class="alloc-item">
        <div class="row-between">
          <strong>${t.name}</strong>
          <span>₹${Math.round(valINR).toLocaleString('en-IN')} (${actualPct.toFixed(1)}%)</span>
        </div>
        <div class="row-between" style="margin-top: 4px;">
          <span class="stat-label">Target %:</span>
          <span><input type="number" step="0.5" value="${t.target}" onchange="updateTarget('${t.name}', this.value)" style="width: 75px;" /> %</span>
        </div>
        ${badgeHtml}
      </div>
    `;
  });

  const tableBody = document.querySelector("#holdingsTable tbody");
  tableBody.innerHTML = "";
  userData.holdings.forEach(h => {
    const valINR = getNormalizedINR(h);
    const mappedGoal = userData.goals.find(g => g.id == h.goalId);
    const goalName = mappedGoal ? mappedGoal.title : "General";

    tableBody.innerHTML += `
      <tr>
        <td>
          <strong>${h.name}</strong><br/>
          <span class="stat-label">${h.category} •${goalName}</span>
        </td>
        <td>
          ${h.currency === "USD" ? `$${h.value.toLocaleString('en-US')}` : `₹${h.value.toLocaleString('en-IN')}`}
          <br/>
          <span class="stat-label">≈ ₹${Math.round(valINR).toLocaleString('en-IN')}</span>
        </td>
        <td><button class="btn-sm btn-danger" onclick="removeHolding(${h.id})">Delete</button></td>
      </tr>
    `;
  });

  const goalsEl = document.getElementById("goalsList");
  goalsEl.innerHTML = "";
  userData.goals.forEach(g => {
    const goalAllocatedINR = userData.holdings
      .filter(h => h.goalId == g.id)
      .reduce((sum, h) => sum + getNormalizedINR(h), 0);

    const pct = Math.min(100, g.target > 0 ? (goalAllocatedINR / g.target) * 100 : 0);
    const remainingTarget = Math.max(0, g.target - goalAllocatedINR);

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

    goalsEl.innerHTML += `
      <div style="margin-bottom: 16px; padding-bottom: 14px; border-bottom: 1px solid var(--border);">
        <div class="row-between">
          <div>
            <strong style="font-size: 1rem;">${g.title}</strong>
            <span class="stat-label" style="display: block;">
              Timeline: ${g.years \vert{}\vert{} 1} Yr(s) • Exp. Return: ${g.expectedReturn || 0}% p.a.
            </span>
          </div>
          <div>
            <button class="btn-sm btn-secondary" onclick="editGoal(${g.id})">Edit</button>
            <button class="btn-sm btn-danger" onclick="removeGoal(${g.id})">×</button>
          </div>
        </div>

        <div class="row-between stat-label" style="margin-top: 6px;">
          <span>Allocated: ₹${Math.round(goalAllocatedINR).toLocaleString('en-IN')} of ₹${g.target.toLocaleString('en-IN')}</span>
          <span>${pct.toFixed(1)}%</span>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width: ${pct}%;"></div>
        </div>

        ${remainingTarget > 0 ? `
          <div class="goal-plan-box">
            <div>
              <div class="stat-label">Way 1: One-time Lump-sum</div>
              <div class="plan-metric">₹${Math.round(lumpsumNeeded).toLocaleString('en-IN')}</div>
              <div style="font-size: 0.75rem; color: var(--muted);">invested today @ ${g.expectedReturn || 0}%</div>
            </div>
            <div>
              <div class="stat-label">Way 2: Monthly SIP</div>
              <div class="plan-metric">₹${Math.round(monthlySipNeeded).toLocaleString('en-IN')}/mo</div>
              <div style="font-size: 0.75rem; color: var(--muted);">for ${totalMonths} months</div>
            </div>
          </div>
        ` : `
          <div style="margin-top: 8px; color: #4ade80; font-size: 0.85rem; font-weight: 600;">
            🎉 Goal fully funded with allocated assets!
          </div>
        `}
      </div>
    `;
  });
}

// Restore active session
const active = sessionStorage.getItem('current_user');
if (active && getUsersDb()[active]) {
  loginUser(active, getUsersDb()[active]);
}