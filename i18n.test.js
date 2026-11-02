'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const i18n = require('./i18n');
const { translate } = i18n;
const builtIn = code => JSON.parse(fs.readFileSync(path.join(__dirname, 'languages', `${code}.json`), 'utf8'));
const withRegistry = run => { try { run(); } finally { i18n.reset(); i18n.loadBuiltIn(); } };

test('Italian source strings stay unchanged and English strings translate', () => {
  assert.equal(translate('Salva impostazioni', 'it'), 'Salva impostazioni');
  assert.equal(translate('Salva impostazioni', 'en'), 'Save settings');
  assert.equal(translate('Gestisci organizzazioni', 'en'), 'Manage organizations');
  assert.equal(translate('Logo dell’organizzazione', 'en'), 'Organization logo');
});
test('longer UI phrases take precedence and labels retain HTML structure', () => {
  assert.equal(translate('<button class="button">Salva attività</button>', 'en'), '<button class="button">Save task</button>');
  assert.equal(translate('Codice portale', 'en'), 'Portal code');
  assert.equal(translate('La lingua è salvata per questa organizzazione. Nomi personalizzati e contenuti non vengono tradotti.', 'en'), 'Language is saved per organization. Custom names and content are not translated.');
});
test('text size settings are translated, including phrases that contain shorter keys', () => {
  assert.equal(translate('<h2>Dimensione del testo</h2>', 'en'), '<h2>Text size</h2>');
  assert.equal(translate('<label>Tabelle</label><small>Righe e colonne della lista attività e delle issue collegate.</small>', 'en'), '<label>Tables</label><small>Rows and columns of the task list and linked issues.</small>');
  assert.equal(translate('Testo generale', 'en'), 'General text');
  assert.equal(translate('Testo', 'en'), 'Text');
  assert.deepEqual(['Compatta', 'Ampia', 'Molto ampia'].map(name => translate(name, 'en')), ['Compact', 'Large', 'Extra large']);
  assert.equal(translate('Ripristina 100%: Vista kanban', 'en'), 'Reset to 100%: Kanban view');
  assert.equal(translate('Dimensioni del testo non valide.', 'en'), 'Invalid text sizes.');
  assert.equal(translate('Dimensione del testo', 'it'), 'Dimensione del testo');
});
test('settings tabs and theme gallery are translated', () => {
  assert.deepEqual(['Predefinito', 'Predefinito modificato', 'Personalizzato', 'Ripristina tema predefinito'].map(text => translate(text, 'en')), ['Built-in', 'Modified built-in', 'Custom', 'Restore built-in theme']);
  assert.deepEqual(['Organizzazione', 'Aspetto', 'Flusso di lavoro', 'Dati e accesso'].map(group => translate(group, 'en')), ['Organization', 'Appearance', 'Workflow', 'Data & access']);
  assert.equal(translate('<input placeholder="Cerca tema…" aria-label="Cerca tema">', 'en'), '<input placeholder="Search themes…" aria-label="Search themes">');
  assert.equal(translate('Sezioni modificate: Temi & atmosfera', 'en'), 'Changed sections: Themes & atmosphere');
  assert.equal(translate('Nessun tema corrisponde alla ricerca.', 'en'), 'No theme matches your search.');
  assert.equal(translate('Questo file è un’esportazione di organizzazione (temi, configurazione o dati): usa “Importa da file…” nella sezione “Esporta e importa organizzazione”.', 'en'), 'This file is an organization export (themes, settings or data): use “Import from file…” in the “Export and import organization” section.');
});

test('row highlighters and list columns are translated', () => {
  assert.equal(translate('Doppio clic sulla riga per modificare.', 'en'), 'Double-click the row to edit.');
  assert.deepEqual(['Evidenziatori', 'Colonne della lista', 'Nessuna evidenziazione', 'Tutte le evidenziazioni', 'Gomma', 'Link portale'].map(label => translate(label, 'en')), ['Highlighters', 'List columns', 'No highlight', 'All highlights', 'Eraser', 'Portal link']);
  assert.equal(translate('Evidenziatori', 'it'), 'Evidenziatori');
  assert.equal(i18n.plural(2, 'evidenziatore', 'en'), '2 highlighters');
  assert.equal(i18n.plural(3, 'evidenziatore', 'it'), '3 evidenziatori');
});
test('tag settings, task selection and validation messages are translated', () => {
  assert.equal(translate('Modifica tag', 'en'), 'Edit tags');
  assert.equal(translate('Tags attività non validi.', 'en'), 'Invalid task tags.');
  assert.equal(translate('I nomi dei tag devono essere univoci.', 'en'), 'Tag names must be unique.');
  assert.equal(translate('Nessun tag disponibile. Aggiungili in Impostazioni › Tags.', 'en'), 'No tags available. Add them in Settings › Tags.');
});
test('upcoming milestone indicators are translated', () => {
  assert.deepEqual(['Prossima release', 'Release di oggi', 'Vai alla prossima release', 'Nessuna release in programma'].map(text => translate(text, 'en')), ['Next release', "Today's release", 'Go to next release', 'No upcoming release']);
});
test('custom columns, per-column filters and CSV validation messages are translated', () => {
  assert.deepEqual(['Colonne personalizzate', 'Filtra colonna', 'Importa CSV', 'Mappa le colonne', 'Solo vuote'].map(text => translate(text, 'en')), ['Custom columns', 'Filter column', 'Import CSV', 'Map columns', 'Empty only']);
  assert.equal(translate('{0} righe valide · {1} errori', 'en'), '{0} valid rows · {1} errors');
  assert.equal(translate('Valore della colonna personalizzata non valido.', 'en'), 'Invalid custom column value.');
  assert.equal(translate('Mappatura colonne non valida o duplicata.', 'en'), 'Invalid or duplicate column mapping.');
  assert.equal(translate('Il CSV supera il limite di 16 MB.', 'en'), 'The CSV exceeds the 16 MB limit.');
});
test('drag and drop ordering is translated', () => {
  assert.deepEqual(['Ordine salvato. Sequence aggiornate.', 'La lista è cambiata. Riprova il riordino.', 'Attività non più disponibile.'].map(text => translate(text, 'en')), ['Order saved. Sequence updated.', 'The list has changed. Try reordering again.', 'Task no longer available.']);
  assert.deepEqual(['Trascina per riordinare, oppure usa i tasti ↑ ↓', 'Riordina «{0}»', 'Spostato in posizione {0} di {1}', 'Spostamento annullato'].map(text => translate(text, 'en')), ['Drag to reorder, or use the ↑ ↓ keys', 'Reorder “{0}”', 'Moved to position {0} of {1}', 'Move cancelled']);
  assert.match(translate('Spunta le colonne da mostrare e trascinale (o usa le frecce) per cambiarne l’ordine. Nascondere una colonna non cancella i dati.', 'en'), /^Tick the columns to show and drag them/);
  assert.equal(translate('Trascina per riordinare, oppure usa i tasti ↑ ↓', 'it'), 'Trascina per riordinare, oppure usa i tasti ↑ ↓');
});
test('duplicate detection texts are translated, placeholders and markup included', () => {
  assert.equal(translate('<label class="toggle-label duplicate-toggle"><input type="checkbox"> Duplicati <span class="tiny-count">', 'en'), '<label class="toggle-label duplicate-toggle"><input type="checkbox"> Duplicates <span class="tiny-count">');
  assert.deepEqual(['{0} è collegato anche a: {1}', '{0} è presente anche in: {1}', '{0} attività con incident duplicato', '{0} associazioni con incident duplicato'].map(text => translate(text, 'en')), ['{0} is also linked to: {1}', '{0} also appears in: {1}', '{0} tasks with a duplicate incident', '{0} associations with a duplicate incident']);
  assert.deepEqual(['Possibile duplicato', 'Rimuovi identiche', 'Esiste già un’associazione identica', 'Incident già presente', 'identica', 'nascosta'].map(text => translate(text, 'en')), ['Possible duplicate', 'Remove identical', 'An identical association already exists', 'Incident already present', 'identical', 'hidden']);
  assert.equal(translate('Attività che condividono l’incident {0}.', 'en'), 'Tasks sharing incident {0}.');
  assert.equal(translate('Possibile duplicato', 'it'), 'Possibile duplicato');
});
test('Excel export and bulk edit texts are translated, placeholders and markup included', () => {
  assert.equal(translate('<button type="button" class="button small primary" id="bulk-edit">✎ Modifica multipla…</button><button type="button" class="button small" id="bulk-excel">⤓ Esporta in Excel</button>', 'en'), '<button type="button" class="button small primary" id="bulk-edit">✎ Bulk edit…</button><button type="button" class="button small" id="bulk-excel">⤓ Export to Excel</button>');
  assert.deepEqual(['{0} selezionate', '{0} non visibili con i filtri attuali', 'Le modifiche verranno applicate a {0}.', 'Modifica multipla applicata: {0} aggiornate.', 'Solo le attività con una data: {0} su {1}.'].map(text => translate(text, 'en')), ['{0} selected', '{0} not visible with the current filters', 'Changes will be applied to {0}.', 'Bulk edit applied: {0} updated.', 'Only tasks with a date: {0} of {1}.']);
  assert.deepEqual(['— Non modificare —', 'Sposta di N giorni', 'Togli la data (da pianificare)', 'Scegli almeno un campo da modificare.', 'Scegli la nuova release date.'].map(text => translate(text, 'en')), ['— Keep unchanged —', 'Move by N days', 'Remove the date (unscheduled)', 'Choose at least one field to change.', 'Choose the new release date.']);
  assert.deepEqual(['Esporta in Excel', 'Riepilogo', 'Situazione attuale', 'Effort (ore)', 'Come mostrate nella lista', 'Solo le selezionate', 'Scegli almeno un foglio da esportare.', 'Excel esportato:'].map(text => translate(text, 'en')), ['Export to Excel', 'Summary', 'Current situation', 'Effort (hours)', 'As shown in the list', 'Selected only', 'Choose at least one sheet to export.', 'Excel exported:']);
  assert.deepEqual(['File Excel non valido.', 'Cartella di lavoro Excel', 'Nessun foglio da esportare.', 'Il foglio Excel supera il numero massimo di righe.'].map(text => translate(text, 'en')), ['Invalid Excel file.', 'Excel workbook', 'No sheet to export.', 'The Excel sheet exceeds the maximum number of rows.']);
  assert.equal(i18n.term('situazione', 'en'), 'situation');
  assert.equal(translate('Modifica multipla', 'it'), 'Modifica multipla');
});

test('built-in language files are valid and every Italian key used for counts and defaults is covered', () => {
  const en = builtIn('en'), it = builtIn('it');
  assert.deepEqual([en.code, en.name, it.code, it.name], ['en', 'English', 'it', 'Italiano']);
  for (const pack of [en, it]) assert.doesNotThrow(() => i18n.validatePack(pack));
  assert.deepEqual(Object.keys(it.plurals).sort(), Object.keys(en.plurals).sort());
  assert.ok(Object.keys(en.messages).length > 400 && Object.values(en.messages).every(text => typeof text === 'string' && text.trim()));
  assert.deepEqual(i18n.languages().map(language => language.code), ['en', 'it']);
  assert.equal(i18n.term('Da fare', 'en'), 'To do');
  assert.equal(i18n.term('Da fare', 'it'), 'Da fare');
  assert.equal(i18n.term('{0}g', 'en'), '{0}d');
});
test('plural forms follow the language rules', () => {
  assert.equal(i18n.plural(1, 'tema', 'en'), '1 theme');
  assert.equal(i18n.plural(3, 'tema', 'en'), '3 themes');
  assert.equal(i18n.plural(1, 'tema', 'it'), '1 tema');
  assert.equal(i18n.plural(0, 'tema', 'it'), '0 temi');
  assert.equal(i18n.plural(12000, 'attività', 'it'), '12.000 attività');
  assert.equal(i18n.plural(2, 'sconosciuto', 'en'), '2 sconosciuto');
});
test('an added language falls back to English for missing texts and unknown codes show English', () => {
  withRegistry(() => {
    i18n.register({ format: i18n.FORMAT, version: 1, code: 'de', name: 'Deutsch', messages: { 'Salva impostazioni': 'Einstellungen speichern', Impostazioni: 'Einstellungen' }, plurals: { tema: { one: '{0} Thema', other: '{0} Themen' } } });
    assert.equal(translate('Salva impostazioni', 'de'), 'Einstellungen speichern');
    assert.equal(translate('Gestisci organizzazioni', 'de'), 'Manage organizations');
    assert.equal(i18n.plural(2, 'tema', 'de'), '2 Themen');
    assert.equal(i18n.plural(2, 'stato', 'de'), '2 statuses');
    assert.equal(i18n.locale('de'), 'de');
    assert.equal(translate('Salva impostazioni', 'fr'), 'Save settings');
    assert.equal(i18n.locale('fr'), 'en-GB');
    assert.equal(translate('Salva impostazioni', 'NOT A CODE'), 'Salva impostazioni');
    assert.deepEqual(i18n.languages().map(language => language.name), ['Deutsch', 'English', 'Italiano']);
  });
  assert.equal(i18n.has('de'), false);
});
test('a file for an existing language customises only the texts it contains', () => {
  withRegistry(() => {
    i18n.register({ format: i18n.FORMAT, version: 1, code: 'en', name: 'English (team)', messages: { 'Salva impostazioni': 'Store settings', Annulla: '' } });
    assert.equal(translate('Salva impostazioni', 'en'), 'Store settings');
    assert.equal(translate('Annulla', 'en'), 'Cancel');
    assert.equal(translate('Gestisci organizzazioni', 'en'), 'Manage organizations');
    assert.equal(i18n.languages().find(language => language.code === 'en').name, 'English (team)');
    i18n.register({ format: i18n.FORMAT, version: 1, code: 'it', name: 'Italiano', messages: { Impostazioni: 'Configurazione' } });
    assert.equal(translate('Impostazioni', 'it'), 'Configurazione');
  });
  assert.equal(translate('Salva impostazioni', 'en'), 'Save settings');
});
test('invalid language packs are rejected with a clear reason', () => {
  const valid = { format: i18n.FORMAT, version: 1, code: 'de', name: 'Deutsch' };
  const cases = [
    [null, /non è una lingua/], [{ ...valid, format: 'other' }, /non è una lingua/], [{ ...valid, version: 2 }, /Versione/],
    [{ ...valid, code: 'Deutsch' }, /Codice lingua/], [{ ...valid, code: '../en' }, /Codice lingua/], [{ ...valid, name: ' ' }, /Nome della lingua/],
    [{ ...valid, locale: 'not a locale!' }, /locale/], [{ ...valid, messages: { Salva: 3 } }, /testi/], [{ ...valid, messages: ['x'] }, /testi/],
    [{ ...valid, plurals: { tema: { one: '{0} Thema' } } }, /plurali/], [{ ...valid, plurals: { tema: { lots: '{0}', other: '{0}' } } }, /plurali/]
  ];
  for (const [pack, error] of cases) assert.throws(() => i18n.validatePack(pack), error);
  assert.equal(i18n.has('de'), false);
});
