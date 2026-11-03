'use strict';
(() => {
  // English is the source language; other language packs translate its interface text.
  const FORMAT = 'orbitkanban-language';
  const VERSION = 1;
  const SOURCE = 'en';
  const FALLBACK = 'en';
  const CODE = /^[a-z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/;
  const PLURAL_CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'];
  const MAX_TEXT = 4000;
  const packs = new Map();
  const cache = new Map();
  const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  const fail = message => { throw new Error(message); };
  const validCode = code => typeof code === 'string' && CODE.test(code);
  const htmlTokenPattern = /(<!--[\s\S]*?-->|<![^>]*>|<\/?[a-z][^>]*>)/gi;
  const translatableAttributePattern = /(\s(?:aria-label|aria-description|aria-valuetext|alt|placeholder|title)\s*=\s*)(["'])(.*?)\2/gi;
  function texts(value) {
    if (value === undefined) return {};
    if (!isRecord(value)) fail("Translations must be text.");
    const result = {};
    for (const [key, text] of Object.entries(value)) {
      if (!key || key.length > MAX_TEXT || typeof text !== 'string' || text.length > MAX_TEXT) fail("Translations must be text.");
      if (text) result[key] = text;
    }
    return result;
  }
  function pluralForms(value) {
    if (value === undefined) return {};
    if (!isRecord(value)) fail("Invalid plural forms.");
    const result = {};
    for (const [key, forms] of Object.entries(value)) {
      if (!key || key.length > MAX_TEXT || !isRecord(forms) || !Object.entries(forms).every(([category, text]) => PLURAL_CATEGORIES.includes(category) && typeof text === 'string' && text.length <= MAX_TEXT)) fail("Invalid plural forms.");
      const filled = Object.fromEntries(Object.entries(forms).filter(([, text]) => text));
      if (!Object.keys(filled).length) continue;
      if (!filled.other) fail("Invalid plural forms.");
      result[key] = filled;
    }
    return result;
  }
  function validatePack(input) {
    if (!isRecord(input) || input.format !== FORMAT) fail("The file is not an OrbitKanban language.");
    if (!Number.isInteger(input.version) || input.version < 1 || input.version > VERSION) fail("Unsupported language file version.");
    if (!validCode(input.code)) fail("Invalid language code.");
    if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 60) fail("Invalid language name.");
    if (input.locale !== undefined && typeof input.locale !== 'string') fail("Invalid locale.");
    let locale;
    try { [locale] = Intl.getCanonicalLocales(input.locale || input.code); }
    catch { fail("Invalid locale."); }
    return { format: FORMAT, version: VERSION, code: input.code, name: input.name.trim(), locale, messages: texts(input.messages), terms: texts(input.terms), plurals: pluralForms(input.plurals) };
  }
  function migrateLegacyKeys(values, sources) {
    const result = { ...values };
    for (const [key, value] of Object.entries(values)) {
      const source = sources.get(key);
      if (source && !Object.hasOwn(result, source)) result[source] = value;
    }
    return result;
  }
  function legacySources() {
    const italian = packs.get('it'), english = packs.get(SOURCE);
    if (!italian || !english) return new Map();
    const current = new Set([...Object.keys(english.messages), ...Object.keys(english.terms)]);
    const candidates = new Map();
    for (const [source, translated] of Object.entries({ ...italian.messages, ...italian.terms })) {
      if (!current.has(source) || !translated) continue;
      const previous = candidates.get(translated);
      candidates.set(translated, previous === undefined ? source : null);
    }
    return new Map([...candidates].filter(([, source]) => source));
  }
  // A pack for an already registered code is merged over it, so a file can customise a few texts.
  function register(input, { replace = false } = {}) {
    const pack = validatePack(input);
    const sources = legacySources();
    pack.messages = migrateLegacyKeys(pack.messages, sources);
    pack.terms = migrateLegacyKeys(pack.terms, sources);
    const legacyPluralKeys = { tema: 'theme', stato: 'status', urgenza: 'urgency', attività: 'tasks', evidenziatore: 'highlighter' };
    pack.plurals = Object.fromEntries(Object.entries(pack.plurals).map(([key, forms]) => [legacyPluralKeys[key] || key, forms]));
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
    const locale = own?.locale || (code === SOURCE ? 'en-GB' : fallback?.locale || 'en-GB');
    const keys = [...messages.keys()].sort((a, b) => b.length - a.length).map(escapeRegex);
    const pattern = keys.length ? new RegExp(`(?<![\\p{L}])(?:${keys.join('|')})(?![\\p{L}])`, 'gu') : null;
    const entry = { code, locale, messages, terms, plurals, pattern };
    cache.set(code, entry);
    return entry;
  }
  // Interface texts: known phrases are replaced inside the text, so markup and placeholders survive.
  function translate(text, language) {
    const { pattern, messages } = dictionary(language);
    const source = String(text);
    if (!pattern) return source;
    const replaceText = value => value.replace(pattern, match => messages.get(match));
    return source.split(htmlTokenPattern).map((part, index) => {
      if (index % 2 === 0) return replaceText(part);
      return part.replace(translatableAttributePattern, (_, prefix, quote, value) => `${prefix}${quote}${replaceText(value)}${quote}`);
    }).join('');
  }
  function translateTemplate(strings, values, language) {
    let prefix = '\uE000orbitkanban-';
    const staticMarkup = strings.join('');
    while (staticMarkup.includes(prefix)) prefix += '\uE000';
    const markers = values.map((_, index) => `${prefix}${index}\uE001`);
    let markup = strings[0];
    for (let index = 0; index < values.length; index++) markup += markers[index] + strings[index + 1];
    const pattern = new RegExp(`${escapeRegex(prefix)}(\\d+)\\uE001`, 'g');
    return translate(markup, language).replace(pattern, (_, index) => '' + values[index]);
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
  const api = { FORMAT, VERSION, SOURCE, FALLBACK, validCode, validatePack, register, reset, has, languages, packs: list, translate, translateTemplate, term, format, plural, locale };
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
