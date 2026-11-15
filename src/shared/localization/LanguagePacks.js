'use strict';
// Repository manifests contain the same declarative language objects as the translator.
(() => {
const Translator = typeof module !== 'undefined' ? require('./Translator') : globalThis.OrbitKanban.Localization.Translator;
const AppearancePacks = typeof module !== 'undefined' ? require('../domain/AppearancePacks') : globalThis.OrbitKanban.Domain.AppearancePacks;
class LanguagePacks {
  static OFFICIAL = [{ kind: 'languages', repository: 'zenplus/orbit_languages' }];
  static repository = AppearancePacks.repository;
  static sources(sources = []) {
    if (!Array.isArray(sources) || sources.length > 20) throw new Error('Too many language repositories.');
    const result = LanguagePacks.OFFICIAL.map(source => ({ ...source }));
    for (const source of sources) {
      if (source?.kind !== 'languages') throw new Error('Invalid language repository.');
      const repository = LanguagePacks.repository(source.repository);
      if (!result.some(item => item.repository === repository)) result.push({ kind: 'languages', repository });
    }
    return result;
  }
  static validate(input, kind = 'languages') {
    if (kind !== 'languages' || input?.format !== 'orbitkanban-languages' || input.version !== 1 ||
      !Array.isArray(input.languages) || !input.languages.length || input.languages.length > 50) throw new Error('Invalid language manifest.');
    const languages = input.languages.map(pack => Translator.validatePack(pack));
    if (new Set(languages.map(pack => pack.code.toLowerCase())).size !== languages.length) throw new Error('Duplicate language codes in repository.');
    for (const pack of languages) {
      const texts = [...Object.values(pack.messages), ...Object.values(pack.terms), ...Object.values(pack.plurals).flatMap(forms => Object.values(forms))];
      if (texts.some(text => /<[a-z!/?]/i.test(text))) throw new Error('Invalid language manifest.');
    }
    return { format: input.format, version: 1, languages };
  }
}
if (typeof module !== 'undefined') module.exports = LanguagePacks;
else ((globalThis.OrbitKanban ??= {}).Localization ??= {}).LanguagePacks = LanguagePacks;
})();
