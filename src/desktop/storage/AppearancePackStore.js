'use strict';
const RepositoryPackStore = require('./RepositoryPackStore');
const AppearancePacks = require('../../shared/domain/AppearancePacks');

class AppearancePackStore extends RepositoryPackStore {
  constructor(options) {
    super({ ...options, definitions: AppearancePacks, folder: 'appearance', label: 'appearance' });
  }
  checkSource(kind, repository, manifest, official) {
    if (kind === 'icons' && official && Object.keys(official.packs[0].icons).some(name => !manifest.packs[0].icons[name])) {
      throw new Error('The official appearance manifest is missing required icons.');
    }
    if (kind === 'themes' && AppearancePacks.OFFICIAL.some(source => source.kind === kind && source.repository === repository)) {
      const ids = new Set();
      for (const pack of manifest.packs) for (const theme of pack.themes) {
        if (theme.id === 'midnight') throw new Error('The official appearance manifest must not include Midnight.');
        if (ids.has(theme.id)) throw new Error('The official appearance manifest contains duplicate theme IDs.');
        ids.add(theme.id);
      }
    }
  }
}
module.exports = AppearancePackStore;
