'use strict';
// Portable workspace archive (data/workspace.json): serialized writes, conflict checks, daily backups and change events.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { DataFactory, ArchiveValidator, OrganizationTransfer } = require('../../shared/domain');
const { Translator } = require('../../shared/localization');

class WorkspaceStore {
  static #BACKUP_RETENTION = 14;
  static #BACKUP_NAME = /^\d{4}-\d{2}-\d{2}-workspace\.json$/;
  static revisionOf(organization) {
    return crypto.createHash('sha256').update(JSON.stringify([organization.name, organization.data])).digest('base64url').slice(0, 22);
  }
  static #codedError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  #dataFolder;
  #extras;
  #seed;
  #backupsFolder;
  #events = new EventEmitter();
  #current;
  #queue = Promise.resolve();

  constructor({ dataFolder, extras = () => ({}), seed = DataFactory.initialData }) {
    this.#dataFolder = dataFolder;
    this.#extras = extras;
    this.#seed = seed;
    this.dataFile = path.join(dataFolder, 'workspace.json');
    this.#backupsFolder = path.join(dataFolder, 'backups');
  }
  on(...args) { return this.#events.on(...args); }
  off(...args) { return this.#events.off(...args); }
  idle() { return this.#queue; }

  #enqueue(task) {
    const run = this.#queue.then(task);
    this.#queue = run.catch(() => {});
    return run;
  }
  #find(organizationId) { return this.#current.organizations.find(o => o.id === organizationId); }
  #language(organizationId) { return (this.#find(organizationId) || this.#find(this.#current?.defaultOrganizationId ?? this.#current?.activeOrganizationId))?.data.settings.language; }
  #translate(organizationId, text) { return Translator.translate(text, this.#current ? this.#language(organizationId) : undefined); }
  #resolve(organizationId) { return this.#find(organizationId) ? organizationId : this.#current.activeOrganizationId; }
  #snapshot(organizationId) {
    const organization = this.#find(this.#resolve(organizationId));
    return {
      ...this.#extras(),
      data: structuredClone(organization.data), dataFolder: this.#dataFolder, revision: WorkspaceStore.revisionOf(organization),
      activeOrganizationId: organization.id, defaultOrganizationId: this.#current.activeOrganizationId,
      organizations: this.#current.organizations.map(({ id, name }) => ({ id, name }))
    };
  }
  #backupName(date = new Date()) {
    const localDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return `${localDate}-workspace.json`;
  }
  async #pruneBackups() {
    const files = (await fs.readdir(this.#backupsFolder)).filter(name => WorkspaceStore.#BACKUP_NAME.test(name)).sort().reverse();
    await Promise.all(files.slice(WorkspaceStore.#BACKUP_RETENTION).map(name => fs.rm(path.join(this.#backupsFolder, name))));
  }
  async #ensureDailyBackup(archive) {
    await fs.mkdir(this.#backupsFolder, { recursive: true });
    const target = path.join(this.#backupsFolder, this.#backupName());
    try { await fs.access(target); await this.#pruneBackups(); return; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
    try {
      await fs.writeFile(temp, JSON.stringify(archive, null, 2), { encoding: 'utf8', flag: 'wx' });
      await fs.rename(temp, target);
    } catch (error) {
      await fs.rm(temp, { force: true });
      try { await fs.access(target); }
      catch { throw error; }
    }
    await this.#pruneBackups();
  }
  #changeInfo() {
    return { defaultOrganizationId: this.#current.activeOrganizationId, organizations: this.#current.organizations.map(o => ({ id: o.id, name: o.name, revision: WorkspaceStore.revisionOf(o) })) };
  }
  async #write(archive) {
    ArchiveValidator.validateArchive(archive);
    const hadCurrent = Boolean(this.#current);
    if (hadCurrent) await this.#ensureDailyBackup(this.#current);
    await fs.mkdir(this.#dataFolder, { recursive: true });
    const temp = `${this.dataFile}.${process.pid}.tmp`;
    await fs.writeFile(temp, JSON.stringify(archive, null, 2), 'utf8');
    try { await fs.copyFile(this.dataFile, `${this.dataFile}.bak`); }
    catch (error) { if (error.code !== 'ENOENT') { await fs.rm(temp, { force: true }); throw error; } }
    await fs.rename(temp, this.dataFile);
    this.#current = structuredClone(archive);
    if (!hadCurrent) await this.#ensureDailyBackup(this.#current);
  }
  async #ensureLoaded() {
    if (this.#current) return;
    let original;
    try { original = JSON.parse(await fs.readFile(this.dataFile, 'utf8')); }
    catch (error) {
      if (error.code === 'ENOENT') { await this.#write(ArchiveValidator.migrateArchive(this.#seed())); return; }
      throw WorkspaceStore.#codedError('unreadable', `Workspace archive is unreadable: ${this.dataFile}\n${error.message}\nThe file has not been overwritten. A backup is also available at workspace.json.bak.`);
    }
    let migrated;
    try { migrated = ArchiveValidator.migrateArchive(original); }
    catch (error) { throw WorkspaceStore.#codedError('unreadable', `Workspace archive is unreadable: ${this.dataFile}\n${error.message}\nThe file has not been overwritten. A backup is also available at workspace.json.bak.`); }
    if (JSON.stringify(original) !== JSON.stringify(migrated)) await this.#write(migrated);
    else {
      this.#current = migrated;
      await this.#ensureDailyBackup(this.#current);
    }
  }
  #transact(update) {
    return this.#enqueue(async () => {
      await this.#ensureLoaded();
      const organizationId = await update(structuredClone(this.#current));
      this.#events.emit('change', this.#changeInfo());
      return this.#snapshot(organizationId);
    });
  }

  load(organizationId) { return this.#enqueue(async () => { await this.#ensureLoaded(); return this.#snapshot(organizationId); }); }
  save(data, organizationId, organizationName, revision) {
    return this.#transact(async archive => {
      const organization = archive.organizations.find(o => o.id === organizationId);
      if (!organization) throw WorkspaceStore.#codedError('missing-organization', this.#translate(organizationId, "This organization no longer exists."));
      if (revision !== WorkspaceStore.revisionOf(organization)) throw WorkspaceStore.#codedError('conflict', this.#translate(organizationId, "The data was changed in another window. Reload before saving."));
      ArchiveValidator.validateData(data);
      if (organizationName !== undefined) {
        if (typeof organizationName !== 'string' || !organizationName.trim() || organizationName.trim().length > 100) throw new Error(this.#translate(organizationId, "Invalid organization name."));
        organization.name = organizationName.trim();
      }
      organization.data = data;
      await this.#write(archive);
      return organizationId;
    });
  }
  organization(operation, payload = {}, contextOrganizationId) {
    return this.#transact(async archive => {
      const exists = id => archive.organizations.some(o => o.id === id);
      const missing = () => WorkspaceStore.#codedError('missing-organization', this.#translate(contextOrganizationId, "Organization not found."));
      let target = contextOrganizationId;
      if (operation === 'create') {
        const organization = DataFactory.createOrganization(payload.name, payload.language, payload.logo, payload.palette, payload.demo === true);
        archive.organizations.push(organization);
        archive.activeOrganizationId = target = organization.id;
      } else if (operation === 'import') {
        if (typeof payload.name !== 'string' || !payload.name.trim() || payload.name.trim().length > 100) throw new Error(this.#translate(contextOrganizationId, "Invalid organization name."));
        const organization = { id: crypto.randomUUID(), name: payload.name.trim(), data: ArchiveValidator.validateData(structuredClone(payload.data)) };
        archive.organizations.push(organization);
        archive.activeOrganizationId = target = organization.id;
      } else if (operation === 'switch') {
        if (!exists(payload.id)) throw missing();
        archive.activeOrganizationId = target = payload.id;
      } else if (operation === 'rename') {
        const organization = archive.organizations.find(o => o.id === payload.id);
        if (!organization) throw missing();
        if (typeof payload.name !== 'string' || !payload.name.trim() || payload.name.trim().length > 100) throw new Error(this.#translate(contextOrganizationId, "Invalid organization name."));
        organization.name = payload.name.trim();
      } else if (operation === 'delete') {
        if (archive.organizations.length <= 1) throw new Error(this.#translate(contextOrganizationId, "At least one organization must remain."));
        if (!exists(payload.id)) throw missing();
        archive.organizations = archive.organizations.filter(o => o.id !== payload.id);
        if (archive.activeOrganizationId === payload.id) archive.activeOrganizationId = archive.organizations[0].id;
        if (target === payload.id) target = archive.activeOrganizationId;
      } else throw new Error(this.#translate(contextOrganizationId, "Unsupported operation."));
      await this.#write(archive);
      return exists(target) ? target : archive.activeOrganizationId;
    });
  }
  parseArchive(text) { return ArchiveValidator.migrateArchive(JSON.parse(text)); }
  replace(input) {
    return this.#transact(async () => {
      const archive = ArchiveValidator.migrateArchive(input);
      await this.#write(archive);
      return archive.activeOrganizationId;
    });
  }
  listBackups() {
    return this.#enqueue(async () => {
      await this.#ensureLoaded();
      const names = (await fs.readdir(this.#backupsFolder)).filter(name => WorkspaceStore.#BACKUP_NAME.test(name)).sort().reverse();
      const backups = await Promise.all(names.map(async fileName => {
        const info = await fs.stat(path.join(this.#backupsFolder, fileName));
        return { fileName, date: fileName.slice(0, 10), size: info.size };
      }));
      return { backups, retention: WorkspaceStore.#BACKUP_RETENTION };
    });
  }
  restoreBackup(fileName) {
    return this.#transact(async () => {
      if (typeof fileName !== 'string' || path.basename(fileName) !== fileName || !WorkspaceStore.#BACKUP_NAME.test(fileName)) throw new Error(this.#translate(undefined, "The selected backup is invalid."));
      let archive;
      try { archive = ArchiveValidator.migrateArchive(JSON.parse(await fs.readFile(path.join(this.#backupsFolder, fileName), 'utf8'))); }
      catch (error) {
        if (error.code === 'ENOENT') throw new Error(this.#translate(undefined, "The selected backup no longer exists."));
        throw WorkspaceStore.#codedError('unreadable', `${this.#translate(undefined, "Backup cannot be read:")} ${fileName}\n${error.message}`);
      }
      await this.#write(archive);
      return archive.activeOrganizationId;
    });
  }
  exportText() { return this.#enqueue(async () => { await this.#ensureLoaded(); return fs.readFile(this.dataFile, 'utf8'); }); }
  exportTo(filePath) { return this.#enqueue(async () => { await this.#ensureLoaded(); await fs.copyFile(this.dataFile, filePath); }); }
  exportOrganization(organizationId, kind) {
    return this.#enqueue(async () => {
      await this.#ensureLoaded();
      const organization = this.#find(organizationId);
      if (!organization) throw WorkspaceStore.#codedError('missing-organization', this.#translate(organizationId, "Organization not found."));
      const file = OrganizationTransfer.organizationExport(organization, kind, { appVersion: String(this.#extras().appVersion || '') });
      return { fileName: OrganizationTransfer.organizationFileName(organization.name, kind, organization.data.settings.language), text: JSON.stringify(file, null, 2) };
    });
  }
  message(text, organizationId) { return this.#translate(organizationId, text); }
  language(organizationId) { return this.#current ? this.#language(organizationId) : undefined; }
}

module.exports = WorkspaceStore;
