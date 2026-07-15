/**
 * BUDGET CASA - Logica applicazione (frontend)
 */

let STATE = {
  idToken: null,
  currentUserEmail: null,
  expenses: [],
  editingId: null,
  chart: null
};

const $ = (id) => document.getElementById(id);

// ===================== AVVIO =====================

window.addEventListener('load', () => {
  const savedToken = sessionStorage.getItem('idToken');
  const savedEmail = sessionStorage.getItem('userEmail');
  initGoogleSignIn();
  if (savedToken && savedEmail) {
    STATE.idToken = savedToken;
    STATE.currentUserEmail = savedEmail;
    enterApp();
  }
  registerServiceWorker();
});

function initGoogleSignIn() {
  if (!window.google || !google.accounts) {
    setTimeout(initGoogleSignIn, 200);
    return;
  }
  google.accounts.id.initialize({
    client_id: APP_CONFIG.GOOGLE_CLIENT_ID,
    callback: handleCredentialResponse
  });
  google.accounts.id.renderButton(
    $('google-signin-hidden'),
    { theme: 'outline', size: 'large', shape: 'pill', width: 130 }
  );
}

function handleCredentialResponse(response) {
  const idToken = response.credential;
  const payload = parseJwt(idToken);
  const email = payload && payload.email;

  const knownUser = APP_CONFIG.USERS.find(u => u.email.toLowerCase() === (email || '').toLowerCase());
  if (!knownUser) {
    showLoginError('Questo account Google non è autorizzato a usare questa app.');
    return;
  }

  STATE.idToken = idToken;
  STATE.currentUserEmail = email;
  sessionStorage.setItem('idToken', idToken);
  sessionStorage.setItem('userEmail', email);
  enterApp();
}

function parseJwt(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(base64))));
  } catch (e) {
    return null;
  }
}

function showLoginError(msg) {
  const el = $('login-error');
  el.textContent = msg;
  el.hidden = false;
}

async function enterApp() {
  $('gate').hidden = true;
  $('tabs').hidden = false;
  $('main-content').hidden = false;
  $('logged-out-box').hidden = true;
  $('logged-in-box').hidden = false;

  const user = APP_CONFIG.USERS.find(u => u.email.toLowerCase() === STATE.currentUserEmail.toLowerCase());
  const nome = user ? user.nome : STATE.currentUserEmail;
  $('user-label').textContent = nome;
  $('user-avatar').textContent = nome.charAt(0).toUpperCase();
  $('user-avatar').style.background = user ? user.colore : '#999';

  setupTabs();
  setupCategoryChips();
  setupPayerToggle();
  setupSplitSlider();
  setupForm();
  setupFilters();
  setupChartControls();
  setupLogout();
  setupFooter();

  await refreshExpenses();
}

function setupLogout() {
  $('logout-btn').addEventListener('click', () => {
    sessionStorage.clear();
    location.reload();
  });
}

function setupFooter() {
  const btn = $('refresh-cache-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Aggiornamento…';
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    } catch (e) {}
    location.reload();
  });
}

// ===================== TABS =====================

function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => activateTab(btn.dataset.tab));
  });
  const savedTab = localStorage.getItem('activeTab');
  activateTab(savedTab && $('tab-' + savedTab) ? savedTab : 'aggiungi');
}

function activateTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  $('tab-' + tab).classList.add('active');
  localStorage.setItem('activeTab', tab);
  if (tab === 'grafici') renderChart();
  if (tab === 'bilancio') renderBalance();
}

// ===================== API =====================

async function apiCall(action, payload) {
  const body = Object.assign({ action: action, idToken: STATE.idToken }, payload || {});
  const res = await fetch(APP_CONFIG.APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body)
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json.data;
}

async function refreshExpenses() {
  try {
    STATE.expenses = await apiCall('list');
  } catch (err) {
    STATE.expenses = [];
    console.error(err);
  }
  renderExpenseList();
  populateFilterOptions();
}

// ===================== FORM: CATEGORIE / PAGATO DA =====================

function setupCategoryChips() {
  const container = $('f-categorie');
  container.innerHTML = '';
  APP_CONFIG.CATEGORIES.forEach(cat => {
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.textContent = cat.nome;
    chip.dataset.id = cat.id;
    chip.addEventListener('click', () => {
      chip.classList.toggle('selected');
      chip.style.background = chip.classList.contains('selected') ? cat.colore : '';
      chip.style.borderColor = chip.classList.contains('selected') ? cat.colore : '';
    });
    container.appendChild(chip);
  });
}

function setupPayerToggle() {
  const container = $('f-pagato-da');
  container.innerHTML = '';
  APP_CONFIG.USERS.forEach((user, idx) => {
    const btn = document.createElement('div');
    btn.className = 'payer-btn';
    btn.textContent = user.nome;
    btn.dataset.id = user.id;
    if (idx === 0) {
      btn.classList.add('selected');
      btn.style.background = user.colore;
    }
    btn.addEventListener('click', () => {
      container.querySelectorAll('.payer-btn').forEach(b => {
        b.classList.remove('selected');
        b.style.background = '';
      });
      btn.classList.add('selected');
      btn.style.background = user.colore;
    });
    container.appendChild(btn);
  });
  $('split-label-1').textContent = APP_CONFIG.USERS[0].nome;
  $('split-label-2').textContent = APP_CONFIG.USERS[1].nome;
}

function setupSplitSlider() {
  const slider = $('f-perc1');
  slider.addEventListener('input', updateSplitDisplay);
  $('f-importo').addEventListener('input', updateSplitDisplay);
  $('f-data').value = todayISO();
  updateSplitDisplay();
}

function updateSplitDisplay() {
  const perc1 = parseInt($('f-perc1').value, 10);
  const perc2 = 100 - perc1;
  const importo = parseFloat($('f-importo').value) || 0;
  $('split-label-1').textContent = APP_CONFIG.USERS[0].nome + ' ' + perc1 + '%';
  $('split-label-2').textContent = perc2 + '% ' + APP_CONFIG.USERS[1].nome;
  $('split-amount-1').textContent = '€' + (importo * perc1 / 100).toFixed(2);
  $('split-amount-2').textContent = '€' + (importo * perc2 / 100).toFixed(2);
}

// ===================== FORM: SALVA / MODIFICA =====================

function setupForm() {
  $('expense-form').addEventListener('submit', onSubmitExpense);
  $('cancel-edit-btn').addEventListener('click', resetForm);
}

async function onSubmitExpense(e) {
  e.preventDefault();
  const submitBtn = $('submit-btn');
  const msg = $('form-message');
  msg.hidden = true;

  const categorieSelezionate = Array.from(document.querySelectorAll('#f-categorie .chip.selected')).map(c => c.dataset.id);
  const pagatoDaEl = document.querySelector('#f-pagato-da .payer-btn.selected');

  if (categorieSelezionate.length === 0) {
    return showFormMessage('Seleziona almeno una categoria.', 'error');
  }
  if (!pagatoDaEl) {
    return showFormMessage('Seleziona chi ha pagato.', 'error');
  }

  const payload = {
    id: STATE.editingId,
    data: $('f-data').value,
    nome: $('f-nome').value.trim(),
    categorie: categorieSelezionate,
    importo: parseFloat($('f-importo').value),
    pagatoDa: pagatoDaEl.dataset.id,
    percentuale1: parseInt($('f-perc1').value, 10)
  };

  submitBtn.disabled = true;
  try {
    if (STATE.editingId) {
      await apiCall('update', payload);
      showFormMessage('Spesa aggiornata.', 'success');
    } else {
      await apiCall('add', payload);
      showFormMessage('Spesa salvata.', 'success');
    }
    resetForm();
    await refreshExpenses();
  } catch (err) {
    showFormMessage('Errore: ' + err.message, 'error');
  } finally {
    submitBtn.disabled = false;
  }
}

function showFormMessage(text, type) {
  const msg = $('form-message');
  msg.textContent = text;
  msg.className = 'form-message ' + type;
  msg.hidden = false;
}

function resetForm() {
  STATE.editingId = null;
  $('expense-form').reset();
  $('f-data').value = todayISO();
  document.querySelectorAll('#f-categorie .chip').forEach(c => {
    c.classList.remove('selected');
    c.style.background = '';
    c.style.borderColor = '';
  });
  const container = $('f-pagato-da');
  container.querySelectorAll('.payer-btn').forEach((b, idx) => {
    b.classList.toggle('selected', idx === 0);
    b.style.background = idx === 0 ? APP_CONFIG.USERS[0].colore : '';
  });
  $('f-perc1').value = 50;
  updateSplitDisplay();
  $('form-title').textContent = 'Nuova spesa';
  $('submit-btn').textContent = 'Salva spesa';
  $('cancel-edit-btn').hidden = true;
}

function editExpense(id) {
  const exp = STATE.expenses.find(e => e.ID === id);
  if (!exp) return;
  STATE.editingId = id;

  $('f-data').value = dateOnly(exp.Data);
  $('f-nome').value = exp.Nome;
  $('f-importo').value = exp.Importo;

  const categorieIds = (exp.Categorie || '').split(',').map(s => s.trim()).filter(Boolean)
    .map(nome => (APP_CONFIG.CATEGORIES.find(c => c.nome === nome || c.id === nome) || {}).id)
    .filter(Boolean);
  document.querySelectorAll('#f-categorie .chip').forEach(chip => {
    const selected = categorieIds.includes(chip.dataset.id);
    chip.classList.toggle('selected', selected);
    const cat = APP_CONFIG.CATEGORIES.find(c => c.id === chip.dataset.id);
    chip.style.background = selected ? cat.colore : '';
    chip.style.borderColor = selected ? cat.colore : '';
  });

  document.querySelectorAll('#f-pagato-da .payer-btn').forEach(btn => {
    const selected = btn.dataset.id === exp.PagatoDa;
    btn.classList.toggle('selected', selected);
    const user = APP_CONFIG.USERS.find(u => u.id === btn.dataset.id);
    btn.style.background = selected ? user.colore : '';
  });

  $('f-perc1').value = exp.Percentuale1;
  updateSplitDisplay();

  $('form-title').textContent = 'Modifica spesa';
  $('submit-btn').textContent = 'Aggiorna spesa';
  $('cancel-edit-btn').hidden = false;

  document.querySelector('.tab-btn[data-tab="aggiungi"]').click();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function removeExpense(id) {
  if (!confirm('Eliminare questa spesa?')) return;
  try {
    await apiCall('delete', { id });
    await refreshExpenses();
  } catch (err) {
    alert('Errore: ' + err.message);
  }
}

function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset();
  const local = new Date(d.getTime() - tz * 60000);
  return local.toISOString().slice(0, 10);
}

// ===================== ELENCO SPESE =====================

function setupFilters() {
  $('filter-categoria').addEventListener('change', renderExpenseList);
  $('filter-pagatoDa').addEventListener('change', renderExpenseList);
}

function populateFilterOptions() {
  const catSelect = $('filter-categoria');
  const chartCatSelect = $('chart-categoria');
  const currentCatVal = catSelect.value;
  catSelect.innerHTML = '<option value="">Tutte le categorie</option>';
  chartCatSelect.innerHTML = '<option value="">Totale generale</option>';
  APP_CONFIG.CATEGORIES.forEach(cat => {
    const o1 = document.createElement('option'); o1.value = cat.id; o1.textContent = cat.nome;
    catSelect.appendChild(o1);
    const o2 = document.createElement('option'); o2.value = cat.id; o2.textContent = cat.nome;
    chartCatSelect.appendChild(o2);
  });
  catSelect.value = currentCatVal;

  const paySelect = $('filter-pagatoDa');
  const currentPayVal = paySelect.value;
  paySelect.innerHTML = '<option value="">Chiunque abbia pagato</option>';
  APP_CONFIG.USERS.forEach(u => {
    const o = document.createElement('option'); o.value = u.id; o.textContent = u.nome;
    paySelect.appendChild(o);
  });
  paySelect.value = currentPayVal;
}

function renderExpenseList() {
  const list = $('expense-list');
  const catFilter = $('filter-categoria').value;
  const payFilter = $('filter-pagatoDa').value;

  let items = [...STATE.expenses].sort((a, b) => (dateOnly(a.Data) < dateOnly(b.Data) ? 1 : -1));

  if (catFilter) {
    const catNome = (APP_CONFIG.CATEGORIES.find(c => c.id === catFilter) || {}).nome;
    items = items.filter(e => (e.Categorie || '').split(',').map(s => s.trim()).includes(catNome));
  }
  if (payFilter) {
    items = items.filter(e => e.PagatoDa === payFilter);
  }

  if (items.length === 0) {
    list.innerHTML = '<p class="empty-state">Nessuna spesa trovata.</p>';
    return;
  }

  list.innerHTML = '';
  items.forEach(exp => {
    const payer = APP_CONFIG.USERS.find(u => u.id === exp.PagatoDa);
    const tags = (exp.Categorie || '').split(',').map(s => s.trim()).filter(Boolean).map(nome => {
      const cat = APP_CONFIG.CATEGORIES.find(c => c.nome === nome) || { colore: '#999', nome };
      return `<span class="tag" style="background:${cat.colore}">${cat.nome}</span>`;
    }).join('');

    const div = document.createElement('div');
    div.className = 'expense-item';
    div.innerHTML = `
      <div class="expense-payer-badge" style="background:${payer ? payer.colore : '#999'}">${payer ? payer.nome.charAt(0).toUpperCase() : '?'}</div>
      <div class="expense-main">
        <div class="expense-name">${escapeHtml(exp.Nome)}</div>
        <div class="expense-meta">${formatDateIt(exp.Data)} · pagato da ${payer ? payer.nome : exp.PagatoDa} · ${exp.Percentuale1}% / ${exp.Percentuale2}%</div>
        <div class="expense-tags">${tags}</div>
      </div>
      <div class="expense-right">
        <div class="expense-amount">€${Number(exp.Importo).toFixed(2)}</div>
        <div class="expense-actions">
          <button class="icon-btn" title="Modifica" data-action="edit">✎</button>
          <button class="icon-btn" title="Elimina" data-action="delete">🗑</button>
        </div>
      </div>
    `;
    div.querySelector('[data-action="edit"]').addEventListener('click', () => editExpense(exp.ID));
    div.querySelector('[data-action="delete"]').addEventListener('click', () => removeExpense(exp.ID));
    list.appendChild(div);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

// Normalizza qualsiasi valore data (es. "2026-07-12" o "2026-07-12T07:00:00.000Z")
// restituendo sempre solo la parte "YYYY-MM-DD".
function dateOnly(d) {
  if (!d) return '';
  return String(d).slice(0, 10);
}

function formatDateIt(raw) {
  const iso = dateOnly(raw);
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return String(raw);
  return `${d}/${m}/${y}`;
}

// ===================== GRAFICI =====================

function setupChartControls() {
  $('chart-periodo').addEventListener('change', () => {
    $('custom-range').hidden = $('chart-periodo').value !== 'personalizzato';
    renderChart();
  });
  $('chart-da').addEventListener('change', renderChart);
  $('chart-a').addEventListener('change', renderChart);
  $('chart-categoria').addEventListener('change', renderChart);
  $('chart-tipo').addEventListener('change', renderChart);
}

function getChartDateRange() {
  const periodo = $('chart-periodo').value;
  const now = new Date();
  let start, end;

  if (periodo === 'settimana') {
    const day = (now.getDay() + 6) % 7;
    start = new Date(now); start.setDate(now.getDate() - day);
    end = new Date(start); end.setDate(start.getDate() + 6);
  } else if (periodo === 'mese') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  } else {
    const da = $('chart-da').value;
    const a = $('chart-a').value;
    start = da ? new Date(da) : new Date(2000, 0, 1);
    end = a ? new Date(a) : now;
  }
  return { start: toISO(start), end: toISO(end) };
}

function toISO(d) {
  const tz = d.getTimezoneOffset();
  return new Date(d.getTime() - tz * 60000).toISOString().slice(0, 10);
}

function renderChart() {
  const { start, end } = getChartDateRange();
  const catFilter = $('chart-categoria').value;
  const tipo = $('chart-tipo').value;

  let items = STATE.expenses.filter(e => {
    const d = dateOnly(e.Data);
    return d >= start && d <= end;
  });
  if (catFilter) {
    const catNome = (APP_CONFIG.CATEGORIES.find(c => c.id === catFilter) || {}).nome;
    items = items.filter(e => (e.Categorie || '').split(',').map(s => s.trim()).includes(catNome));
  }

  $('chart-empty').hidden = items.length > 0;
  if (items.length === 0) {
    if (STATE.chart) { STATE.chart.destroy(); STATE.chart = null; }
    return;
  }

  let config;
  if (tipo === 'doughnut') {
    config = buildDoughnutConfig(items);
  } else if (tipo === 'bar') {
    config = buildBarByDayConfig(items);
  } else if (tipo === 'line') {
    config = buildLineConfig(items);
  } else {
    config = buildUserComparisonConfig(items);
  }

  if (STATE.chart) STATE.chart.destroy();
  STATE.chart = new Chart($('main-chart').getContext('2d'), config);
}

function buildDoughnutConfig(items) {
  const totals = {};
  APP_CONFIG.CATEGORIES.forEach(c => totals[c.nome] = 0);
  items.forEach(exp => {
    const cats = (exp.Categorie || '').split(',').map(s => s.trim()).filter(Boolean);
    const share = Number(exp.Importo) / (cats.length || 1);
    cats.forEach(nome => { totals[nome] = (totals[nome] || 0) + share; });
  });
  const labels = Object.keys(totals).filter(k => totals[k] > 0);
  const data = labels.map(l => Math.round(totals[l] * 100) / 100);
  const colors = labels.map(l => (APP_CONFIG.CATEGORIES.find(c => c.nome === l) || {}).colore || '#999');
  return {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0 }] },
    options: { plugins: { legend: { position: 'bottom' } }, maintainAspectRatio: false }
  };
}

function buildBarByDayConfig(items) {
  const byDay = {};
  items.forEach(exp => { const d = dateOnly(exp.Data); byDay[d] = (byDay[d] || 0) + Number(exp.Importo); });
  const labels = Object.keys(byDay).sort();
  const data = labels.map(l => Math.round(byDay[l] * 100) / 100);
  return {
    type: 'bar',
    data: { labels: labels.map(formatDateIt), datasets: [{ label: 'Spesa (€)', data, backgroundColor: '#1F6F63' }] },
    options: { plugins: { legend: { display: false } }, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
  };
}

function buildLineConfig(items) {
  const byDay = {};
  items.forEach(exp => { const d = dateOnly(exp.Data); byDay[d] = (byDay[d] || 0) + Number(exp.Importo); });
  const labels = Object.keys(byDay).sort();
  let running = 0;
  const data = labels.map(l => { running += byDay[l]; return Math.round(running * 100) / 100; });
  return {
    type: 'line',
    data: { labels: labels.map(formatDateIt), datasets: [{ label: 'Totale cumulato (€)', data, borderColor: '#1F6F63', backgroundColor: 'rgba(31,111,99,0.12)', fill: true, tension: 0.25 }] },
    options: { plugins: { legend: { display: false } }, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
  };
}

function buildUserComparisonConfig(items) {
  const totals = {};
  APP_CONFIG.USERS.forEach(u => totals[u.id] = 0);
  items.forEach(exp => {
    totals[APP_CONFIG.USERS[0].id] += Number(exp.ImportoUtente1) || 0;
    totals[APP_CONFIG.USERS[1].id] += Number(exp.ImportoUtente2) || 0;
  });
  const labels = APP_CONFIG.USERS.map(u => u.nome);
  const data = APP_CONFIG.USERS.map(u => Math.round(totals[u.id] * 100) / 100);
  const colors = APP_CONFIG.USERS.map(u => u.colore);
  return {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Quota di competenza (€)', data, backgroundColor: colors }] },
    options: { plugins: { legend: { display: false } }, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
  };
}

// ===================== BILANCIO =====================

function renderBalance() {
  const [u1, u2] = APP_CONFIG.USERS;
  let paid1 = 0, paid2 = 0, share1 = 0, share2 = 0;

  STATE.expenses.forEach(exp => {
    const importo = Number(exp.Importo) || 0;
    if (exp.PagatoDa === u1.id) paid1 += importo;
    if (exp.PagatoDa === u2.id) paid2 += importo;
    share1 += Number(exp.ImportoUtente1) || 0;
    share2 += Number(exp.ImportoUtente2) || 0;
  });

  $('bal-name-1').textContent = u1.nome;
  $('bal-name-2').textContent = u2.nome;
  $('bal-paid-1').textContent = '€' + paid1.toFixed(2);
  $('bal-paid-2').textContent = '€' + paid2.toFixed(2);
  $('bal-share-1').textContent = '€' + share1.toFixed(2);
  $('bal-share-2').textContent = '€' + share2.toFixed(2);

  const balance1 = paid1 - share1;
  const resultEl = $('balance-result');
  const textEl = $('balance-text');

  if (Math.abs(balance1) < 0.01) {
    textEl.textContent = 'Siete in pari, nessuno deve nulla all\'altro.';
  } else if (balance1 > 0) {
    textEl.textContent = `${u2.nome} deve ${balance1.toFixed(2)} € a ${u1.nome}`;
  } else {
    textEl.textContent = `${u1.nome} deve ${Math.abs(balance1).toFixed(2)} € a ${u2.nome}`;
  }
  resultEl.style.background = Math.abs(balance1) < 0.01 ? 'var(--success-soft)' : 'var(--primary-soft)';
}

// ===================== PWA =====================

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }
}
