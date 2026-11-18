# Roadmap LectureNote

Una riga = una sessione di lavoro. Stato: ⬜ da fare · 🟨 in corso · ✅ fatto

| # | Funzionalità | Cartella | Effort | Stato |
|---|---|---|---|---|
| 0 | Struttura progetto, schema DB, CLAUDE.md | — | basso | ✅ |
| 1 | Libreria: corsi, lezioni, ricerca, elimina | `library/` | basso | ✅ |
| 2 | Registrazione: Wake Lock, pausa, segmenti multipli, recupero dopo crash | `recording/` | alto | ✅ |
| 3 | **Prova tecnica traduttore** (vedi sotto) | `translation/` | alto | 🟨 |
| 4 | Traduttore live zh/en→it con sottotitoli | `translation/live/` | alto | 🟨 |
| 5 | Slide: import PDF/immagini, viewer, aggancio al tempo | `slides/` | medio | ✅ |
| 6 | Penna: tratti vettoriali con pressione, palm rejection, su slide e pagine bianche | `ink/` | alto | ✅ |
| 7 | Note di testo e foto con timestamp | `notes/` | basso | ✅ |
| 8 | Ripasso: riascolto da nota/slide/frase, riassunto AI, flashcard | `study/` | medio | ✅ |
| 9 | Impostazioni: chiavi API, scelta provider | `settings/` | basso | ✅ |
| 10 | Backup: export/import di tutto, import dei vecchi JSON di `legacy/` | `backup/` | medio | ✅ |
| 11 | PWA: icone PNG, installazione su Android, test offline | — | basso | 🟨 |

## Traduttore in tempo reale (cinese→italiano, inglese→italiano)

**Come funziona:** il docente parla → stadio 1 trasforma il parlato in testo cinese o inglese → stadio 2 traduce in italiano ogni frase completa → sottotitoli a due righe (originale e italiano), salvati sulla timeline della lezione e collegati all'audio.

**Vincolo:** tutto deve essere gratuito (vedi `CLAUDE.md`). L'app deve funzionare senza chiavi: base = API di Chrome (offline sul tablet, oppure Web Speech). Le AI (oggi solo Gemini, piano gratuito) sono un'aggiunta facoltativa con la chiave dell'utente. Qwen e DeepSeek sono stati tolti perché a pagamento.

**Stadio 1, parlato→testo** (`SpeechToTextProvider`):
- *Web Speech sul dispositivo* (`processLocally`, Chrome recente): gratis e senza rete, se Chrome Android lo supporta.
- *Web Speech API* (`zh-CN` / `en-US`): gratis e veloce, ma usa i server Google (VPN in Cina). Su Android può litigare con MediaRecorder per il microfono.
- *Blocchi di audio a un servizio AI* ogni 5–10 s (facoltativo, Gemini con chiave dell'utente): ritardo maggiore, ma funziona insieme alla registrazione ed è più preciso con termini tecnici.

**Stadio 2, testo→italiano** (`TranslatorProvider`): di base la Translator API di Chrome (offline, gratuita); facoltativo un LLM (Gemini con chiave) con contesto = ultime frasi + glossario del corso.

**Prova tecnica (sessione 3), da fare prima di costruire la UI:** sul tablet reale verificare
1. se Web Speech e MediaRecorder funzionano insieme su Chrome Android;
2. quali servizi rispondono dalla rete dell'università con e senza VPN;
3. il ritardo reale di ciascuna combinazione;
4. come gestire le lezioni con lingua `zh+en` (il docente alterna cinese e inglese): riconoscimento automatico della lingua per frase, o due riconoscitori.
Il risultato decide i provider di default.

**Stato (🟨):** pagina di prova pronta in `src/features/translation/probe/` (Libreria → «Prova traduttore», oppure `#prova`). Verificata sul PC: build, lint, test di connessione con errori leggibili, conversione audio in WAV. Microfono e Web Speech non provati: servono il tablet.

**Collegamento al tablet (2026-11-18, test rimandato dall'utente):** tablet = Galaxy Tab Active2 (Android 9). Il debug USB resta su «Pending authentication»; l'utente non vuole mettere l'app online. Strada scelta: hotspot del PC + `npm run dev:tablet` + flag Chrome «Insecure origins treated as secure» con `http://192.168.137.1:5173` + regola firewall «LectureNote prova tablet» (porta 5173, solo 192.168.137.0/24, da togliere a fine test con `Remove-NetFirewallRule -DisplayName "LectureNote prova tablet"`). Ultimo stato: PC→tablet risponde al ping, ma le richieste del tablet non arrivano al server. Da provare: dati mobili / «Passa a dati mobili» spenti sul tablet; servizio ExpressVPN arrestato sul PC.

**Da fare sul tablet** (via `chrome://inspect` → port forwarding 5173, il microfono vuole `localhost`):
0. **Prima strada da provare, senza AI (preferenza dell'utente):** premere «Testa Chrome offline cinese→italiano / inglese→italiano / rileva lingua» e «Testa Web Speech sul dispositivo» (sono API di Chrome che girano sul tablet; la prima volta scaricano il modello, poi funzionano senza rete). Poi prova dal vivo con traduttore «Chrome offline» e Web Speech con e senza «Sul dispositivo». Sul PC queste API, nel browser di Claude, non rispondono: vanno provate su Chrome del tablet.
1. (Facoltativo, solo per confronto) Aprire «aggiungi una chiave AI» e inserire la chiave Gemini → Salva.
2. Selezionare «Senza VPN», premere ogni «Testa …» (per Web Speech parlare durante il test). Poi «Con VPN» e ripetere.
3. Prova dal vivo, per ciascuna modalità VPN: (a) Web Speech zh-CN + traduttori, parlando 1–2 min; (b) Web Speech en-US; (c) facoltativo: Gemini su blocchi con un audio che alterna cinese e inglese (`zh+en`), insieme a Web Speech zh-CN per confronto. Dopo ogni prova riascoltare l'audio: deve sentirsi la voce (se è muto, Web Speech ruba il microfono).
4. «Copia risultati» e incollare in chat: lì si decidono i provider di default e si segna ✅.

## Slide (sessione 5, ✅)

- **Import** (`slides/data.ts`): PDF con `pdfjs-dist` (build legacy per il Chrome del tablet, caricato solo al primo import) e immagini. Ogni pagina → JPEG con lato lungo 1600 px + miniatura 240 px (`Slide.thumb`, campo non indicizzato), salvati come `Blob` una pagina alla volta. Le risorse di pdf.js (font, mappe CJK) sono in `public/pdfjs`, quindi l'import funziona offline.
- **Viewer** (`SlideViewer.tsx`, `useZoom.ts`): pizzico per lo zoom fino a 4×, trascinamento da ingrandita, doppio tocco 2.5×/adatta, scorrimento laterale o frecce ‹ › per sfogliare, barra miniature con il tempo in cui ogni slide è comparsa. «Elimina presentazione» toglie slide e agganci.
- **Aggancio al tempo** (`usePins.ts`): durante la registrazione (anche in pausa) ogni cambio di slide crea un `SlidePin`; sfogliando veloce si salva solo la slide su cui ci si ferma (1,2 s), con il `ts` del primo cambio. All'avvio si aggancia la slide visibile.
- **Collegamento**: `RecordingScreen` riceve `panels(clock)` da `app/App.tsx` (le feature non si importano tra loro); lo stesso orologio servirà a note e penna. Una lezione con slide ma senza audio non viene più cancellata alla chiusura.
- Verificato sul PC (microfono simulato); da provare sul tablet: velocità di import di un PDF lungo e fluidità dello zoom.

## Penna (sessione 6, ✅)

- **Tratti** (`ink/freehand.ts`): `perfect-freehand` disegna il contorno in SVG, con lo spessore che segue la pressione della S Pen. Senza pressione (mouse, dito) la pressione viene simulata. Punti salvati normalizzati 0..1 (4 decimali), `size` in unità su 1000 di larghezza, `ts` = momento della lezione a inizio tratto. Colori come token `--ink-*` in `global.css`; nel tratto si salva il valore esatto.
- **Input e palm rejection** (`useInkInput.ts`): scrivono la penna e il mouse; il dito sfoglia e fa zoom, a meno di attivare «Il dito scrive». Fino a 0,8 s dall'ultimo segnale della penna (anche quando è sospesa sopra lo schermo) i tocchi vengono ignorati come palmo. Gli eventi usati dalla penna vengono marcati con `preventDefault()`: `slides/useZoom.ts` li ignora, così non c'è nessun import tra le due feature.
- **Strumenti** (`InkToolbar.tsx`): penna (4 colori, 3 spessori), evidenziatore (2 colori, trasparente), gomma che cancella tratti interi lungo il passaggio, Annulla sull'ultima pagina usata.
- **Su slide**: `SlideViewer` mette la slide in un riquadro di misura esatta (`useFitSize.ts`) e la penna ci sta sopra, quindi segue zoom e spostamento. `deleteDeck` cancella anche gli appunti a penna sulle slide.
- **Pagine bianche** (`NotebookPanel.tsx`): pagine 16:10, aggiungi/elimina, sfoglia. Schede «Slide / Pagine bianche» in `app/LessonPanels.tsx`; restano montate entrambe, così cambiare scheda non crea agganci di slide falsi.
- **Correzione all'import PDF**: `intent: 'print'` nel render di pdf.js, che altrimenti aspetta `requestAnimationFrame` e si blocca se si cambia app o lo schermo si spegne durante l'import.
- Verificato sul PC con eventi penna/tocco simulati. **Da provare sul tablet:** pressione e hover reali della S Pen, palm rejection con la mano appoggiata, fluidità dei tratti lunghi. Le miniature delle slide non mostrano ancora la scrittura.

## Righe 7, 9, 10, 11 (sessione con sub-agenti, 2026-11-18)

Fatte con il metodo Superpowers «subagent-driven development»: un sub-agente Sonnet per task, una revisione per task, una revisione finale su Opus. Piano in `docs/plans/2026-11-18-roadmap-7-9-10-11.md`, ramo git `roadmap-7-9-10-11`.

- **7 Note ✅** (`notes/`): scheda «Note» accanto a Slide e Pagine bianche. Il `ts` è preso quando si inizia a scrivere; foto ridotte a 1600 px JPEG come `Blob`; modifica, eliminazione, foto a tutto schermo. Una bozza non aggiunta si salva uscendo dalla lezione.
- **9 Impostazioni ✅** (`settings/`, `db/settings.ts`): `#impostazioni` dalla Libreria. Scelta del riconoscimento del parlato e del traduttore, chiave Gemini facoltativa (`apiKey.gemini`, la stessa della prova traduttore). Senza chiave le opzioni Gemini sono disattivate. **Per la riga 4:** leggere i provider con `effectiveProvider`, perché un provider Gemini rimasto senza chiave (es. dopo un backup) deve valere come quello di default.
- **10 Backup 🟨** (`backup/`): file `.lnbak` binario (niente base64, adatto a ore di audio), export di tutte le tabelle tranne le chiavi API, import che unisce (stessi id sovrascritti) in un'unica transazione; file troncati o non validi rifiutati. Verificato sul PC con il database vero (esporta → reimporta, conteggi identici, audio/slide/foto leggibili). **Da fare:** import dei vecchi JSON di `legacy/`.
- **11 PWA 🟨**: icone PNG 192/512 + maskable generate da `npm run icons` (`scripts/make-icons.mjs`, senza dipendenze), manifest completo, PNG in cache offline. **Da fare sul tablet:** installazione da Chrome e prova offline.
- Correzioni della revisione finale: una lezione con sole note o pagine a penna non viene più cancellata; una bozza di nota non aggiunta viene salvata **prima** del controllo «lezione vuota» (`LessonClock.onFlush`, registrato da `NotesPanel`, atteso da `close()`), senza doppio salvataggio.
- Rifiniture fatte: nota svuotata ripristinata, errore se «Aggiungi nota» fallisce, foto a tutto schermo chiudibile col tasto Indietro (`PhotoViewer`), valori delle impostazioni validati, niente sfarfallio dopo «Salva», avanzamento dell'import ogni 20 righe, import senza chiavi API, `dbVersion` validato, classi condivise `ui-*` in `global.css`.
- **AI cinesi per la traduzione** (facoltative, con la propria chiave): Qwen, DeepSeek, Kimi, API compatibili OpenAI, catalogo in `lib/aiProviders.ts`; chiavi `apiKey.qwen|deepseek|kimi` nelle impostazioni, scelta in «Traduzione», test nella prova tecnica. Funzionano in Cina senza VPN (CORS verificato). Solo testo: il parlato→testo resta Chrome/Web Speech/Gemini. **Per la riga 4:** usare `keyOf` ed `effectiveProvider(key, value, hasKey)` per leggere il provider; `translate()` della prova mostra la chiamata da replicare.
- Rifiniture ancora aperte: la didascalia di una foto prende il testo scritto prima dell'elaborazione (accettato, è raro); import dei vecchi JSON di `legacy/` e prova sul tablet (vedi sopra).

## Grafica, traduttore live, ripasso, import legacy (sessione 2026-11-18, seconda parte)

Skill gratuite installate (globali, `~/.claude/skills`): `webapp-testing` (Anthropic), `ui-ux-pro-max` (+ design, design-system, ui-styling, brand, banner-design, slides dello stesso pacchetto MIT), `web-design-guidelines` (Vercel). Già presenti: Superpowers, ponytail.

- **Grafica**: token nuovi in `global.css` (superfici, `*-bg` per bottoni con testo bianco a contrasto ≥ 4,5:1, `*-soft`, `--tap` 48 px, `--dur`/`--ease`), `prefers-reduced-motion`, focus visibile, `touch-action: manipulation`. Icone SVG in `lib/Icon.tsx` (disegni Lucide, ISC) al posto di emoji e simboli. Bottoni unificati su `.ui-btn` (`primary`, `record`, `danger`, `ghost`, `big`, `sm`, `icon-only`, `aria-pressed`). Barra del registratore compatta e fissa in alto; schede con icone: Slide, Pagine, Note, Traduzione, Ripasso. Libreria: benvenuto al primo avvio, schede corso con colore, **elimina singola lezione**; «Prova traduttore» spostata nelle impostazioni.
- **4 Traduttore live 🟨** (`translation/live/`): scheda «Traduzione», interruttore «Sottotitoli live» (spento di default, `live.captions`). Usa i provider delle impostazioni con `effectiveProvider`; Web Speech (sul dispositivo o Google) o Gemini a blocchi di 8 s sul microfono della registrazione (`LessonClock.stream`). Ogni frase → `db.transcript`, traduzione → `db.translations`, con il `ts` della lezione; in pausa l'ascolto si ferma. Il modello di Chrome offline si scarica al tocco dell'interruttore. **Limite:** con `zh+en` Web Speech ascolta solo `zh-CN` (le frasi inglesi escono male); Gemini riconosce entrambe. **Da provare sul tablet** (vedi riga 3): l'audio registrato deve restare udibile con i sottotitoli accesi.
- **8 Ripasso ✅** (`study/`): lettore unico su tutti i segmenti audio (`player.ts`), ±10 s e barra del tempo; timeline di note, slide mostrate, frasi tradotte e pagine a penna, filtrabile, un tocco riascolta da lì. Riassunto scritto a mano o generato dall'AI facoltativa (`lib/ai.ts`, la prima AI con chiave). Flashcard (tabella `cards`, **db v2**) a mano o generate dall'AI, ripasso a scatole di Leitner (1, 3, 7, 16 giorni). Mentre si registra il riascolto è disattivato.
- **10 Backup ✅**: «Lezioni della vecchia app (.json)» nelle impostazioni (`backup/legacy.ts`): audio, slide, agganci, note e foto, trascrizione e riassunto; base64 → Blob; reimportare lo stesso file sostituisce la lezione (id `legacy-<id vecchio>`); un'immagine rovinata viene saltata.
- Rifiniture: `lessonTables()` in `db/schema.ts` è l'unico elenco delle tabelle di una lezione; `useBlobUrl` unico in `lib/`; `http.ts` e chiamate AI in `lib/` (usabili da tutte le feature).
- **Verificato sul PC** con Playwright e microfono finto (Chrome): registra/pausa/riprendi/ferma, nota col tempo, riascolto e salto dalla timeline, flashcard e ripasso, import legacy e reimport senza doppioni, eliminazione dei corsi, layout orizzontale 1280×800 e verticale 800×1280, nessun errore in console. `npm run build` e `npm run lint` puliti.
- **Ancora da fare:** prova sul tablet (righe 3, 4, 11).

## Grafica 2, S Pen, export per NotebookLM (sessione 2026-11-18, terza parte, con sub-agenti)

- **Misura reale del tablet:** il Galaxy Tab Active2 in Chrome è circa **960×600** in orizzontale e 600×960 in verticale (non 1280×800): le prove di layout vanno fatte a questa misura.
- **Grafica:** palette nuova in `global.css` (superfici blu inchiostro `--s1..--s4`, accento `#93a6ff` con bottoni primari a gradiente, colori dei corsi `--c1..--c7`, scala `--fs-*`, `--r-lg`, `--shadow-sm`, alone di sfondo `--glow`), più colori d'inchiostro ed evidenziatore. Schermata della lezione a tutta altezza (`recording.css`, `app/lesson.css`): una sola barra in alto (titolo, stato, tempo, comandi), schede compatte, area di lavoro che riempie lo schermo. Slide: comandi in una riga sotto la slide, miniature a scomparsa. **Modalità foglio** (bottone nella barra della penna): nasconde titolo e schede e chiede lo schermo intero. Libreria, note, traduzione, ripasso e impostazioni rifinite con i nuovi token.
- **Penna / S Pen (`ink/`):** strumenti in colonna a sinistra in orizzontale (griglia di 3), in riga in verticale; icone sole con nome al tocco lungo. **Tasto laterale della S Pen = gomma** finché è premuto (`buttons` 2 o 32). **Cursore sospeso:** cerchio del colore e dello spessore del tratto (anello per la gomma) quando la penna è vicina allo schermo (`inkCursor.ts`). Tratto in corso disegnato una volta per fotogramma direttamente nell'SVG (niente render di React a ogni punto) con i punti previsti dal browser (`getPredictedEvents`) per ridurre il ritardo. Curva di pressione più morbida per tratti leggeri. **Ripeti** oltre ad Annulla. Alla prima S Pen vista il dito torna a sfogliare (puntino verde sul bottone Penna). Corretto: con «Il dito scrive» attivo il palmo poteva scrivere mentre si usava la penna. Fogli **bianco / a righe / a quadretti** (`InkPage.paper`, campo non indicizzato, nessuna nuova versione del db).
- **Export per NotebookLM (`export/`):** dalla Libreria, bottone su ogni lezione e su ogni corso. File `.txt` in Markdown: riassunto, «lezione minuto per minuto» (note, cambi di slide, frasi tradotte con l'originale facoltativo, pagine a penna segnalate), flashcard; il corso intero è un unico file con tutte le lezioni in ordine di data. Audio facoltativo, **convertito** perché NotebookLM non accetta il `.webm` del registratore (accetta mp3, wav, m4a, aac): WebM/Opus letto a pezzi (`webm.ts`, nessuna libreria), decodificato con WebCodecs, mono 16 kHz, poi **AAC** (`.aac` ADTS, se il dispositivo sa codificarlo) oppure **WAV** 16 kHz diviso in parti < 190 MB. Avanzamento e «Annulla». Le lezioni registrate restano `.webm`, si converte solo all'export. «Condividi» (menu di Android → NotebookLM o Drive) per i file che Chrome permette di condividere (non l'`.aac`: quelli si scaricano, con un avviso), altrimenti «Scarica».
- **Verificato sul PC** (960×600 e 600×960, eventi penna simulati): build e lint puliti, tratto con pressione, cursore sospeso, gomma col tasto laterale, Annulla/Ripeti, righe/quadretti, modalità foglio, testo dell'export.
- **Da provare sul tablet:** codici reali del tasto della S Pen su Chrome Android 9, hover e `getPredictedEvents`, fluidità sul processore del Tab Active2; condivisione verso NotebookLM; se NotebookLM accetta l'audio `.webm` del registratore (altrimenti caricare solo il testo).
- **Revisione e test (prima del commit):** revisione del codice (`/code-review high`): corretti tratto che spariva scrivendo veloce, frecce che sfogliavano slide nascoste (e creavano agganci falsi), Annulla/Ripeti attivi su una pagina eliminata, modalità foglio non chiusa uscendo dallo schermo intero con Indietro, condivisione dell'`.aac` impossibile su Android. Trovato e corretto anche un bug vecchio: Ripasso ed export mostravano «Slide 0» (`Slide.page` è l'ordine nella lezione, non il numero nella presentazione: ora `lib/slideNumbers.ts`). **Test end-to-end con Playwright e il microfono vero del PC** (script in `.playwright-mcp/e2e.js`, cartella ignorata da git): 20 controlli passati: registrazione/pausa/ripresa, layout 960×600 e 600×960 senza scorrimento, penna, Annulla/Ripeti, tasto laterale S Pen simulato, quadretti, modalità foglio, slide, note, export testo e audio AAC, nessun errore in console.
