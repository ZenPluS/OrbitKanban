// Interface language settings.
import { Component } from '../core/Component.js';
import { Translator } from '../shared.js';

export class LanguageSettings extends Component {
  constructor(app) {
    super(app);
    this.drawLanguages = this.drawLanguages.bind(this);
  }
  languageOptions(selected) {
    const installed = Translator.languages();
    const list = installed.length ? installed : [{ code: 'it', name: "Italian" }];
    const options = list.map(language => `<option value="${this.esc(language.code)}" ${language.code === selected ? 'selected' : ''}>${this.esc(language.name)}</option>`);
    if (selected && !list.some(language => language.code === selected)) options.unshift(`<option value="${this.esc(selected)}" selected>${this.esc(this.app.transfer.fillText("{0} (not installed)", selected))}</option>`);
    return options.join('');
  }
  async loadLanguages(operation = 'info') {
    const info = await this.workspaceApi.languages(operation);
    const registry = Translator;
    registry.reset();
    for (const pack of info?.packs || []) {
      try { registry.register(pack, { replace: true }); }
      catch (error) { console.error('Language not registered:', pack?.code, error); }
    }
    const sources = new Map((info?.languages || []).map(language => [language.code, language.source]));
    this.state.languageInfo = {
      folder: info?.folder || '', template: info?.template || '',
      languages: registry.languages().map(language => ({ ...language, source: sources.get(language.code) || 'built-in' })),
      errors: Array.isArray(info?.errors) ? info.errors : []
    };
    return this.state.languageInfo;
  }
  #languageSources = { 'built-in': "Built-in", added: "Added from file", customized: "Customized from file" };
  #languageSteps = [
    "Open the languages folder: it contains en.template.json, the complete English file to use as a template.",
    "Copy it using the code of the new language, for example de.json, and update code, name and locale.",
    "Translate only the values on the right: the keys on the left are the original text and must not be changed. Missing texts stay in English.",
    "Press “Reload languages”: the new language will appear in the list."
  ];
  drawLanguages() {
    const details = this.$('#languages-details');
    if (!details) return;
    const select = this.$('#language');
    this.$('#language-missing').hidden = !select || Translator.has(select.value);
    const languages = this.state.languageInfo.languages.map(language => `<li><span class="language-name">${this.esc(language.name)}</span><code>${this.esc(language.code)}</code><span class="language-source ${this.esc(language.source)}">${this.esc(this.t(this.#languageSources[language.source] || this.#languageSources['built-in']))}</span></li>`).join('');
    const errors = this.state.languageInfo.errors.length ? `<div class="language-errors" role="alert"><h3>${this.esc(this.t("Ignored language files"))}</h3><ul>${this.state.languageInfo.errors.map(error => `<li><code>${this.esc(error.file || '—')}</code> ${this.esc(this.t(error.message))}</li>`).join('')}</ul></div>` : '';
    const folder = this.state.languageInfo.folder ? `<p class="muted language-folder-label">${this.esc(this.t("Languages folder"))}</p><code class="data-path" id="languages-folder">${this.esc(this.state.languageInfo.folder)}</code>` : '';
    details.innerHTML = `<div class="languages-layout"><div><h3>${this.esc(this.t("Available languages"))}</h3><ul class="language-list">${languages}</ul></div><div><h3>${this.esc(this.t("Add a language"))}</h3><ol class="language-steps">${this.#languageSteps.map(step => `<li>${this.esc(this.t(step))}</li>`).join('')}</ol></div></div>${folder}<div class="storage-actions"><button type="button" class="button" id="open-languages-folder">${this.ico('folder')}${this.esc(this.t("Open languages folder"))}</button><button type="button" class="button" id="reload-languages">${this.esc(this.t("Reload languages"))}</button></div>${errors}`;
    this.$('#open-languages-folder').onclick = this.app.notifier.action(async () => { await this.loadLanguages('open-folder'); this.drawLanguages(); });
    this.$('#reload-languages').onclick = this.app.notifier.action(async () => {
      const draftLanguage = this.$('#language').value, changed = this.app.settings.settingsChanged();
      await this.loadLanguages('reload');
      if (!changed) this.app.shell.render();
      else { this.$('#language').innerHTML = this.languageOptions(draftLanguage); this.drawLanguages(); }
      this.app.notifier.notify("Languages reloaded.");
    });
  }
  wireLanguages() {
    this.$('#language').addEventListener('change', this.drawLanguages);
    this.drawLanguages();
  }
}
