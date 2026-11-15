// Interface language and portable repository settings.
import { Component } from '../core/Component.js';
import { Translator } from '../shared.js';

export class LanguageSettings extends Component {
  #busy = false;
  constructor(app) {
    super(app);
    this.drawLanguages = this.drawLanguages.bind(this);
  }
  languageOptions(selected) {
    const options = Translator.languages().map(language => `<option value="${this.esc(language.code)}" ${language.code === selected ? 'selected' : ''}>${this.esc(language.name)}</option>`);
    if (selected && !Translator.has(selected)) options.unshift(`<option value="${this.esc(selected)}" selected>${this.esc(this.app.transfer.fillText("{0} (not installed)", selected))}</option>`);
    return options.join('');
  }
  async loadLanguages(operation = 'info', payload) {
    const info = await this.workspaceApi.languages(operation, payload);
    // Validate the entire response before replacing a working registry.
    const packs = info.packs.map(pack => Translator.validatePack(pack));
    Translator.reset();
    for (const pack of packs) Translator.register(pack, { replace: true });
    this.state.languageInfo = { revision: info.revision || '', repositories: info.repositories, languages: info.languages, errors: info.errors };
    return this.state.languageInfo;
  }
  async #operation(operation, repository) {
    if (this.#busy) throw new Error(this.t("Language repositories are loading."));
    const draft = this.state.settingsDraft, panel = this.$('#languages-details');
    this.#busy = true;
    this.drawLanguages();
    try {
      await this.loadLanguages(operation, { repository });
      if (this.state.settingsDraft !== draft || !panel.isConnected) return;
      const selected = this.$('#language').value;
      if (!this.app.settings.settingsChanged()) this.app.shell.render();
      else { this.$('#language').innerHTML = this.languageOptions(selected); this.drawLanguages(); }
      this.app.notifier.notify("Language repositories updated.");
    } catch (error) {
      // Reload status as well: the store retains the last valid cache after a failed refresh.
      await this.loadLanguages();
      throw error;
    } finally { this.#busy = false; this.drawLanguages(); }
  }
  drawLanguages() {
    const details = this.$('#languages-details');
    if (!details) return;
    const select = this.$('#language');
    this.$('#language-missing').hidden = !select || Translator.has(select.value);
    const languages = this.state.languageInfo.languages.map(language => `<li><span class="language-name">${this.esc(language.name)}</span><code>${this.esc(language.code)}</code><span class="language-source">${this.esc(language.source === 'built-in' ? this.t("Built-in") : language.source)}</span></li>`).join('');
    const disabled = this.#busy ? 'disabled' : '';
    const repositories = this.state.languageInfo.repositories.map(source => `<article class="appearance-source"><div><strong>${this.esc(source.repository)}</strong><small>${this.esc(this.t(source.official ? "Official repository" : "Community repository"))} · ${this.esc(source.updatedAt ? new Date(source.updatedAt).toLocaleString(this.locale()) : this.t(source.manifest ? "Bundled offline copy" : "Not cached"))}</small>${source.error ? `<p class="language-errors" role="alert">${this.esc(this.t(source.error))}</p>` : ''}</div><button type="button" class="button small" data-language-refresh="${this.esc(source.repository)}" ${disabled}>${this.esc(this.t("Refresh"))}</button>${source.official ? '' : `<button type="button" class="button small" data-language-remove="${this.esc(source.repository)}" ${disabled}>${this.esc(this.t("Remove reference"))}</button>`}</article>`).join('');
    details.innerHTML = `<div class="languages-layout"><div><h3>${this.esc(this.t("Available languages"))}</h3><ul class="language-list">${languages}</ul></div><div><h3>${this.esc(this.t("Add a language"))}</h3><p>${this.esc(this.t("Languages come from public GitHub repositories. Copy the English template from the official repository and add your translation to orbit-languages.json."))}</p><p>${this.esc(this.t("Missing texts stay in English. Cached languages work offline."))}</p><button type="button" class="button" id="language-template">${this.esc(this.t("Open official language repository"))}</button></div></div><h3>${this.esc(this.t("Language repositories"))}</h3><p class="muted">${this.esc(this.t("References apply to every organization in this portable copy. Refresh is manual; removing a reference keeps cached languages needed by saved organizations."))}</p><div class="appearance-sources">${repositories}</div><div class="appearance-add"><label class="field" for="language-repository">${this.esc(this.t("Public GitHub repository"))}<input id="language-repository" maxlength="200" placeholder="owner/repository" autocomplete="off" spellcheck="false" ${disabled}></label><button type="button" class="button" id="add-language-repository" ${disabled}>${this.esc(this.t("Add repository"))}</button><button type="button" class="button" id="reload-languages" ${disabled}>${this.esc(this.t("Reload cached languages"))}</button></div>${this.#busy ? `<p class="muted" role="status">${this.esc(this.t("Language repositories are loading."))}</p>` : ''}`;
    for (const error of this.state.languageInfo.errors.filter(error => !error.repository)) {
      const alert = document.createElement('p');
      alert.className = 'language-errors';
      alert.setAttribute('role', 'alert');
      alert.textContent = this.t(error.message);
      details.append(alert);
    }
    this.$('#language-template').onclick = this.app.notifier.action(() => this.workspaceApi.openLink('https://github.com/ZenPluS/orbit_languages'));
    this.$('#add-language-repository').onclick = this.app.notifier.action(() => this.#operation('add', this.$('#language-repository').value));
    this.$('#language-repository').onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); this.$('#add-language-repository').click(); } };
    this.$('#reload-languages').onclick = this.app.notifier.action(() => this.#operation('info'));
    for (const button of details.querySelectorAll('[data-language-refresh]')) button.onclick = this.app.notifier.action(() => this.#operation('refresh', button.dataset.languageRefresh));
    for (const button of details.querySelectorAll('[data-language-remove]')) button.onclick = this.app.notifier.action(() => this.#operation('remove', button.dataset.languageRemove));
  }
  wireLanguages() {
    this.$('#language').addEventListener('change', this.drawLanguages);
    this.drawLanguages();
  }
}
