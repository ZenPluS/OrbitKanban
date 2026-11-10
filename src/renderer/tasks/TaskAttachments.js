// Portable file attachments for individual tasks.
import { Component } from '../core/Component.js';

export class TaskAttachments extends Component {
  static EXTENSIONS = ['txt', 'json', 'pdf', 'docx', 'pptx', 'csv', 'html', 'js', 'sql', 'xlsx'];
  static MAX_FILE_BYTES = 100 * 1024 * 1024;
  #counts = Object.create(null);
  #refreshTimer;
  #countRequest = 0;
  #dialogRequest = 0;
  #countErrorShown = false;

  count(taskId) { return Number(this.#counts[taskId] || 0); }

  refreshCounts() {
    clearTimeout(this.#refreshTimer);
    const request = ++this.#countRequest;
    this.#refreshTimer = setTimeout(async () => {
      try {
        const counts = await this.workspaceApi.attachmentCounts(this.state.activeOrganizationId);
        if (request !== this.#countRequest) return;
        this.#counts = counts;
        this.#countErrorShown = false;
        document.querySelectorAll('#task-rows [data-task-attachments]').forEach(button => this.#updateButton(button));
      } catch (error) {
        if (request !== this.#countRequest) return;
        console.error('Attachment counts could not be refreshed:', error);
        if (!this.#countErrorShown) this.app.notifier.notify(error.message, true);
        this.#countErrorShown = true;
      }
    }, 180);
  }

  #updateButton(button, count = this.count(button.dataset.taskAttachments)) {
    button.querySelector('.attachment-count').textContent = String(count);
    const label = this.app.transfer.fillText("Manage attachments ({0})", count);
    button.title = label;
    button.setAttribute('aria-label', label);
  }

  #size(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB'];
    let value = bytes / 1024, unit = 0;
    while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
    return `${new Intl.NumberFormat(this.locale(), { maximumFractionDigits: 1 }).format(value)} ${units[unit]}`;
  }

  #fileIcon(extension) {
    return `<span class="attachment-file-icon" data-extension="${this.esc(extension)}">${this.ico('file')}<small>${this.esc(extension.toUpperCase())}</small></span>`;
  }

  #dialog(task, files, state = 'ready') {
    const title = this.app.transfer.fillText("Attachments for {0}", task.code || this.t("Uncoded task"));
    const content = state === 'loading' ? `<p class="muted">${this.esc(this.t("Loading attachments…"))}</p>` :
      state === 'error' ? `<p class="muted">${this.esc(this.t("Attachments could not be loaded. Close and try again."))}</p>` :
      files.length ? `<ul class="attachment-list">${files.map(file => `<li class="attachment-item"><button type="button" class="attachment-open" data-attachment-open="${this.esc(file.name)}" title="${this.esc(this.t("Open with the system default app"))}">${this.#fileIcon(file.extension)}<span class="attachment-file-name">${this.esc(file.name)}</span><small class="attachment-file-size">${this.#size(file.size)}</small></button><button type="button" class="icon-button delete-option" data-attachment-delete="${this.esc(file.name)}" aria-label="${this.esc(this.app.transfer.fillText("Delete attachment: {0}", file.name))}" title="${this.esc(this.t("Delete attachment"))}">${this.ico('close')}</button></li>`).join('')}</ul>` :
        `<p class="muted attachment-empty">${this.esc(this.t("No attachments yet. Drop files here or choose them from your device."))}</p>`;
    return `<section id="attachment-manager" data-task-id="${this.esc(task.id)}"><div class="modal-heading"><div><div class="eyebrow">${this.esc(this.t("TASK ATTACHMENTS"))}</div><h2>${this.esc(title)}</h2></div><button type="button" class="icon-button" data-close aria-label="${this.esc(this.t("Close"))}">${this.ico('close')}</button></div><label class="attachment-dropzone" id="attachment-dropzone"><input type="file" id="attachment-input" accept="${TaskAttachments.EXTENSIONS.map(ext => `.${ext}`).join(',')}" multiple><span class="attachment-drop-icon">${this.ico('transfer')}</span><strong>${this.esc(this.t("Drop files here or choose files"))}</strong><small>${this.esc(this.t("TXT, JSON, PDF, DOCX, PPTX, CSV, HTML, JS, SQL and XLSX · up to 100 MB per file"))}</small></label><div class="attachment-files" aria-live="polite">${content}</div><div class="modal-actions"><span class="spacer"></span><button type="button" class="button" data-close>${this.esc(this.t("Close"))}</button></div></section>`;
  }

  async open(task) {
    if (!task) return;
    const item = { id: task.id, code: task.code };
    const request = ++this.#dialogRequest;
    this.app.modal.openModal(this.#dialog(item, [], 'loading'));
    this.#wire(item);
    try {
      const files = await this.workspaceApi.attachmentList(this.state.activeOrganizationId, item.id);
      if (request !== this.#dialogRequest || !this.$('#modal').open || this.$('#attachment-manager')?.dataset.taskId !== item.id) return;
      this.#counts[item.id] = files.length;
      document.querySelectorAll(`[data-task-attachments="${CSS.escape(item.id)}"]`).forEach(button => this.#updateButton(button, files.length));
      this.#render(item, files);
    } catch (error) {
      if (request !== this.#dialogRequest || !this.$('#modal').open || this.$('#attachment-manager')?.dataset.taskId !== item.id) return;
      console.error('Task attachments could not be loaded:', error);
      this.#render(item, [], 'error');
      this.app.notifier.notify(error.message, true);
    }
  }

  #render(task, files, state = 'ready') {
    this.app.modal.openModal(this.#dialog(task, files, state));
    this.#wire(task);
  }

  #wire(task) {
    const dropzone = this.$('#attachment-dropzone'), input = this.$('#attachment-input');
    if (!dropzone || !input) return;
    input.onchange = this.app.notifier.action(async () => {
      await this.#add(task, [...input.files]);
      input.value = '';
    });
    dropzone.ondragover = event => {
      event.preventDefault();
      dropzone.classList.add('is-dragging');
    };
    dropzone.ondragleave = event => {
      if (!dropzone.contains(event.relatedTarget)) dropzone.classList.remove('is-dragging');
    };
    dropzone.ondrop = this.app.notifier.action(async event => {
      event.preventDefault();
      dropzone.classList.remove('is-dragging');
      await this.#add(task, [...(event.dataTransfer?.files || [])]);
    });
    this.$('#attachment-manager').onclick = event => {
      const open = event.target.closest('[data-attachment-open]');
      if (open) {
        event.preventDefault();
        event.stopPropagation();
        this.app.notifier.action(async () => {
          await this.workspaceApi.attachmentOpen(this.state.activeOrganizationId, task.id, open.dataset.attachmentOpen);
        })();
        return;
      }
      const remove = event.target.closest('[data-attachment-delete]');
      if (remove) {
        event.preventDefault();
        event.stopPropagation();
        const name = remove.dataset.attachmentDelete;
        this.app.modal.confirmDialog("Delete attachment?", this.app.transfer.fillText("Delete {0} permanently?", name), async () => {
          await this.workspaceApi.attachmentRemove(this.state.activeOrganizationId, task.id, name);
          this.app.notifier.notify("Attachment deleted.");
        }, () => this.open(task));
      }
    };
  }

  async #add(task, files) {
    if (!files.length) return;
    if (files.length > 20) throw new Error(this.t("Choose between 1 and 20 files."));
    for (const file of files) {
      const extension = file.name.split('.').pop().toLowerCase();
      if (!TaskAttachments.EXTENSIONS.includes(extension)) throw new Error(this.app.transfer.fillText("Unsupported attachment type: {0}.", file.name));
      if (file.size > TaskAttachments.MAX_FILE_BYTES) throw new Error(this.t("Each attachment must be 100 MB or smaller."));
    }
    this.$('#attachment-input').disabled = true;
    this.$('#attachment-dropzone').classList.add('is-uploading');
    try {
      await this.workspaceApi.attachmentAdd(this.state.activeOrganizationId, task.id, files);
      this.app.notifier.notify(this.app.transfer.fillText("{0} attachment(s) added.", files.length));
      await this.open(task);
    } finally {
      const input = this.$('#attachment-input');
      if (input) input.disabled = false;
    }
  }
}
