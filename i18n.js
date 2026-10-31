'use strict';
(() => {
  // Translations live in languages/<code>.json. Italian is the source language of the code,
  // every other language falls back to English for the texts it does not translate.
  const FORMAT = 'orbitkanban-language';
  const VERSION = 1;
  const SOURCE = 'it';
  const FALLBACK = 'en';
  const CODE = /^[a-z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/;
  const PLURAL_CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'];
  const MAX_TEXT = 4000;
  const packs = new Map();
  const cache = new Map();
  const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  const fail = message => { throw new Error(message); };
  const validCode = code => typeof code === 'string' && CODE.test(code);
  function texts(value) {
    if (value === undefined) return {};
    if (!isRecord(value)) fail('Le traduzioni devono essere testi.');
    const result = {};
    for (const [key, text] of Object.entries(value)) {
      if (!key || key.length > MAX_TEXT || typeof text !== 'string' || text.length > MAX_TEXT) fail('Le traduzioni devono essere testi.');
      if (text) result[key] = text;
    }
    return result;
  }
  function pluralForms(value) {
    if (value === undefined) return {};
    if (!isRecord(value)) fail('Forme plurali non valide.');
    const result = {};
    for (const [key, forms] of Object.entries(value)) {
      if (!key || key.length > MAX_TEXT || !isRecord(forms) || !Object.entries(forms).every(([category, text]) => PLURAL_CATEGORIES.includes(category) && typeof text === 'string' && text.length <= MAX_TEXT)) fail('Forme plurali non valide.');
      const filled = Object.fromEntries(Object.entries(forms).filter(([, text]) => text));
      if (!Object.keys(filled).length) continue;
      if (!filled.other) fail('Forme plurali non valide.');
      result[key] = filled;
    }
    return result;
  }
  function validatePack(input) {
    if (!isRecord(input) || input.format !== FORMAT) fail('Il file non è una lingua OrbitKanban.');
    if (!Number.isInteger(input.version) || input.version < 1 || input.version > VERSION) fail('Versione del file lingua non supportata.');
    if (!validCode(input.code)) fail('Codice lingua non valido.');
    if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 60) fail('Nome della lingua non valido.');
    if (input.locale !== undefined && typeof input.locale !== 'string') fail('Impostazione locale non valida.');
    let locale;
    try { [locale] = Intl.getCanonicalLocales(input.locale || input.code); }
    catch { fail('Impostazione locale non valida.'); }
    return { format: FORMAT, version: VERSION, code: input.code, name: input.name.trim(), locale, messages: texts(input.messages), terms: texts(input.terms), plurals: pluralForms(input.plurals) };
  }
  // A pack for an already registered code is merged over it, so a file can customise a few texts.
  function register(input, { replace = false } = {}) {
    const pack = validatePack(input);
    const existing = replace ? null : packs.get(pack.code);
    packs.set(pack.code, existing ? {
      ...pack,
      messages: { ...existing.messages, ...pack.messages },
      terms: { ...existing.terms, ...pack.terms },
      plurals: { ...existing.plurals, ...pack.plurals }
    } : pack);
    cache.clear();
    return pack.code;
  }
  function reset() { packs.clear(); cache.clear(); }
  const has = code => packs.has(code);
  function languages() {
    return [...packs.values()].map(({ code, name, locale }) => ({ code, name, locale })).sort((a, b) => a.name.localeCompare(b.name, 'en'));
  }
  const list = () => [...packs.values()].map(pack => structuredClone(pack));
  const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function dictionary(language) {
    const code = validCode(language) ? language : SOURCE;
    if (cache.has(code)) return cache.get(code);
    const own = packs.get(code), fallback = packs.get(FALLBACK);
    const chain = (code === SOURCE || code === FALLBACK ? [own] : [fallback, own]).filter(Boolean);
    const messages = new Map(chain.flatMap(pack => Object.entries(pack.messages)));
    const terms = new Map(chain.flatMap(pack => Object.entries(pack.terms)));
    const plurals = new Map(chain.flatMap(pack => Object.entries(pack.plurals)));
    const locale = own?.locale || (code === SOURCE ? 'it-IT' : fallback?.locale || 'en-GB');
    const keys = [...messages.keys()].sort((a, b) => b.length - a.length).map(escapeRegex);
    const pattern = keys.length ? new RegExp(`(?<![\\p{L}])(?:${keys.join('|')})(?![\\p{L}])`, 'gu') : null;
    const entry = { code, locale, messages, terms, plurals, pattern };
    cache.set(code, entry);
    return entry;
  }
  // Interface texts: known phrases are replaced inside the text, so markup and placeholders survive.
  function translate(text, language) {
    const { pattern, messages } = dictionary(language);
    return pattern ? String(text).replace(pattern, match => messages.get(match)) : String(text);
  }
  // Default names and demo content: only exact matches are translated.
  function term(text, language) {
    const { terms, messages } = dictionary(language);
    return terms.get(text) ?? messages.get(text) ?? String(text);
  }
  const format = (text, ...values) => values.reduce((result, value, index) => result.replaceAll(`{${index}}`, value), String(text));
  function plural(count, key, language) {
    const { plurals, locale } = dictionary(language);
    const number = Number(count).toLocaleString(locale);
    const forms = plurals.get(key);
    if (!forms) return `${number} ${key}`;
    let category = 'other';
    try { category = new Intl.PluralRules(locale).select(Number(count)); } catch {}
    return (forms[category] || forms.other).replaceAll('{0}', number);
  }
  const locale = language => dictionary(language).locale;
  const api = { FORMAT, VERSION, SOURCE, FALLBACK, validCode, validatePack, register, reset, has, languages, packs: list, translate, term, format, plural, locale };
  if (typeof module !== 'undefined' && module.exports) {
    const fs = require('node:fs');
    const path = require('node:path');
    api.builtInFolder = path.join(__dirname, 'languages');
    api.loadBuiltIn = () => {
      for (const name of fs.readdirSync(api.builtInFolder).sort()) {
        if (name.endsWith('.json') && validCode(name.slice(0, -5))) register(JSON.parse(fs.readFileSync(path.join(api.builtInFolder, name), 'utf8')), { replace: true });
      }
    };
    api.loadBuiltIn();
    module.exports = api;
  } else window.OrbitaI18n = api;
})();
