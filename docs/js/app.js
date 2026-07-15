/**
 * BUDGET CASA - Logica applicazione (frontend) - v2
 */

let STATE = {
  idToken: null,
  currentUserEmail: null,
  expenses: [],
  settlements: [],
  budgetConfig: { budget: {}, sogliaAvviso: 0 },
  editingId: null,
  chart: null
};

const $ = (id) => document.getElementById(id);

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
  setupSearchAndSort();
  setupExport();
  setupChartControls();
  setupBudgetTab();
  setupSettlementForm();
  setupLogout();
  setupFooter();

  await Promise.all([refreshExpenses(), refreshBudgetConfig(), refreshSettlements()]);
  renderBudgetTab();
  renderBalance();
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
  if (tab === 'budget') renderBudgetTab();
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
  renderSkeletonList();
  try {
    STATE.expenses = await apiCall('list');
  } catch (err) {
    STATE.expenses = [];
    console.error(err);
  }
  renderExpenseList();
  populateFilterOptions();
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
  } catch (err) {
    console.error(err);
  }
}

async function refreshSettlements() {
  try {
    STATE.settlements = await apiCall('listSettlements');
  } catch (err) {
    STATE.settlements = [];
    console.error(err);
  }
  renderSettlementList();
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
    percentuale1: parseInt($('f-perc1').value, 10),
    note: $('f-note').value.trim()
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
  $('f-note').value = exp.Note || '';

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

  activateTab('aggiungi');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function removeExpense(id) {
  const ok = await showConfirmDialog('Eliminare questa spesa? L\'operazione non è reversibile.');
  if (!ok) return;
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
      const cat = APP_CONFIG.CATEGORIES.find(c => c.id === catId) || { colore: '#999', nome: catId };
      return `<span class="tag" style="background:${cat.colore}">${cat.nome}</span>`;
    }).join('');
    const noteHtml = exp.Note ? `<div class="expense-note">📝 ${escapeHtml(exp.Note)}</div>` : '';

    const div = document.createElement('div');
    div.className = 'expense-item';
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

function exportPdf() {
  const da = $('export-da').value;
  const a = $('export-a').value;
  let items = getFilteredExpenses();

  if (da) items = items.filter(e => dateOnly(e.Data) >= da);
  if (a) items = items.filter(e => dateOnly(e.Data) <= a);

  if (items.length === 0) {
    alert('Nessuna spesa corrisponde ai filtri selezionati.');
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
      .map(catId => (APP_CONFIG.CATEGORIES.find(c => c.id === catId) || {}).nome || catId)
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

function renderChart() {
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
  APP_CONFIG.CATEGORIES.forEach(c => totals[c.id] = 0);
  items.forEach(exp => {
    const cats = (exp.Categorie || '').split(',').map(s => s.trim()).filter(Boolean);
    const share = Number(exp.Importo) / (cats.length || 1);
    cats.forEach(catId => { if (totals[catId] !== undefined) totals[catId] += share; });
  });
  const catIds = Object.keys(totals).filter(k => totals[k] > 0);
  const labels = catIds.map(id => (APP_CONFIG.CATEGORIES.find(c => c.id === id) || {}).nome || id);
  const data = catIds.map(id => Math.round(totals[id] * 100) / 100);
  const colors = catIds.map(id => (APP_CONFIG.CATEGORIES.find(c => c.id === id) || {}).colore || '#999');
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
  APP_CONFIG.CATEGORIES.forEach(c => { curTotals[c.id] = 0; prevTotals[c.id] = 0; });

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

  const labels = APP_CONFIG.CATEGORIES.map(c => c.nome);
  const dataCur = APP_CONFIG.CATEGORIES.map(c => Math.round(curTotals[c.id] * 100) / 100);
  const dataPrev = APP_CONFIG.CATEGORIES.map(c => Math.round(prevTotals[c.id] * 100) / 100);

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
  APP_CONFIG.CATEGORIES.forEach(c => totals[c.id] = 0);

  STATE.expenses.forEach(exp => {
    const d = new Date(dateOnly(exp.Data));
    if (d < start || d > now) return;
    const cats = (exp.Categorie || '').split(',').map(s => s.trim()).filter(Boolean);
    const share = Number(exp.Importo) / (cats.length || 1);
    cats.forEach(catId => { if (totals[catId] !== undefined) totals[catId] += share; });
  });

  const labels = APP_CONFIG.CATEGORIES.map(c => c.nome);
  const data = APP_CONFIG.CATEGORIES.map(c => Math.round((totals[c.id] / monthsBack) * 100) / 100);
  const colors = APP_CONFIG.CATEGORIES.map(c => c.colore);

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
  APP_CONFIG.CATEGORIES.forEach(c => speseMese[c.id] = 0);
  STATE.expenses.forEach(exp => {
    const d = new Date(dateOnly(exp.Data));
    if (d < curStart || d > now) return;
    const cats = (exp.Categorie || '').split(',').map(s => s.trim()).filter(Boolean);
    const share = Number(exp.Importo) / (cats.length || 1);
    cats.forEach(catId => { if (speseMese[catId] !== undefined) speseMese[catId] += share; });
  });

  APP_CONFIG.CATEGORIES.forEach(cat => {
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
  if (!daBtn) return alert('Seleziona chi paga.');
  const daUtente = daBtn.dataset.id;
  const aUtente = APP_CONFIG.USERS.find(u => u.id !== daUtente).id;
  const importo = parseFloat($('s-importo').value);
  if (!importo || importo <= 0) return alert('Inserisci un importo valido.');

  try {
    await apiCall('addSettlement', {
      daUtente, aUtente, importo,
      data: $('s-data').value,
      nota: $('s-nota').value.trim()
    });
    closeSettlementForm();
    await refreshSettlements();
    renderBalance();
  } catch (err) {
    alert('Errore: ' + err.message);
  }
}

async function removeSettlement(id) {
  const ok = await showConfirmDialog('Eliminare questo saldamento?');
  if (!ok) return;
  try {
    await apiCall('deleteSettlement', { id });
    await refreshSettlements();
    renderBalance();
  } catch (err) {
    alert('Errore: ' + err.message);
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
        <div class="expense-amount">€${Number(s.Importo).toFixed(2)}</div>
        <button class="icon-btn" title="Elimina" data-action="delete">🗑</button>
      </div>
    `;
    div.querySelector('[data-action="delete"]').addEventListener('click', () => removeSettlement(s.ID));
    list.appendChild(div);
  });
}

// ===================== BILANCIO =====================

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

  let balance1 = paid1 - share1;
  (STATE.settlements || []).forEach(s => {
    const importo = Number(s.Importo) || 0;
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
