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
  'tuaemail@gmail.com',        // <-- Utente 1
  'emailcompagna@gmail.com'    // <-- Utente 2
];

const GOOGLE_CLIENT_ID = 'INSERISCI_QUI_IL_TUO_CLIENT_ID.apps.googleusercontent.com';

const SHEET_NAME = 'Spese';
const CONFIG_SHEET_NAME = 'Config';

const EXPENSE_HEADERS = [
  'ID', 'Data', 'Nome', 'Categorie', 'PagatoDa',
  'Importo', 'Percentuale1', 'Percentuale2',
  'ImportoUtente1', 'ImportoUtente2',
  'CreatoIl', 'ModificatoIl', 'ModificatoDa'
];

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
      case 'config':
        data = getConfig();
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

// ===================== ACCESSO AL FOGLIO =====================

function getSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Foglio "' + SHEET_NAME + '" non trovato');
  return sheet;
}

function ensureHeaders_() {
  const sheet = getSheet_();
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(EXPENSE_HEADERS);
  }
}

// ===================== OPERAZIONI SPESE =====================

function listExpenses() {
  ensureHeaders_();
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
    }
    obj[h] = val;
  });
  return obj;
}

function addExpense(body, email) {
  ensureHeaders_();
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
    email
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
        email
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

// ===================== CONFIGURAZIONE =====================

function getConfig() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG_SHEET_NAME);
  if (!sheet) return {};
  const values = sheet.getDataRange().getValues();
  const config = {};
  values.forEach(function (row) {
    if (row[0]) config[row[0]] = row[1];
  });
  return config;
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
