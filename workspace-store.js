'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { initialData, validateData, validateArchive, migrateArchive, createOrganization, organizationExport, organizationFileName } = require('./core');
const { translate } = require('./i18n');

function revisionOf(organization) {
  return crypto.createHash('sha256').update(JSON.stringify([organization.name, organization.data])).digest('base64url').slice(0, 22);
}
function codedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function createWorkspaceStore({ dataFolder, extras = () => ({}), seed = initialData }) {
  const dataFile = path.join(dataFolder, 'workspace.json');
  const events = new EventEmitter();
  let current;
  let queue = Promise.resolve();

  function enqueue(task) {
    const run = queue.then(task);
    queue = run.catch(() => {});
    return run;
  }
  function find(organizationId) { return current.organizations.find(o => o.id === organizationId); }
  function language(organizationId) { return (find(organizationId) || find(current?.defaultOrganizationId ?? current?.activeOrganizationId))?.data.settings.language; }
  function message(organizationId, text) { return translate(text, current ? language(organizationId) : undefined); }
  function resolve(organizationId) { return find(organizationId) ? organizationId : current.activeOrganizationId; }
  function snapshot(organizationId) {
    const organization = find(resolve(organizationId));
    return {
      ...extras(),
      data: structuredClone(organization.data), dataFolder, revision: revisionOf(organization),
      activeOrganizationId: organization.id, defaultOrganizationId: current.activeOrganizationId,
      organizations: current.organizations.map(({ id, name }) => ({ id, name }))
    };
  }
  function changeInfo() {
    return { defaultOrganizationId: current.activeOrganizationId, organizations: current.organizations.map(o => ({ id: o.id, name: o.name, revision: revisionOf(o) })) };
  }
  async function write(archive) {
    validateArchive(archive);
    await fs.mkdir(dataFolder, { recursive: true });
    const temp = `${dataFile}.${process.pid}.tmp`;
    await fs.writeFile(temp, JSON.stringify(archive, null, 2), 'utf8');
    try { await fs.copyFile(dataFile, `${dataFile}.bak`); }
    catch (error) { if (error.code !== 'ENOENT') { await fs.rm(temp, { force: true }); throw error; } }
    await fs.rename(temp, dataFile);
    current = structuredClone(archive);
  }
  async function ensureLoaded() {
    if (current) return;
    let original;
    try { original = JSON.parse(await fs.readFile(dataFile, 'utf8')); }
    catch (error) {
      if (error.code === 'ENOENT') { await write(migrateArchive(seed())); return; }
      throw codedError('unreadable', `Archivio non leggibile: ${dataFile}\n${error.message}\nIl file non è stato sovrascritto. È disponibile anche workspace.json.bak.`);
    }
    let migrated;
    try { migrated = migrateArchive(original); }
    catch (error) { throw codedError('unreadable', `Archivio non leggibile: ${dataFile}\n${error.message}\nIl file non è stato sovrascritto. È disponibile anche workspace.json.bak.`); }
    if (JSON.stringify(original) !== JSON.stringify(migrated)) await write(migrated);
    else current = migrated;
  }
  function transact(update) {
    return enqueue(async () => {
      await ensureLoaded();
      const organizationId = await update(structuredClone(current));
      events.emit('change', changeInfo());
      return snapshot(organizationId);
    });
  }

  return {
    dataFile,
    on: (...args) => events.on(...args),
    off: (...args) => events.off(...args),
    idle: () => queue,
    load: organizationId => enqueue(async () => { await ensureLoaded(); return snapshot(organizationId); }),
    save(data, organizationId, organizationName, revision) {
      return transact(async archive => {
        const organization = archive.organizations.find(o => o.id === organizationId);
        if (!organization) throw codedError('missing-organization', message(organizationId, 'Questa organizzazione non esiste più.'));
        if (revision !== revisionOf(organization)) throw codedError('conflict', message(organizationId, 'I dati sono stati modificati da un’altra finestra. Ricarica prima di salvare.'));
        validateData(data);
        if (organizationName !== undefined) {
          if (typeof organizationName !== 'string' || !organizationName.trim() || organizationName.trim().length > 100) throw new Error(message(organizationId, 'Nome organizzazione non valido.'));
          organization.name = organizationName.trim();
        }
        organization.data = data;
        await write(archive);
        return organizationId;
      });
    },
    organization(operation, payload = {}, contextOrganizationId) {
      return transact(async archive => {
        const exists = id => archive.organizations.some(o => o.id === id);
        const missing = () => codedError('missing-organization', message(contextOrganizationId, 'Organizzazione inesistente.'));
        let target = contextOrganizationId;
        if (operation === 'create') {
          const organization = createOrganization(payload.name, payload.language, payload.logo, payload.palette, payload.demo === true);
          archive.organizations.push(organization);
          archive.activeOrganizationId = target = organization.id;
        } else if (operation === 'import') {
          if (typeof payload.name !== 'string' || !payload.name.trim() || payload.name.trim().length > 100) throw new Error(message(contextOrganizationId, 'Nome organizzazione non valido.'));
          const organization = { id: crypto.randomUUID(), name: payload.name.trim(), data: validateData(structuredClone(payload.data)) };
          archive.organizations.push(organization);
          archive.activeOrganizationId = target = organization.id;
        } else if (operation === 'switch') {
          if (!exists(payload.id)) throw missing();
          archive.activeOrganizationId = target = payload.id;
        } else if (operation === 'rename') {
          const organization = archive.organizations.find(o => o.id === payload.id);
          if (!organization) throw missing();
          if (typeof payload.name !== 'string' || !payload.name.trim() || payload.name.trim().length > 100) throw new Error(message(contextOrganizationId, 'Nome organizzazione non valido.'));
          organization.name = payload.name.trim();
        } else if (operation === 'delete') {
          if (archive.organizations.length <= 1) throw new Error(message(contextOrganizationId, 'Deve restare almeno un’organizzazione.'));
          if (!exists(payload.id)) throw missing();
          archive.organizations = archive.organizations.filter(o => o.id !== payload.id);
          if (archive.activeOrganizationId === payload.id) archive.activeOrganizationId = archive.organizations[0].id;
          if (target === payload.id) target = archive.activeOrganizationId;
        } else throw new Error(message(contextOrganizationId, 'Operazione non supportata.'));
        await write(archive);
        return exists(target) ? target : archive.activeOrganizationId;
      });
    },
    parseArchive(text) { return migrateArchive(JSON.parse(text)); },
    replace(input) {
      return transact(async () => {
        const archive = migrateArchive(input);
        await write(archive);
        return archive.activeOrganizationId;
      });
    },
    exportText: () => enqueue(async () => { await ensureLoaded(); return fs.readFile(dataFile, 'utf8'); }),
    exportTo: filePath => enqueue(async () => { await ensureLoaded(); await fs.copyFile(dataFile, filePath); }),
    exportOrganization: (organizationId, kind) => enqueue(async () => {
      await ensureLoaded();
      const organization = find(organizationId);
      if (!organization) throw codedError('missing-organization', message(organizationId, 'Organizzazione inesistente.'));
      const file = organizationExport(organization, kind, { appVersion: String(extras().appVersion || '') });
      return { fileName: organizationFileName(organization.name, kind, organization.data.settings.language), text: JSON.stringify(file, null, 2) };
    }),
    message: (text, organizationId) => message(organizationId, text),
    language: organizationId => current ? language(organizationId) : undefined
  };
}

module.exports = { createWorkspaceStore, revisionOf };
