/**
 * BUDGET CASA - Logica applicazione (frontend)
 */

let STATE = {
  idToken: null,
  currentUserEmail: null,
  expenses: [],
  settlements: [],
  categories: [],
  budgetConfig: { budget: {}, sogliaAvviso: 0 },
  editingId: null,
  chart: null,
  older: null,      // totali delle spese piu' vecchie non caricate
  partial: false    // true se l'elenco contiene solo gli ultimi mesi
};

const CACHE_KEY = 'bc_cache_v1';
const RECENT_MONTHS = 13;

const $ = (id) => document.getElementById(id);
const CATS = () => STATE.categories;

// ===================== CARICAMENTO LIBRERIE SOLO SE SERVONO =====================
// Chart.js e jsPDF sono pesanti e non servono ad ogni apertura dell'app:
// vengono scaricati solo la prima volta che servono davvero (grafici o export PDF),
// così l'apertura dell'app è più veloce.

const _libPromises = {};
function loadScriptOnce(url, checkFn) {
  if (checkFn()) return Promise.resolve();
  if (_libPromises[url]) return _libPromises[url];
  _libPromises[url] = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Impossibile caricare ' + url));
    document.head.appendChild(script);
  });
  return _libPromises[url];
}
function ensureChartJs() {
  return loadScriptOnce('https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js', () => !!window.Chart);
}
function ensureJsPdf() {
  return loadScriptOnce('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js', () => !!(window.jspdf && window.jspdf.jsPDF));
}

// ===================== AVVIO =====================

window.addEventListener('load', () => {
  const savedToken = sessionStorage.getItem('idToken');
  const savedEmail = sessionStorage.getItem('userEmail');
  initGoogleSignIn();
  setupThemeToggle();
  if (savedToken && savedEmail) {
    STATE.idToken = savedToken;
    STATE.currentUserEmail = savedEmail;
    enterApp();
  }
  registerServiceWorker();
});

// ===================== TEMA =====================

function setupThemeToggle() {
  const btn = $('theme-toggle-btn');
  updateThemeIcon();
  btn.addEventListener('click', () => {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateThemeIcon();
  });
}

function updateThemeIcon() {
  const isDark = document.documentElement.classList.contains('dark');
  $('theme-toggle-btn').textContent = isDark ? '☀️' : '🌙';
}

// ===================== LOGIN =====================

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

  if (_reloginPromise) {
    if (STATE.currentUserEmail && email.toLowerCase() !== STATE.currentUserEmail.toLowerCase()) {
      sessionStorage.setItem('idToken', idToken);
      sessionStorage.setItem('userEmail', email);
      location.reload();
      return;
    }
    STATE.idToken = idToken;
    sessionStorage.setItem('idToken', idToken);
    finishRelogin();
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

  const cached = loadCache(STATE.currentUserEmail);
  if (cached) {
    STATE.categories = cached.categories;
    STATE.expenses = cached.expenses;
    STATE.older = cached.older || null;
    STATE.partial = !!cached.partial;
    STATE.settlements = cached.settlements || [];
    STATE.budgetConfig = cached.budgetConfig || STATE.budgetConfig;
  } else {
    await refreshCategories();
  }

  setupTabs();
  setupCategoryChips();
  setupCategoryManagement();
  setupPayerToggle();
  setupSplitSlider();
  setupForm();
  setupFilters();
  setupSearchAndSort();
  setupExport();
  setupChartControls();
  setupBudgetTab();
  setupSettlementForm();
  setupLogout();
  setupFooter();

  if (cached) {
    // Mostra subito i dati salvati, poi aggiorna in background
    renderExpenseList();
    populateFilterOptions();
    renderSettlementList();
    renderBudgetTab();
    renderBalance();
    const oldCats = JSON.stringify(STATE.categories);
    await Promise.all([refreshCategories(), refreshExpenses(true), refreshBudgetConfig(), refreshSettlements()]);
    if (JSON.stringify(STATE.categories) !== oldCats) {
      renderCategoryList();
      setupCategoryChips();
      populateFilterOptions();
      renderExpenseList();
    }
    saveCache();
  } else {
    await Promise.all([refreshExpenses(), refreshBudgetConfig(), refreshSettlements()]);
  }
  renderBudgetTab();
  renderBalance();
}

function setupLogout() {
  $('logout-btn').addEventListener('click', () => {
    sessionStorage.clear();
    try { localStorage.removeItem(CACHE_KEY); } catch (e) {}
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
// L'app si apre sempre sulla scheda "Aggiungi", senza ricordare l'ultima
// scheda visitata: è la scheda usata più spesso e deve essere immediata.

function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => activateTab(btn.dataset.tab));
  });
  activateTab('aggiungi');
}

function activateTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  $('tab-' + tab).classList.add('active');
  if (tab === 'grafici') renderChart();
  if (tab === 'bilancio') renderBalance();
  if (tab === 'budget') renderBudgetTab();
}

// ===================== API =====================

// ----- Notifiche (toast) -----
function showToast(msg, type) {
  let t = $('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.className = 'toast ' + (type || 'info') + ' show';
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { t.classList.remove('show'); }, type === 'error' ? 7000 : 3500);
}

// ----- Sessione scaduta: chiede un nuovo login senza perdere quello che si sta facendo -----
let _reloginPromise = null;
let _reloginResolve = null;

function tokenExpired() {
  const p = parseJwt(STATE.idToken || '');
  return !p || !p.exp || p.exp * 1000 < Date.now() + 30000;
}

function requireRelogin() {
  if (_reloginPromise) return _reloginPromise;
  sessionStorage.removeItem('idToken');
  STATE.idToken = null;
  let banner = $('session-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'session-banner';
    banner.className = 'session-banner';
    banner.textContent = 'Sessione scaduta: tocca "Accedi" in alto per rientrare. Quello che stavi facendo non va perso.';
    document.body.appendChild(banner);
  }
  banner.hidden = false;
  $('logged-in-box').hidden = true;
  $('logged-out-box').hidden = false;
  try { if (window.google && google.accounts) google.accounts.id.prompt(); } catch (e) {}
  _reloginPromise = new Promise(resolve => { _reloginResolve = resolve; });
  return _reloginPromise;
}

function finishRelogin() {
  const banner = $('session-banner');
  if (banner) banner.hidden = true;
  $('logged-in-box').hidden = false;
  $('logged-out-box').hidden = true;
  const resolve = _reloginResolve;
  _reloginPromise = null;
  _reloginResolve = null;
  if (resolve) resolve();
}

// ----- Chiamate al backend -----
const API_TIMEOUT_MS = 25000;

async function apiCall(action, payload, _retried) {
  if (tokenExpired()) await requireRelogin();

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    const e = new Error('Sei offline. Controlla la connessione e riprova.');
    e.network = true;
    throw e;
  }

  const body = Object.assign({ action: action, idToken: STATE.idToken }, payload || {});
  const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), API_TIMEOUT_MS) : null;
  let res;
  try {
    res = await fetch(APP_CONFIG.APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      signal: ctrl ? ctrl.signal : undefined
    });
  } catch (err) {
    const e = new Error('Connessione assente o troppo lenta. Controlla la rete e riprova.');
    e.network = true;
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
  }

  let json;
  try {
    json = await res.json();
  } catch (err) {
    const e = new Error('Risposta non valida dal server. Riprova tra qualche secondo.');
    e.network = true;
    throw e;
  }
  if (json.error) {
    if (/non autorizzato/i.test(json.error) && !_retried) {
      await requireRelogin();
      return apiCall(action, payload, true);
    }
    throw new Error(json.error);
  }
  return json.data;
}

function newClientId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// ----- Cache locale: mostra subito gli ultimi dati, poi aggiorna in background -----
function saveCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      email: STATE.currentUserEmail,
      ts: Date.now(),
      expenses: STATE.expenses.filter(e => !e._pending),
      older: STATE.older,
      partial: STATE.partial,
      settlements: (STATE.settlements || []).filter(s => !s._pending),
      budgetConfig: STATE.budgetConfig,
      categories: STATE.categories
    }));
  } catch (e) {}
}

function loadCache(email) {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (!c || !email || String(c.email).toLowerCase() !== String(email).toLowerCase()) return null;
    if (!Array.isArray(c.expenses) || !Array.isArray(c.categories) || c.categories.length === 0) return null;
    return c;
  } catch (e) { return null; }
}

async function refreshCategories() {
  try {
    const data = await apiCall('getCategories');
    STATE.categories = (data && data.length) ? data : [];
  } catch (err) {
    console.error(err);
  }
}

async function refreshExpenses(silent) {
  if (!silent || STATE.expenses.length === 0) renderSkeletonList();
  try {
    const data = await apiCall('list', { mesi: RECENT_MONTHS });
    let items;
    if (Array.isArray(data)) {
      items = data; STATE.older = null; STATE.partial = false;
    } else {
      items = data.items || []; STATE.older = data.older || null; STATE.partial = !!data.partial;
    }
    // Mantiene le spese appena inserite non ancora confermate dal server
    const ids = new Set(items.map(e => e.ID));
    const pending = STATE.expenses.filter(e => e._pending && !ids.has(e.ID));
    STATE.expenses = items.concat(pending);
    saveCache();
  } catch (err) {
    console.error(err);
    if (STATE.expenses.length === 0) STATE.expenses = [];
    else showToast('Dati non aggiornati: ' + err.message, 'error');
  }
  renderExpenseList();
  populateFilterOptions();
}

async function loadAllExpenses() {
  const btn = $('load-all-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Caricamento…'; }
  try {
    const all = await apiCall('list');
    const ids = new Set(all.map(e => e.ID));
    const pending = STATE.expenses.filter(e => e._pending && !ids.has(e.ID));
    STATE.expenses = all.concat(pending);
    STATE.older = null;
    STATE.partial = false;
    saveCache();
    renderExpenseList();
    renderBalance();
  } catch (err) {
    showToast(err.message, 'error');
    renderExpenseList();
  }
}

function renderSkeletonList() {
  const list = $('expense-list');
  if (!list) return;
  let html = '';
  for (let i = 0; i < 4; i++) {
    html += `
      <div class="skeleton-item">
        <div class="skeleton-block skeleton-avatar"></div>
        <div class="skeleton-lines">
          <div class="skeleton-block skeleton-line w-60"></div>
          <div class="skeleton-block skeleton-line w-40"></div>
        </div>
        <div class="skeleton-block skeleton-amount"></div>
      </div>`;
  }
  list.innerHTML = html;
}

async function refreshBudgetConfig() {
  try {
    const data = await apiCall('getBudget');
    STATE.budgetConfig = data || { budget: {}, sogliaAvviso: 0 };
    saveCache();
  } catch (err) {
    console.error(err);
  }
}

async function refreshSettlements() {
  try {
    const data = await apiCall('listSettlements');
    const ids = new Set(data.map(x => x.ID));
    const pending = (STATE.settlements || []).filter(x => x._pending && !ids.has(x.ID));
    STATE.settlements = data.concat(pending);
    saveCache();
  } catch (err) {
    console.error(err);
    if (!STATE.settlements) STATE.settlements = [];
  }
  renderSettlementList();
}

// ===================== GESTIONE CATEGORIE =====================

function setupCategoryManagement() {
  renderCategoryList();
  $('add-category-btn').addEventListener('click', onAddCategory);
  $('new-cat-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); onAddCategory(); }
  });
}

function renderCategoryList() {
  const container = $('category-list');
  if (!container) return;
  if (CATS().length === 0) {
    container.innerHTML = '<p class="empty-state">Nessuna categoria ancora. Aggiungine una qui sotto.</p>';
    return;
  }
  container.innerHTML = '';
  CATS().forEach(cat => {
    const chip = document.createElement('div');
    chip.className = 'category-chip';
    chip.style.background = cat.colore;
    chip.innerHTML = `<span>${escapeHtml(cat.nome)}</span><button type="button" class="category-chip-remove" title="Elimina categoria">✕</button>`;
    chip.querySelector('.category-chip-remove').addEventListener('click', () => onDeleteCategory(cat));
    container.appendChild(chip);
  });
}

async function onAddCategory() {
  const nameInput = $('new-cat-name');
  const colorInput = $('new-cat-color');
  const nome = nameInput.value.trim();
  const msg = $('category-message');

  if (!nome) {
    msg.textContent = 'Inserisci un nome per la categoria.';
    msg.className = 'form-message error';
    msg.hidden = false;
    return;
  }
  if (CATS().some(c => c.nome.toLowerCase() === nome.toLowerCase())) {
    msg.textContent = 'Esiste già una categoria con questo nome.';
    msg.className = 'form-message error';
    msg.hidden = false;
    return;
  }

  try {
    const result = await apiCall('addCategory', { nome, colore: colorInput.value });
    STATE.categories.push({ id: result.id, nome, colore: colorInput.value });
    nameInput.value = '';
    renderCategoryList();
    setupCategoryChips();
    populateFilterOptions();
    renderBudgetTab();
    msg.textContent = 'Categoria aggiunta.';
    msg.className = 'form-message success';
    msg.hidden = false;
  } catch (err) {
    msg.textContent = 'Errore: ' + err.message;
    msg.className = 'form-message error';
    msg.hidden = false;
  }
}

async function onDeleteCategory(cat) {
  const inUse = STATE.expenses.some(exp => (exp.Categorie || '').split(',').map(s => s.trim()).includes(cat.id));
  const warning = inUse
    ? `La categoria "${cat.nome}" è usata in almeno una spesa esistente. Le spese non verranno eliminate, ma perderanno l'etichetta colorata per questa categoria. Continuare?`
    : `Eliminare la categoria "${cat.nome}"?`;
  const ok = await showConfirmDialog(warning);
  if (!ok) return;

  try {
    await apiCall('deleteCategory', { id: cat.id });
    STATE.categories = STATE.categories.filter(c => c.id !== cat.id);
    renderCategoryList();
    setupCategoryChips();
    populateFilterOptions();
    renderBudgetTab();
  } catch (err) {
    alert('Errore: ' + err.message);
  }
}

// ===================== FORM: CATEGORIE / PAGATO DA =====================

function setupCategoryChips() {
  const container = $('f-categorie');
  container.innerHTML = '';
  CATS().forEach(cat => {
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
  const submitLabel = $('submit-btn-label');
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
    percentuale1: parseInt($('f-perc1').value, 10),
    note: $('f-note').value.trim()
  };

  const isEditing = !!STATE.editingId;
  const editId = STATE.editingId;
  if (!isEditing) payload.clientId = newClientId();
  const localId = isEditing ? editId : payload.clientId;
  const local = buildLocalExpense(payload, localId);
  let backup = null;

  // Aggiornamento ottimistico: la spesa compare subito, il salvataggio avviene in background
  if (isEditing) {
    const idx = STATE.expenses.findIndex(x => x.ID === editId);
    if (idx !== -1) {
      backup = STATE.expenses[idx];
      STATE.expenses[idx] = Object.assign({}, backup, local, { _pending: true });
    }
  } else {
    STATE.expenses.unshift(local);
  }
  resetForm();
  showFormMessage(isEditing ? 'Spesa aggiornata.' : 'Spesa salvata.', 'success');
  renderExpenseList();
  renderBalance();
  renderBudgetTab();

  apiCall(isEditing ? 'update' : 'add', payload).then(async () => {
    const cur = STATE.expenses.find(x => x.ID === localId);
    if (cur) delete cur._pending;
    await refreshExpenses(true);
    renderBalance();
    renderBudgetTab();
  }).catch(err => {
    // Annulla la modifica locale e rimette i dati nel modulo per riprovare
    if (isEditing) {
      const idx = STATE.expenses.findIndex(x => x.ID === editId);
      if (idx !== -1 && backup) STATE.expenses[idx] = backup;
    } else {
      STATE.expenses = STATE.expenses.filter(x => x.ID !== localId);
    }
    renderExpenseList();
    renderBalance();
    renderBudgetTab();
    fillExpenseForm(local, isEditing);
    STATE.editingId = isEditing ? editId : null;
    showFormMessage('Spesa NON salvata: ' + err.message + ' I dati sono di nuovo nel modulo: premi di nuovo Salva.', 'error');
    showToast('Spesa non salvata: ' + err.message, 'error');
    activateTab('aggiungi');
  });
}

function buildLocalExpense(payload, id) {
  const importo = parseFloat(payload.importo) || 0;
  const perc1 = Math.max(0, Math.min(100, Number(payload.percentuale1) || 0));
  const perc2 = 100 - perc1;
  const r2 = (n) => Math.round(n * 100) / 100;
  return {
    ID: id,
    Data: payload.data,
    Nome: payload.nome,
    Categorie: (payload.categorie || []).join(', '),
    PagatoDa: payload.pagatoDa,
    Importo: importo,
    Percentuale1: perc1,
    Percentuale2: perc2,
    ImportoUtente1: r2(importo * perc1 / 100),
    ImportoUtente2: r2(importo * perc2 / 100),
    Note: payload.note || '',
    _pending: true
  };
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
  $('f-note').value = '';
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
  $('submit-btn-label').textContent = 'Salva spesa';
  $('cancel-edit-btn').hidden = true;
}

function editExpense(id) {
  const exp = STATE.expenses.find(e => e.ID === id);
  if (!exp || exp._pending) return;
  STATE.editingId = id;
  fillExpenseForm(exp, true);
  activateTab('aggiungi');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function fillExpenseForm(exp, editing) {

  $('f-data').value = dateOnly(exp.Data);
  $('f-nome').value = exp.Nome;
  $('f-importo').value = exp.Importo;
  $('f-note').value = exp.Note || '';

  const categorieIds = (exp.Categorie || '').split(',').map(s => s.trim()).filter(Boolean);
  document.querySelectorAll('#f-categorie .chip').forEach(chip => {
    const selected = categorieIds.includes(chip.dataset.id);
    chip.classList.toggle('selected', selected);
    const cat = CATS().find(c => c.id === chip.dataset.id);
    chip.style.background = selected && cat ? cat.colore : '';
    chip.style.borderColor = selected && cat ? cat.colore : '';
  });

  document.querySelectorAll('#f-pagato-da .payer-btn').forEach(btn => {
    const selected = btn.dataset.id === exp.PagatoDa;
    btn.classList.toggle('selected', selected);
    const user = APP_CONFIG.USERS.find(u => u.id === btn.dataset.id);
    btn.style.background = selected ? user.colore : '';
  });

  $('f-perc1').value = exp.Percentuale1;
  updateSplitDisplay();

  $('form-title').textContent = editing ? 'Modifica spesa' : 'Nuova spesa';
  $('submit-btn-label').textContent = editing ? 'Aggiorna spesa' : 'Salva spesa';
  $('cancel-edit-btn').hidden = !editing;
}

async function removeExpense(id) {
  const target = STATE.expenses.find(e => e.ID === id);
  if (!target || target._pending) return;
  const ok = await showConfirmDialog('Eliminare questa spesa? L\'operazione non è reversibile.');
  if (!ok) return;
  const idx = STATE.expenses.findIndex(e => e.ID === id);
  STATE.expenses.splice(idx, 1);
  renderExpenseList();
  renderBalance();
  renderBudgetTab();
  try {
    await apiCall('delete', { id });
    saveCache();
  } catch (err) {
    STATE.expenses.splice(Math.min(idx, STATE.expenses.length), 0, target);
    renderExpenseList();
    renderBalance();
    renderBudgetTab();
    showToast('Spesa non eliminata: ' + err.message, 'error');
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

function setupSearchAndSort() {
  $('search-input').addEventListener('input', renderExpenseList);
  $('sort-select').addEventListener('change', renderExpenseList);
}

function populateFilterOptions() {
  const catSelect = $('filter-categoria');
  const chartCatSelect = $('chart-categoria');
  const currentCatVal = catSelect.value;
  catSelect.innerHTML = '<option value="">Tutte le categorie</option>';
  chartCatSelect.innerHTML = '<option value="">Totale generale</option>';
  CATS().forEach(cat => {
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

function getFilteredExpenses() {
  const catFilter = $('filter-categoria').value;
  const payFilter = $('filter-pagatoDa').value;
  const search = $('search-input').value.trim().toLowerCase();
  const sort = $('sort-select').value;

  let items = [...STATE.expenses];

  if (catFilter) {
    items = items.filter(e => (e.Categorie || '').split(',').map(s => s.trim()).includes(catFilter));
  }
  if (payFilter) {
    items = items.filter(e => e.PagatoDa === payFilter);
  }
  if (search) {
    items = items.filter(e =>
      (e.Nome || '').toLowerCase().includes(search) ||
      (e.Note || '').toLowerCase().includes(search)
    );
  }

  items.sort((a, b) => {
    if (sort === 'data-asc') return dateOnly(a.Data) < dateOnly(b.Data) ? -1 : 1;
    if (sort === 'data-desc') return dateOnly(a.Data) < dateOnly(b.Data) ? 1 : -1;
    if (sort === 'importo-asc') return Number(a.Importo) - Number(b.Importo);
    if (sort === 'importo-desc') return Number(b.Importo) - Number(a.Importo);
    return 0;
  });

  return items;
}

function renderExpenseList() {
  const list = $('expense-list');
  renderLoadAllButton();
  const items = getFilteredExpenses();

  const total = items.reduce((sum, e) => sum + (Number(e.Importo) || 0), 0);
  $('list-total').textContent = 'Totale: €' + total.toFixed(2) + ' (' + items.length + (items.length === 1 ? ' spesa' : ' spese') + ')';

  if (items.length === 0) {
    const hasFilters = $('search-input').value.trim() || $('filter-categoria').value || $('filter-pagatoDa').value;
    list.innerHTML = hasFilters
      ? `<div class="empty-state-rich">
           <div class="empty-state-icon">🔍</div>
           <div class="empty-state-title">Nessun risultato</div>
           <div class="empty-state-sub">Prova a modificare la ricerca o i filtri attivi.</div>
         </div>`
      : `<div class="empty-state-rich">
           <div class="empty-state-icon">🧾</div>
           <div class="empty-state-title">Ancora nessuna spesa</div>
           <div class="empty-state-sub">Aggiungine una dalla scheda "Aggiungi" per iniziare.</div>
         </div>`;
    return;
  }

  list.innerHTML = '';
  items.forEach(exp => {
    const payer = APP_CONFIG.USERS.find(u => u.id === exp.PagatoDa);
    const tags = (exp.Categorie || '').split(',').map(s => s.trim()).filter(Boolean).map(catId => {
      const cat = CATS().find(c => c.id === catId) || { colore: '#999', nome: catId };
      return `<span class="tag" style="background:${cat.colore}">${escapeHtml(cat.nome)}</span>`;
    }).join('');
    const noteHtml = exp.Note ? `<div class="expense-note">📝 ${escapeHtml(exp.Note)}</div>` : '';

    const div = document.createElement('div');
    div.className = 'expense-item' + (exp._pending ? ' pending' : '');
    div.innerHTML = `
      <div class="expense-payer-badge" style="background:${payer ? payer.colore : '#999'}">${payer ? payer.nome.charAt(0).toUpperCase() : '?'}</div>
      <div class="expense-main">
        <div class="expense-name">${escapeHtml(exp.Nome)}</div>
        <div class="expense-meta">${formatDateIt(exp.Data)} · pagato da ${payer ? payer.nome : exp.PagatoDa} · ${exp.Percentuale1}% / ${exp.Percentuale2}%</div>
        <div class="expense-tags">${tags}</div>
        ${noteHtml}
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

function renderLoadAllButton() {
  const list = $('expense-list');
  let wrap = $('load-all-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'load-all-wrap';
    wrap.className = 'load-all-wrap';
    list.parentNode.insertBefore(wrap, list.nextSibling);
  }
  if (STATE.partial && STATE.older) {
    wrap.innerHTML = `<p class="empty-state">Sono mostrate le spese degli ultimi ${RECENT_MONTHS} mesi (il bilancio include anche le ${STATE.older.count} più vecchie).</p><button type="button" class="btn-ghost" id="load-all-btn">Carica tutto lo storico</button>`;
    $('load-all-btn').addEventListener('click', loadAllExpenses);
  } else {
    wrap.innerHTML = '';
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

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

// ===================== EXPORT PDF =====================

function setupExport() {
  $('export-pdf-btn').addEventListener('click', exportPdf);
}

async function exportPdf() {
  const btn = $('export-pdf-btn');
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-spinner"></span> Preparazione…';

  try {
    await ensureJsPdf();
  } catch (err) {
    alert('Impossibile caricare il modulo di esportazione PDF. Controlla la connessione e riprova.');
    btn.disabled = false;
    btn.innerHTML = originalHtml;
    return;
  }

  const da = $('export-da').value;
  const a = $('export-a').value;
  let items = getFilteredExpenses();

  if (da) items = items.filter(e => dateOnly(e.Data) >= da);
  if (a) items = items.filter(e => dateOnly(e.Data) <= a);

  if (items.length === 0) {
    alert('Nessuna spesa corrisponde ai filtri selezionati.');
    btn.disabled = false;
    btn.innerHTML = originalHtml;
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const total = items.reduce((sum, e) => sum + (Number(e.Importo) || 0), 0);

  doc.setFontSize(16);
  doc.text('Budget Casa - Riepilogo spese', 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(100);
  const periodo = (da || a) ? `Periodo: ${da ? formatDateIt(da) : '…'} - ${a ? formatDateIt(a) : '…'}` : 'Tutte le date';
  doc.text(periodo + `  ·  Generato il ${formatDateIt(todayISO())}`, 14, 25);

  let y = 36;
  doc.setFontSize(9);
  doc.setTextColor(255);
  doc.setFillColor(31, 111, 99);
  doc.rect(14, y - 5, 182, 7, 'F');
  doc.text('Data', 16, y);
  doc.text('Nome', 40, y);
  doc.text('Categorie', 100, y);
  doc.text('Pagato da', 145, y);
  doc.text('Importo', 178, y);
  y += 8;

  doc.setTextColor(30);
  items.forEach((exp, idx) => {
    if (y > 275) {
      doc.addPage();
      y = 20;
    }
    if (idx % 2 === 0) {
      doc.setFillColor(245, 247, 245);
      doc.rect(14, y - 5, 182, 7, 'F');
    }
    const payer = APP_CONFIG.USERS.find(u => u.id === exp.PagatoDa);
    const catNames = (exp.Categorie || '').split(',').map(s => s.trim()).filter(Boolean)
      .map(catId => (CATS().find(c => c.id === catId) || {}).nome || catId)
      .join(', ');
    doc.text(formatDateIt(exp.Data), 16, y);
    doc.text(truncateText(exp.Nome, 32), 40, y);
    doc.text(truncateText(catNames, 24), 100, y);
    doc.text(payer ? payer.nome : (exp.PagatoDa || ''), 145, y);
    doc.text('€' + Number(exp.Importo).toFixed(2), 178, y);
    y += 7;
  });

  y += 4;
  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.text('Totale: €' + total.toFixed(2), 145, y);

  doc.save('budget-casa-export.pdf');

  btn.disabled = false;
  btn.innerHTML = originalHtml;
}

function truncateText(str, max) {
  str = String(str || '');
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
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
  $('chart-mesi').addEventListener('change', renderChart);
  $('chart-tipo').addEventListener('change', () => {
    updateChartControlsVisibility();
    renderChart();
  });
  updateChartControlsVisibility();
}

function updateChartControlsVisibility() {
  const tipo = $('chart-tipo').value;
  const isSpecial = tipo === 'confronto-mesi' || tipo === 'media-categorie';
  $('periodo-wrap').hidden = isSpecial;
  $('categoria-wrap').hidden = isSpecial;
  $('custom-range').hidden = isSpecial || $('chart-periodo').value !== 'personalizzato';
  $('mesi-indietro-wrap').hidden = tipo !== 'media-categorie';
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

async function renderChart() {
  try {
    await ensureChartJs();
  } catch (err) {
    $('chart-empty').textContent = 'Impossibile caricare il modulo grafici. Controlla la connessione.';
    $('chart-empty').hidden = false;
    return;
  }
  $('chart-empty').textContent = 'Nessuna spesa nel periodo selezionato.';

  const tipo = $('chart-tipo').value;

  if (tipo === 'confronto-mesi') {
    return renderMonthComparisonChart();
  }
  if (tipo === 'media-categorie') {
    return renderCategoryAverageChart();
  }

  const { start, end } = getChartDateRange();
  const catFilter = $('chart-categoria').value;

  let items = STATE.expenses.filter(e => {
    const d = dateOnly(e.Data);
    return d >= start && d <= end;
  });
  if (catFilter) {
    items = items.filter(e => (e.Categorie || '').split(',').map(s => s.trim()).includes(catFilter));
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
  CATS().forEach(c => totals[c.id] = 0);
  items.forEach(exp => {
    const cats = (exp.Categorie || '').split(',').map(s => s.trim()).filter(Boolean);
    const share = Number(exp.Importo) / (cats.length || 1);
    cats.forEach(catId => { if (totals[catId] !== undefined) totals[catId] += share; });
  });
  const catIds = Object.keys(totals).filter(k => totals[k] > 0);
  const labels = catIds.map(id => (CATS().find(c => c.id === id) || {}).nome || id);
  const data = catIds.map(id => Math.round(totals[id] * 100) / 100);
  const colors = catIds.map(id => (CATS().find(c => c.id === id) || {}).colore || '#999');
  return {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0 }] },
    options: { plugins: { legend: { position: 'bottom', labels: { color: chartTextColor() } } }, maintainAspectRatio: false }
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
    options: chartOptionsWithAxes()
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
    options: chartOptionsWithAxes()
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
    options: { ...chartOptionsWithAxes(), plugins: { legend: { display: false } } }
  };
}

function renderMonthComparisonChart() {
  const now = new Date();
  const curStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevEnd = new Date(now.getFullYear(), now.getMonth(), 0);

  const curTotals = {}, prevTotals = {};
  CATS().forEach(c => { curTotals[c.id] = 0; prevTotals[c.id] = 0; });

  STATE.expenses.forEach(exp => {
    const d = new Date(dateOnly(exp.Data));
    const cats = (exp.Categorie || '').split(',').map(s => s.trim()).filter(Boolean);
    const share = Number(exp.Importo) / (cats.length || 1);
    if (d >= curStart && d <= now) {
      cats.forEach(catId => { if (curTotals[catId] !== undefined) curTotals[catId] += share; });
    } else if (d >= prevStart && d <= prevEnd) {
      cats.forEach(catId => { if (prevTotals[catId] !== undefined) prevTotals[catId] += share; });
    }
  });

  const labels = CATS().map(c => c.nome);
  const dataCur = CATS().map(c => Math.round(curTotals[c.id] * 100) / 100);
  const dataPrev = CATS().map(c => Math.round(prevTotals[c.id] * 100) / 100);

  const hasData = dataCur.some(v => v > 0) || dataPrev.some(v => v > 0);
  $('chart-empty').hidden = hasData;
  if (!hasData) {
    if (STATE.chart) { STATE.chart.destroy(); STATE.chart = null; }
    return;
  }

  const config = {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Mese corrente', data: dataCur, backgroundColor: '#1F6F63' },
        { label: 'Mese precedente', data: dataPrev, backgroundColor: '#B7C4C0' }
      ]
    },
    options: chartOptionsWithAxes()
  };

  if (STATE.chart) STATE.chart.destroy();
  STATE.chart = new Chart($('main-chart').getContext('2d'), config);
}

function renderCategoryAverageChart() {
  const monthsBack = parseInt($('chart-mesi').value, 10) || 3;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - monthsBack + 1, 1);

  const totals = {};
  CATS().forEach(c => totals[c.id] = 0);

  STATE.expenses.forEach(exp => {
    const d = new Date(dateOnly(exp.Data));
    if (d < start || d > now) return;
    const cats = (exp.Categorie || '').split(',').map(s => s.trim()).filter(Boolean);
    const share = Number(exp.Importo) / (cats.length || 1);
    cats.forEach(catId => { if (totals[catId] !== undefined) totals[catId] += share; });
  });

  const labels = CATS().map(c => c.nome);
  const data = CATS().map(c => Math.round((totals[c.id] / monthsBack) * 100) / 100);
  const colors = CATS().map(c => c.colore);

  const hasData = data.some(v => v > 0);
  $('chart-empty').hidden = hasData;
  if (!hasData) {
    if (STATE.chart) { STATE.chart.destroy(); STATE.chart = null; }
    return;
  }

  const config = {
    type: 'bar',
    data: { labels, datasets: [{ label: `Media mensile ultimi ${monthsBack} mesi (€)`, data, backgroundColor: colors }] },
    options: { ...chartOptionsWithAxes(), plugins: { legend: { display: false } } }
  };

  if (STATE.chart) STATE.chart.destroy();
  STATE.chart = new Chart($('main-chart').getContext('2d'), config);
}

function chartTextColor() {
  return document.documentElement.classList.contains('dark') ? '#D7DBD8' : '#262B29';
}

function chartOptionsWithAxes() {
  const color = chartTextColor();
  return {
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color } } },
    scales: {
      y: { beginAtZero: true, ticks: { color }, grid: { color: 'rgba(128,128,128,0.15)' } },
      x: { ticks: { color }, grid: { color: 'rgba(128,128,128,0.08)' } }
    }
  };
}

// ===================== BUDGET =====================

function setupBudgetTab() {
  $('save-budget-btn').addEventListener('click', saveBudget);
  $('save-soglia-btn').addEventListener('click', saveSoglia);
}

function renderBudgetTab() {
  const container = $('budget-list');
  container.innerHTML = '';

  const now = new Date();
  const curStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const speseMese = {};
  CATS().forEach(c => speseMese[c.id] = 0);
  STATE.expenses.forEach(exp => {
    const d = new Date(dateOnly(exp.Data));
    if (d < curStart || d > now) return;
    const cats = (exp.Categorie || '').split(',').map(s => s.trim()).filter(Boolean);
    const share = Number(exp.Importo) / (cats.length || 1);
    cats.forEach(catId => { if (speseMese[catId] !== undefined) speseMese[catId] += share; });
  });

  CATS().forEach(cat => {
    const budget = (STATE.budgetConfig.budget && STATE.budgetConfig.budget[cat.id]) || 0;
    const speso = speseMese[cat.id] || 0;
    const pct = budget > 0 ? Math.min(100, Math.round((speso / budget) * 100)) : 0;
    const over = budget > 0 && speso > budget;

    const row = document.createElement('div');
    row.className = 'budget-row' + (over ? ' budget-row-over' : '');
    row.innerHTML = `
      <div class="budget-row-top">
        <span class="budget-cat-dot" style="background:${cat.colore}"></span>
        <span class="budget-cat-name">${cat.nome}</span>
        ${over ? '<span class="budget-over-badge">Superato</span>' : ''}
        <span class="budget-amount ${over ? 'budget-over' : ''}">€${speso.toFixed(2)} ${budget > 0 ? '/ €' + budget.toFixed(2) : ''}</span>
      </div>
      <div class="budget-bar-track">
        <div class="budget-bar-fill ${over ? 'budget-over-fill' : ''}" style="width:${pct}%; background:${over ? 'var(--danger)' : cat.colore}"></div>
      </div>
      <input type="number" class="budget-input" data-cat="${cat.id}" min="0" step="1" placeholder="Budget mensile €" value="${budget > 0 ? budget : ''}" />
    `;
    container.appendChild(row);
  });

  $('soglia-input').value = STATE.budgetConfig.sogliaAvviso || '';
}

async function saveBudget() {
  const inputs = document.querySelectorAll('.budget-input');
  const budget = {};
  inputs.forEach(inp => {
    const val = parseFloat(inp.value);
    if (!isNaN(val) && val > 0) budget[inp.dataset.cat] = val;
  });
  const msg = $('budget-message');
  try {
    await apiCall('setBudget', { budget });
    STATE.budgetConfig.budget = budget;
    msg.textContent = 'Budget salvato.';
    msg.className = 'form-message success';
    msg.hidden = false;
    renderBudgetTab();
  } catch (err) {
    msg.textContent = 'Errore: ' + err.message;
    msg.className = 'form-message error';
    msg.hidden = false;
  }
}

async function saveSoglia() {
  const val = parseFloat($('soglia-input').value) || 0;
  const msg = $('budget-message');
  try {
    await apiCall('setBudget', { sogliaAvviso: val });
    STATE.budgetConfig.sogliaAvviso = val;
    msg.textContent = 'Soglia salvata.';
    msg.className = 'form-message success';
    msg.hidden = false;
  } catch (err) {
    msg.textContent = 'Errore: ' + err.message;
    msg.className = 'form-message error';
    msg.hidden = false;
  }
}

// ===================== SALDAMENTI =====================

function setupSettlementForm() {
  const container = $('s-da');
  container.innerHTML = '';
  APP_CONFIG.USERS.forEach((user, idx) => {
    const btn = document.createElement('div');
    btn.className = 'payer-btn';
    btn.textContent = user.nome;
    btn.dataset.id = user.id;
    if (idx === 1) { btn.classList.add('selected'); btn.style.background = user.colore; }
    btn.addEventListener('click', () => {
      container.querySelectorAll('.payer-btn').forEach(b => { b.classList.remove('selected'); b.style.background = ''; });
      btn.classList.add('selected');
      btn.style.background = user.colore;
    });
    container.appendChild(btn);
  });

  $('open-settlement-btn').addEventListener('click', openSettlementForm);
  $('cancel-settlement-btn').addEventListener('click', closeSettlementForm);
  $('settlement-form').addEventListener('submit', onSubmitSettlement);
}

function openSettlementForm() {
  const bal = computeBalance();
  const container = $('s-da');
  const suggestedPayer = bal.balance1 > 0 ? APP_CONFIG.USERS[1] : APP_CONFIG.USERS[0];
  container.querySelectorAll('.payer-btn').forEach(b => {
    const selected = b.dataset.id === suggestedPayer.id;
    b.classList.toggle('selected', selected);
    b.style.background = selected ? suggestedPayer.colore : '';
  });
  $('s-importo').value = Math.abs(bal.balance1).toFixed(2);
  $('s-data').value = todayISO();
  $('s-nota').value = '';
  $('settlement-form').hidden = false;
  $('open-settlement-btn').hidden = true;
}

function closeSettlementForm() {
  $('settlement-form').hidden = true;
  $('open-settlement-btn').hidden = false;
}

async function onSubmitSettlement(e) {
  e.preventDefault();
  const daBtn = document.querySelector('#s-da .payer-btn.selected');
  if (!daBtn) return showToast('Seleziona chi paga.', 'error');
  const daUtente = daBtn.dataset.id;
  const aUtente = APP_CONFIG.USERS.find(u => u.id !== daUtente).id;
  const importo = parseFloat(String($('s-importo').value).replace(',', '.'));
  if (!importo || importo <= 0) return showToast('Inserisci un importo valido.', 'error');

  const clientId = newClientId();
  const payload = { daUtente, aUtente, importo, data: $('s-data').value, nota: $('s-nota').value.trim(), clientId };
  const local = { ID: clientId, Data: payload.data, DaUtente: daUtente, AUtente: aUtente, Importo: importo, Nota: payload.nota, _pending: true };

  // Aggiornamento ottimistico: saldo e storico cambiano subito
  STATE.settlements = (STATE.settlements || []).concat([local]);
  closeSettlementForm();
  renderSettlementList();
  renderBalance();

  try {
    await apiCall('addSettlement', payload);
    delete local._pending;
    await refreshSettlements();
    renderBalance();
  } catch (err) {
    STATE.settlements = STATE.settlements.filter(x => x.ID !== clientId);
    renderSettlementList();
    renderBalance();
    showToast('Saldamento NON registrato: ' + err.message, 'error');
  }
}

async function removeSettlement(id) {
  const target = (STATE.settlements || []).find(x => x.ID === id);
  if (!target || target._pending) return;
  const ok = await showConfirmDialog('Eliminare questo saldamento?');
  if (!ok) return;
  const idx = STATE.settlements.findIndex(x => x.ID === id);
  STATE.settlements.splice(idx, 1);
  renderSettlementList();
  renderBalance();
  try {
    await apiCall('deleteSettlement', { id });
    saveCache();
  } catch (err) {
    STATE.settlements.splice(Math.min(idx, STATE.settlements.length), 0, target);
    renderSettlementList();
    renderBalance();
    showToast('Saldamento non eliminato: ' + err.message, 'error');
  }
}

function renderSettlementList() {
  const list = $('settlement-list');
  if (!STATE.settlements || STATE.settlements.length === 0) {
    list.innerHTML = `<div class="empty-state-rich">
      <div class="empty-state-icon">💶</div>
      <div class="empty-state-title">Nessun saldamento ancora</div>
      <div class="empty-state-sub">Quando uno dei due paga l'altro per pareggiare i conti, registralo qui sopra.</div>
    </div>`;
    return;
  }
  const items = [...STATE.settlements].sort((a, b) => dateOnly(a.Data) < dateOnly(b.Data) ? 1 : -1);
  list.innerHTML = '';
  items.forEach(s => {
    const da = APP_CONFIG.USERS.find(u => u.id === s.DaUtente);
    const a = APP_CONFIG.USERS.find(u => u.id === s.AUtente);
    const div = document.createElement('div');
    div.className = 'settlement-item';
    div.innerHTML = `
      <div class="settlement-main">
        <div class="settlement-line"><strong>${da ? da.nome : s.DaUtente}</strong> → <strong>${a ? a.nome : s.AUtente}</strong></div>
        <div class="expense-meta">${formatDateIt(s.Data)}${s.Nota ? ' · ' + escapeHtml(s.Nota) : ''}</div>
      </div>
      <div class="expense-right">
        <div class="expense-amount">€${toNum(s.Importo).toFixed(2)}</div>
        <button class="icon-btn" title="Elimina" data-action="delete">🗑</button>
      </div>
    `;
    div.querySelector('[data-action="delete"]').addEventListener('click', () => removeSettlement(s.ID));
    list.appendChild(div);
  });
}

// ===================== BILANCIO =====================

function toNum(v) {
  const n = parseFloat(String(v == null ? '' : v).replace(',', '.'));
  return isFinite(n) ? n : 0;
}

function computeBalance() {
  const [u1, u2] = APP_CONFIG.USERS;
  let paid1 = 0, paid2 = 0, share1 = 0, share2 = 0;

  STATE.expenses.forEach(exp => {
    const importo = Number(exp.Importo) || 0;
    if (exp.PagatoDa === u1.id) paid1 += importo;
    if (exp.PagatoDa === u2.id) paid2 += importo;
    share1 += Number(exp.ImportoUtente1) || 0;
    share2 += Number(exp.ImportoUtente2) || 0;
  });

  if (STATE.older) {
    paid1 += Number(STATE.older.paid && STATE.older.paid[u1.id]) || 0;
    paid2 += Number(STATE.older.paid && STATE.older.paid[u2.id]) || 0;
    share1 += Number(STATE.older.share1) || 0;
    share2 += Number(STATE.older.share2) || 0;
  }
  let balance1 = paid1 - share1;
  (STATE.settlements || []).forEach(s => {
    const importo = toNum(s.Importo);
    if (s.DaUtente === u2.id && s.AUtente === u1.id) balance1 -= importo;
    else if (s.DaUtente === u1.id && s.AUtente === u2.id) balance1 += importo;
  });

  return { paid1, paid2, share1, share2, balance1 };
}

function renderBalance() {
  const [u1, u2] = APP_CONFIG.USERS;
  const bal = computeBalance();

  $('bal-name-1').textContent = u1.nome;
  $('bal-name-2').textContent = u2.nome;
  $('bal-paid-1').textContent = '€' + bal.paid1.toFixed(2);
  $('bal-paid-2').textContent = '€' + bal.paid2.toFixed(2);
  $('bal-share-1').textContent = '€' + bal.share1.toFixed(2);
  $('bal-share-2').textContent = '€' + bal.share2.toFixed(2);

  const resultEl = $('balance-result');
  const textEl = $('balance-text');
  const balance1 = bal.balance1;

  if (Math.abs(balance1) < 0.01) {
    textEl.textContent = 'Siete in pari, nessuno deve nulla all\'altro.';
  } else if (balance1 > 0) {
    textEl.textContent = `${u2.nome} deve ${balance1.toFixed(2)} € a ${u1.nome}`;
  } else {
    textEl.textContent = `${u1.nome} deve ${Math.abs(balance1).toFixed(2)} € a ${u2.nome}`;
  }
  resultEl.style.background = Math.abs(balance1) < 0.01 ? 'var(--success-soft)' : 'var(--primary-soft)';

  const soglia = STATE.budgetConfig.sogliaAvviso || 0;
  const alertEl = $('soglia-alert');
  if (soglia > 0 && Math.abs(balance1) > soglia) {
    alertEl.textContent = `⚠️ Il saldo ha superato la soglia di avviso (€${soglia.toFixed(2)}). Potrebbe essere il momento di saldare.`;
    alertEl.hidden = false;
  } else {
    alertEl.hidden = true;
  }
}

// ===================== DIALOGO DI CONFERMA =====================

function showConfirmDialog(message) {
  return new Promise((resolve) => {
    const overlay = $('confirm-overlay');
    const okBtn = $('confirm-ok-btn');
    const cancelBtn = $('confirm-cancel-btn');
    $('confirm-message').textContent = message;
    overlay.hidden = false;

    function cleanup(result) {
      overlay.hidden = true;
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      overlay.removeEventListener('click', onOverlayClick);
      resolve(result);
    }
    function onOk() { cleanup(true); }
    function onCancel() { cleanup(false); }
    function onOverlayClick(e) { if (e.target === overlay) cleanup(false); }

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    overlay.addEventListener('click', onOverlayClick);
  });
}

// ===================== PWA =====================

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }
}
