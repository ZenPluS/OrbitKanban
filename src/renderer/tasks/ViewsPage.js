// Catalog of the organization's saved views and automatic release views.
import { Component } from '../core/Component.js';

export class ViewsPage extends Component {
  renderViews() {
    const savedViews = this.state.data.settings.savedViews || [], groups = this.app.savedViews.releaseViewGroups(true);
    const row = (id, name, summary, kind) => `<article class="saved-view-item"><div class="saved-view-info"><strong>${this.esc(name)}</strong><small>${this.esc(summary)}</small></div><button type="button" class="button small primary" data-catalog-kind="${kind}" data-catalog-id="${this.esc(id)}" aria-label="${this.esc(`${this.t("Open")}: ${name}`)}">${this.esc(this.t("Open"))}</button></article>`;
    const releases = dates => dates.map(date => row(this.app.savedViews.RELEASE_VIEW + date, date ? this.app.presenter.formatDate(date) : this.t("Unassigned"), this.plural(date ? groups.counts.get(date) : groups.unassigned, 'tasks'), 'release')).join('');
    const section = (title, items) => `<section class="panel"><h2>${this.esc(this.t(title))}</h2><div class="views-catalog-list">${items || `<p class="backup-empty">${this.esc(this.t("No views available."))}</p>`}</div></section>`;
    this.$('#content').innerHTML = this.app.columns.heading(this.app.sections.title('views'), "Open saved views and release views from one place.") +
      `<div id="views-page"><p class="section-description">${this.esc(this.t("Release views include hidden tasks. Create and manage saved views from the task list."))}</p>` +
      section("Saved views", savedViews.map(saved => row(saved.id, saved.name, this.app.savedViews.savedViewSummary(saved), 'saved')).join('')) +
      section("Upcoming releases", releases([...groups.upcoming, ...(groups.unassigned ? [''] : [])])) +
      section("Past releases", releases(groups.past)) + '</div>';
    this.$('#views-page').onclick = this.app.notifier.action(async event => {
      const button = event.target.closest('[data-catalog-id]');
      if (!button) return;
      const { catalogId: id, catalogKind: kind } = button.dataset;
      const exists = kind === 'saved' ? savedViews.some(saved => saved.id === id) : this.app.savedViews.releaseViewIds(this.app.savedViews.releaseViewGroups(true)).includes(id);
      if (!exists) throw new Error(this.t("The saved view no longer exists."));
      await this.app.sections.openType('tasks', kind === 'saved' ? id : '');
      if (kind === 'saved') await this.app.savedViews.applySavedView(id);
      else { this.state.showHidden = true; this.app.savedViews.applyReleaseView(id); }
    });
  }
}
