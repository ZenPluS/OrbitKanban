'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const { Translator } = require('../src/shared/localization');
const builtIn = code => JSON.parse(fs.readFileSync(path.join(ROOT, 'languages', `${code}.json`), 'utf8'));
const withRegistry = run => { try { run(); } finally { Translator.reset(); Translator.loadBuiltIn(); } };

test('English is the source language and Italian translates source strings', () => {
  assert.equal(Translator.translate('Save settings', 'en'), 'Save settings');
  assert.equal(Translator.translate('Save settings', 'it'), 'Salva impostazioni');
  assert.equal(Translator.translate('Manage organizations', 'it'), 'Gestisci organizzazioni');
  assert.equal(Translator.translate('Organization logo', 'it'), 'Logo dell’organizzazione');
  assert.equal(Translator.translate('<input placeholder="e.g. PRJ-1042">', 'it'), '<input placeholder="es. PRJ-1042">');
  assert.deepEqual([
    'YOUR PERSONAL WORKSPACE', 'Organization', 'Manage organizations', 'Open in browser', 'Main views', 'LOCAL',
    'Settings', 'Only on your device', 'Your data. Always with you.', 'No cloud. No account. Everything under control.',
    'Tasks', 'Search', 'Undo (Ctrl+Z)', 'Redo (Ctrl+Y)', 'Local archive', 'Open data folder'
  ].map(text => Translator.translate(text, 'it')), [
    'IL TUO SPAZIO DI LAVORO', 'Organizzazione', 'Gestisci organizzazioni', 'Apri nel browser', 'Viste principali', 'LOCALE',
    'Impostazioni', 'Solo sul tuo dispositivo', 'I tuoi dati. Sempre con te.', 'Nessun cloud. Nessun account. Tutto sotto controllo.',
    'Attività', 'Cerca', 'Annulla (Ctrl+Z)', 'Ripristina (Ctrl+Y)', 'Archivio locale', 'Apri cartella dati'
  ]);
});
test('longer UI phrases take precedence and labels retain HTML structure', () => {
  assert.equal(Translator.translate('<button class="button">Save task</button>', 'it'), '<button class="button">Salva attività</button>');
  assert.equal(Translator.translate('<label id="show-hidden" class="hidden" data-state="hidden" title="Include hidden" aria-label="Include hidden">Include hidden</label>', 'it'), '<label id="show-hidden" class="hidden" data-state="hidden" title="Include nascoste" aria-label="Include nascoste">Include nascoste</label>');
  assert.equal(Translator.translate('Portal code', 'it'), 'Codice portale');
  assert.equal(Translator.translate('Language is saved per organization. Custom names and content are not translated.', 'it'), 'La lingua è salvata per questa organizzazione. Nomi personalizzati e contenuti non vengono tradotti.');
});
test('template translation protects markup across split tags and leaves interpolated values untouched', () => {
  const html = Translator.translateTemplate([
    '<label class="toggle-label"><input id="show-hidden" type="checkbox" ',
    '> Hidden <span title="Include hidden" data-state="',
    '">value</span></label>'
  ], ['checked', 'hidden'], 'it');
  assert.equal(html, '<label class="toggle-label"><input id="show-hidden" type="checkbox" checked> Nascoste <span title="Include nascoste" data-state="hidden">value</span></label>');
});
test('text-size phrases translate without changing markup or placeholders', () => {
  assert.equal(Translator.translate('<h2>Text size</h2>', 'it'), '<h2>Dimensione del testo</h2>');
  assert.equal(Translator.translate('<label>Tables</label><small>Rows and columns of the task list and linked issues.</small>', 'it'), '<label>Tabelle</label><small>Righe e colonne della lista attività e delle issue collegate.</small>');
  assert.deepEqual(['Compact', 'Large', 'Extra large'].map(text => Translator.translate(text, 'it')), ['Compatta', 'Ampia', 'Molto ampia']);
  assert.equal(Translator.translate('Reset to 100%: Kanban view', 'it'), 'Ripristina 100%: Vista kanban');
  assert.equal(Translator.translate('Invalid text sizes.', 'it'), 'Dimensioni del testo non valide.');
});
test('settings, themes and default terms translate from English', () => {
  assert.deepEqual(['Built-in', 'Modified built-in', 'Custom', 'Restore built-in theme'].map(text => Translator.translate(text, 'it')), ['Predefinito', 'Predefinito modificato', 'Personalizzata', 'Ripristina tema predefinito']);
  assert.deepEqual(['Organization', 'Appearance', 'Workflow', 'Data & access'].map(text => Translator.translate(text, 'it')), ['Organizzazione', 'Aspetto', 'Flusso di lavoro', 'Dati e accesso']);
  assert.equal(Translator.translate('<input placeholder="Search themes…" aria-label="Search themes">', 'it'), '<input placeholder="Cerca tema…" aria-label="Cerca tema">');
  assert.equal(Translator.term('To do', 'it'), 'Da fare');
  assert.equal(Translator.term('To do', 'en'), 'To do');
});
test('tasks, filters, duplicate messages and CSV validation translate', () => {
  assert.equal(Translator.translate('Double-click the row to edit.', 'it'), 'Doppio clic sulla riga per modificare.');
  assert.deepEqual(['Highlighters', 'List columns', 'No highlight', 'All highlights', 'Eraser', 'Portal link'].map(text => Translator.translate(text, 'it')), ['Evidenziatori', 'Colonne della lista', 'Nessuna evidenziazione', 'Tutte le evidenziazioni', 'Gomma', 'Link portale']);
  assert.equal(Translator.translate('Column names and identifiers must be unique.', 'it'), 'Nomi e identificativi delle colonne devono essere univoci.');
  assert.equal(Translator.translate('Invalid task tags.', 'it'), 'Tags attività non validi.');
  assert.equal(Translator.translate('No tags available. Add them in Settings › Tags.', 'it'), 'Nessun tag disponibile. Aggiungili in Impostazioni › Tags.');
  assert.equal(Translator.translate('{0} is also linked to: {1}', 'it'), '{0} è collegato anche a: {1}');
  assert.equal(Translator.translate('{0} valid rows · {1} errors', 'it'), '{0} righe valide · {1} errori');
  assert.equal(Translator.translate('Invalid custom column value.', 'it'), 'Valore della colonna personalizzata non valido.');
  assert.equal(Translator.translate('The CSV exceeds the 16 MB limit.', 'it'), 'Il CSV supera il limite di 16 MB.');
  assert.equal(Translator.translate('The statuses list is invalid or empty.', 'it'), 'L’elenco degli stati non è valido o è vuoto.');
});
test('release, Excel and bulk-edit text preserves placeholders', () => {
  assert.deepEqual(['Next release', "Today's release", 'Go to next release', 'No upcoming release'].map(text => Translator.translate(text, 'it')), ['Prossima release', 'Release di oggi', 'Vai alla prossima release', 'Nessuna release in programma']);
  assert.equal(Translator.translate('<button id="bulk-edit">✎ Bulk edit…</button><button id="bulk-excel">⤓ Export to Excel</button>', 'it'), '<button id="bulk-edit">✎ Modifica multipla…</button><button id="bulk-excel">⤓ Esporta in Excel</button>');
  assert.equal(Translator.translate('Changes will be applied to {0}.', 'it'), 'Le modifiche verranno applicate a {0}.');
  assert.equal(Translator.translate('Choose at least one sheet to export.', 'it'), 'Scegli almeno un foglio da esportare.');
});
test('built-in packs use English keys and provide Italian translations', () => {
  const en = builtIn('en'), it = builtIn('it');
  assert.deepEqual([en.code, en.name, it.code, it.name], ['en', 'English', 'it', 'Italiano']);
  for (const pack of [en, it]) assert.doesNotThrow(() => Translator.validatePack(pack));
  assert.deepEqual(Object.keys(it.messages).sort(), Object.keys(en.messages).sort());
  assert.ok(Object.entries(en.messages).every(([key, text]) => key === text));
  assert.deepEqual(Object.keys(it.terms).sort(), Object.keys(en.terms).sort());
  assert.ok(Object.entries(en.terms).every(([key, text]) => key === text));
  assert.deepEqual(Object.keys(it.plurals).sort(), Object.keys(en.plurals).sort());
  assert.ok(Object.keys(en.messages).length > 400 && Object.values(en.messages).every((text, key) => typeof text === 'string' && text.trim()));
  assert.deepEqual(Translator.languages().map(language => language.code), ['en', 'it']);
  assert.equal(Translator.SOURCE, 'en');
  assert.equal(Translator.term('To do', 'it'), 'Da fare');
});
test('plural forms follow the selected language rules', () => {
  assert.equal(Translator.plural(1, 'theme', 'en'), '1 theme');
  assert.equal(Translator.plural(3, 'theme', 'en'), '3 themes');
  assert.equal(Translator.plural(1, 'theme', 'it'), '1 tema');
  assert.equal(Translator.plural(0, 'theme', 'it'), '0 temi');
  assert.equal(Translator.plural(12000, 'tasks', 'it'), '12.000 attività');
  assert.equal(Translator.plural(2, 'unknown', 'en'), '2 unknown');
});
test('added languages fall back to English and invalid codes use the source language', () => {
  withRegistry(() => {
    Translator.register({ format: Translator.FORMAT, version: 1, code: 'de', name: 'Deutsch', messages: { 'Save settings': 'Einstellungen speichern', Settings: 'Einstellungen' }, plurals: { theme: { one: '{0} Thema', other: '{0} Themen' } } });
    assert.equal(Translator.translate('Save settings', 'de'), 'Einstellungen speichern');
    assert.equal(Translator.translate('Manage organizations', 'de'), 'Manage organizations');
    assert.equal(Translator.plural(2, 'theme', 'de'), '2 Themen');
    assert.equal(Translator.plural(2, 'status', 'de'), '2 statuses');
    assert.equal(Translator.locale('de'), 'de');
    assert.equal(Translator.translate('Save settings', 'fr'), 'Save settings');
    assert.equal(Translator.locale('fr'), 'en-GB');
    assert.equal(Translator.translate('Save settings', 'NOT A CODE'), 'Save settings');
    assert.deepEqual(Translator.languages().map(language => language.name), ['Deutsch', 'English', 'Italiano']);
  });
  assert.equal(Translator.has('de'), false);
});
test('language files can customize built-in packs without removing other translations', () => {
  withRegistry(() => {
    Translator.register({ format: Translator.FORMAT, version: 1, code: 'en', name: 'English (team)', messages: { 'Save settings': 'Store settings', Cancel: '' } });
    assert.equal(Translator.translate('Save settings', 'en'), 'Store settings');
    assert.equal(Translator.translate('Cancel', 'en'), 'Cancel');
    assert.equal(Translator.translate('Manage organizations', 'en'), 'Manage organizations');
    assert.equal(Translator.languages().find(language => language.code === 'en').name, 'English (team)');
    Translator.register({ format: Translator.FORMAT, version: 1, code: 'it', name: 'Italiano', messages: { Settings: 'Configurazione' } });
    assert.equal(Translator.translate('Settings', 'it'), 'Configurazione');
  });
  assert.equal(Translator.translate('Save settings', 'en'), 'Save settings');
});
test('invalid language packs are rejected with English error messages', () => {
  const valid = { format: Translator.FORMAT, version: 1, code: 'de', name: 'Deutsch' };
  const cases = [
    [null, /not an OrbitKanban language/], [{ ...valid, format: 'other' }, /not an OrbitKanban language/], [{ ...valid, version: 2 }, /version/],
    [{ ...valid, code: 'Deutsch' }, /language code/], [{ ...valid, code: '../en' }, /language code/], [{ ...valid, name: ' ' }, /language name/],
    [{ ...valid, locale: 'not a locale!' }, /locale/], [{ ...valid, messages: { Save: 3 } }, /text/], [{ ...valid, messages: ['x'] }, /text/],
    [{ ...valid, plurals: { theme: { one: '{0} Thema' } } }, /plural/], [{ ...valid, plurals: { theme: { lots: '{0}', other: '{0}' } } }, /plural/]
  ];
  for (const [pack, error] of cases) assert.throws(() => Translator.validatePack(pack), error);
  assert.equal(Translator.has('de'), false);
});
