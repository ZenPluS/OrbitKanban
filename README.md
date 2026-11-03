# OrbitKanban — workspace portable

App desktop locale per Windows 10/11 a 64 bit, **versione 2.21.0**. Nessun account, server esterno o collegamento a Internet necessario per l'uso. **Il nome dell'app è sempre OrbitKanban e non è configurabile.** Tutte le impostazioni del workspace appartengono alla singola organizzazione. Mentre l'app è aperta puoi usarla anche **dal browser dello stesso PC**, con più organizzazioni aperte contemporaneamente in schede diverse.

## Avvio e condivisione

1. Copia `OrbitKanban-Portable.exe` in una cartella scrivibile, per esempio su una chiavetta o sul Desktop. Evita `Program Files` e cartelle di sola lettura.
2. Apri l'eseguibile. Al primo avvio viene creata la cartella `data` accanto all'eseguibile, con un'organizzazione dimostrativa completa (vedi [Dati dimostrativi](#dati-dimostrativi)).
3. Per spostare o condividere tutto, **chiudi l'app e copia insieme l'eseguibile e la cartella `data`**. Copiare soltanto l'eseguibile crea un workspace nuovo.

Windows potrebbe mostrare un avviso SmartScreen perché l'eseguibile non è firmato digitalmente. L'app non richiede privilegi di amministratore. Il file eseguibile è `OrbitKanban-Portable.exe`. Per aggiornare una versione precedente, chiudi l'app e affianca il nuovo eseguibile alla cartella `data` esistente: non è necessario rinominare o ricreare l'archivio.

### Schermata di caricamento

L'icona dell'eseguibile portable, della finestra e della barra delle applicazioni usa lo **stesso logo OrbitKanban** mostrato nella schermata di caricamento e nell'app. I loghi personalizzati delle organizzazioni continuano a comparire nella sidebar e nella scheda del browser; non sostituiscono l'icona Windows dell'app.

L'eseguibile portable estrae i file dell'app in una cartella temporanea a ogni avvio: è la parte che richiede qualche secondo. Appena fai doppio clic compare la **schermata di caricamento**, sempre in inglese, con logo, versione e una **barra di caricamento infinita** che scorre senza fermarsi fin dal primo istante, già durante l'estrazione. Quando l'app parte, la stessa schermata, nella stessa posizione, prosegue con la stessa animazione finché l'organizzazione non è pronta; non ci sono fasi numerate, perché la durata di ogni passaggio dipende dal PC. Tra la schermata del launcher e quella dell'app può esserci un passaggio di qualche decimo di secondo. La finestra principale compare solo quando l'organizzazione è già disegnata, con lo sfondo del suo tema. Se il sistema chiede di ridurre le animazioni, la barra non scorre ma pulsa lentamente. Il pacchetto include soltanto le risorse di Chromium per italiano e inglese, così l'estrazione è più leggera.

L'archivio è `data/workspace.json`; `workspace.json.bak` contiene il salvataggio precedente e le copie giornaliere sono in `data/backups`. Cache, log e la chiave dell'accesso da browser (`data/runtime/browser-access-token`) restano anch'essi nella cartella `data`. Non usare l'app direttamente dentro un archivio ZIP e non aprire più copie dell'eseguibile sullo stesso archivio condiviso: per lavorare in più finestre usa l'[accesso da browser](#accesso-da-browser), che passa sempre dall'unica app aperta. È un'app monoutente, non un sistema di collaborazione in rete.

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
3. Traduci solo i **valori**. Le chiavi sono il testo originale inglese e non vanno modificate; i segnaposto come `{0}` vanno mantenuti. `messages` contiene i testi dell'interfaccia, `terms` i nomi iniziali di stati, urgenze e tab e i testi dei dati dimostrativi, `plurals` i conteggi con le forme `zero`, `one`, `two`, `few`, `many` e `other` (obbligatoria). I testi lasciati vuoti o eliminati restano in inglese, quindi si può tradurre anche un poco alla volta.
4. Premi **Ricarica lingue**: la nuova lingua compare nel selettore con l'etichetta **Aggiunta da file**. Sceglila e premi **Salva impostazioni**.

Un file con il codice di una lingua integrata, per esempio `en.json` o `it.json`, sostituisce solo i testi che contiene ed è segnalato come **Personalizzata da file**. I file non validi, con JSON errato, codice diverso dal nome del file o più grandi di 2 MB, vengono ignorati ed elencati in **File lingua ignorati** con il motivo, senza bloccare l'app. La cartella `data/languages` viaggia con la cartella `data`; se un'organizzazione usa una lingua non presente su un altro PC, il selettore la indica come **non installata** e i testi sono mostrati in inglese finché il file non viene copiato. Le lingue valgono anche per l'accesso da browser. La schermata di caricamento resta sempre in inglese.

## Esporta e importa per organizzazione

In **Impostazioni → Esporta e importa organizzazione** puoi salvare l'organizzazione attiva in **file JSON separati**, da conservare, condividere con un collega o reimportare qui o in un'altra copia di OrbitKanban:

| Pulsante | Contenuto del file |
| --- | --- |
| **Esporta temi** | tutti i temi dell'organizzazione, con i quattro colori, e il tema attivo |
| **Esporta configurazione** | lingua, modello del link al portale, nomi dei tab, ore per giorno, font e dimensioni del testo, stati con colori ed evidenziazione, urgenze, evidenziatori, colonne della lista e logo |
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
- link generati dal modello `https://jira.example.com/browse/{code}` e, per i codici `CHG…`, link specifici a un secondo portale;
- un tema aggiuntivo **Aurora**.

I dati sono generati in modo deterministico rispetto alla data del primo avvio e vengono creati **solo se non esiste già un archivio**: aggiornando l'app, la cartella `data` esistente non viene toccata. Per vedere gli esempi accanto ai tuoi dati crea una nuova organizzazione con **Includi dati dimostrativi**; potrai eliminarla in qualsiasi momento. **Svuota attività e issue** rimuove gli esempi dell'organizzazione corrente mantenendone le impostazioni.

## Accesso da browser

Mentre OrbitKanban è aperto, l'app espone la stessa interfaccia anche al browser **di questo PC** all'indirizzo `http://127.0.0.1:47821` (se la porta è occupata ne viene scelta automaticamente un'altra, visibile nelle impostazioni).

- Il pulsante **Apri nel browser** sotto il selettore delle organizzazioni apre l'organizzazione corrente nel browser predefinito. Dal browser lo stesso pulsante diventa **Apri in nuova scheda**.
- Ogni scheda mostra l'organizzazione scelta dal proprio menu, indipendentemente dall'app e dalle altre schede: puoi tenere **più organizzazioni aperte contemporaneamente**. Il titolo della scheda riporta il nome dell'organizzazione e l'indirizzo (`?org=…`) può essere salvato nei preferiti.
- Le modifiche si **sincronizzano in tempo reale** tra app e schede, senza ricaricare. Se due finestre modificano la stessa organizzazione quasi insieme, la seconda modifica viene riapplicata sui dati aggiornati invece di sovrascriverli. Le impostazioni che stai modificando e non hai ancora salvato non vengono perse quando arrivano aggiornamenti da altre finestre.
- In **Impostazioni → Accesso da browser** trovi l'indirizzo e il comando **Copia link di accesso**.
- Il server ascolta **solo su 127.0.0.1**: non è raggiungibile da altri computer della rete. Il primo accesso usa un link con una chiave personale, poi il browser ricorda la sessione con un cookie protetto. **Non condividere il link di accesso**: contiene la chiave. Eliminando `data/runtime/browser-access-token` ad app chiusa la chiave viene rigenerata e le sessioni precedenti vengono invalidate.
- Chiudendo l'app le schede mostrano **App non raggiungibile** e non possono salvare; riaprendo l'app e ricaricando la pagina si riprende a lavorare. Archivio principale e copie di sicurezza restano nella cartella portable `data`.
- Dal browser funzionano anche esportazione (download del backup), importazione, esportazione e importazione per organizzazione (i file vengono scaricati dal browser) e apertura dei link al portale in una nuova scheda.

## Link al portale

Ogni organizzazione ha il proprio **Modello del link** in **Impostazioni → Link al portale**. Inserisci l'indirizzo del portale e metti il segnaposto `{codice}` nel punto in cui va il codice dell'attività, per esempio `https://jira.azienda.com/browse/{codice}` oppure `qualcosa.net/{codice}/dettaglio`. Sono accettati anche `{code}`, `<codice>` e `<code>`, senza distinzione tra maiuscole e minuscole; il segnaposto può comparire più volte. Se manca lo schema viene aggiunto `https://`. Sotto il campo un'anteprima mostra il link generato con un codice reale e segnala un modello senza segnaposto o non valido, che non può essere salvato. Il modello vale solo per l'organizzazione attiva: un'altra organizzazione può usare un portale diverso o nessuno.

Nell'attività il link non è più obbligatorio. Con il campo **Link specifico (facoltativo)** vuoto il link viene costruito dal codice portale tramite il modello, e si aggiorna da solo se cambi il modello o il codice. Un link specifico, utile per ticket su un altro portale, ha la precedenza sul modello; se coincide con quello generato non viene memorizzato separatamente. Il codice viene inserito nell'URL con la codifica necessaria per spazi e caratteri speciali. Senza modello e senza link specifico l'attività semplicemente non mostra il collegamento.

L'icona **apri esterno** (freccia che esce da un riquadro) accanto al codice nella lista attività, nelle card delle milestone e del kanban, il link nel dialog dell'attività e l'anteprima nelle impostazioni **aprono la pagina nel browser predefinito del PC**, anche con clic centrale o `Ctrl+clic`; l'app non naviga mai all'interno della propria finestra. Vengono aperti solo indirizzi `http://` e `https://`.

## Le quattro viste

Le intestazioni e i riepiloghi sono compatti in tutte le schede. Tabelle, milestone e kanban occupano lo spazio rimanente della finestra e scorrono al proprio interno; le dimensioni del testo configurate restano rispettate. Su finestre basse o con caratteri grandi, anche l'area contenuti può scorrere per mantenere accessibili tutti i comandi.

Il testo dell'interfaccia non viene selezionato trascinando il mouse, come in un'app desktop. La selezione e il copia/incolla restano disponibili nei campi di testo, nella ricerca e negli editor rich text.

Dalla **2.13.0**, su Windows la finestra non usa più la barra del titolo di sistema: la **barra superiore dell'app** (percorso, stato dell'archivio) fa da barra del titolo e i pulsanti **riduci a icona, ingrandisci e chiudi** prendono sfondo e colore del testo del **tema attivo**, anche durante l'anteprima di un tema. Trascina la barra superiore o il logo in alto a sinistra per spostare la finestra; doppio clic per ingrandirla o ripristinarla. L'altezza segue le dimensioni del testo configurate e, con una finestra di dialogo aperta, i pulsanti si oscurano insieme alla pagina. Nella versione browser non cambia nulla.

Nelle liste **Attività** e **Issue collegate**, fai **doppio clic su una cella della riga** per aprire la relativa finestra di modifica. Restano disponibili i pulsanti di modifica e il clic sul codice; link e pulsanti mantengono le proprie azioni. Con un evidenziatore attivo, i clic continuano a colorare le righe senza aprire l'editor. Il Kanban resta in sola lettura.

Dalla **2.15.0**, la creazione e la modifica delle attività usano una **finestra larga**: proprietà, link e associazioni a sinistra, descrizione e note a destra. Sul desktop i campi sono visibili insieme; i testi lunghi scorrono dentro i rispettivi editor e **Salva, Annulla ed Elimina restano sempre accessibili**. Su schermi stretti i gruppi tornano in colonna e scorre solo il contenuto, rispettando le dimensioni del testo configurate.

Ricerca e cambi di vista riutilizzano le anteprime rich text già elaborate e il formattatore delle date. Le associazioni incident/problem vengono indicizzate una sola volta per ogni ricerca, lista o esportazione, evitando di rileggere tutte le issue per ogni attività. La cache delle anteprime è limitata in memoria, non viene salvata e non altera la sanitizzazione o il contenuto dell'archivio.

Dalla **2.12.0**, salvataggi, eliminazioni e cambio di visibilità conservano lo scorrimento orizzontale e verticale della vista corrente, compresi ricerca delle issue e filtri. Descrizione e note mostrano direttamente nella tabella fino a tre righe di testo, andando a capo anche con parole o URL molto lunghi; il suggerimento al passaggio del mouse contiene il testo completo. Un clic apre l'editor rich text, senza alterare il contenuto salvato.

- **Attività**: creazione e modifica tramite “Nuova attività”, codice o descrizione. Progressivo automatico ma modificabile; codice portale con link facoltativo (vedi **Link al portale**); descrizione e note rich text; urgenza, stato, effort in giorni e ore, release date e associazioni incident/problem automatiche. I numeri progressivi possono essere duplicati intenzionalmente. Scorciatoia: `Ctrl+N`.
- **Issue collegate**: ogni riga associa un codice portale a un incident e/o problem. Sono consentiti più incident per problem e più righe per codice. Il confronto del codice ignora spazi esterni e maiuscole/minuscole. Nelle attività le associazioni vengono aggregate senza duplicati; non è necessaria alcuna connessione a JIRA.
- **Milestone**: timeline orizzontale per data di release, con tutte le attività della tappa. Scorre sia in larghezza sia in altezza; il codice apre la modifica. Le attività senza data compaiono in “Da pianificare”. Include anche le attività nascoste dalla lista, contrassegnate dall'etichetta “Nascosta in lista” e da un bordo tratteggiato.
- **Kanban**: sola lettura, una colonna per ogni stato e nello stesso ordine configurato nelle impostazioni. Si modifica lo stato dalla lista attività. Mostra anche le attività nascoste dalla lista, con la stessa etichetta.

Nelle **Milestone**, la prima data di release **da oggi in avanti** è avvolta da una colonna evidenziata con bordo, sfondo ed etichetta **Prossima release**; se la data è oggi compare **Release di oggi**. La selezione dipende dalla data locale del PC, non dallo stato o dalla visibilità delle attività, e mantiene i colori originali delle date e delle righe. All'apertura della vista la colonna viene portata in vista; il pulsante con la prossima data nell'intestazione permette di ritrovarla dopo aver scorso lo storico. Le sincronizzazioni mantengono lo scorrimento scelto dall'utente. L'indicatore si aggiorna con i dati e al cambio di giorno (entro un minuto, senza interrompere un editor aperto). Se restano solo release passate o attività senza data, nessuna colonna viene evidenziata e compare **Nessuna release in programma**.

L'ordinamento iniziale delle attività è per release crescente, con date mancanti in fondo. Clic sulle intestazioni per cambiare verso; `Maiusc+clic` per ordinamenti a più livelli. Descrizione e note non sono ordinabili. Urgenza e stato vengono ordinati in base all'ordine delle rispettive opzioni, non alfabeticamente. Il pulsante “Release” ripristina l'ordinamento iniziale. Ricerca e filtri della lista non limitano le altre viste.

La **ricerca globale** in alto (`Ctrl+K`) cerca attività e issue per codice, incident e problem, oltre ai contenuti descrittivi e alle date di release; selezionando un risultato si apre direttamente la relativa modifica. Nella lista attività puoi **salvare fino a 30 viste per organizzazione**: ciascuna conserva ricerca, filtri, attività nascoste/duplicate, ordinamento e colonne, e si riapplica dal menu delle viste salvate.

Le modifiche salvate possono essere annullate con **Annulla** (`Ctrl+Z`) e ripristinate con **Ripristina** (`Ctrl+Y` o `Ctrl+Maiusc+Z`). La cronologia conserva fino a 20 operazioni per organizzazione finché l'app resta aperta; non modifica le azioni non ancora salvate e viene azzerata al riavvio o quando i dati cambiano in un'altra finestra.

Per un **ordine manuale**, trascina la maniglia accanto alla casella di selezione di una riga, oppure usa le frecce su/giù con il focus sulla maniglia. La tabella scorre automaticamente avvicinandosi ai bordi e `Esc` annulla il trascinamento. Al rilascio l'ordine viene salvato, i campi **Progressivo / Sequence** vengono rinumerati da 1 per tutte le attività e la vista passa a **Sequence crescente**, anche se la relativa colonna è nascosta. Con filtri attivi vengono riordinate soltanto le righe mostrate: le altre conservano le proprie posizioni nell'ordine globale, pur ricevendo i nuovi progressivi. I valori manuali precedenti, anche duplicati, vengono quindi sostituiti dalla numerazione consecutiva. Le nuove Sequence restano nell'archivio e negli export; all'avvio resta predefinito l'ordinamento per release, selezionando l'intestazione Progressivo ritrovi l'ordine manuale.

Il pulsante circolare a destra della riga la nasconde **solo dalla lista attività**, senza eliminarla: è utile, per esempio, per togliere dalla lista le attività già rilasciate in produzione. Le attività nascoste restano visibili in **Milestone** e **Kanban**, contrassegnate da “Nascosta in lista”. Attiva “Nascoste” nella lista per ritrovarle e ripristinarle. Il contatore del tab e le statistiche della lista escludono le righe nascoste. Le associazioni issue restano sempre disponibili.

## Tags delle attività

La **2.7.0** aggiunge la colonna **Tags**, visibile anche aggiornando gli archivi esistenti. In **Impostazioni → Tags** crea il catalogo della singola organizzazione: ogni tag ha nome e colore, e l'ordine si cambia trascinando le righe o con le frecce (vedi [Riordino con trascinamento](#riordino-con-trascinamento)). Sono disponibili fino a **100 tag**, con nomi univoci (senza distinzione tra maiuscole e minuscole) di massimo **60 caratteri**. Premi **Salva impostazioni** per applicare le modifiche.

Clicca la cella **Tags** di un'attività (la freccia in fondo alla cella indica il menu) per aprire il menu multiselezione direttamente nella lista: spunta uno o più tag e premi **Applica**. **Annulla**, `Esc` o un clic fuori dal menu scartano la scelta; deselezionandoli tutti e applicando l'attività resta senza tag. Dalla **2.12.0** i tag non sono più modificabili nella scheda attività: salvare la scheda conserva le assegnazioni della lista. Per le nuove attività, assegna i tag dopo il primo salvataggio; resta disponibile anche la modifica multipla. La ricerca della lista trova i nomi dei tag; dal pulsante **Colonne** puoi nascondere o spostare la colonna senza cancellare le assegnazioni.

Rinominare, ricolorare o riordinare un tag aggiorna la sua visualizzazione nelle righe che lo usano. Eliminare un tag e salvare lo rimuove anche dalle attività nascoste, senza eliminare attività o altri tag. Le modifiche non salvate possono essere annullate come per le altre impostazioni.

Catalogo e assegnazioni restano locali, separati per organizzazione e sincronizzati con le schede del browser. Viaggiano con backup ed esportazioni di configurazione, dati o organizzazione completa. Importando dati, i tag vengono associati per identificativo/nome e quelli mancanti vengono aggiunti; in caso di collisione di identificativo viene preservato il significato del tag. I vecchi archivi si aprono con un catalogo vuoto e senza assegnazioni, senza cambiare il formato dell'archivio. I vecchi file importati in modalità **Aggiungi e aggiorna** non cancellano i tag già assegnati.

## Rilevamento duplicati

Dalla **2.9.0** l'app segnala i possibili duplicati usando come chiave l'**incident**, confrontato come i codici portale: senza distinzione tra maiuscole e minuscole e ignorando gli spazi esterni. Le associazioni senza incident (solo problem) non sono mai considerate duplicate. Il controllo è solo una segnalazione: nulla viene bloccato, unito o eliminato automaticamente, e il formato dell'archivio non cambia, quindi funziona subito anche sugli archivi esistenti.

- **Issue collegate**: un'associazione è un possibile duplicato quando il suo incident compare in più righe. Le righe coinvolte hanno l'incident evidenziato in ambra con l'icona dei duplicati (due fogli sovrapposti) e l'elenco delle altre righe nel suggerimento; cliccandolo la lista mostra solo le associazioni con quell'incident. Il filtro **Duplicati** mostra tutte le associazioni coinvolte. Le righe che ripetono esattamente codice portale, incident, problem e valori personalizzati di un'altra sono marcate **identica**: il pulsante **Rimuovi identiche** le elimina dopo conferma, lasciando la prima di ogni gruppo; incident e problem delle attività non cambiano.
- **Attività**: un'attività è un possibile duplicato quando un suo incident è collegato, tramite le associazioni, anche ad altre attività (con codice portale diverso o uguale). La riga riceve l'icona dei duplicati nella colonna azioni e l'incident evidenziato nella colonna Incident; cliccandoli la lista mostra le attività che lo condividono. Il filtro **Duplicati** include anche le attività **nascoste**, così un duplicato già rilasciato non sfugge.
- La barra laterale mostra sull'icona di **Attività** e **Issue collegate** un contatore ambra degli elementi coinvolti.
- Durante l'inserimento o la modifica, la finestra dell'attività (al cambio del codice portale) e quella dell'associazione (al cambio di codice, incident o problem) avvisano subito se si sta creando un duplicato, indicando con quali righe; il salvataggio resta comunque possibile.

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

Le colonne della lista si scelgono con il pulsante **▥ Colonne** nella barra della lista o in **Impostazioni → Colonne della lista**: spunta le colonne da mostrare e cambiane l'ordine trascinandole o con le frecce; **Ripristina predefinite** torna alla disposizione iniziale. Oltre alle colonne di sempre sono disponibili, inizialmente nascoste, **Link portale**, con l'indirizzo cliccabile, ed **Evidenziazione**, ordinabile in base all'ordine degli evidenziatori. Nascondere una colonna non cancella i dati e la colonna delle azioni resta sempre presente; se le nascondi tutte, il codice portale torna visibile. La disposizione è salvata per organizzazione.

Ogni data ha un colore deterministico condiviso tra lista e milestone: lo stesso giorno mantiene lo stesso colore, indipendentemente dallo stato e dalla posizione. Non è un indicatore di scadenza.

## Filtri per colonna e colonne personalizzate

Dalla **2.16.0**, ogni intestazione delle liste **Attività** e **Issue collegate** ha il pulsante **▽ Filtra colonna**:

- testo, descrizione, note e link: ricerca **Contiene**, senza distinzione tra maiuscole e minuscole;
- numeri ed effort: intervallo **Da / A**, con estremi inclusi; l'effort si filtra in ore;
- date (release date e colonne personalizzate di tipo data): dalla **2.19.0** non si digitano più, si scelgono tra quelle presenti (vedi sotto);
- stati, urgenze, evidenziatori, tag e altri elenchi: selezione di uno o più valori; basta che la cella contenga una delle scelte;
- tutte le colonne tranne le date: celle vuote, valorizzate oppure entrambe. **Solo vuote** ignora gli altri criteri della stessa colonna.

Il filtro di una colonna data elenca, ciascuna con il suo colore e il numero di righe, **Non assegnata** (righe senza data) e tutte le date presenti fra le righe mostrate dagli altri filtri; restano elencate anche le date già spuntate che nel frattempo sono sparite. **Seleziona tutte** e **Deseleziona tutte** agiscono sull'intero elenco. In alternativa, o in aggiunta, **Da** e **A** scelgono un intervallo fra le stesse date, estremi inclusi: date spuntate, **Non assegnata** e intervallo si sommano, quindi una riga compare se soddisfa almeno una delle scelte. Spuntare tutte le date senza **Non assegnata** significa «solo righe con data», valido anche per le date aggiunte in seguito; spuntare tutto rimuove il filtro. Prima della 2.19.0 la data si digitava nel campo nativo del browser, il cui formato dipende dalla lingua del sistema (mese/giorno in inglese): una data inserita come giorno/mese poteva quindi non trovare righe.

**Viste per release**: il menu delle viste della lista attività contiene, oltre alle **Viste salvate**, una vista automatica per ogni release date, con il numero di attività: **Prossime release** (da oggi in avanti, in ordine crescente, più **Non assegnata** per le attività senza data) e **Release passate** (dalla più recente). Le date seguono le attività mostrate, comprese quelle nascoste solo se **Nascoste** è attivo, e si aggiornano subito quando aggiungi o sposti una release. Aprire una vista per release azzera ricerca, stato, evidenziazione, duplicati e filtri per colonna e filtra la release date su quel giorno, mantenendo colonne, ordinamento e nascoste; modificare poi un filtro esce dalla vista. Le viste per release non occupano posti tra le 30 viste salvate e non vengono scritte nell'archivio.

I filtri di colonne diverse si combinano con **AND**, insieme alla ricerca e ai filtri già presenti. La barra sopra la tabella mostra i filtri attivi con un breve riepilogo dei valori scelti, anche se la colonna viene nascosta; puoi modificarli, rimuoverne uno o premere **Azzera filtri colonne**. Restano passando tra i tab, ma si azzerano cambiando organizzazione o ripristinando l'archivio. Le **viste salvate** delle attività conservano anche i filtri per colonna.

In **Impostazioni → Colonne personalizzate** puoi aggiungere fino a **30 colonne per ciascuna lista**, indipendenti per organizzazione:

| Tipo | Valore |
| --- | --- |
| Testo / Testo formattato | Testo semplice o rich text |
| Numero | Numero intero o decimale, anche negativo |
| Data | Data di calendario, con colore deterministico |
| Elenco a scelta singola / multipla | Etichette con nome e colore, configurate nella sezione dedicata |
| Link | Indirizzo HTTP/HTTPS cliccabile |
| Effort (ore) | Numero di ore non negativo |
| Sì / No | Sì, no oppure non compilato |

Il tipo si sceglie alla creazione e non cambia successivamente, per proteggere i dati. Nomi (massimo 60 caratteri), opzioni e ordine sono modificabili; nomi e opzioni devono essere univoci senza distinzione di maiuscole. Gli elenchi accettano fino a 100 etichette, oppure possono restare vuoti.

Dalla **2.18.0**, **Salva impostazioni** include anche nome e tipo delle nuove colonne ancora compilate nei moduli, senza obbligare a premere prima **Aggiungi colonna**. Quest'ultimo permette di prepararne altre o configurare subito le etichette. Le colonne in attesa attivano l'avviso di modifiche non salvate; un nome non valido o duplicato blocca tutto il salvataggio senza svuotare i moduli. Se un'altra finestra modifica le definizioni mentre le impostazioni sono aperte, il salvataggio della vecchia bozza viene bloccato esplicitamente per non cancellare colonne e valori: annulla la bozza e ripeti le modifiche sulla configurazione aggiornata.

Dalla **2.17.0**, ogni colonna a scelta genera automaticamente una propria scheda sotto **Impostazioni → Etichette delle colonne**, identificata dal nome della colonna e dalla lista di appartenenza. **Gestisci etichette e colori** apre la scheda: come per i Tags, puoi aggiungere etichette, modificarne nome e colore, trascinarle o usare le frecce per riordinarle ed eliminarle. Rinomine e riordini conservano le assegnazioni tramite identificativi stabili; le eliminazioni rimuovono le selezioni dalle righe solo con **Salva impostazioni**, e sono annullabili.

Le colonne a scelta multipla mostrano le stesse **pillole colorate e lo stesso dropdown con caselle dei Tags**, sia direttamente nelle righe di attività e issue sia negli editor. **Applica** nella tabella salva le selezioni senza aprire la scheda; nell'editor aggiorna solo il modulo, da confermare con il suo pulsante Salva. Le colonne a scelta singola mostrano anch'esse etichette colorate. I vecchi valori testuali vengono convertiti senza perdere le selezioni; etichette, colori e ordine sono portatili e rispettati anche da ricerca, filtri, CSV ed Excel.

I valori si compilano nelle finestre di modifica di attività e issue, sono ricercabili e vengono salvati insieme all'archivio. Le colonne si mostrano, nascondono e riordinano con **▥ Colonne** su entrambe le liste. Nelle attività, numero, data, effort, sì/no ed elenco singolo sono anche ordinabili. Eliminare una definizione richiede conferma e rimuove i suoi valori soltanto con **Salva impostazioni**; la modifica è annullabile. La modifica multipla dei campi standard conserva i valori personalizzati.

Schemi e valori viaggiano nei backup, nei file dell'organizzazione e nell'export dei soli dati. In importazione, colonne con lo stesso nome e tipo vengono riutilizzate; tipi diversi con lo stesso nome producono un errore. Gli archivi precedenti si aprono senza perdere dati. Non usare versioni precedenti alla 2.17.0 per modificare archivi aggiornati con le etichette colorate.

## Importazione CSV

Il pulsante **Importa CSV** nelle due liste aggiunge righe all'organizzazione attiva, senza sostituire o aggiornare implicitamente quelle esistenti:

1. Scegli un file `.csv` o `.tsv` (massimo **16 MB**, **100 colonne**, **10.000 righe dati**).
2. Verifica separatore (automatico, virgola, punto e virgola o tab), codifica (**UTF-8**, **Windows-1252** o **UTF-16 LE**) e presenza della riga di intestazioni.
3. Mappa ogni colonna sul campo desiderato, standard o personalizzato; **Non importare** la ignora. I nomi comuni italiani/inglesi sono riconosciuti automaticamente. Lo stesso campo non può essere mappato due volte.
4. Controlla l'anteprima delle prime dieci righe valide e gli errori per riga/colonna. **Nessun dato viene salvato finché tutti gli errori non sono risolti.**
5. Premi **Importa righe**. L'intera importazione si può annullare con `Ctrl+Z`.

È obbligatorio mappare e compilare il **codice portale**; nelle issue serve anche almeno un **incident** o **problem**. Questi ultimi sono calcolati nelle attività: importarli dalla lista **Issue collegate** con lo stesso codice portale. I possibili duplicati restano segnalati, non vengono cancellati automaticamente; associazioni con valori personalizzati diversi non sono considerate identiche dalla funzione di pulizia.

- Date: `AAAA-MM-GG` oppure `GG/MM/AAAA`, con calendario valido.
- Numeri: punto o virgola decimale, **senza separatori delle migliaia**. Giorni e ore dell'effort standard vengono sommati usando le ore/giorno dell'organizzazione.
- Sì/no: `sì`, `no`, `yes`, `true`, `false`, `1`, `0`.
- Stati, urgenze, evidenziatori e tag: nome o identificativo del catalogo. Scelte multiple e tag sono separati da `|`.
- Configura prima opzioni e colonne personalizzate; valori mancanti o ambigui nei cataloghi vengono segnalati.
- Campi non mappati o vuoti mantengono i valori iniziali: stato iniziale, urgenza predefinita, progressivo automatico, visibilità normale e testi vuoti.
- Le celle tra virgolette possono contenere separatori, virgolette raddoppiate e ritorni a capo; le righe completamente vuote sono ignorate. Una riga con un numero di celle diverso dalle intestazioni viene segnalata.
- Descrizioni e note sono importate come **testo**, preservando gli a capo: eventuale HTML non viene eseguito. Le righe indicate negli errori sono numerate a partire dalla prima riga dati, escluse intestazioni e righe vuote.

## Riordino con trascinamento

Dalla **2.8.0** stati, urgenze, evidenziatori, tag e colonne della lista (in **Impostazioni** e nella finestra **▥ Colonne**) si riordinano trascinandoli. Afferra la maniglia ⠿ a sinistra della riga, oppure un punto libero della riga come il numero d'ordine o il nome della colonna, e rilasciala nella nuova posizione: le altre righe si spostano per mostrare dove finirà e l'elenco scorre da solo quando arrivi al bordo. Esc durante il trascinamento annulla lo spostamento. I campi di testo e i selettori di colore restano utilizzabili come prima, e trascinare il nome di una colonna non ne cambia la visibilità.

Le frecce ↑ ↓ restano disponibili; da tastiera, con il focus sulla maniglia, i tasti freccia su e giù spostano la riga e la nuova posizione viene annunciata ai lettori di schermo. Come ogni altra impostazione, il nuovo ordine si applica premendo **Salva impostazioni** (nella finestra Colonne, **Applica**): l'ordine degli stati diventa quello delle colonne del kanban.

## Modifica multipla

Dalla **2.10.0** la lista attività ha una colonna di caselle a sinistra per selezionare più righe:

- clic sulla casella per selezionare una riga; **Maiusc + clic** seleziona tutte le righe comprese tra l'ultima spuntata e quella cliccata, nell'ordine mostrato;
- la casella nell'intestazione seleziona o deseleziona tutte le attività mostrate con i filtri attuali;
- la selezione resta anche cambiando ricerca, filtri, ordinamento o vista: il piè di pagina indica quante attività sono selezionate e quante non sono visibili con i filtri attuali. **Deseleziona** o `Esc` la azzerano. Il clic sulla casella non apre la modifica e non applica l'evidenziatore attivo.

Con almeno una riga selezionata compare la barra con **Modifica multipla…**, che apre una finestra con l'elenco delle attività coinvolte (ogni riga si può escludere togliendo la spunta; quando le attività hanno stati diversi, i chip in alto selezionano solo quelle di uno stato) e i campi da cambiare. Ogni campo parte da **— Non modificare —**, quindi viene cambiato solo ciò che scegli:

- **Stato** e **Urgenza**;
- **Release date**: imposta una data, **sposta di N giorni** (anche negativi; le attività senza data restano da pianificare) oppure togli la data;
- **Evidenziazione**: un colore o **Nessuna evidenziazione**;
- **Visibilità nella lista**: nascondi o mostra;
- **Tags**: per ogni tag del catalogo, aggiungi o togli, lasciando invariati gli altri tag delle attività.

Il riepilogo in fondo indica a quante attività verranno applicate le modifiche. **Applica** salva tutto in un'unica operazione, sincronizzata con le altre finestre e schede del browser. **Elimina…** cancella le attività spuntate dopo una conferma; le associazioni delle issue collegate restano invariate.

Anche nella vista **Milestone** ogni tappa ha il pulsante con la matita in alto a destra, che apre la modifica multipla per tutte le attività di quella release (comprese le nascoste), per esempio per spostare l'intera release a un'altra data o chiuderne gli stati. La colonna **Da pianificare** ha lo stesso pulsante per assegnare una data alle attività senza release.

## Esportazione Excel

Dalla **2.10.0** il pulsante **⤓ Excel**, presente nell'intestazione di tutte e quattro le viste e nella barra della selezione, esporta la situazione attuale in una cartella di lavoro `.xlsx` apribile con Excel, LibreOffice o Google Fogli. Il file è generato direttamente dall'app, senza componenti aggiuntivi né collegamento a Internet. Nella finestra di esportazione scegli:

- **Attività da esportare**: come mostrate nella lista (con filtri e ordinamento attuali), tutte comprese le nascoste, oppure solo quelle selezionate;
- **Colonne dei fogli attività e issue**: quelle visibili nelle rispettive liste, nello stesso ordine, oppure tutte, incluse le personalizzate;
- **Fogli** da includere.

I fogli disponibili, con i nomi dei tab dell'organizzazione:

- **Riepilogo**: organizzazione, data di esportazione, versione dell'app, filtri e ordinamento usati, totali (attività, nascoste, effort in giorni e in ore, release pianificate, da pianificare, prossima release, in evidenza, con incident duplicato) e la ripartizione per stato e per urgenza con conteggi, ore e percentuali.
- **Attività**: una riga per attività con le colonne scelte. Il codice portale e il link sono collegamenti cliccabili; l'effort compare sia nel formato giorni/ore sia come numero di ore; le release date sono vere date di Excel colorate come nell'app (stessa data, stesso colore); stati, urgenze ed evidenziazioni mantengono i loro colori e le righe evidenziate sono colorate. Gli incident duplicati sono segnalati in ambra e le attività nascoste in corsivo grigio, con la colonna **Nascosta**. Intestazione e codice restano bloccati scorrendo e i filtri di Excel sono già attivi.
- **Issue collegate**: con **Come mostrate nella lista** rispetta ricerca e filtri delle issue; le altre opzioni esportano tutte le associazioni. Comprende le colonne scelte, il numero di attività collegate e l'indicazione dei duplicati (identica o stesso incident).
- **Milestone**: una riga per release in ordine di data con stato (passata, prossima, futura), numero di attività, ore, effort, conteggio per stato e codici. La prossima release è evidenziata in giallo; in fondo le attività da pianificare.
- **Kanban**: una colonna per stato, nell'ordine degli stati, con codice e descrizione delle attività.

Il nome proposto è `OrbitKanban-<organizzazione>-situazione-<data>.xlsx` (in inglese `situation`). Nell'app desktop scegli dove salvarlo; dal browser viene scaricato come un normale file. L'esportazione non modifica i dati e non cambia il formato dell'archivio.

Le colonne personalizzate mantengono numeri e date come celle Excel tipizzate, link cliccabili, scelte multiple leggibili e testo formattato convertito in testo con a capo. Il riepilogo riporta anche i filtri per colonna delle due liste.

## Backup automatici

OrbitKanban crea una copia portable giornaliera dell'intero archivio prima della prima modifica del giorno e ne conserva le **14 più recenti** in `data/backups`. La lista in **Impostazioni → Dati e accesso** mostra data e dimensione; **Ripristina** richiede conferma e ripristina tutte le organizzazioni e impostazioni. Prima del ripristino, lo stato corrente viene salvato anche in `data/workspace.json.bak`. I backup si spostano e si condividono insieme all'eseguibile e alla cartella `data`; dal browser locale sono consultabili e ripristinabili con le stesse conferme.

## Impostazioni

Le impostazioni sono organizzate in **schede**: a sinistra un menu raggruppa le sezioni (**Organizzazione**, **Aspetto**, **Flusso di lavoro**, **Dati e accesso**) e a destra è visibile una sola sezione alla volta, così la pagina resta compatta anche con molti temi. La scheda aperta viene ricordata finché la finestra resta aperta e si può cambiare anche con le frecce della tastiera. Un pallino accanto al nome segnala le schede con modifiche non salvate e la barra di avviso elenca le sezioni modificate con un collegamento diretto; se il salvataggio fallisce viene aperta la scheda del campo da correggere. Con finestre strette il menu diventa una barra orizzontale scorrevole.

- Nome dell'organizzazione e nomi dei quattro tab; il nome dell'app rimane OrbitKanban.
- **Lingua & traduzioni**: lingua dell'organizzazione, elenco delle lingue disponibili, cartella delle lingue con il modello inglese, ricarica dei file e segnalazione dei file non validi (vedi [Lingue e traduzioni](#lingue-e-traduzioni)).
- Stati e urgenze: nomi, colori, aggiunta, eliminazione e riordino con trascinamento o frecce. Un'opzione usata da un'attività, anche nascosta, non può essere eliminata: riassegna prima le attività.
- La stella accanto a uno stato abilita l'evidenziazione automatica delle relative righe.
- **Evidenziatori** e **Colonne della lista**: colori per evidenziare singole righe e colonne visibili della lista, con il loro ordine (vedi [Evidenziatori e colonne della lista](#evidenziatori-e-colonne-della-lista)).
- **Tags**: catalogo di etichette con nome, colore e ordine, assegnabili in selezione multipla alle attività (vedi [Tags delle attività](#tags-delle-attività)).
- Ore per giorno (inizialmente 8): l'effort viene archiviato in ore; cambiare la durata della giornata cambia solo la rappresentazione, non il totale registrato.
- **40 temi predefiniti** (27 scuri e 13 chiari), oltre alla creazione, modifica ed eliminazione di palette personalizzate (sfondo, superfici, testo e accento). La scheda **Temi & atmosfera** mostra i temi in una **galleria compatta con ricerca per nome**: ogni riquadro ha una miniatura dell'interfaccia, i quattro colori e l'indicazione **Predefinito**, **Predefinito modificato** o **Personalizzato**. La galleria scorre al proprio interno e l'editor del tema scelto resta sempre a fianco. **Crea tema** azzera la ricerca e porta subito al nome del nuovo tema.
- Ogni anteprima mostra tutti e quattro i colori, nello stesso ordine dei selettori, e si aggiorna durante la modifica. Per ricavare una palette da una foto basta caricare un'immagine: **tutti e quattro i colori vengono estratti e assegnati automaticamente**, senza clic manuali. L'analisi raggruppa i colori rappresentativi e assegna il più scuro allo sfondo, il più chiaro al testo, un colore saturo all'accento e il restante alle superfici. Se l'immagine contiene meno di quattro gruppi di colore, alcuni ruoli condividono lo stesso colore e l'app lo segnala. Dalla **2.21.0** anche la palette estratta rispetta il **contrasto WCAG AA**: testo almeno 4,5:1 su sfondo e superfici, accento almeno 3:1. I colori già conformi restano identici; gli altri vengono ritoccati **il meno possibile**, cambiando solo la luminosità (nello spazio colore OKLCH) e mantenendo la tonalità e, finché i colori dello schermo lo consentono, la saturazione dell'immagine. Lo sfondo non viene mai modificato; la superficie viene schiarita o scurita solo se nessun testo potrebbe raggiungere il contrasto. Il messaggio sotto l'immagine indica quali ruoli sono stati ritoccati. I colori scelti a mano o cliccando sull'immagine non vengono corretti. Puoi ritoccare la palette con i selettori oppure, facoltativamente, scegliendo un ruolo e cliccando sull'immagine. Selezione e modifiche dei temi vengono **applicate subito a tutta l'app come anteprima dal vivo**. Premi **Salva impostazioni** per conservare il tema; se esci dalle impostazioni o premi **Annulla modifiche** senza salvare, torna il tema salvato in precedenza. Sono supportati PNG, JPEG, WebP, GIF (primo fotogramma) e BMP fino a 15 MB; le immagini grandi vengono ridimensionate a un massimo di 1600 pixel per lato. Le trasparenze vengono composte su bianco. L'immagine viene elaborata solo in memoria, non inviata in rete né salvata nell'archivio: i colori scelti restano portable con il tema.
- **Dimensione del testo**: regola separatamente sette parti dell'interfaccia (**Testo generale**, **Barra laterale**, **Intestazioni di pagina**, **Tabelle**, **Vista milestone**, **Vista kanban** e **Finestre di dialogo**) con un cursore a passi del 5%, accompagnato da un'anteprima realistica della parte. Ogni parte ha limiti propri, pensati per mantenere l'interfaccia leggibile e ordinata: da 80% a 140% per testo generale, intestazioni e finestre di dialogo, da 80% a 130% per la barra laterale e da 80% a 150% per tabelle, milestone e kanban. Le preimpostazioni **Compatta** (85%, vicina alla densità delle versioni precedenti), **Standard** (100%, consigliata), **Ampia** (115%) e **Molto ampia** (130%) regolano tutte le parti insieme; il pulsante di ripristino riporta una sola parte al 100%. Come per i temi, le modifiche vengono **applicate subito a tutta l'app come anteprima** e conservate solo con **Salva impostazioni**. Le dimensioni valgono per l'organizzazione attiva e sono incluse in **Esporta configurazione**. Logo e nome dell'app mantengono sempre la stessa dimensione, mentre la barra laterale si allarga entro un limite e le aree scorrevoli si adattano per lasciare visibile il fondo della tabella.
- **Esporta e importa organizzazione**: temi, configurazione e dati dell'organizzazione attiva in file separati, oppure tutto insieme, con importazione selettiva in questa o in una nuova organizzazione (vedi **Esporta e importa per organizzazione**).
- **Esporta backup** e **Importa backup**: l'intero archivio JSON, incluse tutte le organizzazioni, i loghi, i temi e le impostazioni. L'importazione richiede conferma e sostituisce l'archivio; un file non valido viene rifiutato.
- “Svuota attività e issue” elimina anche gli esempi iniziali, mantenendo impostazioni e temi.

### Font dell'interfaccia

In **Impostazioni → Font e dimensione del testo**, dalla **2.18.0** puoi scegliere **33 font**, separati nel menu per disponibilità. L'anteprima si applica subito all'interfaccia, mantenendo le dimensioni indipendenti delle sue parti; **Salva impostazioni** conserva la scelta, **Annulla modifiche** ripristina quella precedente.

- **24 inclusi nel portable, disponibili offline senza installazione:** Roboto, Inter, Open Sans, Lato, Montserrat, Poppins, Nunito, Nunito Sans, Raleway, Rubik, Work Sans, Source Sans 3, Noto Sans, DM Sans, Manrope, Fira Sans, Noto Serif, Merriweather, Lora, Playfair Display, Source Serif 4, Roboto Slab, Fira Code e JetBrains Mono.
- **9 font di sistema, usati se installati sul PC:** Segoe UI (predefinito), Aptos, Arial, Calibri, Verdana, Tahoma, Trebuchet MS, Georgia e Consolas. Aptos e gli altri font proprietari non sono redistribuiti: se mancano viene usata l'alternativa di sistema indicata dalla famiglia.

I font liberi provengono da Google Fonts e sono serviti esclusivamente dai file locali, anche nell'accesso da browser: nessuna richiesta a Google durante l'uso. I sottoinsiemi Latin e Latin Extended coprono anche gli accenti; sono inclusi caratteri normali e grassetti (pesi intermedi ove disponibili). Gli altri alfabeti usano i fallback di sistema. Il catalogo WOFF2 occupa circa **2,2 MB**, caricando solo i caratteri necessari alla scelta attiva. [Origini e checksum](fonts/sources.json) e testi delle licenze sono inclusi in [fonts](fonts/): **SIL OFL 1.1**, tranne Roboto Slab con **Apache 2.0**. I file originali distribuiti da Google non sono modificati.

La preferenza è specifica dell'organizzazione e viaggia con archivio, backup ed esportazione della configurazione. I vecchi archivi ricevono Segoe UI; importare una configurazione senza font conserva la scelta attuale.

### Catalogo dei temi predefiniti

Dalla **2.11.0** tutte le organizzazioni, nuove o esistenti, hanno questi temi senza importare file:

- **Scuri:** Midnight, Ocean, Aurora, Monokai, Dracula, Nord, Solarized Dark, Gruvbox Dark, Tokyo Night, One Dark, Material Ocean, GitHub Dark, Synthwave, Ayu Dark, Everforest, Catppuccin Mocha, Rosé Pine, Forest, Graphite, Obsidian, Deep Space, Blue Hour, Copper, Plum, Burgundy, Desert Night, Emerald.
- **Chiari:** Daylight, Solarized Light, Gruvbox Light, GitHub Light, Paper, Pearl, Sandstone, Mist, Sage Light, Lavender Light, Rose Quartz, Iceberg, Mint.

Le palette incorporano quattro colori distinti: testo con contrasto almeno 4,5:1 e accento almeno 3:1 sia sullo sfondo sia sulle superfici. Queste soglie riguardano i quattro colori della palette, non tutti gli elementi derivati dell'interfaccia.

I temi predefiniti si possono modificare per la singola organizzazione; **Ripristina tema predefinito** recupera il nome e i quattro colori originali al posto di eliminarli. Come per ogni modifica del tema, serve **Salva impostazioni** per conservare il ripristino. I temi personali rimangono modificabili ed eliminabili e non diventano parte del catalogo condiviso.

Al primo avvio dopo l'aggiornamento vengono aggiunti soltanto i temi mancanti, confrontando gli identificativi: tema attivo, ordine, nomi e colori già salvati non vengono sovrascritti e non si creano duplicati. Le personalizzazioni ai vecchi temi restano riconoscibili come **Predefinito modificato**. Il formato dell'archivio non cambia; il salvataggio dell'aggiornamento conserva la copia precedente nel backup automatico. Temi, modifiche e selezione continuano a viaggiare con la cartella `data` e con le esportazioni.

Le modifiche alle impostazioni diventano effettive solo con **Salva impostazioni**. Quando ci sono modifiche non salvate compare in alto una barra di avviso, sempre visibile durante lo scorrimento, con l'elenco delle sezioni modificate e i comandi **Salva** e **Annulla modifiche**; la barra scompare se i valori tornano a coincidere con quelli salvati. Se cambi vista senza salvare, le modifiche vengono scartate e resta la configurazione precedente. Le attività e le associazioni hanno il proprio pulsante di salvataggio. Gli errori di lettura o scrittura vengono mostrati esplicitamente; un archivio corrotto non viene sostituito automaticamente.

Il rich text supporta grassetto, corsivo, sottolineato ed elenchi. Contenuti attivi, immagini remote e formattazione HTML non supportata vengono rimossi.

## Icone e controlli

Dalla **2.21.0** l'interfaccia usa un unico set di **icone vettoriali** al posto dei simboli testuali. Le icone fanno parte dell'app, funzionano offline e valgono anche per l'accesso da browser.

- Le icone delle funzioni, cioè navigazione, schede delle impostazioni e tipi di esportazione, hanno uno **stile a gradiente** ispirato ai sistemi operativi più recenti. Ogni area ha una propria famiglia di colore (blu, viola, verde acqua, ambra, rosa, verde, ardesia) e una famiglia aggiuntiva segue l'accento del tema.
- I gradienti **si adattano al tema attivo**. La luminosità viene regolata, mantenendo la tonalità, fino a un contrasto di almeno 3:1 con sfondo e superfici (WCAG AA per gli elementi grafici). I dettagli interni usano il bianco o un inchiostro scuro, secondo quale si legge meglio.
- Le icone di servizio (chiudi, frecce, ordinamento, filtro, altre azioni) sono **a linea** e prendono il colore del testo, così restano discrete nelle tabelle.
- I pulsanti seguono una **scala di dimensioni unica**: 32 px per tutti i controlli della barra superiore (ricerca, annulla, ripeti, stato dell'archivio, profilo), 36 px per i pulsanti delle barre degli strumenti, 30 px per i pulsanti piccoli e per quelli con sola icona, 28 px quadrati per le azioni delle righe.
- L'etichetta dei pulsanti principali, pieni del colore d'accento, sceglie automaticamente un colore con contrasto almeno 4,5:1 sull'accento.

I simboli testuali restano solo nei menu a tendina, che non possono contenere icone, e in qualche testo descrittivo.

## Sviluppo e build

Richiede Node.js con npm soltanto per sviluppare o ricostruire il pacchetto. Il destinatario dell'eseguibile non deve installare Node.js.

La **2.16.0** aggiunge filtri per colonna, schemi personalizzati per attività e issue e importazione CSV con mappatura, anteprima e validazione atomica. `columns.js` condivide schemi e filtri tra Node e interfaccia; `csv.js` contiene parser e conversioni senza dipendenze aggiuntive. I rispettivi test unitari e lo smoke test verificano anche persistenza, viste salvate, annullamento dell'importazione ed Excel.

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

Il logo sorgente unico è `app-logo.svg`, l'atomo con tre orbite, usato dall'interfaccia, dalla favicon predefinita, dalla schermata di caricamento e dall'icona degli eseguibili. Alle dimensioni più piccole il disegno si semplifica da solo (orbite più spesse, senza elettroni) per restare leggibile. `npm run icon` ne genera la versione PNG trasparente a 512 pixel (`app-logo.png`), usata da Electron per entrambe le finestre, e l'icona Windows `build/icon.ico` con le dimensioni 16, 24, 32, 48, 64, 128 e 256 pixel: fino a 128 pixel in formato bitmap a 32 bit, compatibile con tutte le viste di Esplora risorse, e a 256 pixel in PNG. Entrambi i file sono generati e non versionati; `npm start` e `npm run smoke` li rigenerano automaticamente, così come `npm run splash` prima della build. electron-builder incorpora `build/icon.ico` nel launcher portable e nell'eseguibile interno e `build-and-push.ps1` verifica con `node app-icon.js --verify` che entrambi contengano esattamente quell'icona. La modifica delle risorse dell'eseguibile resta attiva (icona, nome e versione), anche senza firma digitale.

Se l'eseguibile precedente è ancora aperto, puoi costruire senza sovrascriverlo con `npm run dist -- --out dist-staging`. Chiudi l'app prima di sostituire l'eseguibile accanto alla cartella `data`.

Il pacchetto condivisibile viene generato in `dist/OrbitKanban-Portable.exe`. `npm run dist` esegue prima `npm run splash`, che genera da `splash.html` l'immagine `build/splash.bmp` e l'animazione della barra `build/splash-bar.avi` (con `build/splash-bar.nsh`) mostrate dal launcher durante l'estrazione: modificando la schermata di caricamento, launcher e app restano allineati. Le traduzioni sono in `languages/<codice>.json`: il codice sorgente è interamente in inglese, che è anche la lingua delle chiavi, e l'italiano è un pacchetto linguistico come gli altri (`languages/it.json`); `i18n.js` le carica, `languages.js` aggiunge quelle di `data/languages`. `xlsx.js` scrive le cartelle di lavoro Excel (formato Office Open XML) senza dipendenze esterne e funziona sia nell'interfaccia sia in Node, dove lo verifica `xlsx.test.js`. La build passa da `build.js`, che usa electron-builder come `electron-builder --win portable --x64` e aggiunge al launcher `build/portable-launcher.nsh`: senza, la finestra di installazione di NSIS lampeggerebbe per un istante sopra la schermata di caricamento. Se una versione futura di electron-builder non permettesse più l'aggancio, la build si interrompe con un errore invece di produrre un launcher diverso. In sviluppo l'archivio è nella cartella `data` del progetto. Lo smoke test usa un workspace temporaneo separato, verifica la schermata di caricamento con la barra animata, le lingue aggiunte da file, le quattro viste, la creazione di organizzazioni con logo, le dimensioni del testo, gli evidenziatori e le colonne della lista, il rilevamento dei duplicati per incident in attività e issue, il riordino con trascinamento e da tastiera, la selezione e la modifica multipla, l'esportazione Excel con il contenuto dei fogli, la sincronizzazione tra finestre, l'esportazione e l'importazione per organizzazione, il server browser con i suoi controlli di sicurezza e la persistenza reale senza modificare i dati dell'utente.

La versione dell'app è definita in `package.json` ed è mostrata nella barra laterale e nella schermata di caricamento. La **2.21.0** applica il **contrasto WCAG AA** anche ai temi generati da un'immagine, ritoccando il meno possibile i colori estratti. Sostituisce inoltre i simboli testuali con **icone vettoriali**, a gradiente per le funzioni e a linea per i comandi, che si adattano al tema, e uniforma le **dimensioni di pulsanti e controlli**, compresi quelli della barra superiore. L'archivio non cambia. La **2.20.0** porta l'intero codice sorgente in inglese, compresi test e script di build: l'interfaccia italiana non cambia e vive nel pacchetto linguistico `languages/it.json`, le cui chiavi sono ora i testi inglesi. L'archivio resta compatibile: i pacchetti lingua personalizzati con le vecchie chiavi italiane e i modelli del link con `{codice}` continuano a funzionare, e il tema **Luce** si chiama ora **Daylight**, con gli stessi colori. La **2.10.0** aggiunge l'**esportazione Excel** della situazione attuale (riepilogo, attività, issue, milestone e kanban in un file `.xlsx`, generato senza nuove dipendenze) e la **modifica multipla** delle attività selezionate o di un'intera milestone; l'archivio non cambia. La **2.9.0** aggiunge il **rilevamento dei duplicati** per incident nella lista attività e nelle issue collegate, con filtro, avvisi durante l'inserimento e rimozione delle associazioni identiche; l'archivio non cambia. La **2.6.0** aggiunge gli **evidenziatori** per colorare le singole righe (barra sopra la tabella, menu del pallino a fine riga, campo nella modifica e filtro), la scelta e l'ordine delle **colonne** della lista con le nuove colonne facoltative Link portale ed Evidenziazione, e mantiene sempre visibile la colonna delle azioni. Archivio e file esportati restano compatibili: i dati della 2.5.0 vengono aperti senza modifiche e ricevono i colori e le colonne predefiniti, mentre la 2.5.0 ignora i nuovi campi. La **2.5.0** sposta le traduzioni in un file per lingua, permette di aggiungere o personalizzare lingue da `data/languages` con la nuova scheda **Lingua & traduzioni**, e rende la schermata di caricamento solo inglese con una barra infinita animata già nel launcher; l'archivio non cambia. La **2.4.0** aggiunge la schermata di caricamento, visibile fin dal doppio clic e aggiornata con le fasi reali dell'avvio, e rende il pacchetto più leggero includendo solo le lingue di Chromium usate dall'app; l'archivio non cambia. La **2.3.0** riorganizza le impostazioni in schede con indicatori delle modifiche non salvate e trasforma l'elenco dei temi in una galleria compatta con ricerca; l'archivio non cambia. La **2.2.0** ingrandisce i testi predefiniti e aggiunge la sezione **Dimensione del testo**, regolabile per organizzazione; l'archivio resta compatibile e le organizzazioni esistenti partono dalla dimensione standard. La **2.1.0** aggiunge l'esportazione e l'importazione per organizzazione in file separati; il formato dell'archivio non cambia, quindi la cartella `data` resta compatibile con la 2.0.0. La **2.0.0** introduce l'accesso da browser con più organizzazioni in parallelo e i nuovi dati dimostrativi; il salto di versione principale riflette anche il formato d'archivio multi-organizzazione (versione 2), non leggibile dalle versioni 1.x.

### Build, test, push e release su GitHub

`build-and-push.ps1` chiude una build e, **solo se tutti i test passano**, fa sempre commit, push e pubblicazione della release GitHub con il portable allegato, anche senza modifiche ai sorgenti (con un commit vuoto che registra la build verificata):

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\build-and-push.ps1 -Message "Descrizione della modifica"
```

Funziona anche con Windows PowerShell 5.1 (`powershell -File …`). Lo script:

1. controlla il repository: ramo attivo, nessun merge o rebase in corso, ramo non indietro rispetto a `origin` e nessun file da non versionare tra le modifiche (cartelle `data`, `dist`, `node_modules`, eseguibili, archivi, file oltre 5 MB);
2. esegue `npm run check`, `npm test` e lo smoke test dai sorgenti;
3. costruisce il portable in `dist-staging\<versione>`, senza toccare l'eseguibile eventualmente aperto, e ne verifica la versione;
4. esegue sempre lo smoke test dell'app impacchettata (`win-unpacked`) e del launcher portable. Ogni test usa dati e cartella temporanea propri: anche l'estrazione del launcher è isolata, senza cancellare i file di eventuali istanze aperte;
5. copia l'eseguibile testato in `dist\OrbitKanban-Portable.exe`, oppure in `dist\OrbitKanban-Portable-<versione>.exe` se quello è in esecuzione;
6. verifica che i file non siano cambiati durante build e test, poi crea sempre un nuovo commit (anche vuoto, con l'elenco dei test superati nel messaggio), crea il tag `v<versione>` se la versione è nuova, esegue sempre un push atomico del ramo e dell'eventuale nuovo tag e controlla il risultato sul remoto;
7. tramite `github-release.js`, crea la release in bozza o aggiorna quella della stessa versione, carica **OrbitKanban-Portable.exe**, ne confronta dimensione e **SHA-256** con l'asset GitHub e solo dopo pubblica la release. Un allegato già identico viene riutilizzato; quello precedente viene rimosso solo dopo aver verificato il nuovo upload. Le note manuali della release vengono preservate.

Il remoto deve essere su **github.com**. L'accesso viene verificato prima della build, usando `GH_TOKEN`/`GITHUB_TOKEN` oppure le credenziali HTTPS già configurate in **Git Credential Manager**; servono permessi di scrittura **Contents** sul repository (per un token classico, accesso `repo` al repository privato). Non servono GitHub CLI o dipendenze aggiuntive, e i token non vengono scritti nei file né passati negli argomenti dei comandi. Non inserirli nel repository.

Al primo errore lo script si ferma con codice di uscita 1; se falliscono build o test, non esegue commit né push. Se fallisce il push, il commit rimane in locale. Se fallisce la release dopo il push, lo segnala esplicitamente: risolvi l'errore e rilancia lo script per completarla. Senza `-Message` l'oggetto è `OrbitKanban <versione>`. `-NoDeliver` non copia l'eseguibile in `dist` ma **pubblica comunque la release**, `-NoCoAuthor` omette il trailer `Co-authored-by` di Copilot e `-Remote` sceglie un remoto diverso da `origin`.

Il tag non viene mai spostato. Per sorgenti nuovi incrementa prima `version` con `npm version patch --no-git-tag-version --ignore-scripts` (oppure `minor`/`major`): lo script rifiuta una versione già taggata con sorgenti diversi. Ripetendo una build degli stessi sorgenti crea il commit di verifica e aggiorna la release esistente. Se GitHub rende la release immutabile e l'eseguibile differisce, occorre una nuova versione.

Usa questo comando al posto di `npm run dist` per chiudere ogni build con test, commit, push e release automatici; `npm run dist` da solo continua a generare soltanto il pacchetto.
