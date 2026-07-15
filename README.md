# Budget Casa

App web per gestire le spese di casa, con Google Sheet come database,
login Google e grafici personalizzabili. Gratis, sempre online, installabile
come app su iPhone e Mac.

**Come funziona:** il frontend (le pagine che vedi) sta su GitHub Pages, i
dati stanno su un tuo Google Sheet, e in mezzo c'è uno script gratuito
(Google Apps Script) che fa da "postino" tra i due, controllando che ad
accedere siate solo tu e la tua compagna.

Tempo stimato per l'installazione: 30-40 minuti, da fare una sola volta.

---

## 1. Crea il Google Sheet (il database)

1. Vai su [sheets.google.com](https://sheets.google.com) e crea un nuovo foglio, chiamalo ad es. **Budget Casa**.
2. Rinomina il primo foglio in basso da "Foglio1" a **Spese** (doppio click sulla scheda).
3. Nella riga 1 del foglio "Spese" scrivi queste intestazioni, una per colonna (da A a M):
   ```
   ID | Data | Nome | Categorie | PagatoDa | Importo | Percentuale1 | Percentuale2 | ImportoUtente1 | ImportoUtente2 | CreatoIl | ModificatoIl | ModificatoDa
   ```
4. Crea un secondo foglio (tasto **+** in basso) e chiamalo **Config**. Non è obbligatorio compilarlo, l'app funziona anche senza, ma puoi lasciarlo vuoto.

Tieni aperta questa scheda, ti servirà tra un minuto.

---

## 2. Crea le credenziali di Google Sign-In

Servono per far sì che solo tu e la tua compagna possiate accedere.

1. Vai su [console.cloud.google.com](https://console.cloud.google.com) e crea un nuovo progetto (in alto a sinistra > "Nuovo progetto"), chiamalo ad es. "Budget Casa".
2. Nel menu a sinistra vai su **API e servizi > Schermata consenso OAuth**.
   - Tipo utente: **Esterno**.
   - Compila nome app ("Budget Casa"), la tua email, e salva.
   - Nella sezione "Utenti di prova" aggiungi le email Google tue e della tua compagna.
3. Vai su **API e servizi > Credenziali > Crea credenziali > ID client OAuth**.
   - Tipo applicazione: **Applicazione web**.
   - Nome: "Budget Casa Web".
   - Per ora lascia vuoti gli "Origini JavaScript autorizzate" (li aggiungiamo dopo, quando avrai l'indirizzo definitivo dell'app).
   - Clicca Crea. Copia il **Client ID** che appare (finisce con `.apps.googleusercontent.com`): ti servirà tra poco.

---

## 3. Collega lo script al Google Sheet

1. Torna sul tuo Google Sheet, vai su **Estensioni > Apps Script**.
2. Cancella il codice di esempio e incolla tutto il contenuto del file [`apps-script/Code.gs`](apps-script/Code.gs) di questo repository.
3. In cima al file trovi queste righe da modificare con i tuoi dati:
   ```javascript
   const ALLOWED_EMAILS = [
     'tuaemail@gmail.com',
     'emailcompagna@gmail.com'
   ];
   const GOOGLE_CLIENT_ID = 'INSERISCI_QUI_IL_TUO_CLIENT_ID.apps.googleusercontent.com';
   ```
   Inserisci le vostre due email Google reali e il Client ID copiato al punto 2.
4. Salva (icona del dischetto).
5. Clicca **Esegui > handleRequest** una prima volta per autorizzare lo script ad accedere al foglio (Google ti chiederà dei permessi, accetta — comparirà un avviso "app non verificata", clicca su "Avanzate" > "Vai a Budget Casa (non sicuro)", è normale per gli script personali).
6. Clicca **Deploy > Nuovo deployment**.
   - Tipo: **App web**.
   - Esegui come: **Me**.
   - Chi ha accesso: **Chiunque**.
   - Clicca **Esegui il deployment**.
7. Copia l'**URL dell'app web** che ti viene mostrato (finisce con `/exec`): ti serve tra poco.

> Se in futuro modifichi il codice dello script, dovrai creare un **Nuovo deployment** (o gestire le versioni da "Deploy > Gestisci deployment") perché le modifiche siano effettive.

---

## 4. Configura il frontend

1. Scarica/clona questo repository sul tuo computer.
2. Apri il file `frontend/js/config.js` con un editor di testo qualsiasi.
3. Sostituisci i valori segnaposto:
   ```javascript
   const APP_CONFIG = {
     APPS_SCRIPT_URL: 'https://script.google.com/macros/s/XXXXX/exec', // URL copiato al punto 3.7
     GOOGLE_CLIENT_ID: 'XXXXX.apps.googleusercontent.com',             // Client ID del punto 2

     USERS: [
       { id: 'utente1', nome: 'Nicolò', email: 'tuaemail@gmail.com', colore: '#3D7EAA' },
       { id: 'utente2', nome: 'Nome compagna', email: 'emailcompagna@gmail.com', colore: '#E07B9A' }
     ],
     // Le categorie sono già pronte, modificale solo se vuoi cambiarle
     CATEGORIES: [ ... ]
   };
   ```
4. Salva il file.

---

## 5. Metti il codice su GitHub

1. Crea un nuovo repository su [github.com](https://github.com) (puoi tenerlo privato).
2. Dal terminale, nella cartella del progetto:
   ```bash
   git init
   git add .
   git commit -m "Prima versione Budget Casa"
   git branch -M main
   git remote add origin https://github.com/TUO-UTENTE/TUO-REPO.git
   git push -u origin main
   ```
3. Vai nelle impostazioni del repository su GitHub: **Settings > Pages**.
   - Source: **Deploy from a branch**.
   - Branch: **main**, cartella **/frontend** (se GitHub non offre la sottocartella, vedi nota sotto).
   - Salva.
4. Dopo 1-2 minuti GitHub ti mostrerà l'indirizzo pubblico, tipo:
   `https://tuo-utente.github.io/tuo-repo/`

> **Nota:** se GitHub Pages non ti permette di scegliere la sottocartella `/frontend`, la soluzione più semplice è spostare tutto il contenuto della cartella `frontend/` nella radice del repository (e cancellare la cartella `frontend` vuota), così la root del repo coincide con il sito. La cartella `apps-script/` può restare dov'è, non viene pubblicata (contiene solo codice da incollare su Google, non serve online).

---

## 6. Ultimo collegamento: autorizza l'indirizzo pubblico

1. Torna su [console.cloud.google.com](https://console.cloud.google.com) > Credenziali > apri il tuo "ID client OAuth".
2. In **Origini JavaScript autorizzate** aggiungi l'indirizzo di GitHub Pages ottenuto al punto 5.4, ad esempio:
   `https://tuo-utente.github.io`
3. Salva.

Ora apri l'indirizzo di GitHub Pages nel browser: dovresti vedere la schermata di login con il pulsante "Accedi con Google". Prova ad accedere con una delle due email autorizzate: se tutto è collegato correttamente, entri nell'app.

---

## 7. Installa l'app su iPhone

1. Apri l'indirizzo dell'app in **Safari** (deve essere Safari, non Chrome, per questa funzione).
2. Tocca l'icona **Condividi** (il quadrato con la freccia verso l'alto).
3. Scorri e tocca **Aggiungi alla schermata Home**.
4. Conferma: comparirà un'icona nella home, si apre a schermo intero come un'app vera.

## 8. Installa l'app su Mac

1. Apri l'indirizzo dell'app in **Safari** o **Chrome**.
2. Su Safari: menu **File > Aggiungi al Dock**.
   Su Chrome: clicca i tre puntini in alto a destra > **Salva e condividi > Installa app** (o l'icona di installazione nella barra degli indirizzi).
3. L'app comparirà come applicazione a sé stante, apribile dal Dock/Launchpad.

---

## Come si usa

- **Aggiungi**: inserisci data, nome, una o più categorie, importo, chi ha pagato e la percentuale di ripartizione tra voi due (es. 70% / 30%). Lo slider mostra in tempo reale quanto tocca a ciascuno.
- **Elenco**: vedi tutte le spese, filtrabili per categoria o per chi ha pagato. Ogni spesa è modificabile o eliminabile in qualsiasi momento (l'icona ✎).
- **Grafici**: scegli il periodo (settimana corrente, mese corrente, o un intervallo di date a tua scelta), una categoria specifica o il totale generale, e il tipo di grafico (torta per categoria, barre per giorno, andamento cumulato, confronto tra i due utenti).
- **Bilancio**: mostra, ad oggi, quanto ciascuno ha effettivamente pagato rispetto a quanto gli sarebbe spettato in base alle percentuali scelte spesa per spesa, e quindi chi deve dei soldi a chi.

## Note

- Tutti i dati restano sul vostro Google Sheet: potete aprirlo e leggerlo/modificarlo anche direttamente da lì in qualsiasi momento.
- Il codice è vostro al 100%: potete spostarlo, modificarlo, ospitarlo altrove (non solo GitHub Pages) semplicemente ricaricando la cartella `frontend/` dove preferite.
- L'accesso è limitato solo alle email indicate in `ALLOWED_EMAILS` (nello script) e in `USERS` (nel frontend): chiunque altro provi ad accedere viene respinto.
- Google Apps Script ha un limite generoso ma non infinito di richieste giornaliere gratuite (ampiamente sufficiente per un uso familiare); se un giorno lo superate (uso molto intenso), lo script torna disponibile il giorno dopo.
