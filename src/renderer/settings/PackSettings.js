// Repository references and previews are organization settings; package bytes stay in the portable cache.
import { Component } from '../core/Component.js';
import { AppearancePacks, IconLibrary, ThemeCatalog } from '../shared.js';

export class PackSettings extends Component {
  busy = false;
  catalog = { sources: [] };
  #unavailable = '';
  #renderedCatalog;
  #renderedSelection;
  adopt(catalog, settings) {
    if (catalog) this.catalog = catalog;
    const official = this.catalog.sources.find(source => source.kind === 'themes' && source.repository === AppearancePacks.OFFICIAL[1].repository);
    if (official?.manifest) ThemeCatalog.setExternalThemes(AppearancePacks.validate(official.manifest, 'themes').packs.flatMap(pack => pack.themes));
    this.preview(settings);
  }
  preview(settings) {
    if (!this.catalog.sources.length) return;
    if (this.#renderedCatalog === this.catalog && this.#renderedSelection === (settings.iconPack || 'default')) return;
    const available = IconLibrary.configure(this.catalog, settings.iconPack || 'default', document);
    this.#renderedCatalog = this.catalog;
    this.#renderedSelection = settings.iconPack || 'default';
    if (!available && this.#unavailable !== settings.iconPack) {
      this.#unavailable = settings.iconPack;
      this.app.notifier.notify("The selected icon pack is unavailable. Default icons are used until its repository is refreshed.", true);
    }
    if (available) this.#unavailable = '';
  }
  #body() {
    const draft = this.state.settingsDraft, sources = AppearancePacks.sources(draft.packSources), packs = [];
    for (const source of this.catalog.sources.filter(source => source.kind === 'icons' && source.manifest && sources.some(reference => reference.kind === source.kind && reference.repository === source.repository))) {
      for (const pack of AppearancePacks.validate(source.manifest, 'icons').packs) packs.push({ id: `${source.repository}:${pack.id}`, name: `${pack.name} · ${source.repository}` });
    }
    const selected = draft.iconPack || 'default';
    return this.ui`<h2>Appearance repositories</h2><p class="section-description">Public GitHub repositories provide declarative icon and theme packs. Cached packs work offline and travel with the data folder. Refresh explicitly to download updates.</p>
      <label class="field">Icon pack<select id="appearance-icon"><option value="default">Default Orbit icons</option>${packs.map(pack => `<option value="${this.esc(pack.id)}" ${selected === pack.id ? 'selected' : ''}>${this.esc(pack.name)}</option>`).join('')}${selected !== 'default' && !packs.some(pack => pack.id === selected) ? `<option value="${this.esc(selected)}" selected>${this.esc(selected)} (${this.esc(this.t("Not cached"))})</option>` : ''}</select></label>
      <button type="button" class="button small" id="appearance-reset">Restore default icons</button>
      <div class="appearance-sources">${sources.map((source, index) => {
        const cached = this.catalog.sources.find(entry => entry.kind === source.kind && entry.repository === source.repository);
        const official = AppearancePacks.OFFICIAL.some(entry => entry.kind === source.kind && entry.repository === source.repository);
        const status = cached?.error ? this.t(cached.error) : cached?.updatedAt ? `${this.t("Cached")}: ${cached.updatedAt}` : cached?.manifest ? this.t("Bundled offline copy") : this.t("Not cached");
        return `<div class="appearance-source"><div><strong>${this.esc(source.repository)}</strong><small>${this.esc(this.t(source.kind === 'icons' ? "Icons" : "Themes"))} · ${this.esc(status)}</small></div><button type="button" class="button small" data-pack-refresh="${index}">${this.esc(this.t("Refresh"))}</button>${official ? '' : `<button type="button" class="button small" data-pack-remove="${index}">${this.esc(this.t("Remove reference"))}</button>`}</div>`;
      }).join('')}</div>
      <form id="appearance-add" class="appearance-add"><label class="field">Package type<select name="kind"><option value="icons">Icons</option><option value="themes">Themes</option></select></label><label class="field">Public GitHub repository<input name="repository" required maxlength="200" placeholder="owner/repository" autocomplete="off"></label><button class="button" type="submit">Add repository</button></form>
      <p class="muted">Missing icons fall back to Orbit. Removing a reference keeps saved themes. Refresh preserves palettes you edited; use the theme reset button to restore a repository preset.</p><output id="appearance-result" role="status" aria-live="polite"></output>`;
  }
  panel() { return `<section class="panel settings-section full" id="appearance-panel">${this.#body()}</section>`; }
  wire() {
    this.$('#appearance-icon').value = this.state.settingsDraft.iconPack || 'default';
    this.$('#appearance-icon').onchange = event => {
      this.state.settingsDraft.iconPack = event.target.value;
      this.preview(this.state.settingsDraft);
    };
    this.$('#appearance-reset').onclick = () => {
      this.state.settingsDraft.iconPack = 'default';
      this.$('#appearance-icon').value = 'default';
      this.preview(this.state.settingsDraft);
    };
    this.$('#appearance-add').onsubmit = this.app.notifier.action(async event => {
      event.preventDefault();
      const form = event.currentTarget;
      await this.#refresh(form.elements.kind.value, AppearancePacks.repository(form.elements.repository.value), true);
    });
    this.$('#appearance-panel').querySelectorAll('[data-pack-refresh]').forEach(button => button.onclick = this.app.notifier.action(async () => {
      const source = AppearancePacks.sources(this.state.settingsDraft.packSources)[Number(button.dataset.packRefresh)];
      await this.#refresh(source.kind, source.repository);
    }));
    this.$('#appearance-panel').querySelectorAll('[data-pack-remove]').forEach(button => button.onclick = () => {
      const draft = this.state.settingsDraft, source = AppearancePacks.sources(draft.packSources)[Number(button.dataset.packRemove)];
      draft.packSources = draft.packSources.filter(entry => entry.kind !== source.kind || entry.repository !== source.repository);
      if (source.kind === 'icons' && draft.iconPack?.startsWith(`${source.repository}:`)) draft.iconPack = 'default';
      this.draw();
      this.preview(draft);
    });
  }
  draw() { this.$('#appearance-panel').innerHTML = this.#body(); this.wire(); }
  async #refresh(kind, repository, add = false) {
    if (this.busy) throw new Error(this.t("Appearance packs are loading."));
    const draft = this.state.settingsDraft, panel = this.$('#appearance-panel');
    const sources = [...(draft.packSources || [])];
    if (add && !AppearancePacks.sources(sources).some(source => source.kind === kind && source.repository === repository)) sources.push({ kind, repository });
    AppearancePacks.sources(sources);
    this.busy = true;
    panel.querySelectorAll('button, input, select').forEach(element => { element.disabled = true; });
    this.$('#appearance-result').textContent = this.t("Downloading appearance pack…");
    try {
      const catalog = await this.workspaceApi.appearance('refresh', { kind, repository, sources });
      if (this.state.settingsDraft !== draft || !panel.isConnected) return;
      this.adopt(catalog, draft);
      draft.packSources = sources;
      AppearancePacks.mergeThemes(draft, catalog);
      this.app.themes.drawThemes();
      this.draw();
      this.$('#appearance-result').textContent = this.t("Appearance packs cached. Save settings to keep your selections.");
    } catch (error) {
      if (panel.isConnected) this.$('#appearance-result').textContent = this.t(error.message);
      throw error;
    } finally {
      this.busy = false;
      if (panel.isConnected) panel.querySelectorAll('button, input, select').forEach(element => { element.disabled = false; });
      this.app.settings.refreshSettingsState();
    }
  }
}
