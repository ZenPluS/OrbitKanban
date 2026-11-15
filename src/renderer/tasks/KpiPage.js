// Organization-wide task statistics.
import { Component } from '../core/Component.js';

export class KpiPage extends Component {
  render() {
    this.$('#content').innerHTML = `<div id="kpi-page">${this.app.columns.heading(this.app.sections.title('kpis'), "A summary of non-hidden tasks in this organization. List filters do not affect these figures.")}${this.app.columns.stats()}</div>`;
    const cards = this.$('#kpi-page').querySelectorAll('.stats > .stat');
    cards[1].hidden = !this.hasColumn('releaseDate');
    cards[2].hidden = !this.hasColumn('effort');
    cards[3].hidden = !this.hasColumn('highlight') && !this.hasColumn('status');
  }
}
