// Modal dialog and confirmation prompts.
import { Component } from '../core/Component.js';

export class ModalDialog extends Component {
  openModal(html) {
    this.app.colorPicker.closeColorPicker();
    this.app.tagMenu.closeTagMenu();
    this.$('#modal-content').innerHTML = html;
    this.$('#modal').showModal();
    document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => this.$('#modal').close());
  }
  confirmDialog(title, message, callback) {
    if (this.$('#modal').open) this.$('#modal').close();
    this.openModal(this.ui`<div class="modal-heading"><h2>${this.esc(this.t(title))}</h2></div><p class="confirm-message">${this.esc(this.t(message))}</p><div class="modal-actions"><span class="spacer"></span><button class="button" data-close>Cancel</button><button class="button danger" id="confirm-action">Confirm</button></div>`);
    this.$('#confirm-action').onclick = this.app.notifier.action(async () => { await callback(); this.$('#modal').close(); });
  }
}
