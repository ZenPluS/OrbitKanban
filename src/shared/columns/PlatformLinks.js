'use strict';
// Web addresses and "Link to platform" templates: validation, filling and normalization.
(() => {
const ColumnSchema = typeof module !== 'undefined' ? require('./ColumnSchema') : globalThis.OrbitKanban.Columns.ColumnSchema;

class PlatformLinks {
  // Templates saved before the source moved to English use the Italian placeholder {codice} (or <codice>), so both spellings stay valid.
  static hasPlaceholder = template => typeof template === 'string' && /\{(?:codice|code)\}|<(?:codice|code)>/i.test(template);
  static #hasScheme = value => /^[a-z][a-z\d+.-]*:\/\//i.test(value);
  static normalizeUrl(value) {
    const url = String(value ?? '').trim();
    return !url || PlatformLinks.#hasScheme(url) ? url : `https://${url}`;
  }
  static isWebUrl(value) {
    if (typeof value !== 'string' || value.length > 4000 || !/^https?:\/\/\S+$/i.test(value)) return false;
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname);
    } catch { return false; }
  }
  static fillTemplate = (template, code) => template.replace(/\{(?:codice|code)\}|<(?:codice|code)>/gi, () => encodeURIComponent(String(code).trim()));
  static validTemplate = template => template === '' || (typeof template === 'string' && template.length <= 2000 && PlatformLinks.hasPlaceholder(template) && PlatformLinks.isWebUrl(PlatformLinks.fillTemplate(template, 'PRJ-1')));
  // A platform value is either the identifier on that platform (put into the column template) or a full address.
  static platformLink(field, value) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) return '';
    if (PlatformLinks.#hasScheme(text)) return PlatformLinks.isWebUrl(text) ? text : '';
    if (!field.template) return '';
    const url = PlatformLinks.fillTemplate(field.template, text);
    return PlatformLinks.isWebUrl(url) ? url : '';
  }
  // Editor and import input: without a template only a web address makes sense, with a template the identifier is kept as typed.
  static platformValue(field, raw) {
    const text = String(raw ?? '').trim().replace(/\s+/g, ' ');
    if (!text) return '';
    if (field.template && !PlatformLinks.#hasScheme(text)) {
      ColumnSchema.assert(text.length <= 2000, "Invalid custom column value.");
      return text;
    }
    const url = PlatformLinks.normalizeUrl(text);
    ColumnSchema.assert(PlatformLinks.isWebUrl(url) && url.length <= 2000, "Enter a valid web address.");
    return url;
  }
}

if (typeof module !== 'undefined') module.exports = PlatformLinks;
else ((globalThis.OrbitKanban ??= {}).Columns ??= {}).PlatformLinks = PlatformLinks;
})();
