# OrbitKanban — workspace portable

App desktop locale per Windows 10/11 a 64 bit, **versione 2.6.3**. Nessun account, server esterno o collegamento a Internet necessario per l'uso. **Il nome dell'app è sempre OrbitKanban e non è configurabile.** Tutte le impostazioni del workspace appartengono alla singola organizzazione. Mentre l'app è aperta puoi usarla anche **dal browser dello stesso PC**, con più organizzazioni aperte contemporaneamente in schede diverse.

## Avvio e condivisione

1. Copia `OrbitKanban-Portable.exe` in una cartella scrivibile, per esempio su una chiavetta o sul Desktop. Evita `Program Files` e cartelle di sola lettura.
2. Apri l'eseguibile. Al primo avvio viene creata la cartella `data` accanto all'eseguibile, con un'organizzazione dimostrativa completa (vedi [Dati dimostrativi](#dati-dimostrativi)).
3. Per spostare o condividere tutto, **chiudi l'app e copia insieme l'eseguibile e la cartella `data`**. Copiare soltanto l'eseguibile crea un workspace nuovo.

Windows potrebbe mostrare un avviso SmartScreen perché l'eseguibile non è firmato digitalmente. L'app non richiede privilegi di amministratore. Il file eseguibile è `OrbitKanban-Portable.exe`. Per aggiornare una versione precedente, chiudi l'app e affianca il nuovo eseguibile alla cartella `data` esistente: non è necessario rinominare o ricreare l'archivio.

### Schermata di caricamento

L'icona dell'eseguibile portable, della finestra e della barra delle applicazioni usa lo **stesso logo OrbitKanban** mostrato nella schermata di caricamento e nell'app. I loghi personalizzati delle organizzazioni continuano a comparire nella sidebar e nella scheda del browser; non sostituiscono l'icona Windows dell'app.

L'eseguibile portable estrae i file dell'app in una cartella temporanea a ogni avvio: è la parte che richiede qualche secondo. Appena fai doppio clic compare la **schermata di caricamento**, sempre in inglese, con logo, versione e una **barra di caricamento infinita** che scorre senza fermarsi fin dal primo istante, già durante l'estrazione. Quando l'app parte, la stessa schermata, nella stessa posizione, prosegue con la stessa animazione finché l'organizzazione non è pronta; non ci sono fasi numerate, perché la durata di ogni passaggio dipende dal PC. Tra la schermata del launcher e quella dell'app può esserci un passaggio di qualche decimo di secondo. La finestra principale compare solo quando l'organizzazione è già disegnata, con lo sfondo del suo tema. Se il sistema chiede di ridurre le animazioni, la barra non scorre ma pulsa lentamente. Il pacchetto include soltanto le risorse di Chromium per italiano e inglese, così l'estrazione è più leggera.

L'archivio è `data/workspace.json`; `workspace.json.bak` contiene il salvataggio precedente. Cache, log e la chiave dell'accesso da browser (`data/runtime/browser-access-token`) restano anch'essi nella cartella `data`. Non usare l'app direttamente dentro un archivio ZIP e non aprire più copie dell'eseguibile sullo stesso archivio condiviso: per lavorare in più finestre usa l'[accesso da browser](#accesso-da-browser), che passa sempre dall'unica app aperta. È un'app monoutente, non un sistema di collaborazione in rete.

## Organizzazioni, logo e lingua

Il menu a tendina sotto il nome fisso **OrbitKanban** seleziona l'organizzazione attiva. **Ogni organizzazione ha un archivio di attività e issue distinto**, insieme al proprio nome, ai nomi dei tab, agli stati, alle urgenze, ai temi, alle dimensioni del testo, all'effort, al logo e alla lingua. Il passaggio aggiorna immediatamente tutte le viste, il logo e i colori, senza mai cambiare il nome dell'app. Il logo dell'app appare all'avvio e come fallback per le organizzazioni senza logo; se l'organizzazione selezionata ha un logo, viene mostrato quello. Ricerca e filtri vengono azzerati al cambio, e la selezione resta memorizzata per il prossimo avvio.

**Gestisci organizzazioni** apre la relativa sezione di **Impostazioni**. Da **Nuova organizzazione** scegli nome, lingua e logo prima di premere **Crea organizzazione**. L'anteprima mostra il logo e i quattro colori del tema che verrà generato: organizzazione, logo e tema vengono salvati insieme, senza un secondo passaggio. Il logo è facoltativo; se omesso viene utilizzato quello dell'app. Le nuove organizzazioni sono vuote, senza attività o issue condivise, a meno di selezionare **Includi dati dimostrativi**.

Per rinominare l'organizzazione attiva modifica **Nome organizzazione** e premi **Salva impostazioni**; il nome viene aggiornato anche nel menu. Puoi eliminarla con **Elimina organizzazione**, dopo conferma; deve restarne almeno una. Se cambi organizzazione con impostazioni non salvate, puoi salvarle, scartarle o annullare il cambio. Non esiste un collegamento tra codici uguali appartenenti a organizzazioni diverse.

Nelle impostazioni, **Carica logo e genera tema** accetta PNG, JPEG, WebP, GIF e BMP fino a 15 MB. Il logo viene convertito in PNG, ridimensionato a un massimo di 512 pixel per lato e incorporato nell'archivio, senza dipendenze dal file originale. Dai suoi colori viene generato e selezionato il tema dedicato **Tema dal logo**, modificabile come gli altri temi. Per mantenere leggibilità anche con loghi monocromatici, testo e accento possono essere schiariti o scuriti e le superfici differenziate dallo sfondo. Una nuova immagine aggiorna quel tema solo per l'organizzazione attiva. Il tema generato viene applicato subito in anteprima; per conservare logo e tema premi **Salva impostazioni**. **Rimuovi logo** ripristina il simbolo predefinito senza eliminare il tema.

Il selettore **Lingua dell'interfaccia**, nella scheda **Lingua & traduzioni** delle impostazioni, offre **Italiano**, **English** e le lingue aggiunte da file (vedi [Lingue e traduzioni](#lingue-e-traduzioni)). La lingua viene salvata per organizzazione e si applica con **Salva impostazioni** a navigazione, comandi, dialog, date e unità dell'effort. I contenuti e i nomi personalizzati dei tab, degli stati, delle urgenze e dei temi non vengono tradotti né rinominati. Alla creazione viene proposta la lingua attuale, modificabile nel modulo; i nomi iniziali seguono la lingua scelta.

I vecchi archivi e backup a organizzazione singola vengono migrati automaticamente nella prima organizzazione, preservando attività, associazioni e impostazioni. Il formato nuovo è versione 2 e non va aperto con versioni precedenti dell'app. L'esportazione include **tutte le organizzazioni**, i loghi e le lingue; l'importazione sostituisce **l'intero archivio**, non soltanto l'organizzazione attiva. **Svuota attività e issue** agisce invece solo sull'organizzazione corrente. Per salvare o condividere **una sola organizzazione** usa invece **Esporta e importa organizzazione**, descritta nella sezione seguente.

## Lingue e traduzioni

Ogni lingua è un singolo file JSON. Le lingue integrate sono `languages/it.json` e `languages/en.json` nel pacchetto dell'app; chiunque può aggiungerne una partendo da quella inglese, senza ricostruire l'eseguibile:

1. In **Impostazioni → Lingua & traduzioni** premi **Apri cartella lingue**. Si apre `data/languages`, accanto all'archivio, che contiene `en.template.json`: la traduzione inglese completa da usare come modello, riscritta a ogni apertura se l'app viene aggiornata.
2. Copia il modello con il codice della nuova lingua, per esempio `de.json`, `fr.json` o `pt-BR.json`, e aggiorna `code` (uguale al nome del file), `name` (il nome mostrato nel selettore, per esempio `Deutsch`) e `locale` (usato per date e numeri, per esempio `de-DE`).
3. Traduci solo i **valori**. Le chiavi sono il testo originale italiano e non vanno modificate; i segnaposto come `{0}` vanno mantenuti. `messages` contiene i testi dell'interfaccia, `terms` i nomi iniziali di stati, urgenze e tab e i testi dei dati dimostrativi, `plurals` i conteggi con le forme `zero`, `one`, `two`, `few`, `many` e `other` (obbligatoria). I testi lasciati vuoti o eliminati restano in inglese, quindi si può tradurre anche un poco alla volta.
4. Premi **Ricarica lingue**: la nuova lingua compare nel selettore con l'etichetta **Aggiunta da file**. Sceglila e premi **Salva impostazioni**.

Un file con il codice di una lingua integrata, per esempio `en.json` o `it.json`, sostituisce solo i testi che contiene ed è segnalato come **Personalizzata da file**. I file non validi, con JSON errato, codice diverso dal nome del file o più grandi di 2 MB, vengono ignorati ed elencati in **File lingua ignorati** con il motivo, senza bloccare l'app. La cartella `data/languages` viaggia con la cartella `data`; se un'organizzazione usa una lingua non presente su un altro PC, il selettore la indica come **non installata** e i testi sono mostrati in inglese finché il file non viene copiato. Le lingue valgono anche per l'accesso da browser. La schermata di caricamento resta sempre in inglese.

## Esporta e importa per organizzazione

In **Impostazioni → Esporta e importa organizzazione** puoi salvare l'organizzazione attiva in **file JSON separati**, da conservare, condividere con un collega o reimportare qui o in un'altra copia di OrbitKanban:

| Pulsante | Contenuto del file |
| --- | --- |
| **Esporta temi** | tutti i temi dell'organizzazione, con i quattro colori, e il tema attivo |
| **Esporta configurazione** | lingua, modello del link al portale, nomi dei tab, ore per giorno, dimensioni del testo, stati con colori ed evidenziazione, urgenze, evidenziatori, colonne della lista e logo |
| **Esporta dati** | attività e issue, con il colore evidenziatore di ogni riga, insieme a stati, urgenze ed evidenziatori per poterle riassociare |
| **Esporta tutto** | temi, configurazione e dati in un unico file |

I file si chiamano `OrbitKanban-<organizzazione>-<temi|configurazione|dati|organizzazione>-<data>.json` (tradotti nella lingua dell'organizzazione, per esempio in inglese `themes`, `settings`, `data`, `organization`). Nell'app desktop viene chiesto dove salvarli, proponendo la cartella dell'app; dal browser vengono scaricati. Se ci sono impostazioni non salvate, prima di esportare o importare puoi salvarle o scartarle: il file riflette sempre la configurazione salvata.

**Importa da file…** accetta un file esportato da OrbitKanban, fino a 32 MB. Il file viene verificato prima di qualsiasi modifica: file non validi, file creati da una versione più recente dell'app e backup completi dell'archivio, da importare con **Importa backup**, vengono rifiutati con un messaggio chiaro; i campi sconosciuti vengono ignorati. La finestra di importazione mostra organizzazione di origine, data di esportazione e versione dell'app, e propone solo le parti presenti nel file:

- **Temi**: i temi con lo stesso identificativo vengono aggiornati, gli altri aggiunti. L'opzione **Attiva il tema «…»**, con l'anteprima dei quattro colori, rende subito attivo il tema del file.
- **Configurazione**: sostituisce quella attuale. I file creati prima della versione 2.2.0 non contengono le dimensioni del testo: in quel caso restano quelle attuali. Le attività esistenti restano e vengono associate agli stati e alle urgenze del file con lo stesso nome, senza distinzione tra maiuscole e minuscole, altrimenti a quelli nella stessa posizione. Il logo attuale viene sostituito solo selezionando **Sostituisci anche il logo**.
- **Dati**: con **Aggiungi e aggiorna** le attività con lo stesso identificativo vengono aggiornate e le altre aggiunte; le issue già presenti, con stesso codice, incident e problem, non vengono duplicate. Reimportare lo stesso file quindi non crea doppioni. Con **Sostituisci tutto** attività e issue attuali vengono sostituite da quelle del file. Stati e urgenze delle attività importate seguono la stessa regola: prima per nome, poi per posizione. Il colore evidenziatore di una riga viene riassociato per identificativo e poi per nome; se non esiste nell'organizzazione la riga resta senza evidenziazione. I file creati prima della versione 2.6.0 non contengono evidenziatori né colonne: la configurazione importata usa i colori e le colonne predefiniti e, con **Aggiungi e aggiorna**, le righe già presenti mantengono la propria evidenziazione.

In **Dove importare** scegli **In questa organizzazione** oppure **In una nuova organizzazione**, proposta automaticamente per i file creati con **Esporta tutto**. Il nome suggerito è quello dell'organizzazione di origine, reso univoco se necessario, per esempio `Acme (2)`. La nuova organizzazione riceve le parti selezionate: con i dati arrivano anche stati e urgenze del file, con la configurazione anche lingua e logo; ciò che non importi parte dai valori iniziali. L'organizzazione attuale non viene modificata. Gli identificativi di attività, issue e temi vengono mantenuti, così gli scambi ripetuti tra due copie dell'app aggiornano le stesse righe. Prima di importare nell'organizzazione corrente, se vuoi poter tornare indietro, esporta l'organizzazione completa o un backup.

## Dati dimostrativi

Il primo avvio crea un'organizzazione di esempio pensata per mostrare tutte le funzioni:

- **una milestone ogni due settimane, con rilascio di mercoledì**, dal 1° gennaio 2025 fino a oggi, più la prossima release già pianificata;
- oltre 200 attività con codici portale, progressivi, urgenze e stati diversi, effort in giorni e ore, descrizioni e note in rich text;
- le release passate sono completate; le attività completate da più di otto settimane sono **nascoste dalla lista** ma restano visibili in Milestone e Kanban;
- l'ultima release è in verifica, la prossima ha attività da fare, in corso e in verifica; alcune attività senza data formano il backlog;
- oltre 150 issue: problem condivisi da più incident, codici scritti in minuscolo, issue con solo problem e alcuni codici senza attività corrispondente;
- link generati dal modello `https://jira.example.com/browse/{codice}` e, per i codici `CHG…`, link specifici a un secondo portale;
- un tema aggiuntivo **Aurora**.

I dati sono generati in modo deterministico rispetto alla data del primo avvio e vengono creati **solo se non esiste già un archivio**: aggiornando l'app, la cartella `data` esistente non viene toccata. Per vedere gli esempi accanto ai tuoi dati crea una nuova organizzazione con **Includi dati dimostrativi**; potrai eliminarla in qualsiasi momento. **Svuota attività e issue** rimuove gli esempi dell'organizzazione corrente mantenendone le impostazioni.

## Accesso da browser

Mentre OrbitKanban è aperto, l'app espone la stessa interfaccia anche al browser **di questo PC** all'indirizzo `http://127.0.0.1:47821` (se la porta è occupata ne viene scelta automaticamente un'altra, visibile nelle impostazioni).

- Il pulsante **Apri nel browser ↗** sotto il selettore delle organizzazioni apre l'organizzazione corrente nel browser predefinito. Dal browser lo stesso pulsante diventa **Apri in nuova scheda**.
- Ogni scheda mostra l'organizzazione scelta dal proprio menu, indipendentemente dall'app e dalle altre schede: puoi tenere **più organizzazioni aperte contemporaneamente**. Il titolo della scheda riporta il nome dell'organizzazione e l'indirizzo (`?org=…`) può essere salvato nei preferiti.
- Le modifiche si **sincronizzano in tempo reale** tra app e schede, senza ricaricare. Se due finestre modificano la stessa organizzazione quasi insieme, la seconda modifica viene riapplicata sui dati aggiornati invece di sovrascriverli. Le impostazioni che stai modificando e non hai ancora salvato non vengono perse quando arrivano aggiornamenti da altre finestre.
- In **Impostazioni → Accesso da browser** trovi l'indirizzo e il comando **Copia link di accesso**.
- Il server ascolta **solo su 127.0.0.1**: non è raggiungibile da altri computer della rete. Il primo accesso usa un link con una chiave personale, poi il browser ricorda la sessione con un cookie protetto. **Non condividere il link di accesso**: contiene la chiave. Eliminando `data/runtime/browser-access-token` ad app chiusa la chiave viene rigenerata e le sessioni precedenti vengono invalidate.
- Chiudendo l'app le schede mostrano **App non raggiungibile** e non possono salvare; riaprendo l'app e ricaricando la pagina si riprende a lavorare. I dati restano sempre e solo in `data/workspace.json`.
- Dal browser funzionano anche esportazione (download del backup), importazione, esportazione e importazione per organizzazione (i file vengono scaricati dal browser) e apertura dei link al portale in una nuova scheda.

## Link al portale

Ogni organizzazione ha il proprio **Modello del link** in **Impostazioni → Link al portale**. Inserisci l'indirizzo del portale e metti il segnaposto `{codice}` nel punto in cui va il codice dell'attività, per esempio `https://jira.azienda.com/browse/{codice}` oppure `qualcosa.net/{codice}/dettaglio`. Sono accettati anche `{code}`, `<codice>` e `<code>`, senza distinzione tra maiuscole e minuscole; il segnaposto può comparire più volte. Se manca lo schema viene aggiunto `https://`. Sotto il campo un'anteprima mostra il link generato con un codice reale e segnala un modello senza segnaposto o non valido, che non può essere salvato. Il modello vale solo per l'organizzazione attiva: un'altra organizzazione può usare un portale diverso o nessuno.

Nell'attività il link non è più obbligatorio. Con il campo **Link specifico (facoltativo)** vuoto il link viene costruito dal codice portale tramite il modello, e si aggiorna da solo se cambi il modello o il codice. Un link specifico, utile per ticket su un altro portale, ha la precedenza sul modello; se coincide con quello generato non viene memorizzato separatamente. Il codice viene inserito nell'URL con la codifica necessaria per spazi e caratteri speciali. Senza modello e senza link specifico l'attività semplicemente non mostra il collegamento.

Il simbolo **↗** accanto al codice nella lista attività, nelle card delle milestone e del kanban, il link nel dialog dell'attività e l'anteprima nelle impostazioni **aprono la pagina nel browser predefinito del PC**, anche con clic centrale o `Ctrl+clic`; l'app non naviga mai all'interno della propria finestra. Vengono aperti solo indirizzi `http://` e `https://`.

## Le quattro viste

Le intestazioni e i riepiloghi sono compatti in tutte le schede. Tabelle, milestone e kanban occupano lo spazio rimanente della finestra e scorrono al proprio interno; le dimensioni del testo configurate restano rispettate. Su finestre basse o con caratteri grandi, anche l'area contenuti può scorrere per mantenere accessibili tutti i comandi.

Il testo dell'interfaccia non viene selezionato trascinando il mouse, come in un'app desktop. La selezione e il copia/incolla restano disponibili nei campi di testo, nella ricerca e negli editor rich text.

Nelle liste **Attività** e **Issue collegate**, fai **doppio clic su una cella della riga** per aprire la relativa finestra di modifica. Restano disponibili i pulsanti di modifica e il clic sul codice; link e pulsanti mantengono le proprie azioni. Con un evidenziatore attivo, i clic continuano a colorare le righe senza aprire l'editor. Il Kanban resta in sola lettura.

- **Attività**: creazione e modifica tramite “Nuova attività”, codice o descrizione. Progressivo automatico ma modificabile; codice portale con link facoltativo (vedi **Link al portale**); descrizione e note rich text; urgenza, stato, effort in giorni e ore, release date e associazioni incident/problem automatiche. I numeri progressivi possono essere duplicati intenzionalmente. Scorciatoia: `Ctrl+N`.
- **Issue collegate**: ogni riga associa un codice portale a un incident e/o problem. Sono consentiti più incident per problem e più righe per codice. Il confronto del codice ignora spazi esterni e maiuscole/minuscole. Nelle attività le associazioni vengono aggregate senza duplicati; non è necessaria alcuna connessione a JIRA.
- **Milestone**: timeline orizzontale per data di release, con tutte le attività della tappa. Scorre sia in larghezza sia in altezza; il codice apre la modifica. Le attività senza data compaiono in “Da pianificare”. Include anche le attività nascoste dalla lista, contrassegnate dall'etichetta “Nascosta in lista” e da un bordo tratteggiato.
- **Kanban**: sola lettura, una colonna per ogni stato e nello stesso ordine configurato nelle impostazioni. Si modifica lo stato dalla lista attività. Mostra anche le attività nascoste dalla lista, con la stessa etichetta.

L'ordinamento iniziale delle attività è per release crescente, con date mancanti in fondo. Clic sulle intestazioni per cambiare verso; `Maiusc+clic` per ordinamenti a più livelli. Descrizione e note non sono ordinabili. Urgenza e stato vengono ordinati in base all'ordine delle rispettive opzioni, non alfabeticamente. Il pulsante “Release” ripristina l'ordinamento iniziale. Ricerca e filtri della lista non limitano le altre viste.

Il pulsante circolare a destra della riga la nasconde **solo dalla lista attività**, senza eliminarla: è utile, per esempio, per togliere dalla lista le attività già rilasciate in produzione. Le attività nascoste restano visibili in **Milestone** e **Kanban**, contrassegnate da “Nascosta in lista”. Attiva “Nascoste” nella lista per ritrovarle e ripristinarle. Il contatore del tab e le statistiche della lista escludono le righe nascoste. Le associazioni issue restano sempre disponibili.

## Evidenziatori e colonne della lista

Ci sono due modi, indipendenti, per far risaltare le righe:

- **Per stato (automatico)**: la ★ accanto a uno stato in **Impostazioni → Stati** evidenzia tutte le attività in quello stato.
- **Per riga (manuale), con gli evidenziatori**: colori con un nome, per esempio *Attenzione*, *Bloccante*, *Da discutere* e *Pronta*, da assegnare alle singole righe. La riga riceve uno sfondo tenue e una barra laterale del colore scelto; l'evidenziatore prevale sulla ★ dello stato.

Per evidenziare le righe:

- **Barra Evidenziatore** sopra la tabella: scegli un colore e clicca sulle righe da colorare; cliccando una riga che ha già quel colore lo togli. **Gomma** rimuove l'evidenziazione dalle righe cliccate. Clicca di nuovo il colore attivo o premi `Esc` per terminare; in questa modalità il clic sulla riga non apre la modifica.
- **Pallino ●** nella colonna azioni a fine riga, sempre visibile anche quando la tabella scorre in orizzontale: apre un menu con tutti i colori e **Nessuna evidenziazione**.
- Campo **Evidenziazione** nella finestra di modifica dell'attività.
- Il filtro **Tutte le evidenziazioni** mostra solo le righe evidenziate, quelle senza evidenziazione o quelle di un colore; la ricerca trova anche il nome del colore. L'evidenziazione compare anche nelle card di **Milestone** e **Kanban**.

Gli evidenziatori si gestiscono in **Impostazioni → Evidenziatori**: nome, colore, aggiunta, riordino ed eliminazione, fino a 16 colori per organizzazione. Accanto a ogni colore è indicato quante attività lo usano; eliminandolo, al salvataggio quelle righe tornano senza evidenziazione.

Le colonne della lista si scelgono con il pulsante **▥ Colonne** nella barra della lista o in **Impostazioni → Colonne della lista**: spunta le colonne da mostrare e cambiane l'ordine con le frecce; **Ripristina predefinite** torna alla disposizione iniziale. Oltre alle colonne di sempre sono disponibili, inizialmente nascoste, **Link portale**, con l'indirizzo cliccabile, ed **Evidenziazione**, ordinabile in base all'ordine degli evidenziatori. Nascondere una colonna non cancella i dati e la colonna delle azioni resta sempre presente; se le nascondi tutte, il codice portale torna visibile. La disposizione è salvata per organizzazione.

Ogni data ha un colore deterministico condiviso tra lista e milestone: lo stesso giorno mantiene lo stesso colore, indipendentemente dallo stato e dalla posizione. Non è un indicatore di scadenza.

## Impostazioni

Le impostazioni sono organizzate in **schede**: a sinistra un menu raggruppa le sezioni (**Organizzazione**, **Aspetto**, **Flusso di lavoro**, **Dati e accesso**) e a destra è visibile una sola sezione alla volta, così la pagina resta compatta anche con molti temi. La scheda aperta viene ricordata finché la finestra resta aperta e si può cambiare anche con le frecce della tastiera. Un pallino accanto al nome segnala le schede con modifiche non salvate e la barra di avviso elenca le sezioni modificate con un collegamento diretto; se il salvataggio fallisce viene aperta la scheda del campo da correggere. Con finestre strette il menu diventa una barra orizzontale scorrevole.

- Nome dell'organizzazione e nomi dei quattro tab; il nome dell'app rimane OrbitKanban.
- **Lingua & traduzioni**: lingua dell'organizzazione, elenco delle lingue disponibili, cartella delle lingue con il modello inglese, ricarica dei file e segnalazione dei file non validi (vedi [Lingue e traduzioni](#lingue-e-traduzioni)).
- Stati e urgenze: nomi, colori, aggiunta, eliminazione e riordino con frecce. Un'opzione usata da un'attività, anche nascosta, non può essere eliminata: riassegna prima le attività.
- La stella accanto a uno stato abilita l'evidenziazione automatica delle relative righe.
- **Evidenziatori** e **Colonne della lista**: colori per evidenziare singole righe e colonne visibili della lista, con il loro ordine (vedi [Evidenziatori e colonne della lista](#evidenziatori-e-colonne-della-lista)).
- Ore per giorno (inizialmente 8): l'effort viene archiviato in ore; cambiare la durata della giornata cambia solo la rappresentazione, non il totale registrato.
- Tre temi iniziali e creazione, modifica ed eliminazione di palette personalizzate (sfondo, superfici, testo e accento). La scheda **Temi & atmosfera** mostra i temi in una **galleria compatta con ricerca per nome**: ogni riquadro ha una miniatura dell'interfaccia e i quattro colori, la galleria scorre al proprio interno e l'editor del tema scelto resta sempre a fianco. **＋ Crea tema** azzera la ricerca e porta subito al nome del nuovo tema.
- Ogni anteprima mostra tutti e quattro i colori, nello stesso ordine dei selettori, e si aggiorna durante la modifica. Per ricavare una palette da una foto basta caricare un'immagine: **tutti e quattro i colori vengono estratti e assegnati automaticamente**, senza clic manuali. L'analisi raggruppa i colori rappresentativi e assegna il più scuro allo sfondo, il più chiaro al testo, un colore saturo all'accento e il restante alle superfici. Se l'immagine contiene meno di quattro gruppi di colore, alcuni ruoli condividono lo stesso colore e l'app lo segnala. Puoi ritoccare la palette con i selettori oppure, facoltativamente, scegliendo un ruolo e cliccando sull'immagine. Selezione e modifiche dei temi vengono **applicate subito a tutta l'app come anteprima dal vivo**. Premi **Salva impostazioni** per conservare il tema; se esci dalle impostazioni o premi **Annulla modifiche** senza salvare, torna il tema salvato in precedenza. Sono supportati PNG, JPEG, WebP, GIF (primo fotogramma) e BMP fino a 15 MB; le immagini grandi vengono ridimensionate a un massimo di 1600 pixel per lato. Le trasparenze vengono composte su bianco. L'immagine viene elaborata solo in memoria, non inviata in rete né salvata nell'archivio: i colori scelti restano portable con il tema.
- **Dimensione del testo**: regola separatamente sette parti dell'interfaccia (**Testo generale**, **Barra laterale**, **Intestazioni di pagina**, **Tabelle**, **Vista milestone**, **Vista kanban** e **Finestre di dialogo**) con un cursore a passi del 5%, accompagnato da un'anteprima realistica della parte. Ogni parte ha limiti propri, pensati per mantenere l'interfaccia leggibile e ordinata: da 80% a 140% per testo generale, intestazioni e finestre di dialogo, da 80% a 130% per la barra laterale e da 80% a 150% per tabelle, milestone e kanban. Le preimpostazioni **Compatta** (85%, vicina alla densità delle versioni precedenti), **Standard** (100%, consigliata), **Ampia** (115%) e **Molto ampia** (130%) regolano tutte le parti insieme; ↺ riporta una sola parte al 100%. Come per i temi, le modifiche vengono **applicate subito a tutta l'app come anteprima** e conservate solo con **Salva impostazioni**. Le dimensioni valgono per l'organizzazione attiva e sono incluse in **Esporta configurazione**. Logo e nome dell'app mantengono sempre la stessa dimensione, mentre la barra laterale si allarga entro un limite e le aree scorrevoli si adattano per lasciare visibile il fondo della tabella.
- **Esporta e importa organizzazione**: temi, configurazione e dati dell'organizzazione attiva in file separati, oppure tutto insieme, con importazione selettiva in questa o in una nuova organizzazione (vedi **Esporta e importa per organizzazione**).
- **Esporta backup** e **Importa backup**: l'intero archivio JSON, incluse tutte le organizzazioni, i loghi, i temi e le impostazioni. L'importazione richiede conferma e sostituisce l'archivio; un file non valido viene rifiutato.
- “Svuota attività e issue” elimina anche gli esempi iniziali, mantenendo impostazioni e temi.

Le modifiche alle impostazioni diventano effettive solo con **Salva impostazioni**. Quando ci sono modifiche non salvate compare in alto una barra di avviso, sempre visibile durante lo scorrimento, con l'elenco delle sezioni modificate e i comandi **Salva** e **Annulla modifiche**; la barra scompare se i valori tornano a coincidere con quelli salvati. Se cambi vista senza salvare, le modifiche vengono scartate e resta la configurazione precedente. Le attività e le associazioni hanno il proprio pulsante di salvataggio. Gli errori di lettura o scrittura vengono mostrati esplicitamente; un archivio corrotto non viene sostituito automaticamente.

Il rich text supporta grassetto, corsivo, sottolineato ed elenchi. Contenuti attivi, immagini remote e formattazione HTML non supportata vengono rimossi.

## Sviluppo e build

Richiede Node.js con npm soltanto per sviluppare o ricostruire il pacchetto. Il destinatario dell'eseguibile non deve installare Node.js.

```powershell
npm ci
npm start
npm test
npm run check
npm run smoke
npm run icon
npm run splash
npm run dist
```

Il logo sorgente unico è `app-logo.svg`, usato dall'interfaccia, dalla favicon predefinita e dalla schermata di caricamento. `npm run icon` ne genera la versione PNG trasparente a 512 pixel (`app-logo.png`, non versionata); `npm start` e `npm run smoke` la rigenerano automaticamente. Anche `npm run splash`, eseguito prima della build, rigenera l'icona. Electron usa quel PNG per entrambe le finestre ed electron-builder lo converte nell'icona Windows multirisoluzione per il launcher portable e l'eseguibile interno. La modifica delle risorse dell'eseguibile resta attiva (icona, nome e versione), anche senza firma digitale.

Se l'eseguibile precedente è ancora aperto, puoi costruire senza sovrascriverlo con `npm run dist -- --out dist-staging`. Chiudi l'app prima di sostituire l'eseguibile accanto alla cartella `data`.

Il pacchetto condivisibile viene generato in `dist/OrbitKanban-Portable.exe`. `npm run dist` esegue prima `npm run splash`, che genera da `splash.html` l'immagine `build/splash.bmp` e l'animazione della barra `build/splash-bar.avi` (con `build/splash-bar.nsh`) mostrate dal launcher durante l'estrazione: modificando la schermata di caricamento, launcher e app restano allineati. Le traduzioni sono in `languages/<codice>.json`, con l'italiano come lingua sorgente del codice; `i18n.js` le carica, `languages.js` aggiunge quelle di `data/languages`. La build passa da `build.js`, che usa electron-builder come `electron-builder --win portable --x64` e aggiunge al launcher `build/portable-launcher.nsh`: senza, la finestra di installazione di NSIS lampeggerebbe per un istante sopra la schermata di caricamento. Se una versione futura di electron-builder non permettesse più l'aggancio, la build si interrompe con un errore invece di produrre un launcher diverso. In sviluppo l'archivio è nella cartella `data` del progetto. Lo smoke test usa un workspace temporaneo separato, verifica la schermata di caricamento con la barra animata, le lingue aggiunte da file, le quattro viste, la creazione di organizzazioni con logo, le dimensioni del testo, gli evidenziatori e le colonne della lista, la sincronizzazione tra finestre, l'esportazione e l'importazione per organizzazione, il server browser con i suoi controlli di sicurezza e la persistenza reale senza modificare i dati dell'utente.

La versione dell'app è definita in `package.json` ed è mostrata nella barra laterale e nella schermata di caricamento. La **2.6.0** aggiunge gli **evidenziatori** per colorare le singole righe (barra sopra la tabella, menu del pallino a fine riga, campo nella modifica e filtro), la scelta e l'ordine delle **colonne** della lista con le nuove colonne facoltative Link portale ed Evidenziazione, e mantiene sempre visibile la colonna delle azioni. Archivio e file esportati restano compatibili: i dati della 2.5.0 vengono aperti senza modifiche e ricevono i colori e le colonne predefiniti, mentre la 2.5.0 ignora i nuovi campi. La **2.5.0** sposta le traduzioni in un file per lingua, permette di aggiungere o personalizzare lingue da `data/languages` con la nuova scheda **Lingua & traduzioni**, e rende la schermata di caricamento solo inglese con una barra infinita animata già nel launcher; l'archivio non cambia. La **2.4.0** aggiunge la schermata di caricamento, visibile fin dal doppio clic e aggiornata con le fasi reali dell'avvio, e rende il pacchetto più leggero includendo solo le lingue di Chromium usate dall'app; l'archivio non cambia. La **2.3.0** riorganizza le impostazioni in schede con indicatori delle modifiche non salvate e trasforma l'elenco dei temi in una galleria compatta con ricerca; l'archivio non cambia. La **2.2.0** ingrandisce i testi predefiniti e aggiunge la sezione **Dimensione del testo**, regolabile per organizzazione; l'archivio resta compatibile e le organizzazioni esistenti partono dalla dimensione standard. La **2.1.0** aggiunge l'esportazione e l'importazione per organizzazione in file separati; il formato dell'archivio non cambia, quindi la cartella `data` resta compatibile con la 2.0.0. La **2.0.0** introduce l'accesso da browser con più organizzazioni in parallelo e i nuovi dati dimostrativi; il salto di versione principale riflette anche il formato d'archivio multi-organizzazione (versione 2), non leggibile dalle versioni 1.x.

### Build, test e push su GitHub

`build-and-push.ps1` chiude una build e, **solo se tutti i test passano**, fa commit e push su GitHub:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\build-and-push.ps1 -Message "Descrizione della modifica"
```

Funziona anche con Windows PowerShell 5.1 (`powershell -File …`). Lo script:

1. controlla il repository: ramo attivo, nessun merge o rebase in corso, ramo non indietro rispetto a `origin` e nessun file da non versionare tra le modifiche (cartelle `data`, `dist`, `node_modules`, eseguibili, archivi, file oltre 5 MB);
2. esegue `npm run check`, `npm test` e lo smoke test dai sorgenti;
3. costruisce il portable in `dist-staging\<versione>`, senza toccare l'eseguibile eventualmente aperto, e ne verifica la versione;
4. esegue lo smoke test dell'app impacchettata (`win-unpacked`). Il launcher portable estrae sempre nella stessa cartella di `%TEMP%` e la cancella all'avvio e alla chiusura, quindi viene testato solo se nessuna istanza di OrbitKanban è aperta; altrimenti lo script lo segnala;
5. copia l'eseguibile testato in `dist\OrbitKanban-Portable.exe`, oppure in `dist\OrbitKanban-Portable-<versione>.exe` se quello è in esecuzione;
6. verifica che i file non siano cambiati durante build e test, poi fa commit di tutte le modifiche (con l'elenco dei test superati nel messaggio), crea il tag `v<versione>` se la versione è nuova, esegue un push atomico di ramo e tag e controlla il risultato sul remoto.

Al primo errore lo script si ferma con codice di uscita 1, prima del commit. Senza `-Message` l'oggetto è `OrbitKanban <versione>`. `-NoDeliver` non copia l'eseguibile in `dist`, `-NoCoAuthor` omette il trailer `Co-authored-by` di Copilot e `-Remote` sceglie un remoto diverso da `origin`. Il tag non viene mai spostato: per pubblicare una nuova versione incrementa prima `version` con `npm version patch --no-git-tag-version --ignore-scripts` (oppure `minor`/`major`). Lo script non crea la release GitHub con l'eseguibile allegato.
