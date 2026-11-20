# LectureNote

App per l'università da installare su un **tablet Android** (PWA da Chrome): registra le lezioni, abbina slide e appunti (testo e penna) alla timeline dell'audio, trascrive e **traduce in tempo reale cinese→italiano e inglese→italiano**. L'utente studia in Cina: i servizi Google (Gemini, Web Speech) richiedono la VPN, quindi ogni servizio esterno passa da un provider intercambiabile.

## Stack
Vite + React 19 + TypeScript · Dexie (IndexedDB) + `dexie-react-hooks` · `vite-plugin-pwa` (offline, installabile).
Da aggiungere solo quando serve la funzionalità: `pdfjs-dist` (slide), `perfect-freehand` (penna).
Niente backend e niente Supabase: i dati restano sul tablet, backup = export/import di un file.

## Comandi
- `npm run dev`: server locale (http://localhost:5173)
- `npm run build`: type-check + build di produzione (da eseguire prima di dire "fatto")
- `npm run lint`: oxlint
- `npm run test`: test automatici (vitest) delle parti di logica pura (`*.test.ts` accanto al file)
- Prova sul tablet: collegarlo con USB, poi in Chrome sul PC `chrome://inspect` → Port forwarding `5173 → localhost:5173`. Il microfono funziona solo su `localhost` o HTTPS, NON su `http://192.168.x.x`.
- **App pubblicata**: https://papaleoluca6-rgb.github.io/lecturenote/ (repository pubblico `papaleoluca6-rgb/lecturenote`). Ogni push su `main` la ricompila e la pubblica (`.github/workflows/pages.yml`, `BASE_PATH=/lecturenote/`). Online c'è solo il codice: i dati restano sul tablet. Repository pubblico = mai chiavi, dati personali o file delle lezioni nei commit.
- Prova sul tablet senza cavo, con il server di sviluppo: `npm run dev:tablet` sul PC, tablet sulla stessa rete (meglio hotspot), e in Chrome del tablet `chrome://flags/#unsafely-treat-insecure-origin-as-secure` con `http://<IP-del-PC>:5173` per sbloccare il microfono.

## Struttura
```
src/
  app/            shell, navigazione tra schermate
  db/schema.ts    UNICO modello dati (tabelle Dexie + tipi). Cambi schema = nuova db.version(n)
  lib/            utility condivise tra feature (time.ts, ai.ts, http.ts, Icon.tsx, useBlobUrl.ts, …)
  styles/         global.css con i token di design (variabili CSS)
  features/
    library/        corsi e lezioni: lista, ricerca, eliminazione
    recording/      MediaRecorder, Wake Lock, pausa, segmenti audio multipli
    translation/    traduttore live zh/en→it: live/ (sottotitoli nella lezione), probe/ (prova tecnica)
    slides/         import PDF/immagini, viewer, aggancio slide↔tempo
    ink/            scrittura a mano vettoriale con pressione, su pagina bianca o su slide
    notes/          note di testo con timestamp, foto
    study/          riassunti AI, flashcard, domande d'esame, riascolto da un punto
    settings/       chiavi API e scelta provider (salvate in db.settings, MAI nel codice)
    backup/         export/import di tutto il database
legacy/           vecchia app a file unico (solo riferimento, NON modificare, NON leggere tutta: ~58k token)
docs/ROADMAP.md   funzionalità in ordine e stato
```

## Regole
- **Regola principale: tutto quello che l'app usa deve essere gratuito.** Niente servizi a pagamento né a consumo; prima si preferisce ciò che gira sul tablet (API di Chrome offline), poi servizi gratuiti. **L'app deve funzionare del tutto senza chiavi API:** le AI esterne sono solo un'aggiunta facoltativa (l'utente può inserire la sua chiave nelle impostazioni), mai essenziali e mai default.
- Ogni funzionalità vive nella sua cartella `features/<nome>/`. Si importa da altre feature solo tramite `db/` o `lib/`.
- File piccoli (meglio < 200 righe): componenti in `*.tsx`, logica in `*.ts`.
- Una sola timeline: ogni nota, tratto, slide agganciata, frase trascritta o tradotta ha `ts` in secondi dall'inizio della lezione.
- Audio e immagini come `Blob` in IndexedDB, mai base64.
- Chiavi API solo nelle impostazioni dell'app, mai scritte nel codice né nei commit.
- UI in italiano, pensata per il touch e la penna: tap target ≥ 44px, layout per tablet sia orizzontale sia verticale.
- Colori e misure solo tramite le variabili di `styles/global.css`; bottoni con `.ui-btn`, icone con `lib/Icon.tsx` (mai emoji).

## Come lavoriamo (risparmio token)
- **Sub-agenti ogni volta che è possibile e conviene**: ricerche nel codice, bug indipendenti tra loro, revisione delle modifiche, verifiche (build, test nel browser) vanno a sub-agenti, anche in parallelo; il lavoro che tocca gli stessi file resta in un solo agente.
- **Una sessione per funzionalità** della roadmap; alla fine aggiornare lo stato in `docs/ROADMAP.md`.
- `/compact` quando la conversazione si allunga.
- Effort basso per modifiche semplici (testi, stile, piccoli fix); effort alto solo per registrazione, penna e traduttore live.
- Leggere solo i file della feature su cui si lavora + `db/schema.ts`. Da `legacy/` usare grep mirati, mai letture intere.
