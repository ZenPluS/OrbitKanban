// Toast notifications and the error-reporting wrapper for event handlers.
import { Component } from '../core/Component.js';

export class Notifier extends Component {
  constructor(app) {
    super(app);
    this.notify = this.notify.bind(this);
    this.$('#modal')?.addEventListener('close', () => {
      const toast = this.$('#toast');
      if (toast.parentElement !== document.body) document.body.append(toast);
    });
  }
  #timeout;
  notify(message, error = false, detail = '') {
    const toast = this.$('#toast'), modal = this.$('#modal');
    if (error && modal?.open) modal.append(toast);
    else if (toast.parentElement !== document.body) document.body.append(toast);
    toast.textContent = this.t(message) + (detail ? ` ${detail}` : '');
    toast.className = error ? 'visible error' : 'visible';
    clearTimeout(this.#timeout);
    this.#timeout = setTimeout(() => { toast.className = ''; }, error ? 10000 : 3500);
  }
  action(handler) { return async event => { try { await handler(event); } catch (error) { this.notify(error.message, true); } }; }
}
