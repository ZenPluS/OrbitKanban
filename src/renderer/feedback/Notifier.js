// Toast notifications and the error-reporting wrapper for event handlers.
import { Component } from '../core/Component.js';

export class Notifier extends Component {
  constructor(app) {
    super(app);
    this.notify = this.notify.bind(this);
  }
  #timeout;
  notify(message, error = false, detail = '') {
    this.$('#toast').textContent = this.t(message) + (detail ? ` ${detail}` : '');
    this.$('#toast').className = error ? 'visible error' : 'visible';
    clearTimeout(this.#timeout);
    this.#timeout = setTimeout(() => { this.$('#toast').className = ''; }, error ? 10000 : 3500);
  }
  action(handler) { return async event => { try { await handler(event); } catch (error) { this.notify(error.message, true); } }; }
}
