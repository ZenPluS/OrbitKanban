// Font family and text size settings.
import { Component } from '../core/Component.js';
import { TaskOrder, Typography } from '../shared.js';

export class FontSettings extends Component {
  #fontSizeLabels = {
    base: ["General text", "Top bar, buttons, statistics, filters, settings and messages."],
    sidebar: ["Sidebar", "Organization, views and details in the left column."],
    headings: ["Page headings", "Eyebrow, title and description at the top of each view."],
    tables: ["Tables", "Rows and columns of the task list and linked issues."],
    milestones: ["Milestone view", "Roadmap dates, milestones and cards."],
    kanban: ["Kanban view", "Board columns and cards."],
    dialogs: ["Dialogs", "Task and issue editing, confirmations and import."]
  };
  #fontPresets = [[85, "Compact"], [100, 'Standard'], [115, "Large"], [130, "Extra large"]];
  #sampleTask() {
    const { statuses, urgencies } = this.state.data.settings;
    return this.state.data.tasks.find(task => task.releaseDate && !task.hidden && this.app.richText.plain(task.description)) || this.state.data.tasks.find(task => task.releaseDate) || this.state.data.tasks[0] || {
      id: 'font-sample', code: 'PRJ-1042', sequence: 1, description: this.t("Example: prepare the release and update the documentation."), notes: '',
      releaseDate: new Date().toLocaleDateString('en-CA'), statusId: statuses[Math.min(1, statuses.length - 1)]?.id || '', urgencyId: urgencies[0]?.id || '', effortHours: 12, hidden: false
    };
  }
  #fontSample(id, task) {
    const settings = this.state.data.settings, status = this.statusOf(task);
    const color = task.releaseDate ? TaskOrder.dateColor(task.releaseDate) : '#929bb2', group = this.state.data.tasks.includes(task) ? this.state.data.tasks.filter(item => item.releaseDate === task.releaseDate) : [task];
    const samples = {
      base: () => this.ui`<div class="sample-stack"><div class="stat"><span>Visible tasks <span class="stat-icon">${this.ico('tasks')}</span></span><strong>${this.app.presenter.visibleTasks().length}<small>in your workspace</small></strong></div><div class="sample-actions"><span class="button primary">${this.ico('plus')}New task</span><span class="button">Save settings</span></div></div>`,
      sidebar: () => [0, 1, 2].map(i => `<div class="nav-button ${i ? '' : 'active'}"><span class="nav-icon">${this.icons[i]}</span><span>${this.esc(settings.tabNames[i])}</span>${i ? '' : `<span class="nav-count">${this.app.presenter.visibleTasks().length}</span>`}</div>`).join(''),
      headings: () => this.app.columns.heading(settings.tabNames[0], "All tasks, one direction. Plan your work and focus on upcoming releases."),
      tables: () => this.ui`<table><thead><tr><th>Portal code</th><th>Description</th><th>Release date</th></tr></thead><tbody><tr><td><span class="code-link">${this.esc(task.code)}</span></td><td><span class="description-cell">${this.esc(this.app.richText.plain(task.description) || this.tr("No description"))}</span></td><td><span class="date-pill" style="--date:${color}">${this.ico('calendar')}${this.app.presenter.formatDate(task.releaseDate)}</span></td></tr></tbody></table>`,
      milestones: () => this.ui`<div style="--milestone:${color}"><div class="timeline-label">MILESTONE ${'01'}</div><div class="timeline-line"><span>${this.ico('diamond')}</span></div><div class="milestone-heading"><h2>${this.app.presenter.formatDate(task.releaseDate)}</h2><span>${group.length} tasks · ${this.app.presenter.effort(group.reduce((sum, item) => sum + item.effortHours, 0))}</span></div><div class="milestone-cards">${this.app.milestones.miniTask(task)}</div></div>`,
      kanban: () => `<div class="kanban-column" style="--column:${status.color}"><div class="kanban-heading"><span><i></i>${this.esc(status.name)}</span><b>${this.state.data.tasks.filter(item => item.statusId === status.id).length}</b></div><div class="kanban-cards">${this.app.milestones.miniTask(task, true)}</div></div>`,
      dialogs: () => this.ui`<div class="sample-dialog"><div class="modal-heading"><div><div class="eyebrow">TASK</div><h2>Edit task</h2></div><span class="icon-button">${this.ico('close')}</span></div><label class="field">Portal code<input value="${this.esc(task.code)}" readonly tabindex="-1"></label><div class="modal-actions"><span class="spacer"></span><span class="button">Cancel</span><span class="button primary">Save task</span></div></div>`
    };
    return samples[id]();
  }
  fontSizePanel() {
    const sizes = this.state.settingsDraft.fontSizes || Typography.defaultFontSizes(), task = this.#sampleTask();
    const families = [true, false].map(bundled => `<optgroup label="${this.esc(this.t(bundled ? "Bundled with the portable app (offline)" : "System fonts (if installed)"))}">${Typography.FONT_FAMILIES.filter(font => Boolean(font.bundled) === bundled).map(font => `<option value="${font.id}" ${font.id === (this.state.settingsDraft.fontFamily ?? Typography.DEFAULT_FONT_FAMILY) ? 'selected' : ''}>${font.name}</option>`).join('')}</optgroup>`).join('');
    const presets = this.#fontPresets.map(([value, name]) => `<button type="button" class="button small font-preset" data-font-preset="${value}" aria-pressed="false">${this.esc(this.t(name))} <small>${value}%</small></button>`).join('');
    const cards = Typography.FONT_SIZE_PARTS.map(({ id, min, max }) => {
      const [name, description] = this.#fontSizeLabels[id], value = sizes[id] ?? 100, reset = this.t("Reset to 100%");
      return `<div class="font-size-card" data-font-card="${id}"><div class="font-size-title"><label for="font-size-${id}">${this.esc(this.t(name))}</label><small id="font-size-${id}-hint">${this.esc(this.t(description))}</small></div><div class="font-size-control"><span class="font-size-limit" aria-hidden="true">${min}%</span><input type="range" id="font-size-${id}" data-font-size="${id}" min="${min}" max="${max}" step="${Typography.FONT_SIZE_STEP}" value="${value}" aria-describedby="font-size-${id}-hint"><span class="font-size-limit" aria-hidden="true">${max}%</span><output class="font-size-value" id="font-size-${id}-value" for="font-size-${id}">${value}%</output><button type="button" class="icon-button font-size-reset" data-font-reset="${id}" title="${this.esc(reset)}" aria-label="${this.esc(`${reset}: ${this.t(name)}`)}">${this.ico('reset')}</button></div><div class="font-sample" data-part="${id}" inert aria-hidden="true">${this.#fontSample(id, task)}</div></div>`;
    }).join('');
    return this.ui`<section class="panel settings-section full" id="font-size-panel"><label class="field font-family-field"><span>${this.esc(this.t("Interface font"))}</span><select id="font-family">${families}</select><small>${this.esc(this.t("Instant preview; save to keep your choice. Bundled fonts work offline on every PC. System fonts, such as Aptos, must be installed locally; an alternative is used when unavailable."))}</small></label><div class="font-size-heading"><div><h2>Text size</h2><p class="section-description">Adjust the text of each part of the app: the preview applies instantly across the whole interface, save to keep it. Minimums and maximums keep everything readable and tidy.</p></div><div class="font-presets" role="group" aria-label="Presets">${presets}</div></div><div class="font-size-grid">${cards}<div class="font-size-card font-size-notes"><h3>Good to know</h3><ul><li>100% is the recommended size; presets adjust every part at once.</li><li>Each part has a minimum and a maximum, in 5% steps: the interface always stays usable.</li><li>Sizes apply only to this organization and are included in the settings export.</li></ul></div></div></section>`;
  }
  paintFontFamily(value = Typography.DEFAULT_FONT_FAMILY) {
    const font = Typography.FONT_FAMILIES.find(font => font.id === value);
    if (!font) throw new Error(this.t("Invalid font."));
    document.documentElement.style.fontFamily = font.css;
    if (font.bundled) document.fonts.load(`400 14px "${font.name}"`).then(faces => {
      if (!faces.length) throw new Error(`Missing font face: ${font.name}`);
    }).catch(error => {
      console.error('Portable font load failed:', error);
      this.app.notifier.notify(this.t("Unable to load the bundled font. Check the app files or choose another font.") + ` (${font.name})`, true);
    });
  }
  wireFontSizes() {
    this.$('#font-family').onchange = event => {
      this.state.settingsDraft.fontFamily = event.target.value;
      this.paintFontFamily(this.state.settingsDraft.fontFamily);
      this.app.settings.refreshSettingsState();
    };
    const draftSizes = () => (this.state.settingsDraft.fontSizes ??= Typography.defaultFontSizes());
    const sync = () => {
      const sizes = this.state.settingsDraft.fontSizes || Typography.defaultFontSizes();
      for (const { id } of Typography.FONT_SIZE_PARTS) {
        const value = sizes[id] ?? 100, input = this.$(`#font-size-${id}`);
        input.value = String(value);
        input.setAttribute('aria-valuetext', `${value}%`);
        this.$(`#font-size-${id}-value`).textContent = `${value}%`;
        this.$(`[data-font-reset="${id}"]`).disabled = value === 100;
        this.$(`[data-font-card="${id}"]`).classList.toggle('changed', value !== (this.state.data.settings.fontSizes?.[id] ?? 100));
      }
      document.querySelectorAll('[data-font-preset]').forEach(button => {
        button.setAttribute('aria-pressed', String(Typography.FONT_SIZE_PARTS.every(({ id }) => (sizes[id] ?? 100) === Typography.clampFontSize(id, button.dataset.fontPreset))));
      });
      this.app.shell.paintFontSizes(sizes);
    };
    document.querySelectorAll('[data-font-size]').forEach(input => input.oninput = () => {
      draftSizes()[input.dataset.fontSize] = Typography.clampFontSize(input.dataset.fontSize, input.value);
      sync();
    });
    document.querySelectorAll('[data-font-reset]').forEach(button => button.onclick = () => {
      draftSizes()[button.dataset.fontReset] = 100;
      sync();
    });
    document.querySelectorAll('[data-font-preset]').forEach(button => button.onclick = () => {
      const sizes = draftSizes();
      for (const { id } of Typography.FONT_SIZE_PARTS) sizes[id] = Typography.clampFontSize(id, button.dataset.fontPreset);
      sync();
    });
    sync();
  }
}
