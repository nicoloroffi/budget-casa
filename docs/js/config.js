/**
 * CONFIGURAZIONE BUDGET CASA
 * --------------------------
 * Questo è l'UNICO file che devi modificare per collegare l'app
 * al tuo Google Sheet e al tuo login Google. Segui il README.
 */

const APP_CONFIG = {
  // URL del Web App di Google Apps Script (lo ottieni dopo il deploy, vedi README)
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbyKdjZKDLPYgoEa8ueiyVL5ShooPJSAIAIPmKB5O7iWmHnA_Ykr3_Z0mlrg3K_y4TXOEA/exec',

  // Client ID OAuth di Google (lo ottieni da Google Cloud Console, vedi README)
  GOOGLE_CLIENT_ID: '972317357128-d28ns4cgat4jbhrno3qp8tlkfsg5mk9k.apps.googleusercontent.com',

  // I due utenti dell'app. "email" deve corrispondere esattamente
  // all'account Google con cui la persona farà login.
  USERS: [
    { id: 'utente1', nome: 'Tu', email: 'roffinicolo@gmail.com', colore: '#3D7EAA' },
    { id: 'utente2', nome: 'La tua compagna', email: 'greta.milino@gmail.com', colore: '#E07B9A' }
  ],

  // Categorie di spesa disponibili
  CATEGORIES: [
    { id: 'bollette', nome: 'Bollette', colore: '#4A7B9D' },
    { id: 'fibra', nome: 'Fibra', colore: '#6FA8A0' },
    { id: 'alimentare', nome: 'Alimentare', colore: '#8FBF6E' },
    { id: 'ristorante', nome: 'Ristorante', colore: '#E0A458' },
    { id: 'casa', nome: 'Casa', colore: '#B98BC9' },
    { id: 'shopping', nome: 'Shopping', colore: '#E07B9A' }
  ]
};
