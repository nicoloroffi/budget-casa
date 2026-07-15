/**
 * BUDGET CASA - Backend Google Apps Script
 * -----------------------------------------
 * Questo script va incollato nell'editor di Apps Script collegato
 * al tuo Google Sheet (Estensioni > Apps Script). Legge e scrive
 * le spese direttamente sul foglio "Spese" e controlla che chi
 * chiama l'app sia una delle due persone autorizzate.
 *
 * CONFIGURAZIONE OBBLIGATORIA: modifica le costanti qui sotto.
 */

const ALLOWED_EMAILS = [
  'roffinicolo@gmail.com',        // <-- Utente 1
  'greta.milino@gmail.com'    // <-- Utente 2
];

const GOOGLE_CLIENT_ID = '972317357128-d28ns4cgat4jbhrno3qp8tlkfsg5mk9k.apps.googleusercontent.com';

const SHEET_NAME = 'Spese';
const CONFIG_SHEET_NAME = 'Config';
const SETTLEMENTS_SHEET_NAME = 'Saldamenti';

const EXPENSE_HEADERS = [
  'ID', 'Data', 'Nome', 'Categorie', 'PagatoDa',
  'Importo', 'Percentuale1', 'Percentuale2',
  'ImportoUtente1', 'ImportoUtente2',
  'CreatoIl', 'ModificatoIl', 'ModificatoDa', 'Note'
];

const SETTLEMENT_HEADERS = ['ID', 'Data', 'DaUtente', 'AUtente', 'Importo', 'Nota', 'CreatoIl', 'CreatoDa'];

// ===================== ENTRY POINT =====================

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  let responseBody;
  try {
    const params = e.parameter || {};
    let body = {};
    if (e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }
    const action = body.action || params.action;
    const idToken = body.idToken || params.idToken;

    const email = verifyToken(idToken);
    if (!email) {
      responseBody = { error: 'Non autorizzato. Effettua di nuovo il login.' };
      return jsonResponse(responseBody);
    }

    let data;
    switch (action) {
      case 'list':
        data = listExpenses();
        break;
      case 'add':
        data = addExpense(body, email);
        break;
      case 'update':
        data = updateExpense(body, email);
        break;
      case 'delete':
        data = deleteExpense(body);
        break;
      case 'getBudget':
        data = getBudgetConfig();
        break;
      case 'setBudget':
        data = setBudgetConfig(body);
        break;
      case 'listSettlements':
        data = listSettlements();
        break;
      case 'addSettlement':
        data = addSettlement(body, email);
        break;
      case 'deleteSettlement':
        data = deleteSettlement(body);
        break;
      default:
        responseBody = { error: 'Azione non valida: ' + action };
        return jsonResponse(responseBody);
    }
    responseBody = { data: data, requestedBy: email };
  } catch (err) {
    responseBody = { error: err.message };
  }
  return jsonResponse(responseBody);
}

// ===================== AUTENTICAZIONE =====================

function verifyToken(idToken) {
  if (!idToken) return null;
  try {
    const resp = UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
      { muteHttpExceptions: true }
    );
    if (resp.getResponseCode() !== 200) return null;
    const data = JSON.parse(resp.getContentText());
    if (data.aud !== GOOGLE_CLIENT_ID) return null;
    if (data.email_verified !== 'true' && data.email_verified !== true) return null;
    if (ALLOWED_EMAILS.indexOf(data.email) === -1) return null;
    return data.email;
  } catch (err) {
    return null;
  }
}

// ===================== ACCESSO AI FOGLI =====================

function getOrCreateSheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  if (sheet.getLastRow() === 0 && headers) {
    sheet.appendRow(headers);
  }
  return sheet;
}

function getSheet_() {
  return getOrCreateSheet_(SHEET_NAME, EXPENSE_HEADERS);
}

function getSettlementsSheet_() {
  return getOrCreateSheet_(SETTLEMENTS_SHEET_NAME, SETTLEMENT_HEADERS);
}

function getConfigSheet_() {
  return getOrCreateSheet_(CONFIG_SHEET_NAME, ['Chiave', 'Valore']);
}

// ===================== OPERAZIONI SPESE =====================

function listExpenses() {
  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();
  const headers = values.shift();
  return values
    .filter(function (row) { return row[0]; })
    .map(function (row) { return rowToObject_(headers, row); });
}

function rowToObject_(headers, row) {
  const obj = {};
  headers.forEach(function (h, i) {
    let val = row[i];
    if (val instanceof Date) {
      val = Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    } else if (h === 'Data' && typeof val === 'string' && val.indexOf('T') !== -1) {
      val = val.slice(0, 10);
    }
    obj[h] = val;
  });
  return obj;
}

function addExpense(body, email) {
  const sheet = getSheet_();
  const id = Utilities.getUuid();
  const now = new Date();
  const importo = parseFloat(body.importo);
  const perc1 = clampPercent_(body.percentuale1);
  const perc2 = 100 - perc1;

  sheet.appendRow([
    id,
    body.data,
    body.nome,
    (body.categorie || []).join(', '),
    body.pagatoDa,
    importo,
    perc1,
    perc2,
    round2_(importo * perc1 / 100),
    round2_(importo * perc2 / 100),
    now,
    now,
    email,
    body.note || ''
  ]);
  return { id: id };
}

function updateExpense(body, email) {
  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idCol = headers.indexOf('ID');
  const creatoIlCol = headers.indexOf('CreatoIl');

  for (let i = 1; i < values.length; i++) {
    if (values[i][idCol] === body.id) {
      const rowIndex = i + 1;
      const importo = parseFloat(body.importo);
      const perc1 = clampPercent_(body.percentuale1);
      const perc2 = 100 - perc1;

      sheet.getRange(rowIndex, 1, 1, headers.length).setValues([[
        body.id,
        body.data,
        body.nome,
        (body.categorie || []).join(', '),
        body.pagatoDa,
        importo,
        perc1,
        perc2,
        round2_(importo * perc1 / 100),
        round2_(importo * perc2 / 100),
        values[i][creatoIlCol],
        new Date(),
        email,
        body.note || ''
      ]]);
      return { updated: true };
    }
  }
  throw new Error('Spesa non trovata');
}

function deleteExpense(body) {
  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();
  const idCol = values[0].indexOf('ID');
  for (let i = 1; i < values.length; i++) {
    if (values[i][idCol] === body.id) {
      sheet.deleteRow(i + 1);
      return { deleted: true };
    }
  }
  throw new Error('Spesa non trovata');
}

// ===================== BUDGET & SOGLIA (nel foglio Config) =====================

function getBudgetConfig() {
  const sheet = getConfigSheet_();
  const values = sheet.getDataRange().getValues();
  const config = { budget: {}, sogliaAvviso: null };
  values.forEach(function (row) {
    const key = row[0];
    const val = row[1];
    if (!key) return;
    if (String(key).indexOf('budget_') === 0) {
      config.budget[String(key).replace('budget_', '')] = parseFloat(val) || 0;
    } else if (key === 'sogliaAvviso') {
      config.sogliaAvviso = parseFloat(val) || 0;
    }
  });
  return config;
}

function setBudgetConfig(body) {
  const sheet = getConfigSheet_();
  const budget = body.budget || {};
  Object.keys(budget).forEach(function (catId) {
    upsertConfigValue_(sheet, 'budget_' + catId, budget[catId]);
  });
  if (body.sogliaAvviso !== undefined && body.sogliaAvviso !== null) {
    upsertConfigValue_(sheet, 'sogliaAvviso', body.sogliaAvviso);
  }
  return { saved: true };
}

function upsertConfigValue_(sheet, key, value) {
  const values = sheet.getDataRange().getValues();
  for (let i = 0; i < values.length; i++) {
    if (values[i][0] === key) {
      sheet.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  sheet.appendRow([key, value]);
}

// ===================== SALDAMENTI =====================

function listSettlements() {
  const sheet = getSettlementsSheet_();
  const values = sheet.getDataRange().getValues();
  const headers = values.shift();
  return values
    .filter(function (row) { return row[0]; })
    .map(function (row) { return rowToObject_(headers, row); });
}

function addSettlement(body, email) {
  const sheet = getSettlementsSheet_();
  const id = Utilities.getUuid();
  const now = new Date();
  sheet.appendRow([
    id,
    body.data,
    body.daUtente,
    body.aUtente,
    parseFloat(body.importo),
    body.nota || '',
    now,
    email
  ]);
  return { id: id };
}

function deleteSettlement(body) {
  const sheet = getSettlementsSheet_();
  const values = sheet.getDataRange().getValues();
  const idCol = values[0].indexOf('ID');
  for (let i = 1; i < values.length; i++) {
    if (values[i][idCol] === body.id) {
      sheet.deleteRow(i + 1);
      return { deleted: true };
    }
  }
  throw new Error('Saldamento non trovato');
}

// ===================== HELPERS =====================

function clampPercent_(p) {
  let n = parseFloat(p);
  if (isNaN(n)) n = 50;
  if (n < 0) n = 0;
  if (n > 100) n = 100;
  return n;
}

function round2_(n) {
  return Math.round(n * 100) / 100;
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
