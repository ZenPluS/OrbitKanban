'use strict';
// Browser counterpart of the desktop preload: exposes window.workspace on top of the local web server API.
(() => {
  class WebBridge {
    #organizationId;
    #language = 'it';
    #online = true;
    #connectionListeners = new Set();

    constructor() {
      this.#organizationId = new URLSearchParams(location.search).get('org') || undefined;
    }

    #say(text) { return globalThis.OrbitKanban?.Localization?.Translator?.translate(text, this.#language) ?? text; }

    static #codedError(code, message) { const error = new Error(message); error.code = code; return error; }

    #track = snapshot => {
      if (snapshot && snapshot.activeOrganizationId) {
        this.#organizationId = snapshot.activeOrganizationId;
        this.#language = snapshot.data?.settings?.language || this.#language;
        const url = new URL(location.href);
        url.searchParams.set('org', this.#organizationId);
        history.replaceState(history.state, '', url);
      }
      return snapshot;
    };

    async #request(path, body, raw = false) {
      let response;
      try {
        response = await fetch(path, {
          method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
          headers: body === undefined ? { 'X-OrbitKanban': '1' } : { 'X-OrbitKanban': '1', 'Content-Type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body)
        });
      } catch {
        throw WebBridge.#codedError('offline', "OrbitKanban is not reachable: reopen the app on the PC and reload the page.");
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw WebBridge.#codedError(payload.code || (response.status === 401 ? 'unauthorized' : 'error'), payload.error || `HTTP ${response.status}`);
      }
      return raw ? response : response.json();
    }

    async #uploadAttachment(organizationId, taskId, file) {
      const url = new URL('/api/attachments/add', location.origin);
      url.searchParams.set('org', organizationId);
      url.searchParams.set('task', taskId);
      url.searchParams.set('name', file.name);
      let response;
      try {
        response = await fetch(url, {
          method: 'POST', credentials: 'same-origin', cache: 'no-store',
          headers: { 'X-OrbitKanban': '1', 'Content-Type': 'application/octet-stream' }, body: file
        });
      } catch {
        throw WebBridge.#codedError('offline', "OrbitKanban is not reachable: reopen the app on the PC and reload the page.");
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw WebBridge.#codedError(payload.code || (response.status === 401 ? 'unauthorized' : 'error'), payload.error || `HTTP ${response.status}`);
      }
      return response.json();
    }

    static #download(blob, fileName) {
      const href = URL.createObjectURL(blob);
      const link = Object.assign(document.createElement('a'), { href, download: fileName });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 10000);
    }

    static #chooseFile() {
      return new Promise(resolve => {
        const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json' });
        input.addEventListener('change', () => resolve(input.files[0] || null), { once: true });
        input.addEventListener('cancel', () => resolve(null), { once: true });
        input.click();
      });
    }

    #setOnline(value) {
      if (this.#online === value) return;
      this.#online = value;
      this.#connectionListeners.forEach(listener => listener(value));
    }

    static #accessUrl(id) {
      const url = new URL('/', location.origin);
      if (id) url.searchParams.set('org', id);
      return url.toString();
    }

    // The frozen API used by the interface, with the same shape as the desktop preload.
    api() {
      const bridge = this;
      return Object.freeze({
        mode: 'browser',
        load: id => this.#request(`/api/load${id || this.#organizationId ? `?org=${encodeURIComponent(id || this.#organizationId)}` : ''}`).then(this.#track),
        save: (data, id, organizationName, revision) => this.#request('/api/save', { data, organizationId: id, organizationName, revision }).then(this.#track),
        organization: (operation, payload, contextId) => this.#request('/api/organization', { operation, payload, organizationId: contextId ?? this.#organizationId }).then(this.#track),
        async exportData() {
          const response = await bridge.#request('/api/export', undefined, true);
          WebBridge.#download(await response.blob(), 'OrbitKanban-backup.json');
          return true;
        },
        async exportOrganization(id, kind) {
          const response = await bridge.#request(`/api/export-organization?org=${encodeURIComponent(id || bridge.#organizationId || '')}&kind=${encodeURIComponent(kind)}`, undefined, true);
          const fileName = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') || '')?.[1] || 'OrbitKanban-organization.json';
          WebBridge.#download(await response.blob(), fileName);
          return { fileName };
        },
        async exportSpreadsheet(fileName, bytes) {
          WebBridge.#download(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName);
          return { fileName };
        },
        async importData() {
          const file = await WebBridge.#chooseFile();
          if (!file) return null;
          let archive;
          try { archive = JSON.parse(await file.text()); }
          catch { throw new Error(bridge.#say("The selected file is not a valid JSON archive.")); }
          if (!confirm(bridge.#say("Replace all organizations, data and settings? The previous archive will be kept in workspace.json.bak."))) return null;
          return bridge.#request('/api/import', { archive }).then(bridge.#track);
        },
        backups: async (operation = 'list', fileName) => operation === 'list'
          ? this.#request('/api/backups')
          : this.#request('/api/backups', { operation, fileName }).then(this.#track),
        async openLink(url) {
          if (!/^https?:\/\/\S+$/i.test(String(url))) throw new Error("Invalid URL.");
          window.open(url, '_blank', 'noopener,noreferrer');
          return url;
        },
        openDataFolder: () => this.#request('/api/open-data-folder', {}),
        attachmentCounts: organizationId => {
          const query = new URLSearchParams();
          if (organizationId) query.set('org', organizationId);
          return this.#request(`/api/attachments?${query}`);
        },
        attachmentList: (organizationId, taskId) => {
          const query = new URLSearchParams({ org: organizationId, task: taskId });
          return this.#request(`/api/attachments?${query}`);
        },
        async attachmentAdd(organizationId, taskId, files) {
          const selected = [...files];
          if (!selected.length || selected.length > 20) throw new Error(bridge.#say("Choose between 1 and 20 files."));
          let result;
          for (const file of selected) result = await bridge.#uploadAttachment(organizationId, taskId, file);
          return result;
        },
        attachmentRemove: (organizationId, taskId, name) => this.#request('/api/attachments/remove', { organizationId, taskId, name }),
        attachmentOpen: (organizationId, taskId, name) => this.#request('/api/attachments/open', { organizationId, taskId, name }),
        languages: (operation = 'info') => operation === 'info' ? this.#request('/api/languages') : this.#request('/api/languages', { operation }),
        onChange(callback) {
          const source = new EventSource('/api/events');
          source.addEventListener('ready', () => bridge.#setOnline(true));
          source.addEventListener('change', event => { bridge.#setOnline(true); callback(JSON.parse(event.data)); });
          source.addEventListener('error', () => bridge.#setOnline(false));
          return () => source.close();
        },
        onConnection(callback) {
          bridge.#connectionListeners.add(callback);
          return () => bridge.#connectionListeners.delete(callback);
        },
        async browserAccess(operation, id) {
          const url = WebBridge.#accessUrl(id);
          if (operation === 'open') window.open(url, '_blank', 'noopener');
          else if (operation === 'copy') await navigator.clipboard.writeText(url);
          return { url };
        }
      });
    }
  }

  ((globalThis.OrbitKanban ??= {}).Web ??= {}).WebBridge = WebBridge;
  window.workspace = new WebBridge().api();
})();
