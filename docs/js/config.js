/**
 * CONFIGURAZIONE BUDGET CASA
 * --------------------------
 * Questo è l'UNICO file che devi modificare per collegare l'app
 * al tuo Google Sheet e al tuo login Google.
 */

const APP_CONFIG = {
  APPS_SCRIPT_URL: 'INSERISCI_QUI_URL_APPS_SCRIPT',
  GOOGLE_CLIENT_ID: 'INSERISCI_QUI_IL_TUO_CLIENT_ID.apps.googleusercontent.com',

  USERS: [
    { id: 'utente1', nome: 'Nicolò', email: 'roffinicolo@gmail.com', colore: '#3D7EAA' },
    { id: 'utente2', nome: 'Greta', email: 'greta.milino@gmail.com', colore: '#E07B9A' }
  ],

  CATEGORIES: [
    { id: 'bollette', nome: 'Bollette', colore: '#4A7B9D' },
    { id: 'fibra', nome: 'Fibra', colore: '#6FA8A0' },
    { id: 'alimentare', nome: 'Alimentare', colore: '#8FBF6E' },
    { id: 'ristorante', nome: 'Ristorante', colore: '#E0A458' },
    { id: 'casa', nome: 'Casa', colore: '#B98BC9' },
    { id: 'shopping', nome: 'Shopping', colore: '#E07B9A' },
    { id: 'viaggi', nome: 'Viaggi', colore: '#5C6BC0' }
  ]
};
