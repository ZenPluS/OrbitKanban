// Shared task formatting: platform links, pills, dates, effort, options and tags.
import { Component } from '../core/Component.js';
import { ColumnSchema } from '../shared.js';

export class TaskPresenter extends Component {
  constructor(app) {
    super(app);
    this.formatDate = this.formatDate.bind(this);
  }
  #openPortal = this.app.notifier.action(async url => { this.state.lastOpenedLink = await this.workspaceApi.openLink(url); });
  portalAnchor(url, code, className = 'external-link') {
    return url ? `<a class="${className}" href="${this.esc(url)}" data-open-url title="${this.esc(this.t("Open in the default browser") + ': ' + url)}" aria-label="${this.esc(this.t("Open on the platform") + ' ' + code)}">${this.ico('external')}</a>` : '';
  }
  pill(name, color, extra = '') { return `<span class="pill ${extra}" style="--pill:${this.esc(color)}"><i></i>${this.esc(name)}</span>`; }
  #dateFormatter; #dateFormatterLocale;
  formatDate(date) {
    if (!date) return this.t("Unscheduled");
    const currentLocale = this.locale();
    if (this.#dateFormatterLocale !== currentLocale) {
      this.#dateFormatter = new Intl.DateTimeFormat(currentLocale, { day: '2-digit', month: 'short', year: 'numeric' });
      this.#dateFormatterLocale = currentLocale;
    }
    return this.#dateFormatter.format(new Date(date + 'T12:00:00'));
  }
  effort(value) {
    const days = Math.floor(value / this.state.data.settings.hoursPerDay);
    const hours = Math.round((value - days * this.state.data.settings.hoursPerDay) * 100) / 100;
    return [days ? this.term("{0}d").replaceAll('{0}', days) : '', hours ? `${hours}h` : ''].filter(Boolean).join(' ') || '—';
  }
  optionList(items, selected, all = '') {
    return (all ? `<option value="">${this.esc(this.t(all))}</option>` : '') + items.map(x => `<option value="${this.esc(x.id)}" ${x.id === selected ? 'selected' : ''}>${this.esc(x.name)}</option>`).join('');
  }
  visibleTasks() { return this.state.data.tasks.filter(t => !t.hidden); }
  highlightsOf = () => this.hasColumn('highlight') ? this.state.data.settings.highlights || [] : [];
  taskHighlights = task => {
    const ids = ColumnSchema.taskHighlightIds(task);
    return this.highlightsOf().filter(highlight => ids.includes(highlight.id));
  };
  highlightOf = task => this.taskHighlights(task)[0];
  highlightStyle(marks, status) {
    if (!marks.length) return '';
    const colors = marks.map(mark => mark.color);
    const backgroundColors = status?.highlight ? [status.color, ...colors] : colors;
    const gradient = (items, tint) => `linear-gradient(90deg, ${items.map((color, index) => {
      const value = tint ? `color-mix(in srgb, ${color} 16%, transparent)` : color;
      return `${value} ${index * 100 / items.length}% ${(index + 1) * 100 / items.length}%`;
    }).join(', ')})`;
    return `--mark:${colors[0]};--mark-colors:${gradient(colors, false)};--mark-background:${gradient(backgroundColors, true)}`;
  }
  tagsOf = task => (this.hasColumn('tags') ? this.state.data.settings.tags || [] : []).filter(tag => task.tagIds?.includes(tag.id));
  tagChips(task) { return `<span class="tag-chips">${this.tagsOf(task).map(tag => this.pill(tag.name, tag.color, 'tag-pill')).join('')}</span>`; }
  tagPicker(task) {
    const tags = this.state.data.settings.tags || [];
    return `<fieldset class="field full task-tags" tabindex="-1"><legend>${this.esc(this.t('Tags'))}</legend><p class="muted">${this.esc(this.t(tags.length ? "Select one or more tags. Manage them in Settings › Tags." : "No tags available. Add them in Settings › Tags."))}</p><div class="tag-options">${tags.map(tag => `<label class="tag-choice"><input type="checkbox" name="tagIds" value="${this.esc(tag.id)}" ${task.tagIds?.includes(tag.id) ? 'checked' : ''}>${this.pill(tag.name, tag.color, 'tag-pill')}</label>`).join('')}</div></fieldset>`;
  }
  install() {
    document.addEventListener('click', event => {
      const link = event.target.closest('a[data-open-url]');
      if (!link) return;
      event.preventDefault();
      this.#openPortal(link.getAttribute('href'));
    });
  }
}
