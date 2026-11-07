// Settings tab that orders, renames, removes and adds the sections of the sidebar.
import { Component } from '../core/Component.js';
import { NavigationSections } from '../shared.js';

export class NavigationSettings extends Component {
  #typeName = type => this.term(NavigationSections.DEFAULT_NAMES[type]);
  #viewOptions(selected = '') {
    const views = this.state.settingsDraft.savedViews || [];
    return `<option value="">${this.esc(this.t("All tasks"))}</option>` + views.map(view => `<option value="${this.esc(view.id)}" ${view.id === selected ? 'selected' : ''}>${this.esc(view.name)}</option>`).join('');
  }
  navigationPanel() {
    const types = NavigationSections.TYPES.map(type => `<option value="${type}">${this.esc(this.#typeName(type))}</option>`).join('');
    return this.ui`<section class="panel settings-section full" id="navigation-panel"><h2>Navigation</h2><p class="section-description">Choose the sections of the sidebar, their names and their order. Each section opens one of the five view types; Guide and Settings always stay at the bottom.</p><div class="section-list" id="section-list"></div>
    <form id="add-section" class="section-add"><h3>New section</h3><div class="section-add-fields"><label class="field">Section type<select name="type" id="new-section-type">${types}</select></label><label class="field">Section name<input name="name" id="new-section-name" maxlength="60" autocomplete="off"></label><label class="field">Saved view<select name="viewId" id="new-section-view"></select></label><button type="submit" class="button" id="add-section-button">${this.ico('plus')}Add section</button></div><small class="muted">A saved view limits the tasks a list, milestone or kanban section shows. Leave the name empty to use the name of the view type.</small></form>
    <p class="muted">Removing a section never deletes tasks or issues: you can add it again at any time. The first section opens when the app starts.</p></section>`;
  }
  drawNavigation() {
    const container = this.$('#section-list'), list = this.state.settingsDraft?.navigation;
    if (!container || !list) return;
    const refresh = () => { this.drawNavigation(); this.app.settings.refreshSettingsState(); };
    container.innerHTML = list.map((section, index) => {
      const icon = this.app.sections.iconOf(section.type), type = this.#typeName(section.type);
      const view = NavigationSections.FILTERABLE.includes(section.type)
        ? `<select class="section-view" data-section-view="${this.esc(section.id)}" aria-label="${this.esc(this.app.transfer.fillText("Saved view of {0}", section.name))}">${this.#viewOptions(section.viewId)}</select>`
        : `<span class="section-view muted">${this.esc(this.t(section.type === 'views' ? "All views" : "Every association"))}</span>`;
      return `<div class="option-row section-row" data-section-row="${this.esc(section.id)}">${this.app.sortable.dragHandle(section.name)}<span class="order-number">${String(index + 1).padStart(2, '0')}</span><span class="section-type" title="${this.esc(type)}"><span class="section-type-icon" aria-hidden="true">${icon}</span><span class="section-type-name">${this.esc(type)}</span></span><input class="option-name" aria-label="${this.esc(this.t("Section name"))}" maxlength="60" required data-section-name="${this.esc(section.id)}" value="${this.esc(section.name)}">${view}<button type="button" class="icon-button" data-section-move="${this.esc(section.id)}:-1" ${index === 0 ? 'disabled' : ''} title="${this.esc(this.t("Move up"))}">${this.ico('arrow-up')}</button><button type="button" class="icon-button" data-section-move="${this.esc(section.id)}:1" ${index === list.length - 1 ? 'disabled' : ''} title="${this.esc(this.t("Move down"))}">${this.ico('arrow-down')}</button><button type="button" class="icon-button delete-option" data-section-remove="${this.esc(section.id)}" ${list.length === 1 ? 'disabled' : ''} title="${this.esc(this.t("Remove section"))}" aria-label="${this.esc(this.app.transfer.fillText("Remove section {0}", section.name))}">${this.ico('close')}</button></div>`;
    }).join('');
    const find = id => list.find(section => section.id === id);
    container.querySelectorAll('[data-section-name]').forEach(input => input.oninput = () => { find(input.dataset.sectionName).name = input.value; });
    container.querySelectorAll('[data-section-view]').forEach(select => select.onchange = () => {
      const section = find(select.dataset.sectionView);
      if (select.value) section.viewId = select.value; else delete section.viewId;
      this.app.settings.refreshSettingsState();
    });
    container.querySelectorAll('[data-section-move]').forEach(button => button.onclick = () => {
      const [id, offset] = button.dataset.sectionMove.split(/:(?=-?1$)/), index = list.findIndex(section => section.id === id), target = index + Number(offset);
      if (index < 0 || target < 0 || target >= list.length) return;
      [list[index], list[target]] = [list[target], list[index]];
      refresh();
      container.querySelector(`[data-section-move="${CSS.escape(id)}:${offset}"]:not(:disabled)`)?.focus();
    });
    container.querySelectorAll('[data-section-remove]').forEach(button => button.onclick = () => {
      if (list.length === 1) return;
      list.splice(list.findIndex(section => section.id === button.dataset.sectionRemove), 1);
      refresh();
    });
    this.app.sortable.sortable(container, '.section-row', (from, to) => { list.splice(to, 0, ...list.splice(from, 1)); refresh(); });
    this.#drawAddForm();
  }
  #drawAddForm() {
    const form = this.$('#add-section'), list = this.state.settingsDraft.navigation;
    if (!form) return;
    const type = this.$('#new-section-type'), view = this.$('#new-section-view'), selected = view.value;
    const sync = () => {
      const filterable = NavigationSections.FILTERABLE.includes(type.value);
      view.disabled = !filterable;
      if (!filterable) view.value = '';
      this.$('#new-section-name').placeholder = NavigationSections.defaultName(type.value, this.currentLanguage());
    };
    view.innerHTML = this.#viewOptions(selected);
    sync();
    type.onchange = sync;
    const full = list.length >= NavigationSections.LIMIT;
    this.$('#add-section-button').disabled = full;
    this.$('#add-section-button').title = full ? this.t("You can have up to 12 navigation sections.") : '';
    form.onsubmit = event => {
      event.preventDefault();
      if (list.length >= NavigationSections.LIMIT) { this.app.notifier.notify("You can have up to 12 navigation sections.", true); return; }
      const name = this.$('#new-section-name').value.trim() || NavigationSections.defaultName(type.value, this.currentLanguage());
      const section = { id: this.uid(), type: type.value, name };
      if (NavigationSections.FILTERABLE.includes(type.value) && view.value) section.viewId = view.value;
      list.push(section);
      form.reset();
      view.value = '';
      this.drawNavigation();
      this.app.settings.refreshSettingsState();
      this.app.sortable.announceOrder(this.$('#section-list'), this.app.transfer.fillText("Section “{0}” added.", name));
      this.$(`[data-section-name="${CSS.escape(section.id)}"]`)?.focus();
    };
  }
}
