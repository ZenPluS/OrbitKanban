'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const i18n = require('./i18n');

const MAX_FILE_SIZE = 2 * 1024 * 1024;
const TEMPLATE_FILE = `${i18n.FALLBACK}.template.json`;

// User languages live in data/languages/<code>.json, next to the portable data.
// A file for a built-in code customises it, any other valid code adds a new language.
function createLanguageStore({ dataFolder }) {
  const folder = path.join(dataFolder, 'languages');
  const template = path.join(folder, TEMPLATE_FILE);
  let sources = new Map(), errors = [];

  async function writeTemplate() {
    const source = await fs.readFile(path.join(i18n.builtInFolder, `${i18n.FALLBACK}.json`));
    const current = await fs.readFile(template).catch(() => null);
    if (current?.equals(source)) return;
    const temporary = `${template}.${process.pid}-${Date.now()}.tmp`;
    await fs.writeFile(temporary, source);
    try { await fs.rename(temporary, template); }
    catch (error) { await fs.rm(temporary, { force: true }); throw error; }
  }
  async function prepareFolder() {
    await fs.mkdir(folder, { recursive: true });
    await writeTemplate();
    return folder;
  }
  async function readUserFiles() {
    const found = [], failed = [];
    let names = [];
    try { names = await fs.readdir(folder); }
    catch (error) { if (error.code !== 'ENOENT') failed.push({ file: '', message: error.message }); }
    const files = names.filter(name => /\.json$/i.test(name) && !/\.template\.json$/i.test(name)).sort((a, b) => a.localeCompare(b, 'en'));
    for (const file of files) {
      try {
        const fullPath = path.join(folder, file);
        const stat = await fs.stat(fullPath);
        if (!stat.isFile()) continue;
        if (stat.size > MAX_FILE_SIZE) throw new Error('File lingua troppo grande.');
        let pack;
        try { pack = JSON.parse((await fs.readFile(fullPath, 'utf8')).replace(/^\uFEFF/, '')); }
        catch { throw new Error('File JSON non valido.'); }
        const { code } = i18n.validatePack(pack);
        if (code.toLowerCase() !== file.slice(0, -5).toLowerCase()) throw new Error('Il codice lingua deve coincidere con il nome del file.');
        found.push({ file, pack });
      } catch (error) { failed.push({ file, message: error.message }); }
    }
    return { found, failed };
  }
  function info() {
    return {
      folder,
      template,
      packs: i18n.packs(),
      languages: i18n.languages().map(language => ({ ...language, source: sources.get(language.code) || 'built-in' })),
      errors: errors.map(error => ({ ...error }))
    };
  }
  // Files are read first and swapped in synchronously, so translations never see a half-loaded registry.
  async function reload() {
    const { found, failed } = await readUserFiles();
    i18n.reset();
    i18n.loadBuiltIn();
    const builtIn = new Set(i18n.languages().map(language => language.code));
    const nextSources = new Map([...builtIn].map(code => [code, 'built-in']));
    for (const { file, pack } of found) {
      try {
        const code = i18n.register(pack);
        nextSources.set(code, builtIn.has(code) ? 'customized' : 'added');
      } catch (error) { failed.push({ file, message: error.message }); }
    }
    sources = nextSources;
    errors = failed;
    return info();
  }
  return { folder, template, prepareFolder, reload, info };
}

module.exports = { createLanguageStore, MAX_FILE_SIZE, TEMPLATE_FILE };
