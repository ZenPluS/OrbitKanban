'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('workspace', {
  mode: 'desktop',
  load: organizationId => ipcRenderer.invoke('load', organizationId),
  save: (data, organizationId, organizationName, revision) => ipcRenderer.invoke('save', data, organizationId, organizationName, revision),
  organization: (operation, payload, organizationId) => ipcRenderer.invoke('organization', operation, payload, organizationId),
  exportData: () => ipcRenderer.invoke('export'),
  exportOrganization: (organizationId, kind) => ipcRenderer.invoke('export-organization', organizationId, kind),
  importData: () => ipcRenderer.invoke('import'),
  openLink: url => ipcRenderer.invoke('open-link', url),
  openDataFolder: () => ipcRenderer.invoke('open-data-folder'),
  languages: (operation = 'info') => ipcRenderer.invoke('languages', operation),
  browserAccess: (operation, organizationId) => ipcRenderer.invoke('browser-access', operation, organizationId),
  ready: () => ipcRenderer.send('app-ready'),
  onChange: callback => {
    const listener = (_, info) => callback(info);
    ipcRenderer.on('workspace-changed', listener);
    return () => ipcRenderer.removeListener('workspace-changed', listener);
  }
});
