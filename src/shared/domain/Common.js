'use strict';
// Small helpers shared by the domain classes: ids, dates, guards and translated terms.
(() => {
const Translator = typeof module !== 'undefined' ? require('../localization/Translator') : globalThis.OrbitKanban.Localization.Translator;

class Common {
  static id = () => globalThis.crypto.randomUUID();
  static APP_NAME = 'OrbitKanban';
  static today = () => new Date().toLocaleDateString('en-CA');
  static term = (text, language) => Translator.term(text, language) ?? String(text);
  static validLanguage = code => typeof code === 'string' && /^[a-z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/.test(code);
  static plainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  static localIsoDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  static addDays(isoDate, days) {
    const date = new Date(`${isoDate}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }
  static assert(condition, message) { if (!condition) throw new Error(message); }
}

if (typeof module !== 'undefined') module.exports = Common;
else ((globalThis.OrbitKanban ??= {}).Domain ??= {}).Common = Common;
})();
