/**
 * CONFIGURAZIONE BUDGET CASA
 * --------------------------
 * Questo è l'UNICO file che devi modificare per collegare l'app
 * al tuo Google Sheet e al tuo login Google.
 *
 * Le categorie di spesa NON sono più qui: si gestiscono direttamente
 * dentro l'app, nella scheda "Budget" (sezione "Categorie"), e sono
 * salvate nel foglio "Categorie" del tuo Google Sheet.
 */

const APP_CONFIG = {
  APPS_SCRIPT_URL: 'INSERISCI_QUI_URL_APPS_SCRIPT',
  GOOGLE_CLIENT_ID: 'INSERISCI_QUI_IL_TUO_CLIENT_ID.apps.googleusercontent.com',

  USERS: [
    { id: 'utente1', nome: 'Nicolò', email: 'roffinicolo@gmail.com', colore: '#3D7EAA' },
    { id: 'utente2', nome: 'Greta', email: 'greta.milino@gmail.com', colore: '#E07B9A' }
  ]
};
