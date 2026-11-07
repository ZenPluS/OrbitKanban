'use strict';
// Language packs and translation of interface text, templates, terms and plurals.
// English is the source language; other language packs translate its interface text.
(() => {
class Translator {
  static FORMAT = 'orbitkanban-language';
  static VERSION = 1;
  static SOURCE = 'en';
  static FALLBACK = 'en';
  static #CODE = /^[a-z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/;
  static #PLURAL_CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'];
  static #MAX_TEXT = 4000;
  static #registry = new Map();
  static #cache = new Map();
  static #isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  static #fail = message => { throw new Error(message); };
  static validCode = code => typeof code === 'string' && Translator.#CODE.test(code);
  static #htmlTokenPattern = /(<!--[\s\S]*?-->|<![^>]*>|<\/?[a-z][^>]*>)/gi;
  static #translatableAttributePattern = /(\s(?:aria-label|aria-description|aria-valuetext|alt|placeholder|title)\s*=\s*)(["'])(.*?)\2/gi;
  static #texts(value) {
    if (value === undefined) return {};
    if (!Translator.#isRecord(value)) Translator.#fail("Translations must be text.");
    const result = {};
    for (const [key, text] of Object.entries(value)) {
      if (!key || key.length > Translator.#MAX_TEXT || typeof text !== 'string' || text.length > Translator.#MAX_TEXT) Translator.#fail("Translations must be text.");
      if (text) result[key] = text;
    }
    return result;
  }
  static #pluralForms(value) {
    if (value === undefined) return {};
    if (!Translator.#isRecord(value)) Translator.#fail("Invalid plural forms.");
    const result = {};
    for (const [key, forms] of Object.entries(value)) {
      if (!key || key.length > Translator.#MAX_TEXT || !Translator.#isRecord(forms) || !Object.entries(forms).every(([category, text]) => Translator.#PLURAL_CATEGORIES.includes(category) && typeof text === 'string' && text.length <= Translator.#MAX_TEXT)) Translator.#fail("Invalid plural forms.");
      const filled = Object.fromEntries(Object.entries(forms).filter(([, text]) => text));
      if (!Object.keys(filled).length) continue;
      if (!filled.other) Translator.#fail("Invalid plural forms.");
      result[key] = filled;
    }
    return result;
  }
  static validatePack(input) {
    if (!Translator.#isRecord(input) || input.format !== Translator.FORMAT) Translator.#fail("The file is not an OrbitKanban language.");
    if (!Number.isInteger(input.version) || input.version < 1 || input.version > Translator.VERSION) Translator.#fail("Unsupported language file version.");
    if (!Translator.validCode(input.code)) Translator.#fail("Invalid language code.");
    if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 60) Translator.#fail("Invalid language name.");
    if (input.locale !== undefined && typeof input.locale !== 'string') Translator.#fail("Invalid locale.");
    let locale;
    try { [locale] = Intl.getCanonicalLocales(input.locale || input.code); }
    catch { Translator.#fail("Invalid locale."); }
    return { format: Translator.FORMAT, version: Translator.VERSION, code: input.code, name: input.name.trim(), locale, messages: Translator.#texts(input.messages), terms: Translator.#texts(input.terms), plurals: Translator.#pluralForms(input.plurals) };
  }
  static #migrateLegacyKeys(values, sources) {
    const result = { ...values };
    for (const [key, value] of Object.entries(values)) {
      const source = sources.get(key);
      if (source && !Object.hasOwn(result, source)) result[source] = value;
    }
    return result;
  }
  static #legacySources() {
    const italian = Translator.#registry.get('it'), english = Translator.#registry.get(Translator.SOURCE);
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
  static register(input, { replace = false } = {}) {
    const pack = Translator.validatePack(input);
    const sources = Translator.#legacySources();
    pack.messages = Translator.#migrateLegacyKeys(pack.messages, sources);
    pack.terms = Translator.#migrateLegacyKeys(pack.terms, sources);
    const legacyPluralKeys = { tema: 'theme', stato: 'status', urgenza: 'urgency', attività: 'tasks', evidenziatore: 'highlighter' };
    pack.plurals = Object.fromEntries(Object.entries(pack.plurals).map(([key, forms]) => [legacyPluralKeys[key] || key, forms]));
    const existing = replace ? null : Translator.#registry.get(pack.code);
    Translator.#registry.set(pack.code, existing ? {
      ...pack,
      messages: { ...existing.messages, ...pack.messages },
      terms: { ...existing.terms, ...pack.terms },
      plurals: { ...existing.plurals, ...pack.plurals }
    } : pack);
    Translator.#cache.clear();
    return pack.code;
  }
  static reset() { Translator.#registry.clear(); Translator.#cache.clear(); }
  static has = code => Translator.#registry.has(code);
  static languages() {
    return [...Translator.#registry.values()].map(({ code, name, locale }) => ({ code, name, locale })).sort((a, b) => a.name.localeCompare(b.name, 'en'));
  }
  static packs = () => [...Translator.#registry.values()].map(pack => structuredClone(pack));
  static #escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  static #dictionary(language) {
    const code = Translator.validCode(language) ? language : Translator.SOURCE;
    if (Translator.#cache.has(code)) return Translator.#cache.get(code);
    const own = Translator.#registry.get(code), fallback = Translator.#registry.get(Translator.FALLBACK);
    const chain = (code === Translator.SOURCE || code === Translator.FALLBACK ? [own] : [fallback, own]).filter(Boolean);
    const messages = new Map(chain.flatMap(pack => Object.entries(pack.messages)));
    const terms = new Map(chain.flatMap(pack => Object.entries(pack.terms)));
    const plurals = new Map(chain.flatMap(pack => Object.entries(pack.plurals)));
    const locale = own?.locale || (code === Translator.SOURCE ? 'en-GB' : fallback?.locale || 'en-GB');
    const keys = [...messages.keys()].sort((a, b) => b.length - a.length).map(Translator.#escapeRegex);
    const pattern = keys.length ? new RegExp(`(?<![\\p{L}])(?:${keys.join('|')})(?![\\p{L}])`, 'gu') : null;
    const entry = { code, locale, messages, terms, plurals, pattern };
    Translator.#cache.set(code, entry);
    return entry;
  }
  // Interface texts: known phrases are replaced inside the text, so markup and placeholders survive.
  static translate(text, language) {
    const { pattern, messages } = Translator.#dictionary(language);
    const source = String(text);
    if (!pattern) return source;
    const replaceText = value => value.replace(pattern, match => messages.get(match));
    return source.split(Translator.#htmlTokenPattern).map((part, index) => {
      if (index % 2 === 0) return replaceText(part);
      return part.replace(Translator.#translatableAttributePattern, (_, prefix, quote, value) => `${prefix}${quote}${replaceText(value)}${quote}`);
    }).join('');
  }
  static translateTemplate(strings, values, language) {
    let prefix = '\uE000orbitkanban-';
    const staticMarkup = strings.join('');
    while (staticMarkup.includes(prefix)) prefix += '\uE000';
    const markers = values.map((_, index) => `${prefix}${index}\uE001`);
    let markup = strings[0];
    for (let index = 0; index < values.length; index++) markup += markers[index] + strings[index + 1];
    const pattern = new RegExp(`${Translator.#escapeRegex(prefix)}(\\d+)\\uE001`, 'g');
    return Translator.translate(markup, language).replace(pattern, (_, index) => '' + values[index]);
  }
  // Default names and demo content: only exact matches are translated.
  static term(text, language) {
    const { terms, messages } = Translator.#dictionary(language);
    return terms.get(text) ?? messages.get(text) ?? String(text);
  }
  static format = (text, ...values) => values.reduce((result, value, index) => result.replaceAll(`{${index}}`, value), String(text));
  static plural(count, key, language) {
    const { plurals, locale } = Translator.#dictionary(language);
    const number = Number(count).toLocaleString(locale);
    const forms = plurals.get(key);
    if (!forms) return `${number} ${key}`;
    let category = 'other';
    try { category = new Intl.PluralRules(locale).select(Number(count)); } catch {}
    return (forms[category] || forms.other).replaceAll('{0}', number);
  }
  static locale = language => Translator.#dictionary(language).locale;
}

if (typeof module !== 'undefined' && module.exports) {
  const fs = require('node:fs');
  const path = require('node:path');
  Translator.builtInFolder = path.join(__dirname, '..', '..', '..', 'languages');
  Translator.loadBuiltIn = () => {
    for (const name of fs.readdirSync(Translator.builtInFolder).sort()) {
      if (name.endsWith('.json') && Translator.validCode(name.slice(0, -5))) Translator.register(JSON.parse(fs.readFileSync(path.join(Translator.builtInFolder, name), 'utf8')), { replace: true });
    }
  };
  Translator.loadBuiltIn();
  module.exports = Translator;
} else ((globalThis.OrbitKanban ??= {}).Localization ??= {}).Translator = Translator;
})();
