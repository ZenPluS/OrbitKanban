'use strict';
(() => {
  const query = new URLSearchParams(location.search);
  let organizationId = query.get('org') || undefined;
  let language = 'it';
  const say = text => window.OrbitaI18n?.translate(text, language) ?? text;
  function codedError(code, message) { const error = new Error(message); error.code = code; return error; }
  function track(snapshot) {
    if (snapshot && snapshot.activeOrganizationId) {
      organizationId = snapshot.activeOrganizationId;
      language = snapshot.data?.settings?.language || language;
      const url = new URL(location.href);
      url.searchParams.set('org', organizationId);
      history.replaceState(history.state, '', url);
    }
    return snapshot;
  }
  async function request(path, body, raw = false) {
    let response;
    try {
      response = await fetch(path, {
        method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: body === undefined ? { 'X-OrbitKanban': '1' } : { 'X-OrbitKanban': '1', 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch {
      throw codedError('offline', "OrbitKanban is not reachable: reopen the app on the PC and reload the page.");
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw codedError(payload.code || (response.status === 401 ? 'unauthorized' : 'error'), payload.error || `HTTP ${response.status}`);
    }
    return raw ? response : response.json();
  }
  function download(blob, fileName) {
    const href = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement('a'), { href, download: fileName });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(href), 10000);
  }
  function chooseFile() {
    return new Promise(resolve => {
      const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json' });
      input.addEventListener('change', () => resolve(input.files[0] || null), { once: true });
      input.addEventListener('cancel', () => resolve(null), { once: true });
      input.click();
    });
  }
  const connectionListeners = new Set();
  let online = true;
  function setOnline(value) {
    if (online === value) return;
    online = value;
    connectionListeners.forEach(listener => listener(value));
  }
  const accessUrl = id => {
    const url = new URL('/', location.origin);
    if (id) url.searchParams.set('org', id);
    return url.toString();
  };
  window.workspace = Object.freeze({
    mode: 'browser',
    load: id => request(`/api/load${id || organizationId ? `?org=${encodeURIComponent(id || organizationId)}` : ''}`).then(track),
    save: (data, id, organizationName, revision) => request('/api/save', { data, organizationId: id, organizationName, revision }).then(track),
    organization: (operation, payload, contextId) => request('/api/organization', { operation, payload, organizationId: contextId ?? organizationId }).then(track),
    async exportData() {
      const response = await request('/api/export', undefined, true);
      download(await response.blob(), 'OrbitKanban-backup.json');
      return true;
    },
    async exportOrganization(id, kind) {
      const response = await request(`/api/export-organization?org=${encodeURIComponent(id || organizationId || '')}&kind=${encodeURIComponent(kind)}`, undefined, true);
      const fileName = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') || '')?.[1] || 'OrbitKanban-organization.json';
      download(await response.blob(), fileName);
      return { fileName };
    },
    async exportSpreadsheet(fileName, bytes) {
      download(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName);
      return { fileName };
    },
    async importData() {
      const file = await chooseFile();
      if (!file) return null;
      let archive;
      try { archive = JSON.parse(await file.text()); }
      catch { throw new Error(say("The selected file is not a valid JSON archive.")); }
      if (!confirm(say("Replace all organizations, data and settings? The previous archive will be kept in workspace.json.bak."))) return null;
      return request('/api/import', { archive }).then(track);
    },
    backups: async (operation = 'list', fileName) => operation === 'list'
      ? request('/api/backups')
      : request('/api/backups', { operation, fileName }).then(track),
    async openLink(url) {
      if (!/^https?:\/\/\S+$/i.test(String(url))) throw new Error("Invalid URL.");
      window.open(url, '_blank', 'noopener,noreferrer');
      return url;
    },
    openDataFolder: () => request('/api/open-data-folder', {}),
    languages: (operation = 'info') => operation === 'info' ? request('/api/languages') : request('/api/languages', { operation }),
    onChange(callback) {
      const source = new EventSource('/api/events');
      source.addEventListener('ready', () => setOnline(true));
      source.addEventListener('change', event => { setOnline(true); callback(JSON.parse(event.data)); });
      source.addEventListener('error', () => setOnline(false));
      return () => source.close();
    },
    onConnection(callback) {
      connectionListeners.add(callback);
      return () => connectionListeners.delete(callback);
    },
    async browserAccess(operation, id) {
      const url = accessUrl(id);
      if (operation === 'open') window.open(url, '_blank', 'noopener');
      else if (operation === 'copy') await navigator.clipboard.writeText(url);
      return { url };
    }
  });
})();
