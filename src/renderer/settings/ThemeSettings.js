// Theme gallery and theme editor.
import { Component } from '../core/Component.js';
import { ThemeCatalog, ThemeGenerator } from '../shared.js';

export class ThemeSettings extends Component {
  themeFields = [['background', "Background"], ['surface', "Surfaces"], ['text', "Text"], ['accent', "Accent"]];
  #themePresets = new Map(ThemeCatalog.defaultThemes().map(theme => [theme.id, theme]));
  #themeKind(theme) {
    const preset = this.#themePresets.get(theme.id);
    if (!preset) return "Custom";
    return theme.name === preset.name && this.themeFields.every(([key]) => theme[key].toLowerCase() === preset[key]) ? "Built-in" : "Modified built-in";
  }
  drawThemeChoices() {
    const query = this.state.themeQuery.trim().toLocaleLowerCase(), total = this.state.settingsDraft.themes.length;
    const themes = this.state.settingsDraft.themes.filter(theme => !query || theme.name.toLocaleLowerCase().includes(query));
    const themeCount = this.plural(total, 'theme');
    this.$('#theme-count').textContent = query ? `${themes.length} / ${themeCount}` : themeCount;
    this.$('#theme-list').innerHTML = themes.length ? themes.map(theme => {
      const chosen = theme.id === this.state.settingsDraft.themeId, mock = this.themeFields.map(([key]) => `--mock-${key}:${theme[key]}`).join(';');
      return `<button type="button" class="theme-choice ${chosen ? 'chosen' : ''}" data-theme="${this.esc(theme.id)}" aria-pressed="${chosen}" title="${this.esc(theme.name)}"><span class="theme-mock" style="${mock}" aria-hidden="true"><span class="theme-mock-card"><span class="theme-mock-line"></span><span class="theme-mock-pill"></span></span></span><span class="theme-choice-info"><span class="theme-choice-name">${this.esc(theme.name)}</span><span class="theme-kind">${this.esc(this.t(this.#themeKind(theme)))}</span><span class="theme-swatches">${this.themeFields.map(([key, label]) => `<i style="background:${theme[key]}" title="${this.t(label)}: ${theme[key]}" role="img" aria-label="${this.t(label)}: ${theme[key]}"></i>`).join('')}</span></span>${chosen ? `<span class="theme-check" aria-hidden="true">${this.ico('check')}</span>` : ''}</button>`;
    }).join('') : `<p class="theme-empty">${this.esc(this.t("No theme matches your search."))}</p>`;
    document.querySelectorAll('#theme-list [data-theme]').forEach(b => b.onclick = () => {
      this.state.settingsDraft.themeId = b.dataset.theme; this.drawThemes();
      document.querySelector(`#theme-list [data-theme="${CSS.escape(b.dataset.theme)}"]`)?.focus({ preventScroll: true });
    });
  }
  #updateThemeChoice(theme) {
    const choice = document.querySelector(`#theme-list [data-theme="${CSS.escape(theme.id)}"]`);
    if (!choice) return;
    choice.querySelector('.theme-kind').textContent = this.t(this.#themeKind(theme));
    this.themeFields.forEach(([key, label], index) => {
      choice.querySelector('.theme-mock').style.setProperty(`--mock-${key}`, theme[key]);
      const swatch = choice.querySelectorAll('.theme-swatches i')[index];
      swatch.style.background = theme[key];
      swatch.title = `${this.t(label)}: ${theme[key]}`;
      swatch.setAttribute('aria-label', swatch.title);
    });
  }
  revealChosenTheme() {
    const list = this.$('#theme-list'), chosen = list?.querySelector('.theme-choice.chosen');
    if (!chosen || !list.clientHeight) return;
    const top = chosen.offsetTop, bottom = top + chosen.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top - 6;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight + 6;
  }
  async loadThemeImage(file, canvas) {
    if (!file) return false;
    const bitmap = await this.app.logo.decodeImage(file);
    try {
      if (!canvas.isConnected) return false;
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error("The image picker is unavailable on this device.");
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      canvas.hidden = false;
      return true;
    } finally { bitmap.close(); }
  }
  drawThemes() {
    this.app.colorPicker.closeColorPicker();
    this.drawThemeChoices();
    const theme = this.state.settingsDraft.themes.find(t => t.id === this.state.settingsDraft.themeId);
    this.app.themePainter.paintTheme(theme);
    this.$('#theme-editor').innerHTML = this.ui`<div class="theme-edit"><h3 class="theme-edit-title">Edit theme</h3><label class="field">Theme name<input id="theme-name" value="${this.esc(theme.name)}"></label><div class="theme-colors">${this.themeFields.map(([key, label]) => `<div class="theme-color-field"><span>${this.esc(this.t(label))}</span>${this.app.colorPicker.colorControl(theme[key], this.t(label), `data-theme-color="${key}"`, true)}</div>`).join('')}</div>
    <div class="image-picker"><label class="field">Generate 4 colors from an image<input id="theme-image-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"></label><p class="muted">Upload an image: background, surfaces, text and accent are extracted and assigned automatically. You can then adjust them with the color controls. Transparency is shown on white. Colors are adjusted as little as possible to meet WCAG AA contrast.</p><canvas id="theme-image-canvas" hidden role="img" aria-label="Image used to automatically generate the four theme colors"></canvas><label class="field">Optional adjustment: color to sample with a click<select id="theme-image-target">${this.themeFields.map(([key, label]) => `<option value="${key}">${this.t(label)}</option>`).join('')}</select></label><output id="theme-image-result" aria-live="polite">The image stays local and is not saved: only colors are stored in the theme.</output></div>
    <small class="muted">Live preview: the theme is applied to the app immediately. Save settings to keep it, otherwise the previous one remains.</small>${this.#themePresets.has(theme.id) ? this.ui`<button class="button small" id="reset-theme">Restore built-in theme</button>` : this.ui`<button class="button small" id="delete-theme">Delete theme</button>`}</div>`;
    this.$('#theme-name').oninput = e => { theme.name = e.target.value; this.drawThemeChoices(); };
    document.querySelectorAll('[data-theme-color]').forEach(button => {
      button.onclick = () => this.app.colorPicker.openColorPicker(button);
      button.oninput = () => { theme[button.dataset.themeColor] = button.value; this.app.colorPicker.updateColorControl(button, button.value); this.#updateThemeChoice(theme); this.app.themePainter.paintTheme(theme); this.app.settings.refreshSettingsState(); };
    });
    const canvas = this.$('#theme-image-canvas'), fileInput = this.$('#theme-image-file'), result = this.$('#theme-image-result');
    fileInput.onchange = this.app.notifier.action(async () => {
      const file = fileInput.files[0];
      if (!file) return;
      fileInput.disabled = true;
      result.textContent = this.t("Loading image…");
      try {
        if (await this.loadThemeImage(file, canvas)) {
          const context = canvas.getContext('2d', { willReadFrequently: true });
          if (!context) throw new Error("Cannot extract a palette from this image.");
          const palette = ThemeGenerator.themeFromImage(context.getImageData(0, 0, canvas.width, canvas.height).data);
          for (const [key] of this.themeFields) {
            theme[key] = palette[key];
            this.app.colorPicker.updateColorControl(document.querySelector(`[data-theme-color="${key}"]`), palette[key]);
          }
          this.#updateThemeChoice(theme); this.app.themePainter.paintTheme(theme); this.app.settings.refreshSettingsState();
          const contrastNote = palette.adjusted.length
            ? this.app.transfer.fillText("Adjusted as little as possible for WCAG AA contrast: {0}.", palette.adjusted.map(role => this.t(this.themeFields.find(([key]) => key === role)[1]).toLowerCase()).join(', '))
            : this.t("The extracted colors already meet WCAG AA contrast.");
          result.textContent = `${file.name} — ${this.t("four colors assigned automatically.")} ${palette.colorCount < 4 ? this.t("The image has few distinct colors: some roles share the same color.") + ' ' : ''}${contrastNote} ${this.t("Click “Save settings” to keep them.")}`;
        }
      } catch (error) {
        result.textContent = this.t(error.message);
        throw error;
      } finally { fileInput.disabled = false; fileInput.value = ''; }
    });
    canvas.onclick = this.app.notifier.action(event => {
      const bounds = canvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(canvas.width - 1, Math.floor((event.clientX - bounds.left) * canvas.width / bounds.width)));
      const y = Math.max(0, Math.min(canvas.height - 1, Math.floor((event.clientY - bounds.top) * canvas.height / bounds.height)));
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error("Cannot read the image color.");
      const pixel = context.getImageData(x, y, 1, 1).data;
      const color = '#' + [...pixel].slice(0, 3).map(value => value.toString(16).padStart(2, '0')).join('');
      const key = this.$('#theme-image-target').value;
      const input = document.querySelector(`[data-theme-color="${key}"]`);
      input.value = color;
      input.dispatchEvent(new Event('input'));
      result.textContent = `${this.t(this.themeFields.find(([field]) => field === key)[1])}: ${color}`;
    });
    if (this.$('#reset-theme')) this.$('#reset-theme').onclick = () => {
      Object.assign(theme, this.#themePresets.get(theme.id));
      this.drawThemes();
    };
    if (this.$('#delete-theme')) this.$('#delete-theme').onclick = () => {
      if (this.state.settingsDraft.themes.length === 1) { this.app.notifier.notify("At least one theme must remain.", true); return; }
      this.state.settingsDraft.themes = this.state.settingsDraft.themes.filter(t => t.id !== theme.id); this.state.settingsDraft.themeId = this.state.settingsDraft.themes[0].id; this.drawThemes();
    };
    this.revealChosenTheme();
  }
}
