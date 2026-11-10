// Modal dialog and confirmation prompts.
import { Component } from '../core/Component.js';

export class ModalDialog extends Component {
  openModal(html) {
    this.app.colorPicker.closeColorPicker();
    this.app.tagMenu.closeTagMenu();
    this.$('#modal-content').innerHTML = html;
    if (!this.$('#modal').open) this.$('#modal').showModal();
    document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => this.$('#modal').close());
  }
  confirmDialog(title, message, callback, afterClose) {
    if (this.$('#modal').open) this.$('#modal').close();
    this.openModal(this.ui`<div class="modal-heading"><h2>${this.esc(this.t(title))}</h2></div><p class="confirm-message">${this.esc(this.t(message))}</p><div class="modal-actions"><span class="spacer"></span><button class="button" data-close>Cancel</button><button class="button danger" id="confirm-action">Confirm</button></div>`);
    this.$('#confirm-action').onclick = this.app.notifier.action(async () => {
      await callback();
      this.$('#modal').close();
      if (afterClose) await afterClose();
    });
  }
  confirmOverlay(title, message, callback) {
    const host = this.$('#modal-content'), opener = document.activeElement;
    host.querySelector('.confirm-overlay')?.remove();
    host.insertAdjacentHTML('beforeend', this.ui`<div class="confirm-overlay"><section class="confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="confirm-overlay-title" aria-describedby="confirm-overlay-message"><div class="modal-heading"><h2 id="confirm-overlay-title">${this.esc(this.t(title))}</h2></div><p class="confirm-message" id="confirm-overlay-message">${this.esc(this.t(message))}</p><div class="modal-actions"><span class="spacer"></span><button type="button" class="button" data-confirm-cancel>Cancel</button><button type="button" class="button danger" data-confirm-action>Delete</button></div></section></div>`);
    const overlay = host.querySelector('.confirm-overlay'), cancel = overlay.querySelector('[data-confirm-cancel]'), confirm = overlay.querySelector('[data-confirm-action]');
    const close = () => {
      overlay.remove();
      if (opener?.isConnected) opener.focus();
      else host.querySelector('.task-attachment-input')?.focus();
    };
    cancel.onclick = close;
    confirm.onclick = this.app.notifier.action(async () => {
      confirm.disabled = true;
      cancel.disabled = true;
      try {
        await callback();
        close();
      } finally {
        if (overlay.isConnected) {
          confirm.disabled = false;
          cancel.disabled = false;
        }
      }
    });
    overlay.onkeydown = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
      } else if (event.key === 'Tab') {
        event.preventDefault();
        (event.shiftKey ? confirm : cancel).focus();
      }
    };
    cancel.focus();
  }
}
