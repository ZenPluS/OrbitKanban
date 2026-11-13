'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('workspace', {
  mode: 'desktop',
  load: organizationId => ipcRenderer.invoke('load', organizationId),
  save: (data, organizationId, organizationName, revision) => ipcRenderer.invoke('save', data, organizationId, organizationName, revision),
  organization: (operation, payload, organizationId) => ipcRenderer.invoke('organization', operation, payload, organizationId),
  exportData: () => ipcRenderer.invoke('export'),
  exportOrganization: (organizationId, kind) => ipcRenderer.invoke('export-organization', organizationId, kind),
  exportSpreadsheet: (fileName, bytes) => ipcRenderer.invoke('export-spreadsheet', fileName, bytes),
  importData: () => ipcRenderer.invoke('import'),
  backups: (operation = 'list', fileName) => ipcRenderer.invoke('backups', operation, fileName),
  openLink: url => ipcRenderer.invoke('open-link', url),
  openDataFolder: () => ipcRenderer.invoke('open-data-folder'),
  attachmentCounts: organizationId => ipcRenderer.invoke('attachment-counts', organizationId),
  attachmentList: (organizationId, taskId) => ipcRenderer.invoke('attachment-list', organizationId, taskId),
  attachmentAdd: (organizationId, taskId, files) => ipcRenderer.invoke('attachment-add', organizationId, taskId, [...files].map(file => webUtils.getPathForFile(file))),
  attachmentRemove: (organizationId, taskId, name) => ipcRenderer.invoke('attachment-remove', organizationId, taskId, name),
  attachmentOpen: (organizationId, taskId, name) => ipcRenderer.invoke('attachment-open', organizationId, taskId, name),
  languages: (operation = 'info') => ipcRenderer.invoke('languages', operation),
  appearance: (operation = 'info', payload = {}) => ipcRenderer.invoke('appearance', operation, payload),
  updates: (operation = 'info', value) => ipcRenderer.invoke('updates', operation, value),
  createShortcut: () => ipcRenderer.invoke('create-shortcut'),
  onUpdate: callback => {
    const listener = (_, info) => callback(info);
    ipcRenderer.on('update-changed', listener);
    return () => ipcRenderer.removeListener('update-changed', listener);
  },
  browserAccess: (operation, organizationId) => ipcRenderer.invoke('browser-access', operation, organizationId),
  ready: () => ipcRenderer.send('app-ready'),
  titleBarOverlay: process.argv.includes('--orbitkanban-title-bar=overlay'),
  windowChrome: chrome => ipcRenderer.send('window-chrome', chrome),
  windowIcon: process.platform === 'win32' ? images => ipcRenderer.invoke('window-icon', images) : undefined,
  onChange: callback => {
    const listener = (_, info) => callback(info);
    ipcRenderer.on('workspace-changed', listener);
    return () => ipcRenderer.removeListener('workspace-changed', listener);
  }
});
